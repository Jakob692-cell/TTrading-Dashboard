#!/usr/bin/env node
/**
 * bfsg-beweise – erzeugt sichtbare Belege zu den Befunden einer Website.
 *
 * Für jeden belegbaren Befund: Element markieren und einzeln fotografieren, die
 * Sprachausgabe ermitteln, bei Formularfeldern echten Text eintippen (ohne Absenden)
 * und Vorher/Nachher festhalten, bei Bedienelementen den Fokus setzen.
 *
 * Aufruf:
 *   node bin/bfsg-beweise.mjs https://beispiel.de --out ./belege-beispiel
 *
 * Optionen:
 *   --out <dir>        Ausgabeverzeichnis (Standard ./belege-<host>)
 *   --max <n>          maximale Anzahl Belege (Standard 12)
 *   --network <modus>  auto | direct | relay
 *   --timeout <ms>     Zeitbudget je Seitenaufruf (Standard 40000)
 *   --keine-eingabe    keine Texteingabe in Formularfelder vornehmen
 */
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from '../src/browser.mjs';
import { pageProbe } from '../src/probe.mjs';
import { analyzePage } from '../src/analyze.mjs';
import { sammleBeweise, seitenBelege } from '../src/beweise.mjs';
import { seitentyp } from '../src/seitentyp.mjs';

const log = (...a) => console.error('[bfsg-beweise]', ...a);

function parseArgs(argv) {
  const o = { max: 12, network: 'auto', timeout: 40000, eingabe: true };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--out': o.out = next(); break;
      case '--max': o.max = Number(next()); break;
      case '--network': o.network = next(); break;
      case '--timeout': o.timeout = Number(next()); break;
      case '--keine-eingabe': o.eingabe = false; break;
      default: rest.push(a);
    }
  }
  o.url = rest[0];
  return o;
}

/** Wählt aus den Befunden diejenigen aus, die sich am Element zeigen lassen. */
function belegbareAufgaben(befunde, probe, max) {
  const aufgaben = [];
  const selektorAus = (text) => {
    const t = String(text);
    // Kontrastbefunde nennen den Selektor am Ende: "... – z. B. div.foo > p „Text""
    const zb = /z\. B\.\s+(.+?)(?:\s+„|$)/.exec(t);
    let roh = zb ? zb[1] : t;
    // Zusätze abschneiden: "sel → /ziel", "sel: \"Text\"", "sel (3 Treffer)", "sel – Hinweis"
    roh = roh.split(/\s+→\s+|\s+[–—]\s+|:\s|\s\(/)[0].trim();
    if (!roh || !/^[a-z*#.\[:]/i.test(roh)) return null;
    if (/^\d/.test(roh) || /:\d/.test(roh)) return null;   // Messwerte wie "2.85:1"
    if (/^<|^\.\.\./.test(roh)) return null;                // "<html>", Auslassungen
    return roh;
  };
  const artFuer = (check) => {
    if (/^form-/.test(check)) return 'formularfeld';
    if (/^(button-empty|link-empty|link-generic|svg-icon-no-name|focus-invisible|clickable-nonsemantic)/.test(check)) return 'bedienelement';
    if (/^contrast/.test(check)) return 'kontrast';
    return 'element';
  };
  // Nach Beweiswert sortieren: Was sich am Telefon oder im Bericht sofort zeigen lässt,
  // kommt zuerst – nicht die Reihenfolge, in der die Prüfmodule laufen.
  const BEWEISWERT = ['form-unlabelled', 'form-placeholder-only', 'button-empty', 'link-empty',
    'contrast-text', 'svg-icon-no-name', 'img-link-no-name', 'img-alt-missing', 'focus-invisible',
    'aria-hidden-focusable', 'aria-ref-broken', 'contrast-nontext', 'link-generic', 'table-headers',
    'form-autocomplete', 'img-alt-suspicious', 'heading-skip', 'heading-empty'];
  const rang = (c) => {
    const i = BEWEISWERT.findIndex((x) => c.startsWith(x));
    return i === -1 ? BEWEISWERT.length + 1 : i;
  };
  const SEV = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sortiert = [...befunde]
    .filter((f) => f.elements && f.elements.length)
    .filter((f) => !/^(reflow|viewport-zoom|keyboard-|consent-manual|embed-manual|error-404|title-|lang-|landmark-|nav-|consistent-|duplicate-ids|tabindex-)/.test(f.check))
    .sort((a, x) => (rang(a.check) - rang(x.check)) || (SEV[a.severity] - SEV[x.severity]));

  const gesehen = new Set();
  for (const f of sortiert) {
    if (aufgaben.length >= max) break;
    for (const e of f.elements.slice(0, 2)) {
      const sel = selektorAus(e);
      if (!sel || gesehen.has(sel)) continue;
      gesehen.add(sel);
      aufgaben.push({ id: f.id, art: artFuer(f.check), selector: sel, titel: f.title, wcag: f.wcag, severity: f.severity, messwert: f.messwert, erwartet: f.erwartet, wirkung: f.benutzerwirkung });
      if (aufgaben.length >= max) break;
    }
  }
  return aufgaben;
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildHtml(url, belege, seite, meta) {
  const bild = (datei) => {
    try {
      const b64 = fs.readFileSync(datei).toString('base64');
      return `<img src="data:image/png;base64,${b64}" alt="">`;
    } catch { return '<p><em>Screenshot nicht verfügbar</em></p>'; }
  };
  const karten = belege.map((b) => `
  <section class="beleg">
    <h3>${esc(b.id)} · ${esc(b.titel)}</h3>
    ${b.fehler ? `<p class="warn">${esc(b.fehler)}</p>` : ''}
    <p class="sel"><code>${esc(b.selector)}</code></p>
    ${b.ansage ? `<p class="ansage"><strong>Was die Sprachausgabe sagt:</strong> ${esc(b.ansage.ansage)}${b.ansage.quelle ? ` <span class="q">(Quelle: ${esc(b.ansage.quelle)})</span>` : ''}</p>` : ''}
    ${b.element ? `<p><strong>Gemessen:</strong> Textfarbe ${esc(b.element.farbe)} · Hintergrund ${esc(b.element.hintergrund)} · Schrift ${esc(b.element.schrift)}</p>` : ''}
    ${b.schritte.length ? `<ul>${b.schritte.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    <div class="bilder">${b.bilder.map((x) => `<figure>${bild(x.datei)}<figcaption>${esc(x.name)}</figcaption></figure>`).join('')}</div>
    ${b.element ? `<details><summary>HTML des Elements</summary><pre>${esc(b.element.html)}</pre></details>` : ''}
  </section>`).join('\n');

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Belege – ${esc(url)}</title>
<style>
 :root { color-scheme: light dark; }
 body { font-family: system-ui, sans-serif; line-height: 1.6; max-width: 62rem; margin: 0 auto; padding: 1.5rem; background: #fff; color: #16181d; }
 h1 { line-height: 1.2; } h3 { margin-bottom: .2rem; }
 .beleg { border: 1px solid #b9bec7; border-radius: 8px; padding: 1rem 1.2rem; margin: 1.5rem 0; }
 .sel code { background: #f0f1f4; padding: .1em .35em; border-radius: 3px; word-break: break-all; }
 .ansage { background: #fff6e5; border-left: 4px solid #d98600; padding: .5rem .8rem; }
 .warn { color: #a30000; }
 .q { color: #555; }
 figure { margin: .5rem 0; } figcaption { font-size: .85rem; color: #555; }
 img { max-width: 100%; border: 1px solid #ccc; border-radius: 4px; }
 .bilder { display: flex; flex-wrap: wrap; gap: 1rem; } .bilder figure { flex: 1 1 20rem; }
 pre { background: #f0f1f4; padding: .6rem; overflow-x: auto; font-size: .85rem; }
 @media (prefers-color-scheme: dark) {
   body { background: #101216; color: #e9ecf1; } .beleg { border-color: #444b56; }
   .sel code, pre { background: #21252c; } .ansage { background: #2a2314; border-left-color: #d98600; }
   .q { color: #aaa; } figcaption { color: #aaa; }
 }
</style></head>
<body>
<h1>Belege zur Barrierefreiheit</h1>
<p><strong>Website:</strong> ${esc(url)}<br><strong>Geprüft am:</strong> ${esc(meta.datum)} · <strong>Browser:</strong> ${esc(meta.browser)} · <strong>Seitentyp:</strong> ${esc(meta.seitentyp)}</p>
<p>Jeder Beleg zeigt das betroffene Element rot markiert, die Ansage einer Sprachausgabe und – wo sinnvoll – das Verhalten nach einer echten Eingabe. Formulare wurden <strong>nicht abgesendet</strong>.</p>

<h2>Gesamtansicht</h2>
<div class="bilder">
  <figure>${bild(path.join(meta.dir, seite.desktop || ''))}<figcaption>Desktop 1440 px</figcaption></figure>
  <figure>${bild(path.join(meta.dir, seite.mobil320 || ''))}<figcaption>Mobil 320 px</figcaption></figure>
</div>
${seite.reflow ? `<p><strong>Breite bei 320 px Viewport:</strong> Inhalt ${seite.reflow.inhaltsbreite} px, Überstand ${seite.reflow.ueberstand} px ${seite.reflow.ueberstand > 2 ? '→ horizontales Scrollen nötig' : '→ kein horizontales Scrollen'}</p>` : ''}
${seite.viewportMeta ? `<p><strong>Viewport-Angabe im Quelltext:</strong></p><pre>${esc(seite.viewportMeta)}</pre>` : ''}

<h2>Einzelbelege</h2>
${karten}
<hr>
<p><small>Technischer Nachweis, keine Rechtsberatung und keine Konformitätsbescheinigung.</small></p>
</body></html>`;
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (!opt.url) { console.log(fs.readFileSync(new URL('./bfsg-beweise.mjs', import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, '')); process.exit(1); }
  const host = new URL(opt.url).hostname;
  const outDir = path.resolve(opt.out || `belege-${host}`);
  fs.mkdirSync(outDir, { recursive: true });

  const b = await launchBrowser({ networkMode: opt.network, probeUrl: opt.url });
  log(`Netzwerkmodus: ${b.mode} · Ziel: ${opt.url}`);
  const page = await b.context.newPage();
  page.setDefaultTimeout(opt.timeout);
  await page.goto(opt.url, { waitUntil: 'domcontentloaded', timeout: opt.timeout });
  await page.waitForTimeout(1200);

  const probe = await page.evaluate(pageProbe, { maxElements: 6000 });
  const typ = seitentyp(page.url(), probe);
  const befunde = analyzePage({ url: page.url(), probe });
  log(`${befunde.length} Befunde – erzeuge Belege für bis zu ${opt.max}`);

  const seite = await seitenBelege(page, { verzeichnis: outDir });
  const aufgaben = belegbareAufgaben(befunde, probe, opt.max)
    .map((a) => (opt.eingabe ? a : { ...a, art: a.art === 'formularfeld' ? 'element' : a.art }));
  const belege = await sammleBeweise(page, aufgaben, { verzeichnis: outDir });

  const meta = { datum: new Date().toISOString().slice(0, 16).replace('T', ' '), browser: b.browser.version(), seitentyp: typ, dir: outDir };
  fs.writeFileSync(path.join(outDir, 'belege.html'), buildHtml(opt.url, belege, seite, meta));
  fs.writeFileSync(path.join(outDir, 'belege.json'), JSON.stringify({ url: opt.url, seitentyp: typ, seite, belege, meta }, null, 2));

  await b.close();
  log(`${belege.filter((x) => !x.fehler).length} Belege erzeugt → ${path.join(outDir, 'belege.html')}`);
  console.log(outDir);
}

main().then(() => process.exit(0)).catch((e) => { console.error('[bfsg-beweise] Abbruch:', e.message || e); process.exit(1); });
