/**
 * Phasen 4–8 – Berichterstellung (Markdown + HTML + JSON).
 *
 * Wichtig: Der Bericht trennt strikt zwischen TECHNISCHEM AUDIT (was gemessen wurde),
 * MANUELLER PRÜFUNG (was automatisiert nicht entscheidbar ist) und RECHTLICHER
 * EINORDNUNG (Einschätzung, keine Konformitätsbescheinigung).
 */
import { SEVERITIES } from './analyze.mjs';
import { wcagLabel, WCAG_UNCLEAR } from './wcag.mjs';

const SEV_ORDER = Object.fromEntries(SEVERITIES.map((s, i) => [s, i]));

export function prioritize(findings) {
  return [...findings].sort((a, b) => {
    const s = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
    if (s !== 0) return s;
    const pagesA = a.pages ? a.pages.length : 1;
    const pagesB = b.pages ? b.pages.length : 1;
    if (pagesA !== pagesB) return pagesB - pagesA;
    return (b.count || 0) - (a.count || 0);
  });
}

/** Fasst gleichartige Befunde über mehrere Seiten zusammen. */
export function groupFindings(findings) {
  const map = new Map();
  for (const f of findings) {
    const k = f.check.replace(/-\d+$/, '') + '|' + f.title;
    if (!map.has(k)) {
      map.set(k, { ...f, pages: [f.url], seitentypen: [f.seitentyp || 'Inhaltsseite'], totalCount: f.count || 0, elements: [...(f.elements || [])] });
    } else {
      const g = map.get(k);
      if (!g.pages.includes(f.url)) g.pages.push(f.url);
      if (f.seitentyp && !g.seitentypen.includes(f.seitentyp)) g.seitentypen.push(f.seitentyp);
      if (!g.messwert && f.messwert) g.messwert = f.messwert;
      if (!g.screenshot && f.screenshot) g.screenshot = f.screenshot;
      g.totalCount += f.count || 0;
      for (const e of f.elements || []) if (g.elements.length < 12) g.elements.push(e);
      if (SEV_ORDER[f.severity] < SEV_ORDER[g.severity]) g.severity = f.severity;
    }
  }
  return prioritize([...map.values()]);
}

const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const wcagList = (ids) => (ids && ids.length ? ids.map(wcagLabel).join('; ') : WCAG_UNCLEAR);
const wcagShort = (ids) => (ids && ids.length ? ids.join(', ') : 'nicht eindeutig');
const DET = { automatisch: 'ja', teilautomatisch: 'teilweise', manuell: 'nein' };

export function buildMarkdown(result) {
  const { target, startedAt, finishedAt, sitemap, pages, docs, context, findings, meta } = result;
  const grouped = groupFindings(findings);
  const bySev = Object.fromEntries(SEVERITIES.map((s) => [s, grouped.filter((f) => f.severity === s)]));
  const manual = grouped.filter((f) => f.detectable !== 'automatisch');
  const auto = grouped.filter((f) => f.detectable === 'automatisch');
  const L = [];
  const P = (...x) => L.push(...x, '');

  P(`# Barrierefreiheits-Audit (technische Vorprüfung): ${target.origin}`);
  P(
    '> **Einordnung dieses Dokuments.** Es handelt sich um ein automatisiertes technisches Audit mit ergänzenden Hinweisen auf manuell zu prüfende Punkte.',
    '> Es ist **keine Konformitätsbescheinigung** und **keine Rechtsberatung**. Aus diesem Bericht lässt sich weder ableiten, dass die Website die Anforderungen des BFSG erfüllt,',
    '> noch dass sie sie verletzt. Automatisierte Prüfungen decken erfahrungsgemäss nur einen Teil der WCAG-Anforderungen ab; die übrigen Anforderungen sind ausschliesslich manuell',
    '> (u. a. mit Screenreader und Tastatur) und teilweise nur redaktionell beurteilbar.',
  );

  /* 1. Executive Summary */
  P('## 1. Executive Summary');
  P(
    `- Untersuchter Auftritt: **${target.startUrl}**`,
    `- Untersuchungszeitraum: ${startedAt} bis ${finishedAt}`,
    `- Untersuchte Seiten: **${pages.length}**${sitemap.discovered ? ` (aus ${sitemap.discovered} gefundenen internen URLs)` : ''}`,
    `- Geprüfte Dokumente (PDF): **${docs.length}**`,
    `- Befunde gesamt (nach Zusammenfassung gleichartiger Probleme): **${grouped.length}**`,
    `- Davon automatisiert belegt: **${auto.length}** · teilautomatisch/manuell zu verifizieren: **${manual.length}**`,
    `- Schweregrade: CRITICAL **${bySev.CRITICAL.length}** · HIGH **${bySev.HIGH.length}** · MEDIUM **${bySev.MEDIUM.length}** · LOW **${bySev.LOW.length}**`,
    `- Referenzstand: WCAG 2.1 A/AA (über EN 301 549 V3.2.1 in Bezug genommen); Kriterien aus WCAG 2.2 sind als solche gekennzeichnet.`,
  );
  const top = grouped.slice(0, 5);
  if (top.length) {
    P('**Die fünf gewichtigsten Befunde**');
    top.forEach((f, i) => L.push(`${i + 1}. **[${f.severity}] ${f.title}** – ${f.problem} (WCAG ${wcagShort(f.wcag)}; betroffen: ${f.pages.length} Seite(n), ${f.totalCount} Element(e))`));
    L.push('');
  }

  /* 2. Unternehmens-/BFSG-Kontext */
  P('## 2. Unternehmens- und BFSG-Kontext (Indizien aus der Website)');
  P('Die folgenden Punkte sind **technisch erhobene Indizien**, keine rechtliche Feststellung.');
  L.push('| Merkmal | Befund | Belege |', '| --- | --- | --- |');
  for (const [k, v] of Object.entries(context.signals)) {
    L.push(`| ${esc(v.label)} | ${v.found ? 'Hinweise gefunden' : 'keine Hinweise'} | ${esc(v.evidence.slice(0, 2).map((e) => `${e.url} („${e.match}“)`).join('; '))} |`);
  }
  L.push('');
  L.push('| Pflicht-/Standardseite | Status |', '| --- | --- |');
  for (const [k, v] of Object.entries(context.legalPages)) {
    L.push(`| ${k} | ${v.found ? esc(v.url) : '**nicht gefunden**'} |`);
  }
  L.push('');
  if (context.imprint) {
    P('**Impressumsdaten (automatisch extrahiert, ungeprüft):**',
      `- Rechtsform: ${context.imprint.legalForm || 'nicht erkannt'}`,
      `- Registereintrag: ${context.imprint.register || 'nicht erkannt'}`,
      `- USt-IdNr.: ${context.imprint.vatId || 'nicht erkannt'}`,
      `- Vertretung: ${context.imprint.representative || 'nicht erkannt'}`);
  }
  P('**Verdichtete Indizien:**',
    `- Elektronischer Geschäftsverkehr: ${context.indication.electronicCommerce}`,
    `- Verbraucherbezug: ${context.indication.consumerFacing}`,
    `- Branchenspezifische Dienstleistungen nach § 1 Abs. 3 BFSG: ${context.indication.sectorSpecific.length ? context.indication.sectorSpecific.join(', ') : 'keine Hinweise'}`,
    `- Erklärung zur Barrierefreiheit / Informationen nach § 14 Abs. 1 Nr. 2 i. V. m. Anlage 3 BFSG: ${context.indication.accessibilityStatement ? 'Seite gefunden (Inhalt manuell prüfen)' : '**nicht gefunden**'}`,
    `- Mobile App: ${context.appLinks.length ? context.appLinks.join(', ') : 'keine App-Store-Links gefunden'}`);
  P('**Nicht automatisiert feststellbar:**', ...context.notDeterminable.map((n) => `- ${n}`));

  /* 3. Untersuchte URLs */
  P('## 3. Untersuchte URLs (Sitemap des geprüften Bereichs)');
  L.push('| # | URL | Titel | HTTP | Elemente | Links | Formulare |', '| --- | --- | --- | --- | --- | --- | --- |');
  pages.forEach((p, i) => {
    const c = (p.probe && p.probe.counts) || {};
    L.push(`| ${i + 1} | ${esc(p.url)} | ${esc((p.probe && p.probe.title) || '–')} | ${p.status || '–'} | ${c.elements || '–'} | ${c.links || '–'} | ${c.forms || '–'} |`);
  });
  L.push('');
  if (sitemap.notVisited && sitemap.notVisited.length) {
    P(`**Nicht besuchte interne URLs (Auswahl, Limit ${meta.maxPages} Seiten):**`, ...sitemap.notVisited.slice(0, 25).map((u) => `- ${u}`));
  }
  if (docs.length) {
    P('**Gefundene Dokumente:**');
    L.push('| Dokument | Status | Getaggt | Sprache | Titel | Formular |', '| --- | --- | --- | --- | --- | --- |');
    for (const d of docs) {
      const c = d.checks || {};
      L.push(`| ${esc(d.url)} | ${d.error ? esc(d.error) : d.status} | ${c.tagged ? 'ja' : 'nein'} | ${c.lang || '–'} | ${c.title ? 'ja' : 'nein'} | ${c.acroForm ? 'ja' : 'nein'} |`);
    }
    L.push('');
  }
  if (sitemap.externalHosts && sitemap.externalHosts.length) {
    P('**Eingebundene externe Hosts (Auswahl):** ' + sitemap.externalHosts.slice(0, 20).join(', '));
  }

  /* 4./5. Anzahl und Schweregrade */
  P('## 4. Anzahl gefundener Probleme');
  L.push('| Schweregrad | Befundgruppen | betroffene Elemente (Summe) |', '| --- | --- | --- |');
  for (const s of SEVERITIES) {
    L.push(`| ${s} | ${bySev[s].length} | ${bySev[s].reduce((a, f) => a + (f.totalCount || 0), 0)} |`);
  }
  L.push('');
  P('## 5. Probleme nach Schweregrad');
  for (const s of SEVERITIES) {
    if (!bySev[s].length) continue;
    L.push(`### ${s}`, '');
    for (const f of bySev[s]) {
      L.push(`- **${f.title}** (${f.category}) – ${f.totalCount} Element(e) auf ${f.pages.length} Seite(n) · WCAG ${wcagShort(f.wcag)} · automatisch feststellbar: ${DET[f.detectable]}`);
    }
    L.push('');
  }

  /* 6./7. Detailbefunde mit WCAG-Zuordnung */
  P('## 6./7. Wichtigste Accessibility-Probleme mit WCAG-Zuordnung');
  grouped.forEach((f) => {
    L.push(`### ${f.id} · [${f.severity}] ${f.title}`, '');
    L.push(`**URL:** ${f.pages.slice(0, 6).join(', ')}${f.pages.length > 6 ? ` … (+${f.pages.length - 6})` : ''}  `);
    L.push(`**Seitentyp:** ${[...new Set(f.seitentypen || [])].join(', ') || 'Inhaltsseite'}  `);
    L.push(`**Kategorie:** ${f.category}  `);
    L.push(`**WCAG:** ${wcagList(f.wcag)}  `);
    L.push(`**Level:** ${f.level || 'nicht eindeutig'}  `);
    L.push(`**Problem:** ${f.problem}  `);
    L.push(`**Technischer Nachweis:** ${f.count} betroffene(s) Element(e) auf ${f.pages.length} Seite(n); Prüfquelle: ${f.source}  `);
    if (f.elements.length) {
      L.push('**Konkrete Elemente (Auszug):**', '');
      f.elements.slice(0, 8).forEach((e) => L.push(`  - \`${String(e).replace(/`/g, "'")}\``));
      L.push('');
    }
    L.push(`**Messwert:** ${f.messwert || '—'}  `);
    L.push(`**Erwarteter Wert:** ${f.erwartet || f.expectation}  `);
    L.push(`**Schweregrad:** ${f.severity}  `);
    L.push(`**Automatisierbarkeit:** ${f.automatisierbarkeit}  `);
    L.push(`**Benutzerwirkung:** ${f.benutzerwirkung}  `);
    L.push(`**Empfohlene Lösung:** ${f.recommendation}  `);
    if (f.screenshot) L.push(`**Screenshot:** \`${f.screenshot}\`  `);
    if (f.rationale) L.push(`**Hinweis:** ${f.rationale}  `, '');
    else L.push('');
  });

  /* 8. Screenshots */
  P('## 8. Screenshots und Belege');
  const shots = pages.flatMap((p) => (p.screenshots || []).map((s) => `- ${p.url} – ${s.label}: \`${s.path}\``));
  P(shots.length ? shots.join('\n') : 'Keine Screenshots erzeugt (Option --no-screenshots oder Fehler beim Rendern).');

  /* 9. Lösungsvorschläge */
  P('## 9. Konkrete Lösungsvorschläge (nach Aufwand gebündelt)');
  const quick = grouped.filter((f) => ['lang-missing', 'title-missing', 'img-alt-missing', 'button-empty', 'link-empty', 'iframe-title', 'viewport-zoom', 'aria-ref-broken', 'form-unlabelled'].some((c) => f.check.startsWith(c)));
  P('**Kurzfristig umsetzbar (Attribute/Texte, meist ohne Redesign):**',
    ...(quick.length ? quick.map((f) => `- ${f.title}: ${f.recommendation}`) : ['- (keine Treffer in dieser Kategorie)']));
  const design = grouped.filter((f) => f.check.startsWith('contrast') || f.check.startsWith('focus') || f.check.startsWith('reflow') || f.check.startsWith('target-size') || f.check.startsWith('color-only'));
  P('**Mittelfristig (Design-/CSS-Anpassungen):**',
    ...(design.length ? design.map((f) => `- ${f.title}: ${f.recommendation}`) : ['- (keine Treffer in dieser Kategorie)']));
  const deep = grouped.filter((f) => ['consent', 'keyboard', 'form-error', 'auth', 'embed', 'pdf', 'motion'].some((c) => f.check.startsWith(c)));
  P('**Grundlegend (Komponenten, Prozesse, Fremdkomponenten, Dokumente):**',
    ...(deep.length ? deep.map((f) => `- ${f.title}: ${f.recommendation}`) : ['- (keine Treffer in dieser Kategorie)']));

  /* 10. Manuelle Prüfungen */
  P('## 10. MANUELLE PRÜFUNG ERFORDERLICH');
  P('Die folgenden Punkte sind automatisiert **nicht** oder **nicht abschliessend** feststellbar:');
  const manualStandard = [
    'Tatsächliche Screenreader-Nutzbarkeit (NVDA/JAWS/VoiceOver) der zentralen Prozesse',
    'Verständlichkeit und Angemessenheit der Texte und Alternativtexte (redaktionelle Qualität)',
    'Logische Bedien- und Lesereihenfolge komplexer Komponenten (Menüs, Tabs, Modals, Datepicker)',
    'Tatsächliche Tastaturbedienbarkeit inkl. Shift+Tab, Escape, Pfeiltasten und Fokusrückgabe',
    'Qualität und Synchronität von Untertiteln, Transkripten und Audiodeskription',
    'Verständlichkeit von Fehlermeldungen und das Fokusverhalten nach Fehlern (echtes Absenden von Formularen)',
    'Kognitive Zugänglichkeit (Sprachniveau, Konsistenz, Hilfestellungen)',
    'Vollständige Durchführung der Kernprozesse (Bestellung, Buchung, Anmeldung, Zahlung) mit Hilfsmitteln',
    'Zoom auf 200 % und Textabstände nach WCAG 1.4.12 in realer Nutzung',
    'Statusmeldungen (Warenkorb, Filter, Ladezustände) mit Screenreader',
  ];
  manualStandard.forEach((m, i) => L.push(`${i + 1}. **MANUELLE PRÜFUNG ERFORDERLICH** – ${m}`));
  L.push('');
  if (manual.length) {
    P('**Aus dem Scan abgeleitete, konkret zu verifizierende Punkte:**');
    manual.forEach((f) => L.push(`- **${f.title}** (${f.pages.length} Seite(n)) – ${f.recommendation}`));
    L.push('');
  }

  /* 11. BFSG-Relevanz */
  P('## 11. BFSG-Relevanz (Einschätzung, keine Rechtsberatung)');
  P(...bfsgAssessment(context));

  /* 12. Technische Empfehlungen */
  P('## 12. Technische Empfehlungen');
  P(
    '- Barrierefreiheit in die Definition-of-Done aufnehmen: axe-core/Lighthouse im CI, Pull-Request-Check für Kontraste und Formularbeschriftungen.',
    '- Komponentenbibliothek zentral korrigieren (Buttons, Formularfelder, Modals, Consent-Layer) – die meisten Befunde stammen aus wiederverwendeten Komponenten.',
    '- Fokusindikator global definieren (`:focus-visible`) statt `outline: none`.',
    '- Redaktions-Leitfaden für Alternativtexte, Linktexte und Überschriftenhierarchie bereitstellen.',
    '- Bei Fremdkomponenten (Consent-Tool, Kartendienst, Zahlungs-/Buchungs-Widgets) Barrierefreiheitszusagen der Anbieter einholen und Alternativen vorhalten.',
    '- Dokumente vorrangig als HTML anbieten; PDFs nur getaggt (PDF/UA) veröffentlichen.',
    '- Nach der Umsetzung eine manuelle Prüfung nach BITV-Test/EN 301 549 mit Nutzenden mit Behinderungen einplanen.',
  );

  /* 13. Priorisierung */
  P('## 13. Prioritäten für die Umsetzung');
  P('Reihenfolge nach Nutzerbeeinträchtigung, Verbreitung, Relevanz für zentrale Funktionen, WCAG-Bezug und Aufwand.');
  L.push('| Rang | Befund | Schweregrad | Seiten | Elemente | Aufwand (Einschätzung) |', '| --- | --- | --- | --- | --- | --- |');
  grouped.slice(0, 20).forEach((f, i) => {
    const effort = f.check.startsWith('contrast') ? 'gering–mittel'
      : /consent|keyboard|form-error|embed|pdf|motion|auth/.test(f.check) ? 'mittel–hoch' : 'gering';
    L.push(`| ${i + 1} | ${esc(f.title)} | ${f.severity} | ${f.pages.length} | ${f.totalCount} | ${effort} |`);
  });
  L.push('');

  /* Kompakttabelle */
  P('## Kompaktübersicht');
  L.push('| ID | URL | Seitentyp | Problem | WCAG | Level | Schweregrad | Nachweis | Automatisierbarkeit |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const f of grouped) {
    const u = f.pages.length === 1 ? f.pages[0] : `${f.pages[0]} (+${f.pages.length - 1})`;
    const typ = [...new Set(f.seitentypen || [])].slice(0, 2).join(', ') || 'Inhaltsseite';
    L.push(`| ${f.id} | ${esc(u)} | ${esc(typ)} | ${esc(f.title)} | ${esc(wcagShort(f.wcag))} | ${f.level || '–'} | ${f.severity} | ${f.count} Element(e)${f.messwert ? `, ${esc(f.messwert)}` : ''} | ${f.automatisierbarkeit} |`);
  }
  L.push('');

  P('## BFSG-Einschätzung');
  P(...bfsgAssessment(context, true));

  P('## Größte 5 Probleme');
  if (top.length) top.forEach((f, i) => L.push(`${i + 1}. [${f.severity}] ${f.title} – ${f.problem}`));
  else L.push('1. Keine Befunde im automatisierten Scan – das ersetzt keine manuelle Prüfung.');
  L.push('');

  P('## Manuelle Prüfungen erforderlich');
  manualStandard.slice(0, 6).forEach((m, i) => L.push(`${i + 1}. ${m}`));
  L.push('');

  P('## Empfohlene nächste Schritte');
  P(
    '1. CRITICAL- und HIGH-Befunde in den zentralen Komponenten beheben (Formularbeschriftungen, Namen von Bedienelementen, Kontraste, Fokusindikator).',
    '2. Manuelle Prüfung der Kernprozesse (Kontakt, Anmeldung, Bestellung/Buchung) mit Tastatur und Screenreader durchführen bzw. beauftragen.',
    '3. Rechtliche Einordnung des BFSG mit Blick auf Unternehmensgrösse, Verbraucherbezug und elektronischen Geschäftsverkehr fachkundig klären lassen und – falls einschlägig – die Informationen nach § 14 Abs. 1 Nr. 2 i. V. m. Anlage 3 BFSG barrierefrei veröffentlichen.',
    '4. Erneuten automatisierten Lauf nach der Umsetzung durchführen und Ergebnisse gegenüberstellen.',
  );

  /* Akquise-Kurzausgabe */
  const st = bfsgStatus(context, result.unternehmen || {});
  P('## Sales-Output (Akquise-Kurzfassung)');
  const einstieg = grouped.find((f) => ['contrast-text', 'form-unlabelled', 'button-empty', 'img-alt-missing', 'viewport-zoom', 'focus-invisible'].some((c) => f.check.startsWith(c)));
  P('```',
    `UNTERNEHMEN: ${target.host}`,
    `BFSG-RELEVANZ: ${st.kategorie === 'A' ? 'HIGH' : st.kategorie === 'B' ? 'MEDIUM' : (st.kategorie === 'C' || st.kategorie === 'D') ? 'LOW' : 'UNKLAR'} (Status ${st.kategorie}: ${st.label})`,
    `KLEINSTUNTERNEHMEN: ${st.kleinstunternehmen}`,
    `B2C: ${st.b2c}`,
    `ONLINE-VERTRAG: ${st.elektronischerGeschaeftsverkehr}`,
    `ACCESSIBILITY-FEHLER: ${grouped.length} Befundgruppen, ${grouped.reduce((a, f) => a + (f.totalCount || 0), 0)} betroffene Elemente`,
    `CRITICAL: ${bySev.CRITICAL.length}`,
    `HIGH: ${bySev.HIGH.length}`,
    `BESTER GESPRAECHSEINSTIEG: ${einstieg ? einstieg.title : 'kein belastbarer Einstieg – keine schweren Befunde'}`,
    `KONKRETER NACHWEIS: ${einstieg ? `${einstieg.id} · ${einstieg.messwert || `${einstieg.totalCount} Element(e)`} · ${einstieg.pages[0]}` : '—'}`,
    '```');

  /* Abschlussformat nach Prüfspezifikation */
  P('# AUDIT SUMMARY');
  P(`**Website:** ${target.startUrl}`);
  P(`**Unternehmen:** ${(context.imprint && context.imprint.legalForm) ? `${target.host} (${context.imprint.legalForm})` : target.host}`);
  P(`**Audit-Datum:** ${finishedAt.slice(0, 10)}`);
  P(`**Untersuchte URLs:** ${pages.length} – ${Object.entries(meta.geprueftTypen || {}).map(([t, n]) => `${t}: ${n}`).join(', ') || 'keine Typisierung'}`);
  if (meta.fehlendeTypen && meta.fehlendeTypen.length) {
    P(`**Nicht erfasste Seitentypen (Prüflücke):** ${meta.fehlendeTypen.join(', ')}`);
  }
  P('## BFSG');
  P(`- BFSG-Relevanz: **${st.kategorie} – ${st.label}**`,
    `- B2C: ${st.b2c}`,
    `- Elektronischer Geschäftsverkehr: ${st.elektronischerGeschaeftsverkehr}`,
    `- Kleinstunternehmen: ${st.kleinstunternehmen}`,
    `- Unternehmensgröße: ${result.unternehmen && result.unternehmen.beschaeftigte != null ? `${result.unternehmen.beschaeftigte} Beschäftigte` : 'nicht feststellbar'}`,
    `- Rechtliche Sicherheit: ${st.rechtlicheSicherheit}`);
  P('## TECHNISCH');
  P(`- Gesamtbefunde: ${grouped.length}`,
    `- Critical: ${bySev.CRITICAL.length}`,
    `- High: ${bySev.HIGH.length}`,
    `- Medium: ${bySev.MEDIUM.length}`,
    `- Low: ${bySev.LOW.length}`,
    `- Automatisch nachweisbar: ${auto.length}`,
    `- Manuell zu prüfen: ${manual.length}`);
  P('## TOP 5');
  if (top.length) top.forEach((f, i) => L.push(`${i + 1}. ${f.id} · [${f.severity}] ${f.title} (${f.totalCount} Element(e), WCAG ${wcagShort(f.wcag)})`));
  else L.push('1. Keine Befunde im automatisierten Lauf – das ersetzt keine manuelle Prüfung.');
  L.push('');
  P('## WICHTIGSTE TECHNISCHE ÄNDERUNGEN');
  const massnahmen = grouped.slice(0, 5).map((f, i) => `${i + 1}. ${f.recommendation} (${f.id})`);
  P(...(massnahmen.length ? massnahmen : ['1. Keine Massnahmen aus dem automatisierten Lauf ableitbar.']));
  P('## RECHTLICHER HINWEIS');
  P('„Dieser Bericht ist ein technischer Accessibility-/BFSG-Vorcheck und keine Rechtsberatung oder rechtsverbindliche Konformitätsbescheinigung."');

  P('---');
  P(`Erzeugt mit \`tools/bfsg-audit\` · Prüfwerkzeuge: eigene DOM-Analyse + axe-core ${meta.axeVersion || ''} · Netzwerkmodus: ${meta.networkMode} · Chromium ${meta.browserVersion || ''}`);
  return L.join('\n');
}

/**
 * BFSG-Status in genau einer der fünf Kategorien der Prüfspezifikation.
 *
 * Kategorie D (Kleinstunternehmen-Ausnahme wahrscheinlich) kann das Werkzeug allein aus
 * Website-Signalen nicht vergeben – Beschäftigtenzahl und Umsatz stehen auf keiner Website.
 * Sie wird nur gesetzt, wenn die Prüferin/der Prüfer recherchierte Werte übergibt.
 */
export function bfsgStatus(context, unternehmen = {}) {
  const i = context.indication;
  const s = context.signals || {};
  const b2c = s.b2c && s.b2c.found ? 'JA' : (s.b2b && s.b2b.found ? 'NEIN' : 'UNKLAR');
  const ecom = i.electronicCommerce === 'deutliche Hinweise' ? 'JA'
    : i.electronicCommerce === 'schwache Hinweise' ? 'UNKLAR' : 'NEIN';

  // Kleinstunternehmen: < 10 Beschäftigte UND (Umsatz <= 2 Mio ODER Bilanzsumme <= 2 Mio)
  let kleinst = 'UNKLAR';
  if (unternehmen.beschaeftigte != null && (unternehmen.umsatzMio != null || unternehmen.bilanzsummeMio != null)) {
    const unterSchwelle = (unternehmen.umsatzMio != null && unternehmen.umsatzMio <= 2)
      || (unternehmen.bilanzsummeMio != null && unternehmen.bilanzsummeMio <= 2);
    kleinst = unternehmen.beschaeftigte < 10 && unterSchwelle ? 'JA' : 'NEIN';
  }

  // Öffentliche Stellen unterliegen BGG/BITV 2.0 bzw. Landesrecht, nicht dem BFSG.
  const OEFFENTLICH = /(\.bund\.de|\.bayern\.de|\.nrw\.de|\.niedersachsen\.de|bundesfachstelle|bundesamt|bundesministerium|ministerium|landkreis|stadt-|stadtverwaltung|gemeinde|kreisverwaltung|behoerde|hochschule|universit|\.schule)/i;
  const oeffentlicheStelle = OEFFENTLICH.test(context.baseUrl || '');

  let kategorie, label;
  if (oeffentlicheStelle) {
    kategorie = 'E'; label = 'nicht ausreichend feststellbar – Hinweise auf eine öffentliche Stelle (dann BGG/BITV 2.0 bzw. Landesrecht statt BFSG)';
  } else if (kleinst === 'JA' && (ecom === 'JA' || ecom === 'UNKLAR')) {
    kategorie = 'D'; label = 'Kleinstunternehmen-Ausnahme wahrscheinlich';
  } else if (i.sectorSpecific.length || (ecom === 'JA' && b2c !== 'NEIN')) {
    kategorie = 'A'; label = 'BFSG wahrscheinlich relevant';
  } else if (ecom === 'UNKLAR') {
    kategorie = 'B'; label = 'BFSG möglicherweise relevant';
  } else if (ecom === 'NEIN' && b2c === 'NEIN') {
    kategorie = 'C'; label = 'BFSG wahrscheinlich nicht relevant';
  } else {
    kategorie = 'E'; label = 'nicht ausreichend feststellbar';
  }

  const begruendung = [];
  if (oeffentlicheStelle) begruendung.push('Domain/Name deutet auf eine öffentliche Stelle hin – Anwendungsbereich des BFSG (private Wirtschaftsakteure) ist dann zu hinterfragen; einschlägig sind regelmässig BGG/BITV 2.0 oder Landesgesetze');
  if (i.sectorSpecific.length) begruendung.push(`branchenspezifische Dienstleistung nach § 1 Abs. 3 BFSG: ${i.sectorSpecific.join(', ')}`);
  begruendung.push(`elektronischer Geschäftsverkehr (§ 2 Nr. 26 BFSG): ${i.electronicCommerce}`);
  begruendung.push(`Verbraucherbezug (§ 2 Nr. 16 BFSG): ${i.consumerFacing}`);
  begruendung.push(kleinst === 'UNKLAR'
    ? 'Kleinstunternehmen-Schwelle (§ 2 Nr. 17 BFSG) nicht feststellbar – Beschäftigtenzahl und Umsatz sind aus der Website nicht ableitbar'
    : `Kleinstunternehmen nach § 2 Nr. 17 BFSG: ${kleinst}`);

  return {
    kategorie, label, b2c, elektronischerGeschaeftsverkehr: ecom, kleinstunternehmen: kleinst,
    dienstleistung: i.sectorSpecific.length ? i.sectorSpecific.join(', ') : 'nicht eindeutig branchenspezifisch',
    begruendung,
    rechtlicheSicherheit: kategorie === 'E' || kleinst === 'UNKLAR' ? 'NIEDRIG' : (kategorie === 'A' ? 'MITTEL' : 'MITTEL'),
    quellen: [
      'BFSG: https://www.gesetze-im-internet.de/bfsg/ (§§ 1, 2, 3, 14, 16, 17, 38)',
      'BFSGV: https://www.gesetze-im-internet.de/bfsgv/ (§§ 3, 12, 13, 19, 21)',
      'EN 301 549 / WCAG 2.1 A+AA als technische Referenz',
      'Website-Signale des vorliegenden Laufs (siehe Abschnitt 2)',
    ],
  };
}

function bfsgAssessment(context, short = false, unternehmen = {}) {
  const st = bfsgStatus(context, unternehmen);
  const out = [];
  out.push(`**BFSG-Status: ${st.kategorie} – ${st.label}**`);
  out.push('');
  out.push(`- B2C: **${st.b2c}**`);
  out.push(`- Elektronischer Geschäftsverkehr: **${st.elektronischerGeschaeftsverkehr}**`);
  out.push(`- Kleinstunternehmen: **${st.kleinstunternehmen}**`);
  out.push(`- Relevante Dienstleistung: ${st.dienstleistung}`);
  out.push(`- Rechtliche Sicherheit dieser Einschätzung: **${st.rechtlicheSicherheit}**`);
  out.push('');
  out.push('**Begründung:**');
  out.push(...st.begruendung.map((b) => `- ${b}`));
  out.push('');
  out.push('**Offene Punkte, die die Einordnung ändern können:**');
  out.push('- Kleinstunternehmen-Ausnahme (§ 3 Abs. 3 i. V. m. § 2 Nr. 17 BFSG): weniger als 10 Beschäftigte **und** (Jahresumsatz ≤ 2 Mio. € **oder** Jahresbilanzsumme ≤ 2 Mio. €). Zu recherchieren über Unternehmensregister, Bundesanzeiger und Geschäftsberichte.');
  out.push('- Übergangsbestimmungen nach § 38 BFSG (vor dem 28.06.2025 eingesetzte Produkte und geschlossene Verträge, längstens bis 27.06.2030).');
  out.push('- Ausnahmen nach § 16 BFSG (grundlegende Veränderung) und § 17 BFSG (unverhältnismässige Belastung) – nur vom Wirtschaftsakteur selbst zu beurteilen und zu dokumentieren.');
  out.push('- Nicht erfasste Inhalte nach § 1 Abs. 4 BFSG (u. a. vor dem 28.06.2025 veröffentlichte Medien und Bürodateiformate, Kartendienste, Inhalte Dritter, Archive).');
  out.push('');
  out.push('**Quellen:**');
  out.push(...st.quellen.map((q) => `- ${q}`));
  out.push('');
  out.push('**Eine abschliessende rechtliche Bewertung ist anhand öffentlich verfügbarer Informationen nicht möglich.** Dieser Bericht ersetzt keine Rechtsberatung.');
  if (!short) {
    out.push('');
    out.push('Zuständig für die Marktüberwachung von Dienstleistungen sind die Marktüberwachungsstellen der Länder (§§ 28 ff. BFSG); Verbraucherinnen und Verbraucher sowie anerkannte Verbände haben Rechte nach §§ 32–34 BFSG.');
  }
  return out;
}

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Minimaler Markdown→HTML-Wandler für den Bericht (Überschriften, Tabellen, Listen, Zitate). */
function mdToHtml(md) {
  const inline = (s) => escHtml(s)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)|]+)/g, '$1<a href="$2">$2</a>')
    .replace(/\\\|/g, '|');
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  const closeList = (tag) => { if (tag) out.push(`</${tag}>`); };
  let listTag = null;
  let inCode = false;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      closeList(listTag); listTag = null;
      out.push(inCode ? '</pre>' : '<pre>');
      inCode = !inCode; i++; continue;
    }
    if (inCode) { out.push(escHtml(line)); i++; continue; }
    const table = /^\|(.+)\|\s*$/.exec(line);
    if (table && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      closeList(listTag); listTag = null;
      const cells = (l) => l.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
      out.push('<div class="table-wrap"><table><thead><tr>' + cells(line).map((c) => `<th scope="col">${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
      i += 2;
      while (i < lines.length && /^\|(.+)\|\s*$/.test(lines[i])) {
        out.push('<tr>' + cells(lines[i]).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
        i++;
      }
      out.push('</tbody></table></div>');
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { closeList(listTag); listTag = null; out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^>\s?/.test(line)) {
      closeList(listTag); listTag = null;
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote><p>${inline(buf.join(' '))}</p></blockquote>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) { closeList(listTag); listTag = null; out.push('<hr>'); i++; continue; }
    const li = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      const want = /^\d+\./.test(li[2]) ? 'ol' : 'ul';
      if (listTag !== want) { closeList(listTag); out.push(`<${want}>`); listTag = want; }
      out.push(`<li>${inline(li[3])}</li>`);
      i++; continue;
    }
    if (!line.trim()) { closeList(listTag); listTag = null; i++; continue; }
    closeList(listTag); listTag = null;
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  closeList(listTag);
  return out.join('\n');
}

export function buildHtml(markdown, title) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.6; max-width: 62rem; margin: 0 auto; padding: 1.5rem; background: #fff; color: #16181d; }
  h1, h2, h3 { line-height: 1.25; }
  h2 { margin-top: 2.5rem; border-bottom: 1px solid currentColor; padding-bottom: .25rem; }
  h3 { margin-top: 2rem; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .92em; background: #f0f1f4; padding: .1em .3em; border-radius: 3px; word-break: break-word; }
  .table-wrap { overflow-x: auto; margin: 1rem 0; }
  table { border-collapse: collapse; width: 100%; font-size: .95rem; }
  th, td { border: 1px solid #b9bec7; padding: .4rem .6rem; text-align: left; vertical-align: top; }
  th { background: #eef0f4; }
  blockquote { border-left: 4px solid #0b57d0; margin: 1rem 0; padding: .5rem 1rem; background: #f4f7fd; }
  a { color: #0b46a8; }
  a:focus-visible, :focus-visible { outline: 3px solid #0b57d0; outline-offset: 2px; }
  @media (prefers-color-scheme: dark) {
    body { background: #101216; color: #e9ecf1; }
    a { color: #9dc0ff; }
    code { background: #21252c; }
    th { background: #1d2128; }
    th, td { border-color: #444b56; }
    blockquote { background: #171b22; border-left-color: #9dc0ff; }
  }
</style>
</head>
<body>
<main>
${mdToHtml(markdown)}
</main>
</body>
</html>`;
}
