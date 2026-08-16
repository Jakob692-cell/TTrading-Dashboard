/**
 * Fester WCAG-Katalog (WCAG 2.1 + Ergänzungen aus WCAG 2.2), Konformitätsstufen A und AA.
 *
 * Zweck: Es dürfen ausschliesslich real existierende Erfolgskriterien referenziert werden.
 * Jede Zuordnung im Audit läuft über wcagRef(); unbekannte IDs führen zur ausdrücklichen
 * Kennzeichnung "WCAG-Zuordnung nicht eindeutig" statt zu einer erfundenen Referenz.
 *
 * Normbezug: EN 301 549 V3.2.1 (2021-03) verweist für Web-Inhalte auf WCAG 2.1 Stufe A/AA.
 * Kriterien, die erst mit WCAG 2.2 hinzugekommen sind, sind mit `since22: true` markiert
 * und werden im Bericht als "über den aktuell referenzierten Normstand hinausgehend"
 * ausgewiesen (siehe references/rechtsgrundlagen-bfsg.md).
 */

const C = (id, title, level, opts = {}) => [id, { id, title, level, ...opts }];

export const WCAG = Object.fromEntries([
  // 1 Wahrnehmbar
  C('1.1.1', 'Nicht-Text-Inhalt', 'A'),
  C('1.2.1', 'Reine Audio- und reine Videoinhalte (aufgezeichnet)', 'A'),
  C('1.2.2', 'Untertitel (aufgezeichnet)', 'A'),
  C('1.2.3', 'Audiodeskription oder Volltext-Alternative (aufgezeichnet)', 'A'),
  C('1.2.4', 'Untertitel (live)', 'AA'),
  C('1.2.5', 'Audiodeskription (aufgezeichnet)', 'AA'),
  C('1.3.1', 'Info und Beziehungen', 'A'),
  C('1.3.2', 'Bedeutungstragende Reihenfolge', 'A'),
  C('1.3.3', 'Sensorische Eigenschaften', 'A'),
  C('1.3.4', 'Ausrichtung', 'AA'),
  C('1.3.5', 'Eingabezweck bestimmen', 'AA'),
  C('1.4.1', 'Benutzung von Farbe', 'A'),
  C('1.4.2', 'Audio-Steuerelement', 'A'),
  C('1.4.3', 'Kontrast (Minimum)', 'AA'),
  C('1.4.4', 'Textgrösse ändern', 'AA'),
  C('1.4.5', 'Bilder eines Textes', 'AA'),
  C('1.4.10', 'Reflow', 'AA'),
  C('1.4.11', 'Nicht-Text-Kontrast', 'AA'),
  C('1.4.12', 'Textabstand', 'AA'),
  C('1.4.13', 'Inhalt bei Hover oder Fokus', 'AA'),
  // 2 Bedienbar
  C('2.1.1', 'Tastatur', 'A'),
  C('2.1.2', 'Keine Tastaturfalle', 'A'),
  C('2.1.4', 'Tastenkürzel mit einzelnen Zeichen', 'A'),
  C('2.2.1', 'Zeiteinteilung anpassbar', 'A'),
  C('2.2.2', 'Pausieren, stoppen, ausblenden', 'A'),
  C('2.3.1', 'Grenzwert von dreimaligem Blitzen oder weniger', 'A'),
  C('2.4.1', 'Blöcke umgehen', 'A'),
  C('2.4.2', 'Seite mit Titel versehen', 'A'),
  C('2.4.3', 'Fokus-Reihenfolge', 'A'),
  C('2.4.4', 'Linkzweck (im Kontext)', 'A'),
  C('2.4.5', 'Verschiedene Methoden', 'AA'),
  C('2.4.6', 'Überschriften und Beschriftungen', 'AA'),
  C('2.4.7', 'Fokus sichtbar', 'AA'),
  C('2.4.11', 'Fokus nicht verdeckt (Minimum)', 'AA', { since22: true }),
  C('2.5.1', 'Zeigergesten', 'A'),
  C('2.5.2', 'Zeiger-Abbruch', 'A'),
  C('2.5.3', 'Beschriftung im Namen', 'A'),
  C('2.5.4', 'Bewegungsaktivierung', 'A'),
  C('2.5.7', 'Ziehbewegungen', 'AA', { since22: true }),
  C('2.5.8', 'Zielgrösse (Minimum)', 'AA', { since22: true }),
  // 3 Verständlich
  C('3.1.1', 'Sprache der Seite', 'A'),
  C('3.1.2', 'Sprache von Teilen', 'AA'),
  C('3.2.1', 'Bei Fokus', 'A'),
  C('3.2.2', 'Bei Eingabe', 'A'),
  C('3.2.3', 'Konsistente Navigation', 'AA'),
  C('3.2.4', 'Konsistente Erkennung', 'AA'),
  C('3.2.6', 'Konsistente Hilfe', 'A', { since22: true }),
  C('3.3.1', 'Fehlererkennung', 'A'),
  C('3.3.2', 'Beschriftungen oder Anweisungen', 'A'),
  C('3.3.3', 'Fehlerempfehlung', 'AA'),
  C('3.3.4', 'Fehlervermeidung (rechtlich, finanziell, Daten)', 'AA'),
  C('3.3.7', 'Redundante Eingabe', 'A', { since22: true }),
  C('3.3.8', 'Barrierefreie Authentifizierung (Minimum)', 'AA', { since22: true }),
  // 4 Robust
  C('4.1.1', 'Parsing', 'A', { obsolete: true }),
  C('4.1.2', 'Name, Rolle, Wert', 'A'),
  C('4.1.3', 'Statusmeldungen', 'AA'),
]);

/** Gibt eine gesicherte WCAG-Referenz zurück oder `null`, wenn die ID nicht im Katalog steht. */
export function wcagRef(id) {
  if (!id) return null;
  const c = WCAG[id];
  if (!c) return null;
  return c;
}

export const WCAG_UNCLEAR = 'WCAG-Zuordnung nicht eindeutig';

/** Formatiert eine WCAG-Referenz für den Bericht. */
export function wcagLabel(id) {
  const c = wcagRef(id);
  if (!c) return WCAG_UNCLEAR;
  let s = `${c.id} ${c.title} (${c.level})`;
  if (c.since22) s += ' [neu in WCAG 2.2]';
  if (c.obsolete) s += ' [in WCAG 2.2 entfallen]';
  return s;
}

/**
 * Übersetzt axe-core-Tags (z. B. "wcag143", "wcag2aa") in Katalog-IDs.
 * Nur Treffer, die im Katalog existieren, werden übernommen.
 */
export function wcagFromAxeTags(tags = []) {
  const out = [];
  for (const t of tags) {
    const m = /^wcag(\d)(\d)(\d{1,2})$/.exec(t);
    if (!m) continue;
    const id = `${m[1]}.${m[2]}.${Number(m[3])}`;
    if (WCAG[id] && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Konformitätsstufe für eine Menge von Kriterien: die strengste betroffene Stufe.
 * Ohne gesicherte Zuordnung: "nicht eindeutig".
 */
export function wcagLevel(ids = []) {
  const stufen = ids.map((id) => (WCAG[id] || {}).level).filter(Boolean);
  if (!stufen.length) return 'nicht eindeutig';
  if (stufen.includes('A') && stufen.includes('AA')) return 'A/AA';
  return stufen[0];
}
