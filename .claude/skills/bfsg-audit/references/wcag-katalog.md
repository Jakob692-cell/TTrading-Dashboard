# Zulässiger WCAG-Katalog (Stufen A und AA)

Nur diese Erfolgskriterien dürfen in Befunden referenziert werden. Der Katalog ist identisch mit
`tools/bfsg-audit/src/wcag.mjs`; dort führt eine unbekannte ID bewusst zu einem Fehler, damit keine
erfundenen Kriterien in Berichte gelangen. Ist keine sichere Zuordnung möglich:
**„WCAG-Zuordnung nicht eindeutig"**.

Normbezug: EN 301 549 V3.2.1 verweist auf **WCAG 2.1 A/AA**. Mit **[2.2]** markierte Kriterien sind
erst mit WCAG 2.2 hinzugekommen und werden als Empfehlung geführt.

## 1 Wahrnehmbar

| ID | Titel | Stufe |
| --- | --- | --- |
| 1.1.1 | Nicht-Text-Inhalt | A |
| 1.2.1 | Reine Audio- und reine Videoinhalte (aufgezeichnet) | A |
| 1.2.2 | Untertitel (aufgezeichnet) | A |
| 1.2.3 | Audiodeskription oder Volltext-Alternative (aufgezeichnet) | A |
| 1.2.4 | Untertitel (live) | AA |
| 1.2.5 | Audiodeskription (aufgezeichnet) | AA |
| 1.3.1 | Info und Beziehungen | A |
| 1.3.2 | Bedeutungstragende Reihenfolge | A |
| 1.3.3 | Sensorische Eigenschaften | A |
| 1.3.4 | Ausrichtung | AA |
| 1.3.5 | Eingabezweck bestimmen | AA |
| 1.4.1 | Benutzung von Farbe | A |
| 1.4.2 | Audio-Steuerelement | A |
| 1.4.3 | Kontrast (Minimum) | AA |
| 1.4.4 | Textgrösse ändern | AA |
| 1.4.5 | Bilder eines Textes | AA |
| 1.4.10 | Reflow | AA |
| 1.4.11 | Nicht-Text-Kontrast | AA |
| 1.4.12 | Textabstand | AA |
| 1.4.13 | Inhalt bei Hover oder Fokus | AA |

## 2 Bedienbar

| ID | Titel | Stufe |
| --- | --- | --- |
| 2.1.1 | Tastatur | A |
| 2.1.2 | Keine Tastaturfalle | A |
| 2.1.4 | Tastenkürzel mit einzelnen Zeichen | A |
| 2.2.1 | Zeiteinteilung anpassbar | A |
| 2.2.2 | Pausieren, stoppen, ausblenden | A |
| 2.3.1 | Grenzwert von dreimaligem Blitzen oder weniger | A |
| 2.4.1 | Blöcke umgehen | A |
| 2.4.2 | Seite mit Titel versehen | A |
| 2.4.3 | Fokus-Reihenfolge | A |
| 2.4.4 | Linkzweck (im Kontext) | A |
| 2.4.5 | Verschiedene Methoden | AA |
| 2.4.6 | Überschriften und Beschriftungen | AA |
| 2.4.7 | Fokus sichtbar | AA |
| 2.4.11 | Fokus nicht verdeckt (Minimum) | AA **[2.2]** |
| 2.5.1 | Zeigergesten | A |
| 2.5.2 | Zeiger-Abbruch | A |
| 2.5.3 | Beschriftung im Namen | A |
| 2.5.4 | Bewegungsaktivierung | A |
| 2.5.7 | Ziehbewegungen | AA **[2.2]** |
| 2.5.8 | Zielgrösse (Minimum) | AA **[2.2]** |

## 3 Verständlich

| ID | Titel | Stufe |
| --- | --- | --- |
| 3.1.1 | Sprache der Seite | A |
| 3.1.2 | Sprache von Teilen | AA |
| 3.2.1 | Bei Fokus | A |
| 3.2.2 | Bei Eingabe | A |
| 3.2.3 | Konsistente Navigation | AA |
| 3.2.4 | Konsistente Erkennung | AA |
| 3.2.6 | Konsistente Hilfe | A **[2.2]** |
| 3.3.1 | Fehlererkennung | A |
| 3.3.2 | Beschriftungen oder Anweisungen | A |
| 3.3.3 | Fehlerempfehlung | AA |
| 3.3.4 | Fehlervermeidung (rechtlich, finanziell, Daten) | AA |
| 3.3.7 | Redundante Eingabe | A **[2.2]** |
| 3.3.8 | Barrierefreie Authentifizierung (Minimum) | AA **[2.2]** |

## 4 Robust

| ID | Titel | Stufe |
| --- | --- | --- |
| 4.1.1 | Parsing | A – **in WCAG 2.2 entfallen** |
| 4.1.2 | Name, Rolle, Wert | A |
| 4.1.3 | Statusmeldungen | AA |

## Häufige Fehlzuordnungen (vermeiden)

- **Neues Fenster ohne Ankündigung** → 3.2.5 ist Stufe **AAA**, nicht AA. Als Best-Practice-Befund
  ohne WCAG-Zuordnung führen (Technik G201).
- **Doppelte IDs** → nicht mehr über 4.1.1 begründen (entfallen), sondern über 1.3.1/4.1.2, sofern
  Namen oder Beziehungen betroffen sind.
- **Zielgrösse 44 × 44 px** → das ist 2.5.5 (AAA). Auf AA-Ebene gilt 2.5.8 mit 24 × 24 px.
- **Kontrast von Fokusindikatoren** → 1.4.11 (Nicht-Text-Kontrast); die dickere Anforderung 2.4.13
  „Fokusdarstellung" ist AAA.
- **Untertitel bei Livestreams** → 1.2.4, nicht 1.2.2.
- **Alternativtext-Qualität** → 1.1.1 gilt, aber die inhaltliche Angemessenheit ist nicht
  automatisiert prüfbar; als „MANUELLE PRÜFUNG ERFORDERLICH" kennzeichnen.
