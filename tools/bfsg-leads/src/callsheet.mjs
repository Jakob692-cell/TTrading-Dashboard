/**
 * Ausgabe: Anrufliste als CSV (Excel-tauglich), Markdown und HTML.
 * Jeder Eintrag enthält den Aufhänger aus echten Befunden und die Dokumentation
 * der mutmasslichen Einwilligung.
 */
import { pitchSatz } from './score.mjs';

const csvFeld = (v) => {
  const s = v == null ? '' : String(v).replace(/\r?\n/g, ' ').trim();
  return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildCsv(leads) {
  const kopf = [
    'Segment', 'Score', 'Firma', 'Branche', 'PLZ', 'Ort', 'Telefon', 'E-Mail', 'Website',
    'Ansprechpartner', 'Rechtsform', 'BFSG-Relevanz (0-40)', 'Barrieren (0-40)', 'Erreichbarkeit (0-20)',
    'CRITICAL', 'HIGH', 'MEDIUM', 'Aufhänger 1', 'Aufhänger 2', 'Aufhänger 3',
    'Hinweise', 'Ausschlussgrund', 'Geprüft am', 'Quelle', 'Status', 'Notiz',
  ];
  const zeilen = [kopf.join(';')];
  for (const l of leads) {
    const b = l.bewertung;
    const k = l.kontakt;
    zeilen.push([
      b.segment, b.score, l.name, l.branchenLabel || l.branche, k.plz || l.plz, k.ort || l.ort,
      k.telefon || '', k.email || '', l.website, k.ansprechpartner || '', k.rechtsform || '',
      b.punkte.bfsgRelevanz, b.punkte.barrieren, b.punkte.ansprechbarkeit,
      b.befundZaehler.CRITICAL, b.befundZaehler.HIGH, b.befundZaehler.MEDIUM,
      (b.aufhaenger[0] || {}).klartext || '', (b.aufhaenger[1] || {}).klartext || '', (b.aufhaenger[2] || {}).klartext || '',
      b.flags.join(' | '), b.ausschluss.join(' | '), (l.geprueftAm || '').slice(0, 10), l.quelle,
      '', '',
    ].map(csvFeld).join(';'));
  }
  return '﻿' + zeilen.join('\n') + '\n';
}

export function buildMarkdown(leads, meta) {
  const aktiv = leads.filter((l) => !l.bewertung.ausschluss.length);
  const raus = leads.filter((l) => l.bewertung.ausschluss.length);
  const nachSegment = (s) => aktiv.filter((l) => l.bewertung.segment === s);
  const L = [];
  const P = (...x) => L.push(...x, '');

  P(`# Anrufliste Barrierefreiheit – ${meta.region || 'eigene Liste'}`);
  P(
    `Erstellt am ${new Date().toISOString().slice(0, 10)} · Kandidaten geprüft: ${leads.length} · anrufbar: ${aktiv.filter((l) => l.kontakt.telefon).length}`,
    `Quelle der Betriebsdaten: ${meta.quelle || 'OpenStreetMap (© OpenStreetMap-Mitwirkende, ODbL)'} · Website-Prüfung: eigener Kurzcheck + axe-core`,
  );
  P(
    '> **Vor dem ersten Anruf lesen.** Diese Liste ist eine Vertriebsvorbereitung, kein Rechtsgutachten.',
    '> Es wird nirgends festgestellt, dass ein Betrieb gegen das BFSG verstösst – der Kurzcheck zeigt technische Mängel,',
    '> die rechtliche Einordnung bleibt offen. Angerufen werden ausschliesslich Gewerbebetriebe unter ihrer',
    '> veröffentlichten Geschäftsnummer (§ 7 Abs. 2 Nr. 1 UWG: mutmaßliche Einwilligung). Keine Anrufe bei',
    '> Privatpersonen, keine Werbe-E-Mails ohne vorherige ausdrückliche Einwilligung.',
  );

  P('## Überblick');
  L.push('| Segment | Anzahl | Bedeutung |', '| --- | --- | --- |');
  L.push(`| A | ${nachSegment('A').length} | hohe BFSG-Relevanz und deutliche Mängel – zuerst anrufen |`);
  L.push(`| B | ${nachSegment('B').length} | solide Ausgangslage |`);
  L.push(`| C | ${nachSegment('C').length} | eher Website-Relaunch-Thema als BFSG |`);
  L.push(`| D | ${nachSegment('D').length} | schwach – nur bei Leerlauf |`);
  L.push(`| ausgeschlossen | ${raus.length} | nicht anrufen (siehe unten) |`);
  L.push('');

  P('## Anrufliste');
  for (const seg of ['A', 'B', 'C', 'D']) {
    const gruppe = nachSegment(seg);
    if (!gruppe.length) continue;
    L.push(`### Segment ${seg}`, '');
    for (const l of gruppe) {
      const b = l.bewertung;
      const k = l.kontakt;
      L.push(`#### ${l.name || l.host} · Score ${b.score}`, '');
      L.push(`- **Telefon:** ${k.telefon || '– keine Nummer gefunden –'}${k.ansprechpartner ? ` · **Ansprechpartner:** ${k.ansprechpartner}` : ''}`);
      L.push(`- **Website:** ${l.website} · **Branche:** ${l.branchenLabel || l.branche}`);
      L.push(`- **Adresse:** ${[k.strasse || l.strasse, [k.plz || l.plz, k.ort || l.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'unbekannt'}`);
      L.push(`- **Befunde im Kurzcheck:** ${b.befundZaehler.CRITICAL} kritisch, ${b.befundZaehler.HIGH} hoch, ${b.befundZaehler.MEDIUM} mittel`);
      L.push(`- **BFSG-Indizien:** ${b.relevanzGruende.length ? b.relevanzGruende.join('; ') : 'keine deutlichen Hinweise auf Online-Vertragsabschluss'}`);
      L.push('');
      L.push(`**Einstieg:** „${pitchSatz(l, b)}“`, '');
      if (b.aufhaenger.length) {
        L.push('**Belege für das Gespräch:**', '');
        b.aufhaenger.forEach((a, i) => L.push(`  ${i + 1}. ${a.klartext} (${a.anzahl} Stelle(n), WCAG ${a.wcag.join(', ') || 'ohne eindeutige Zuordnung'}, geprüft: ${a.belegUrl})`));
        L.push('');
      }
      if (b.flags.length) { L.push('**Hinweise:** ' + b.flags.join(' · '), ''); }
      L.push(`**Mutmaßliche Einwilligung dokumentiert:** ${b.mutmasslicheEinwilligung.sachlicherZusammenhang.join(' ')}`, '');
      L.push('| Anruf am | Ergebnis | Wiedervorlage |', '| --- | --- | --- |', '|  |  |  |', '');
    }
  }

  if (raus.length) {
    P('## Nicht anrufen');
    L.push('| Firma | Website | Grund |', '| --- | --- | --- |');
    for (const l of raus) L.push(`| ${l.name || ''} | ${l.website} | ${l.bewertung.ausschluss.join('; ')} |`);
    L.push('');
  }

  P('## Regeln für dieses Projekt');
  P(
    '1. Nur Gewerbebetriebe, nur unter der veröffentlichten Geschäftsnummer. Wirkt eine Nummer privat: nicht anrufen.',
    '2. Kein Anruf mehr nach Widerspruch – Eintrag sofort in `sperrliste.txt` aufnehmen.',
    '3. Keine Werbe-E-Mail und kein Fax ohne vorherige ausdrückliche Einwilligung (§ 7 Abs. 2 Nr. 2 UWG).',
    '4. Am Telefon nie behaupten, der Betrieb verstosse gegen das BFSG, werde abgemahnt oder müsse zahlen. Gesagt wird, was gemessen wurde – und dass die rechtliche Einordnung von Unternehmensgrösse und Online-Angebot abhängt.',
    '5. Kleinstunternehmen (< 10 Beschäftigte und höchstens 2 Mio. € Umsatz oder Bilanzsumme) sind bei Dienstleistungen vom BFSG ausgenommen (§ 3 Abs. 3 BFSG). Das offen ansprechen – Barrierefreiheit bleibt trotzdem ein Verkaufsargument (mehr erreichbare Kundschaft, bessere Auffindbarkeit, weniger Absprünge auf dem Handy).',
    '6. Auf Wunsch die Datenherkunft nennen: öffentlich zugängliche Website und OpenStreetMap.',
  );
  return L.join('\n');
}

/** Kompakte Übersicht für den schnellen Blick (eine Zeile je Lead). */
export function buildKurzliste(leads) {
  const aktiv = leads.filter((l) => !l.bewertung.ausschluss.length && l.kontakt.telefon);
  const L = ['| Segment | Score | Firma | Telefon | Aufhänger |', '| --- | --- | --- | --- | --- |'];
  for (const l of aktiv) {
    L.push(`| ${l.bewertung.segment} | ${l.bewertung.score} | ${l.name || l.host} | ${l.kontakt.telefon} | ${(l.bewertung.aufhaenger[0] || {}).klartext || '–'} |`);
  }
  return L.join('\n');
}
