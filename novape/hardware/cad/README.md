# NoVape One – CAD

`novape-one.scad` ist das parametrische Modell aller Druckteile (OpenSCAD 2021 oder neuer).
Alle Hauptmaße stehen oben in der Datei: Gehäuse, Luftweg (Einlass-Ø, Bypass-Rille),
Kartusche, Kopf und die Maße der V0-Module. Die fertigen STL-Dateien liegen in `stl/`.

Koordinaten: mm, z nach oben, z = 0 ist die Unterkante des Geräts. Vorne (Taste,
Lichtstreifen) ist +y, der Lufteinlass sitzt rechts (+x) – gleiches System wie das 3D-Modell
im Bauplan.

## Teile

| Datei | Teil | Druck |
| --- | --- | --- |
| `kopfteil.stl` | Pod-Aufnahme + Pod-Sockel in einem Teil: Dichtschacht, Einlasskammer, Einlasskanal Ø 1,2, Sensor-Port Ø 1,0 mit Membransenkung, Taschen für 2 Stahlscheiben | Standard-Harz schwarz |
| `kappe.stl` | Mundstück-Kappe, 0,9 mm Wand, Auslass 7,2 × 2, 2 Magnettaschen Ø 2,1 | **nur biokompatibles Harz** (Mundkontakt) |
| `kartusche_unterteil.stl` | Docht-Bohrung Ø 5,9, drei Stützrippen, Bypass-Rille 0,5 × 0,5, Einlass Ø 2,4 | klar |
| `kartusche_oberteil.stl` | Deckel, Ventiltasche Ø 3,9 × 0,5, Stiel Ø 4,2 / 2,8, Y-Trichter bis 98,7 mm | klar oder schwarz |
| `huelse.stl` | Gehäuse mit 1,2 mm Wand, Lichtschlitz 1 × 7,1, Tastenfenster 5,4 × 12,4, Einlass Ø 1,0 | Standard, danach lackieren |
| `bodenkappe_v0.stl` | Boden für das V0-Muster mit Öffnung für XIAO und USB-C-Stecker, Rastlaschen | Standard |
| `chassis_v0.stl` | Innenleben V0: Querplatte für die XIAO-Oberkante, Rückgrat (Akku hinten), Motortasche, Tasterhalter, Sensor-Ablage, LED-Halter | Standard |
| `taste.stl`, `lichtleiter.stl` | Tastkappe mit Stößel; Lichtleiter mit Fuß zur LED | Standard / klar |
| `dichtung.dxf` | Kartuschendichtung 11,4 × 9, Loch Ø 3 – aus 1,5 mm Silikon | Laser oder Cutter |
| `lippendichtung.dxf` | Lippendichtung 10,6 × 3,6, Öffnung 7,6 × 2,2 – aus 0,5–0,6 mm Silikon | Laser oder Cutter |

## Neu exportieren

```bash
openscad --export-format binstl -D 'part="kartusche_unterteil"' -o stl/kartusche_unterteil.stl novape-one.scad
openscad -D 'part="dichtung_2d"' -o stl/dichtung.dxf novape-one.scad
openscad -D 'part="schnitt"' novape-one.scad   # Schnitt durch die Montage ansehen
```

Häufige Änderungen:

- `inlet_d` – Einlassbohrung 1,0 / 1,2 / 1,4 mm (Zugwiderstand, Sensorsignal)
- `bypass_a` – Bypass-Rille 0 / 0,4 / 0,5 / 0,6 mm (Intensität)
- `wall` – 1,2 für den Druck, 0,8 für die Aluminiumhülse
- `xiao`, `bat`, `motor`, `tact` – Maße eurer Module, falls sie abweichen

## Geprüft

Alle Teilepaare wurden mit OpenSCAD auf Überschneidungen geprüft (Schnittmenge = leer bzw.
nur Berührflächen: Kappe auf Kopfring, Hülse auf Bodenkappe). Die Luftwege sind
durchgängig: Einlass → Kanal → Kammer → Dichtung → Docht/Bypass → Ventil → Stiel → Trichter.

## Toleranzen und Nacharbeit

- SLA druckt Bohrungen meist 0,05–0,1 mm zu klein: Einlass mit 1,0-mm-Bohrer, Sensor-Port
  mit 1,0-mm-Draht, Docht-Bohrung mit 5,9-mm-Bohrer nacharbeiten.
- Die Kartusche hat 0,15 mm Spiel im Turm; die Dichtung 0,1 mm Spiel im Schacht.
- Die Lippendichtung wird beim Aufsetzen der Kappe um 0,2 mm zusammengedrückt.
- Druckteile mit Mundkontakt (Kappe) nie aus Standard-Harz; das Aroma nur in Kartuschen aus
  klarem, vollständig nachgehärtetem Harz testen und Muster nicht weitergeben.
