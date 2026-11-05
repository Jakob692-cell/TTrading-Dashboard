# Van Eik – Pitch-Deck „Für unsere Eltern“

Neues, komplett überarbeitetes Pitch-Deck für **Van Eik** (Oskar Roth · Oskar Kunhart · Jakob Rösler).
Ziel des Pitches: kein Geld, sondern das **Okay der Eltern**, Van Eik zu starten.

## Dateien

| Datei | Wofür |
|---|---|
| `Van_Eik_Pitch.pdf` | Fertiges Deck als PDF (16:9, 18 Folien) – zum Verschicken oder Ausdrucken |
| `index.html` | Präsentationsansicht im Browser: Pfeiltasten oder Klick zum Blättern, **F** für Vollbild. Das Sample-Video läuft auf Folie 7 automatisch. |
| `png/` | Jede Folie als Bild (z. B. für WhatsApp) |
| `deck-source/project/` | Quelle der Folien (eine HTML-Datei pro Folie, Sprechertexte im `<aside>`) |
| `assets/` | Logo (freigestellt), Gürtel-Illustrationen (SVG), Frames und Clip aus dem Sample-Video, Shop-Screenshots |
| `build.mjs` | Baut `index.html`, `png/` und das PDF neu |

## Neu bauen

```bash
node pitch/build.mjs           # index.html + png/ + Van_Eik_Pitch.pdf
node pitch/build.mjs --no-pdf  # nur HTML und Bilder
```

Benötigt Node.js und Playwright mit Chromium.

## Aufbau (18 Folien)

1. Cover · 2. Vorweg: 0 € von euch · 3. Die Marke · 4. Das Team · 5. Das Produkt · 6. Der Preis (125 € → 59 €)
7. Der Beweis (echtes Sample-Video) · 8. Der Shop · 9. Marketing · 10. Partner Solfaire · 11. Logistik
12. Die Rechnung pro Gürtel · 13. Startbudget & Break-even · 14. Organisation & Transparenz · 15. Risiken – ganz ehrlich
16. Die Zukunft · 17. Nächste Schritte · 18. Unser Deal

## Gerechnete Zahlen (alle aus euren eigenen Angaben)

- Pro Gürtel im eigenen Shop: 59 € − ca. 16 € = **ca. 43 €** (≈ 73 %)
- Über Solfaire (Annahme: die 20 % gehen an Solfaire): 59 € − 11,80 € − 16 € = **31,20 €**
- Startbudget: 200 € Einlage + 10 Samples × ca. 16 € = **ca. 360 €** → **ca. 120 € pro Gründer**
- Break-even: 360 € ÷ 43 € ≈ 8,4 → **ab dem 9. verkauften Gürtel**
- Videos: 10 Freunde × 1 Video/Woche = 10 pro Woche ≈ **1,4 pro Tag**

Noch **nicht** eingerechnet: Shop-Abo, Zahlungsgebühren, Versand zum Kunden, Einfuhrumsatzsteuer, die Agentur-Idee (150 €).
