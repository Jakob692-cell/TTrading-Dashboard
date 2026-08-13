/**
 * Qualifizierung eines Kandidaten: Kurz-Audit der Website + Kontaktdaten + BFSG-Signale.
 *
 * Bewusst schlank gehalten (Startseite + bis zu zwei Unterseiten, keine Screenshots),
 * damit viele Betriebe geprüft werden können, ohne die fremden Server zu belasten.
 * Der vollständige Audit läuft später mit tools/bfsg-audit – erst beim zahlenden Kunden.
 */
import { pageProbe } from '../../bfsg-audit/src/probe.mjs';
import { analyzePage, analyzeAxe } from '../../bfsg-audit/src/analyze.mjs';
import { buildContext } from '../../bfsg-audit/src/context.mjs';
import { classifyLink, isInternal, loadRobots, normalizeUrl } from '../../bfsg-audit/src/crawl.mjs';

const UNTERSEITEN_PRIO = [
  /impressum|imprint/i,
  /kontakt|contact/i,
  /(shop|produkt|leistung|angebot|buchen|termin|bestell)/i,
  /(datenschutz|privacy)/i,
];

/** Wählt bis zu `max` interessante Unterseiten aus den gefundenen Links. */
function waehleUnterseiten(links, startUrl, max) {
  const kandidaten = [];
  const gesehen = new Set([startUrl]);
  for (const prio of UNTERSEITEN_PRIO) {
    for (const l of links) {
      if (!l.href) continue;
      const c = classifyLink(l.href, startUrl);
      if (c.kind !== 'page' || !isInternal(c.url, startUrl)) continue;
      if (gesehen.has(c.url)) continue;
      if (!prio.test(c.url) && !prio.test(l.name || '')) continue;
      gesehen.add(c.url);
      kandidaten.push(c.url);
      break; // je Kategorie eine Seite genügt
    }
    if (kandidaten.length >= max) break;
  }
  return kandidaten.slice(0, max);
}

/** Übliche URL-Schreibweisen eines Eintrags, ohne Dubletten. */
export function urlVarianten(url) {
  let u;
  try { u = new URL(url); } catch { return [url]; }
  const host = u.hostname.replace(/^www\./i, '');
  const pfad = u.pathname + u.search;
  const kandidaten = [
    u.toString(),
    `https://${host}${pfad}`,
    `https://www.${host}${pfad}`,
    `http://${host}${pfad}`,
  ];
  return [...new Set(kandidaten)];
}

async function ladeMitVarianten(page, startUrl, timeout) {
  let fehler = null;
  for (const url of urlVarianten(startUrl)) {
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      if (resp && resp.status() < 400) return { resp, url };
      fehler = `HTTP ${resp ? resp.status() : '?'} bei ${url}`;
    } catch (e) {
      fehler = String(e.message || e).split('\n')[0];
    }
  }
  return { resp: null, url: startUrl, fehler };
}

export async function qualifiziereKandidat(context, kandidat, {
  axeSource, dispatcher, maxUnterseiten = 2, timeout = 30000, robotsBeachten = true,
} = {}) {
  const startUrl = normalizeUrl(kandidat.website, kandidat.website) || kandidat.website;
  const ergebnis = {
    ...kandidat,
    geprueftAm: new Date().toISOString(),
    erreichbar: false,
    seiten: [],
    fehler: null,
    hinweise: [],
  };

  let robots = { isAllowed: () => true };
  if (robotsBeachten) {
    try { robots = await loadRobots(new URL(startUrl).origin, dispatcher); } catch { /* optional */ }
  }
  if (!robots.isAllowed(startUrl)) {
    ergebnis.fehler = 'Durch robots.txt ausgeschlossen – nicht geprüft';
    return ergebnis;
  }

  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
  const geladen = [];
  try {
    // Verzeichnisdaten enthalten oft veraltete Schreibweisen (http statt https, mit/ohne www).
    // Deshalb der Reihe nach die üblichen Varianten probieren, bevor ein Lead als
    // "nicht erreichbar" gilt.
    const { resp, url: benutzteUrl, fehler } = await ladeMitVarianten(page, startUrl, timeout);
    if (!resp) {
      ergebnis.fehler = fehler || 'Website nicht erreichbar';
      await page.close();
      return ergebnis;
    }
    if (benutzteUrl !== startUrl) ergebnis.hinweise.push(`Erreichbar über ${benutzteUrl} (Verzeichniseintrag: ${startUrl})`);
    ergebnis.status = resp.status();
    ergebnis.finalUrl = page.url();
    await page.waitForTimeout(700);
    const titel = (await page.title().catch(() => '')) || '';
    if (/(just a moment|nur einen moment|attention required|checking your browser)/i.test(titel)) {
      ergebnis.fehler = 'Bot-Schutz – Seite nicht auswertbar';
      await page.close();
      return ergebnis;
    }
    if (ergebnis.status && ergebnis.status >= 400) ergebnis.hinweise.push(`Startseite antwortet mit HTTP ${ergebnis.status}`);
    ergebnis.erreichbar = true;

    const ladeSeite = async (url) => {
      const rec = { url };
      try {
        if (url !== startUrl) {
          const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
          rec.status = r ? r.status() : null;
          await page.waitForTimeout(500);
        } else {
          rec.status = ergebnis.status;
        }
        rec.probe = await page.evaluate(pageProbe, { maxElements: 4000 });
        rec.text = await page.evaluate(() => (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 20000));
        if (axeSource) {
          try {
            await page.evaluate(axeSource);
            rec.axe = await page.evaluate(async () => {
              const r = await window.axe.run(document, {
                resultTypes: ['violations'],
                runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
              });
              return {
                violations: r.violations.map((v) => ({
                  id: v.id, impact: v.impact, help: v.help, description: v.description,
                  helpUrl: v.helpUrl, tags: v.tags,
                  nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target, failureSummary: n.failureSummary })),
                })),
              };
            });
          } catch { /* axe optional */ }
        }
      } catch (e) {
        rec.fehler = String(e.message || e).split('\n')[0];
      }
      return rec;
    };

    geladen.push(await ladeSeite(startUrl));
    const unterseiten = waehleUnterseiten((geladen[0].probe && geladen[0].probe.links) || [], startUrl, maxUnterseiten)
      .filter((u) => robots.isAllowed(u));
    for (const u of unterseiten) {
      geladen.push(await ladeSeite(u));
      await page.waitForTimeout(300);
    }
  } catch (e) {
    ergebnis.fehler = String(e.message || e).split('\n')[0];
  } finally {
    await page.close().catch(() => {});
  }

  // Befunde und Kontext aus den geladenen Seiten ableiten
  const befunde = [];
  for (const p of geladen) {
    if (p.probe) befunde.push(...analyzePage(p));
    if (p.axe) befunde.push(...analyzeAxe(p.url, p.axe));
  }
  ergebnis.befunde = befunde.map((f) => ({
    check: f.check, title: f.title, severity: f.severity, wcag: f.wcag,
    count: f.count, url: f.url, detectable: f.detectable, problem: f.problem,
    recommendation: f.recommendation,
  }));
  ergebnis.seiten = geladen.map((p) => ({ url: p.url, status: p.status, titel: p.probe ? p.probe.title : null, fehler: p.fehler }));
  ergebnis.kontext = geladen.some((p) => p.probe) ? buildContext(geladen, [], new URL(startUrl).origin) : null;
  ergebnis._seitenMitText = geladen.map((p) => ({ url: p.url, text: p.text, probe: p.probe }));
  return ergebnis;
}
