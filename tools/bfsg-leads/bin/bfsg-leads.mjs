#!/usr/bin/env node
/**
 * bfsg-leads – Kundenakquise-Vorbereitung für Barrierefreiheits-Audits.
 *
 * Findet Betriebe mit Website in einer Region, prüft deren Website in einem kurzen,
 * höflichen Durchlauf und erzeugt daraus eine Anrufliste mit belegten Aufhängern.
 *
 * Aufruf:
 *   node bin/bfsg-leads.mjs run --ort "Bamberg" --radius 15 --branchen shop,handwerk --max 40
 *   node bin/bfsg-leads.mjs discover --ort "Forchheim" --out leads/kandidaten.json
 *   node bin/bfsg-leads.mjs qualify  --in leads/kandidaten.json --out leads/leads.json
 *   node bin/bfsg-leads.mjs report   --in leads/leads.json --out leads/
 *   node bin/bfsg-leads.mjs run --liste meine-firmen.csv
 *
 * Optionen:
 *   --ort <name>          Ort/Landkreis für die Suche (Nominatim)
 *   --radius <km>         Radius um den Ortsmittelpunkt (sonst amtliche Grenze)
 *   --branchen <a,b,c>    shop, handwerk, gastro_hotel, gesundheit, kultur_tickets,
 *                         dienstleistung, bueros (Standard: shop,handwerk,dienstleistung)
 *   --max <n>             maximale Anzahl geprüfter Betriebe (Standard 25)
 *   --liste <datei>       eigene CSV/URL-Liste statt OpenStreetMap
 *   --out <pfad>          Ausgabeverzeichnis bzw. Ausgabedatei
 *   --in <datei>          Eingabedatei für qualify/report
 *   --ketten              Filialisten/Ketten nicht ausfiltern
 *   --delay <ms>          Pause zwischen zwei Betrieben (Standard 1500)
 *   --unterseiten <n>     zusätzlich geprüfte Unterseiten je Betrieb (Standard 2)
 *   --sperrliste <datei>  Zeilenweise Hosts/Nummern, die nie kontaktiert werden
 *   --network auto|direct|relay
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { launchBrowser } from '../../bfsg-audit/src/browser.mjs';
import { buildHtml } from '../../bfsg-audit/src/report.mjs';
import { discoverOsm, importList, BRANCHEN } from '../src/discover.mjs';
import { qualifiziereKandidat } from '../src/qualify.mjs';
import { extractContact, istGeschaeftsbetrieb } from '../src/contact.mjs';
import { bewerteLead } from '../src/score.mjs';
import { buildCsv, buildMarkdown, buildKurzliste } from '../src/callsheet.mjs';

// Abhängigkeiten (playwright, axe-core, undici) liegen im Paket tools/bfsg-audit –
// von dort aus auflösen, damit hier keine zweite Kopie installiert werden muss.
const require = createRequire(new URL('../../bfsg-audit/package.json', import.meta.url));
const log = (...a) => console.error('[bfsg-leads]', ...a);

function parseArgs(argv) {
  const o = {
    branchen: ['shop', 'handwerk', 'dienstleistung'], max: 25, delay: 1500,
    unterseiten: 2, network: 'auto', ketten: false, radius: null,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--ort': o.ort = next(); break;
      case '--radius': o.radius = Number(next()); break;
      case '--branchen': o.branchen = next().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--max': o.max = Number(next()); break;
      case '--liste': o.liste = next(); break;
      case '--out': o.out = next(); break;
      case '--in': o.in = next(); break;
      case '--delay': o.delay = Number(next()); break;
      case '--unterseiten': o.unterseiten = Number(next()); break;
      case '--sperrliste': o.sperrliste = next(); break;
      case '--network': o.network = next(); break;
      case '--ketten': o.ketten = true; break;
      case '-h': case '--help': o.help = true; break;
      default: rest.push(a);
    }
  }
  o.cmd = rest[0];
  return o;
}

function hilfe() {
  console.log(fs.readFileSync(new URL('./bfsg-leads.mjs', import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
  console.log('Verfügbare Branchen:');
  for (const [k, v] of Object.entries(BRANCHEN)) console.log(`  ${k.padEnd(16)} ${v.label}`);
}

const ladeSperrliste = (datei) => {
  if (!datei || !fs.existsSync(datei)) return [];
  return fs.readFileSync(datei, 'utf8').split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim().toLowerCase())
    .filter(Boolean)
    .map((l) => l.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''));
};

async function cmdDiscover(opt) {
  const outFile = opt.out || 'leads/kandidaten.json';
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  let ergebnis;
  if (opt.liste) {
    const kandidaten = importList(fs.readFileSync(opt.liste, 'utf8'));
    ergebnis = { region: `Liste ${path.basename(opt.liste)}`, kandidaten, quelle: 'eigene Liste' };
  } else {
    if (!opt.ort) throw new Error('--ort oder --liste angeben');
    log(`Suche Betriebe in "${opt.ort}"${opt.radius ? ` (Radius ${opt.radius} km)` : ''} · Branchen: ${opt.branchen.join(', ')}`);
    ergebnis = await discoverOsm({
      ort: opt.ort, radiusKm: opt.radius, branchen: opt.branchen,
      limit: Math.max(opt.max * 4, 100), includeChains: opt.ketten,
    });
    ergebnis.quelle = 'OpenStreetMap (© OpenStreetMap-Mitwirkende, ODbL)';
  }
  fs.writeFileSync(outFile, JSON.stringify(ergebnis, null, 2));
  log(`${ergebnis.kandidaten.length} Kandidaten mit Website gefunden → ${outFile}`);
  return ergebnis;
}

async function cmdQualify(opt, vorab) {
  const quelle = vorab || JSON.parse(fs.readFileSync(opt.in || 'leads/kandidaten.json', 'utf8'));
  const outFile = opt.out && opt.out.endsWith('.json') ? opt.out : path.join(opt.out || 'leads', 'leads.json');
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  const sperrliste = ladeSperrliste(opt.sperrliste);
  const kandidaten = quelle.kandidaten.slice(0, opt.max);

  let b = await launchBrowser({ networkMode: opt.network, probeUrl: kandidaten[0] && kandidaten[0].website });
  const netzwerkModus = b.mode;
  log(`Netzwerkmodus: ${b.mode} · prüfe ${kandidaten.length} Betriebe`);
  const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  let neustarts = 0;

  const leads = [];
  for (const [i, k] of kandidaten.entries()) {
    // Einzelne Websites bringen Chromium zum Absturz. Dann neu starten statt den
    // restlichen Lauf mit leeren Datensätzen zu füllen, die wie "keine Mängel" aussehen.
    if (!b.browser.isConnected()) {
      if (neustarts >= 3) {
        log(`Browser wiederholt abgestürzt – Lauf nach ${leads.length} von ${kandidaten.length} Betrieben beendet.`);
        break;
      }
      neustarts++;
      log(`Browser abgestürzt – Neustart ${neustarts}/3`);
      await b.close().catch(() => {});
      b = await launchBrowser({ networkMode: netzwerkModus });
    }
    log(`(${i + 1}/${kandidaten.length}) ${k.name || k.host}`);
    let lead;
    try {
      lead = await qualifiziereKandidat(b.context, k, {
        axeSource, dispatcher: b.dispatcher, maxUnterseiten: opt.unterseiten,
      });
    } catch (e) {
      lead = { ...k, erreichbar: false, fehler: String(e.message || e).split('\n')[0], befunde: [], hinweise: [] };
    }
    const seiten = lead._seitenMitText || [];
    delete lead._seitenMitText;
    const kontakt = extractContact(seiten);
    // aus OSM bekannte Kontaktdaten ergänzen, wenn die Website nichts hergibt
    if (!kontakt.telefon && k.telefon) { kontakt.telefon = k.telefon.replace(/[^\d+]/g, ''); kontakt.telefonQuelle = 'OpenStreetMap'; }
    if (!kontakt.email && k.email) kontakt.email = k.email;
    lead.kontakt = kontakt;
    lead.betriebspruefung = istGeschaeftsbetrieb(kontakt, k);
    lead.bewertung = bewerteLead(lead, kontakt, { doNotCall: sperrliste });
    if (!lead.betriebspruefung.istBetrieb) {
      lead.bewertung.flags.push('Gewerbebetrieb nicht eindeutig belegt – vor dem Anruf manuell prüfen');
    }
    leads.push(lead);
    if (opt.delay) await new Promise((r) => setTimeout(r, opt.delay));
  }
  await b.close();

  const daten = { region: quelle.region, quelle: quelle.quelle, erstelltAm: new Date().toISOString(), leads };
  fs.writeFileSync(outFile, JSON.stringify(daten, null, 2));
  log(`Qualifizierung fertig → ${outFile}`);
  return daten;
}

function cmdReport(opt, vorab) {
  const daten = vorab || JSON.parse(fs.readFileSync(opt.in || 'leads/leads.json', 'utf8'));
  const outDir = opt.out && !opt.out.endsWith('.json') ? opt.out : 'leads';
  fs.mkdirSync(outDir, { recursive: true });
  const sortiert = [...daten.leads].sort((a, x) => x.bewertung.score - a.bewertung.score);
  const md = buildMarkdown(sortiert, { region: daten.region, quelle: daten.quelle });

  fs.writeFileSync(path.join(outDir, 'anrufliste.csv'), buildCsv(sortiert));
  fs.writeFileSync(path.join(outDir, 'anrufliste.md'), md);
  fs.writeFileSync(path.join(outDir, 'anrufliste.html'), buildHtml(md, `Anrufliste Barrierefreiheit – ${daten.region || ''}`));
  fs.writeFileSync(path.join(outDir, 'kurzliste.md'), buildKurzliste(sortiert));

  const aktiv = sortiert.filter((l) => !l.bewertung.ausschluss.length);
  const mitTel = aktiv.filter((l) => l.kontakt.telefon);
  log('---');
  log(`Leads gesamt: ${sortiert.length} · anrufbar: ${mitTel.length} · ausgeschlossen: ${sortiert.length - aktiv.length}`);
  for (const s of ['A', 'B', 'C', 'D']) log(`Segment ${s}: ${aktiv.filter((l) => l.bewertung.segment === s).length}`);
  log(`Dateien: ${path.join(outDir, 'anrufliste.csv')}, anrufliste.md, anrufliste.html, kurzliste.md`);
  console.log(path.resolve(outDir));
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.help || !opt.cmd) { hilfe(); process.exit(opt.cmd ? 0 : 1); }
  switch (opt.cmd) {
    case 'discover': await cmdDiscover(opt); break;
    case 'qualify': await cmdQualify(opt); break;
    case 'report': cmdReport(opt); break;
    case 'run': {
      const outDir = opt.out || 'leads';
      const kandidaten = await cmdDiscover({ ...opt, out: path.join(outDir, 'kandidaten.json') });
      const daten = await cmdQualify({ ...opt, out: path.join(outDir, 'leads.json') }, kandidaten);
      cmdReport({ ...opt, out: outDir }, daten);
      break;
    }
    default: hilfe(); process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('[bfsg-leads] Abbruch:', e.message || e); process.exit(1); });
