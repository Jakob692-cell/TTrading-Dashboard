#!/usr/bin/env node
/**
 * bfsg-audit – automatisierte Barrierefreiheits-Vorprüfung einer Website.
 *
 * Aufruf:
 *   node bin/bfsg-audit.mjs https://example.tld [Optionen]
 *
 * Optionen:
 *   --max-pages <n>        maximale Anzahl zu prüfender Seiten (Standard 12)
 *   --out <verzeichnis>    Ausgabeverzeichnis (Standard ./audit-<host>-<datum>)
 *   --network auto|direct|relay   Netzwerkmodus des Browsers (Standard auto)
 *   --delay <ms>           Wartezeit zwischen Seitenaufrufen (Standard 600)
 *   --max-tabs <n>         maximale Tab-Schritte je Seite (Standard 60)
 *   --max-docs <n>         maximal zu analysierende PDF-Dokumente (Standard 8)
 *   --no-screenshots       keine Screenshots erzeugen
 *   --no-keyboard          Tastatur-Durchlauf überspringen
 *   --no-responsive        Viewport-Durchlauf überspringen
 *   --ignore-robots        robots.txt nicht auswerten (nur mit Erlaubnis des Betreibers!)
 *   --same-host            Subdomains nicht mitprüfen
 *   --timeout <ms>         Navigations-Timeout (Standard 45000)
 *   --beschaeftigte <n>    recherchierte Beschäftigtenzahl (für die Kleinstunternehmen-Prüfung)
 *   --umsatz-mio <n>       recherchierter Jahresumsatz in Mio. Euro
 *   --bilanzsumme-mio <n>  recherchierte Jahresbilanzsumme in Mio. Euro
 *   --cookie "n=v; n2=v2"  Cookies vorab setzen (z. B. Consent-Cookie, damit der
 *                          Cookie-Layer den Tastatur-Durchlauf nicht blockiert)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { launchBrowser, fetchRaw } from '../src/browser.mjs';
import { classifyLink, isInternal, loadRobots, loadSitemapUrls, normalizeUrl } from '../src/crawl.mjs';
import { seitentyp, stichprobenPrioritaet, typenUebersicht, KRITISCHE_TYPEN } from '../src/seitentyp.mjs';
import { pageProbe } from '../src/probe.mjs';
import { runKeyboardWalk } from '../src/keyboard.mjs';
import { runResponsive, DEFAULT_VIEWPORTS } from '../src/responsive.mjs';
import { analyzePdf, pdfFindings } from '../src/docs.mjs';
import { buildContext } from '../src/context.mjs';
import { analyzePage, analyzeAxe, analyzeKeyboard, analyzeResponsive, analyzeErrorPage, analyzeCrossPage } from '../src/analyze.mjs';
import { buildMarkdown, buildHtml, groupFindings } from '../src/report.mjs';

const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const o = {
    maxPages: 12, network: 'auto', delay: 600, maxTabs: 60, maxDocs: 8,
    screenshots: true, keyboard: true, responsive: true, robots: true,
    includeSubdomains: true, timeout: 45000, out: null, cookies: [],
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--max-pages': o.maxPages = Number(next()); break;
      case '--out': o.out = next(); break;
      case '--network': o.network = next(); break;
      case '--delay': o.delay = Number(next()); break;
      case '--max-tabs': o.maxTabs = Number(next()); break;
      case '--max-docs': o.maxDocs = Number(next()); break;
      case '--timeout': o.timeout = Number(next()); break;
      case '--cookie': o.cookies.push(next()); break;
      case '--beschaeftigte': o.beschaeftigte = Number(next()); break;
      case '--umsatz-mio': o.umsatzMio = Number(next()); break;
      case '--bilanzsumme-mio': o.bilanzsummeMio = Number(next()); break;
      case '--no-screenshots': o.screenshots = false; break;
      case '--no-keyboard': o.keyboard = false; break;
      case '--no-responsive': o.responsive = false; break;
      case '--ignore-robots': o.robots = false; break;
      case '--same-host': o.includeSubdomains = false; break;
      case '-h': case '--help': o.help = true; break;
      default: rest.push(a);
    }
  }
  o.url = rest[0];
  return o;
}

const log = (...a) => console.error('[bfsg-audit]', ...a);
const slugify = (u) => {
  try {
    const x = new URL(u);
    const s = (x.pathname === '/' ? 'start' : x.pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
    return (s || 'seite').slice(0, 60);
  } catch { return 'seite'; }
};

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (!opt.url || opt.help) {
    console.log(fs.readFileSync(new URL('./bfsg-audit.mjs', import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
    process.exit(opt.url ? 0 : 1);
  }
  const startUrl = normalizeUrl(opt.url, 'https://example.invalid') || opt.url;
  const target = new URL(startUrl);
  const startedAt = new Date().toISOString();
  const outDir = opt.out || path.resolve(process.cwd(), `audit-${target.hostname}-${startedAt.slice(0, 10)}`);
  const shotDir = path.join(outDir, 'screenshots');
  fs.mkdirSync(shotDir, { recursive: true });

  log(`Ziel: ${startUrl}`);
  const b = await launchBrowser({ networkMode: opt.network, probeUrl: startUrl });
  log(`Netzwerkmodus: ${b.mode}`);
  const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  const axeVersion = require('axe-core/package.json').version;

  const robots = opt.robots ? await loadRobots(target.origin, b.dispatcher) : { isAllowed: () => true, sitemaps: [] };
  const sitemapUrls = await loadSitemapUrls(target.origin, b.dispatcher, robots.sitemaps || []);
  log(`robots.txt: ${robots.rules ? robots.rules.length : 0} Regeln · sitemap.xml: ${sitemapUrls.length} URLs`);

  const queue = [startUrl];
  const discovered = new Set([startUrl]);
  for (const u of sitemapUrls) {
    const n = normalizeUrl(u, startUrl);
    if (n && isInternal(n, startUrl, { includeSubdomains: opt.includeSubdomains }) && !discovered.has(n)) {
      discovered.add(n);
      queue.push(n);
    }
  }

  const pages = [];
  const findings = [];
  const docLinks = new Set();
  const externalHosts = new Set();
  const skippedByRobots = [];
  const visited = new Set();
  if (opt.cookies.length) {
    const jar = opt.cookies.flatMap((c) => c.split(';')).map((c) => c.trim()).filter(Boolean).map((c) => {
      const i = c.indexOf('=');
      return { name: c.slice(0, i).trim(), value: c.slice(i + 1).trim(), domain: `.${target.hostname.replace(/^www\./, '')}`, path: '/' };
    }).filter((c) => c.name);
    await b.context.addCookies(jar);
    log(`Cookies gesetzt: ${jar.map((c) => c.name).join(', ')}`);
  }

  const page = await b.context.newPage();
  page.setDefaultTimeout(opt.timeout);

  while (queue.length && pages.length < opt.maxPages) {
    // Startseite immer zuerst, danach Seiten mit hoher BFSG-Relevanz
    // (Kontakt, Shop, Login, Checkout, Impressum …)
    if (pages.length > 0) queue.sort((a, x) => stichprobenPrioritaet(x) - stichprobenPrioritaet(a));
    else queue.sort((a, x) => (a === startUrl ? -1 : x === startUrl ? 1 : 0));
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    if (!robots.isAllowed(url)) { skippedByRobots.push(url); continue; }

    log(`(${pages.length + 1}/${opt.maxPages}) ${url}`);
    const rec = { url, screenshots: [] };
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: opt.timeout });
      rec.status = resp ? resp.status() : null;
      await page.waitForTimeout(900);
      rec.finalUrl = page.url();
      if (rec.status && rec.status >= 400) log(`  ! HTTP ${rec.status} – Ergebnisse dieser Seite sind womöglich nicht repräsentativ.`);
      const t = (await page.title().catch(() => '')) || '';
      if (/(just a moment|nur einen moment|attention required|checking your browser|access denied|zugriff verweigert)/i.test(t)) {
        rec.blocked = true;
        log(`  ! Bot-Schutz/Interstitial erkannt ("${t}") – Seite wurde nicht wirklich geprüft.`);
      }
    } catch (e) {
      rec.error = String(e.message || e).split('\n')[0];
      log(`  ! Fehler beim Laden: ${rec.error}`);
      pages.push(rec);
      continue;
    }

    // axe-core
    try {
      await page.evaluate(axeSource);
      rec.axe = await page.evaluate(async () => {
        const r = await window.axe.run(document, {
          resultTypes: ['violations', 'incomplete'],
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
        });
        return {
          violations: r.violations.map((v) => ({
            id: v.id, impact: v.impact, help: v.help, description: v.description, helpUrl: v.helpUrl, tags: v.tags,
            nodes: v.nodes.slice(0, 10).map((n) => ({ target: n.target, failureSummary: n.failureSummary })),
          })),
          incomplete: r.incomplete.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.length })),
        };
      });
    } catch (e) {
      rec.axeError = String(e.message || e).split('\n')[0];
    }

    // eigene Sonde
    try {
      rec.probe = await page.evaluate(pageProbe, { maxElements: 8000 });
      rec.text = await page.evaluate(() => (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 25000));
    } catch (e) {
      rec.probeError = String(e.message || e).split('\n')[0];
      log(`  ! Sonde fehlgeschlagen: ${rec.probeError}`);
    }

    rec.seitentyp = seitentyp(rec.finalUrl || url, rec.probe);
    if (opt.screenshots) {
      try {
        const p = path.join(shotDir, `${slugify(url)}-desktop.png`);
        await page.screenshot({ path: p, fullPage: false });
        rec.screenshots.push({ label: 'Desktop 1440', path: path.relative(outDir, p) });
      } catch { /* optional */ }
    }
    if (opt.keyboard && rec.probe) {
      try { rec.keyboard = await runKeyboardWalk(page, rec.probe, { maxTabs: opt.maxTabs }); }
      catch (e) { rec.keyboardError = String(e.message || e).split('\n')[0]; }
    }
    if (opt.responsive) {
      try {
        rec.viewports = await runResponsive(page, {
          viewports: DEFAULT_VIEWPORTS,
          screenshotDir: opt.screenshots ? shotDir : null,
          slug: slugify(url),
        });
        for (const v of rec.viewports) {
          if (v.screenshot) rec.screenshots.push({ label: v.label, path: path.relative(outDir, v.screenshot) });
        }
        await page.setViewportSize({ width: 1440, height: 900 });
      } catch (e) { rec.responsiveError = String(e.message || e).split('\n')[0]; }
    }

    // Links einsammeln
    if (rec.probe) {
      for (const l of rec.probe.links) {
        if (!l.href) continue;
        const c = classifyLink(l.href, rec.finalUrl || url);
        if (c.kind === 'document') docLinks.add(c.url);
        else if (c.kind === 'external') { try { externalHosts.add(new URL(c.url).hostname); } catch { /* ignorieren */ } }
        else if (c.kind === 'page' && isInternal(c.url, startUrl, { includeSubdomains: opt.includeSubdomains })) {
          if (!discovered.has(c.url)) { discovered.add(c.url); queue.push(c.url); }
        }
      }
      for (const fr of rec.probe.media.iframes) {
        if (fr.src && /^https?:/i.test(fr.src)) { try { externalHosts.add(new URL(fr.src).hostname); } catch { /* ignorieren */ } }
      }
    }

    pages.push(rec);
    if (opt.delay) await page.waitForTimeout(opt.delay);
  }

  /* --------------------------------------------------------- Fehlerseite */
  let errorPage = null;
  try {
    const url404 = new URL(`/bfsg-audit-pruefung-${Date.now().toString(36)}`, target.origin).toString();
    const resp = await page.goto(url404, { waitUntil: 'domcontentloaded', timeout: opt.timeout });
    errorPage = { url: url404, status: resp ? resp.status() : null };
    errorPage.probe = await page.evaluate(pageProbe, { maxElements: 2000 });
  } catch (e) {
    errorPage = errorPage || { url: 'n/a', status: null, error: String(e.message || e).split('\n')[0] };
  }

  /* ----------------------------------------------------------- Dokumente */
  const docs = [];
  for (const d of [...docLinks].slice(0, opt.maxDocs)) {
    if (!/\.pdf(\?|#|$)/i.test(d)) continue;
    log(`PDF: ${d}`);
    const doc = await analyzePdf(d, { dispatcher: b.dispatcher });
    docs.push(doc);
  }

  const browserVersion = b.browser.version();
  await b.close();

  /* ------------------------------------------------------------ Auswertung */
  const seitentypJeUrl = new Map(pages.map((p) => [p.url, p.seitentyp || 'Inhaltsseite']));
  const screenshotJeUrl = new Map(pages.map((p) => [p.url, (p.screenshots || [])[0] ? p.screenshots[0].path : null]));
  for (const p of pages) {
    if (p.blocked || (p.status && p.status >= 400)) {
      findings.push({
        key: `page-not-audited-${p.url}`, check: 'page-not-audited', category: 'Technik',
        title: p.blocked ? 'Seite durch Bot-Schutz blockiert – nicht bewertbar' : `Seite antwortete mit HTTP ${p.status}`,
        wcag: [], severity: 'MEDIUM', url: p.url,
        problem: p.blocked
          ? 'Statt der Seite wurde eine Zwischenseite (Bot-/DDoS-Schutz) ausgeliefert. Alle Befunde zu dieser URL beziehen sich auf die Zwischenseite, nicht auf den eigentlichen Inhalt.'
          : `Der Server antwortete mit HTTP ${p.status}.`,
        expectation: 'Für eine belastbare Prüfung muss die Seite regulär ausgeliefert werden.',
        elements: [p.url], count: 1, detectable: 'manuell',
        recommendation: 'Prüfung aus einem freigegebenen Netz/mit Freischaltung der Prüf-IP wiederholen oder die Seite manuell prüfen.',
        rationale: 'Ohne echten Seiteninhalt ist keine Aussage über die Barrierefreiheit dieser URL möglich.',
        source: 'Crawler',
      });
      if (p.blocked) continue;
    }
    if (p.probe) findings.push(...analyzePage(p));
    if (p.axe) findings.push(...analyzeAxe(p.url, p.axe));
    if (p.keyboard) findings.push(...analyzeKeyboard(p.url, p.keyboard));
    if (p.viewports) findings.push(...analyzeResponsive(p.url, p.viewports));
    if (p.error) {
      findings.push({
        key: `load-error-${p.url}`, check: 'page-load-error', category: 'Technik',
        title: 'Seite konnte nicht geladen werden', wcag: [], severity: 'MEDIUM', url: p.url,
        problem: p.error, expectation: 'Seite muss erreichbar sein.', elements: [p.url], count: 1,
        detectable: 'automatisch', recommendation: 'Erreichbarkeit prüfen und Seite erneut auditieren.',
        rationale: '', source: 'Crawler',
      });
    }
  }
  for (const f of findings) {
    if (f.seitentyp == null) f.seitentyp = seitentypJeUrl.get(f.url) || seitentyp(f.url);
    if (f.screenshot == null) f.screenshot = screenshotJeUrl.get(f.url) || null;
  }
  findings.push(...analyzeErrorPage(target.origin, errorPage));
  findings.push(...analyzeCrossPage(pages));
  for (const d of docs) findings.push(...pdfFindings(d));

  const context = buildContext(pages, docs, target.origin);
  const result = {
    target: { startUrl, origin: target.origin, host: target.hostname },
    startedAt, finishedAt: new Date().toISOString(),
    meta: {
      maxPages: opt.maxPages, networkMode: b.mode, axeVersion, browserVersion,
      viewports: DEFAULT_VIEWPORTS.map((v) => v.label),
      robotsRespected: opt.robots,
      toolVersion: '2.0.0',
      geprueftTypen: typenUebersicht(pages.map((p) => ({ seitentyp: p.seitentyp }))),
      fehlendeTypen: KRITISCHE_TYPEN.filter((t) => !pages.some((p) => p.seitentyp === t)),
    },
    sitemap: {
      discovered: discovered.size,
      visited: pages.map((p) => p.url),
      notVisited: [...discovered].filter((u) => !visited.has(u)),
      skippedByRobots,
      externalHosts: [...externalHosts],
      documents: [...docLinks],
    },
    pages: pages.map((p) => ({
      url: p.url, finalUrl: p.finalUrl, status: p.status, error: p.error,
      seitentyp: p.seitentyp || null,
      title: p.probe ? p.probe.title : null,
      probe: p.probe, keyboard: p.keyboard, viewports: p.viewports,
      screenshots: p.screenshots, text: undefined,
    })),
    docs, context,
    unternehmen: {
      beschaeftigte: opt.beschaeftigte != null ? opt.beschaeftigte : null,
      umsatzMio: opt.umsatzMio != null ? opt.umsatzMio : null,
      bilanzsummeMio: opt.bilanzsummeMio != null ? opt.bilanzsummeMio : null,
      quelle: opt.beschaeftigte != null ? 'manuell recherchiert und übergeben' : 'nicht recherchiert',
    },
    findings,
    errorPage: errorPage ? { url: errorPage.url, status: errorPage.status } : null,
  };
  // Kontext braucht die Texte, der JSON-Export nicht
  const md = buildMarkdown({ ...result, pages: pages.map((p) => ({ ...p, text: undefined })), context });

  fs.writeFileSync(path.join(outDir, 'befunde.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(outDir, 'bericht.md'), md);
  fs.writeFileSync(path.join(outDir, 'bericht.html'), buildHtml(md, `Barrierefreiheits-Audit ${target.hostname}`));

  const grouped = groupFindings(findings);
  const count = (s) => grouped.filter((f) => f.severity === s).length;
  log('---');
  log(`Seiten geprüft: ${pages.length} · Dokumente: ${docs.length} · Befundgruppen: ${grouped.length}`);
  log(`CRITICAL ${count('CRITICAL')} · HIGH ${count('HIGH')} · MEDIUM ${count('MEDIUM')} · LOW ${count('LOW')}`);
  log(`Bericht: ${path.join(outDir, 'bericht.md')}`);
  console.log(outDir);
}

main().catch((e) => {
  console.error('[bfsg-audit] Abbruch:', e);
  process.exit(1);
});
