# Van Eik – Konzept-Deck

Neu gestaltetes Deck für **Van Eik**. Inhaltlich hält es sich nur an das Original-Deck: Es stellt das Konzept vor und spricht niemanden direkt an.

## Dateien

| Datei | Wofür |
|---|---|
| `Van_Eik_Pitch.pdf` | Fertiges Deck als PDF (16:9, 9 Folien) – zum Verschicken oder Ausdrucken |
| `index.html` | Präsentationsansicht im Browser: Pfeiltasten oder Klick zum Blättern, **F** für Vollbild. Das Sample-Video läuft auf Folie 5 automatisch. |
| `png/` | Jede Folie als Bild |
| `deck-source/project/` | Quelle der Folien (eine HTML-Datei pro Folie) |
| `assets/` | Logo (freigestellt), Gürtel-Illustrationen (SVG), Frames und Clip aus dem Sample-Video, Screenshots |
| `build.mjs` | Baut `index.html`, `png/` und das PDF neu |
| `VORBEREITUNG.md` | Offene Punkte, die ihr unabhängig vom Deck klären solltet |

## Neu bauen

```bash
node pitch/build.mjs           # index.html + png/ + Van_Eik_Pitch.pdf
node pitch/build.mjs --no-pdf  # nur HTML und Bilder
```

Benötigt Node.js und Playwright mit Chromium.

## Aufbau (9 Folien, wie im Original)

1. Cover
2. Was ist Van Eik? – Marke und langfristige Ziele
3. Unsere Produkte – der klassische Polo Belt, 3 Farben, 59 €
4. In der Zukunft – weitere Farben, eigene Farbwahl, Initialen, Pullover
5. Marketingkonzept – 10 Samples, Videos, Agentur Expandia
6. Organisation & Transparenz
7. Zusammenarbeit mit Solfaire
8. Logistik
9. Was steht als Nächstes an?
