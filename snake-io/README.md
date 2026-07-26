# Snake.io — Neon Arena

Ein vollständiges Browser-Spiel im Stil von Snake.io: moderne Neon-Optik,
Glassmorphism-Menüs, 30 KI-Gegner, unbegrenztes Längenwachstum — komplett in
HTML, CSS und JavaScript ohne Framework, ohne Build-Schritt und ohne externe
Assets.

## Starten

`index.html` im Browser öffnen. Das war alles.

Es werden ausschließlich klassische `<script>`-Tags verwendet (keine ES-Module),
damit das Spiel auch per Doppelklick über `file://` läuft — ohne lokalen Server.
Sounds und Musik sind vollständig prozedural (Web Audio API), Grafiken werden
zur Laufzeit gezeichnet. Es gibt keine Netzwerkabhängigkeiten.

Optional mit Server:

```bash
python3 -m http.server 8000   # dann http://localhost:8000/snake-io/
```

### Einzeldatei-Variante

`dist/index.html` ist derselbe Stand als **eine** Datei mit inline eingebettetem
CSS und JavaScript (96 kB) — praktisch zum Verschicken oder Hochladen. Neu bauen:

```bash
npm i terser clean-css   # nur zum Bauen nötig
node build.js            # schreibt dist/index.html
```

Entwickelt wird immer gegen die Quelldateien; `dist/` ist reines Artefakt.

## Steuerung

| | PC | Handy / Tablet |
|---|---|---|
| Lenken | Maus zeigt die Richtung (alternativ WASD / Pfeiltasten) | Ziehen — der virtuelle Joystick erscheint am Berührpunkt |
| Boost | Linke Maustaste oder Leertaste halten | Boost-Button halten, zweiter Finger, oder Joystick voll auslenken |
| Zoom | Mausrad, `+` / `-` | Einstellungen → Zoomstufe |
| Pause | `P` oder `Esc` | Pause-Button oben mittig |
| Bestätigen | `Enter` | — |

Boost kostet Masse: die Schlange verliert 11 Masse pro Sekunde und wirft dabei
Kugeln hinter sich ab. Unter 22 Masse ist kein Boost möglich (Boost-Anzeige im
HUD zeigt die Reserve).

## Spielregeln

* Nahrung sammeln lässt die Schlange wachsen — Länge und Dicke.
* Der Kopf zieht Kugeln in einem Umkreis an; einsammeln muss man nicht pixelgenau.
* Berührt der **eigene Kopf** einen **fremden Körper**, stirbt man. Der eigene
  Körper ist harmlos (Snake.io-Regel).
* Wer stirbt, zerfällt vollständig in Nahrung — der Verursacher bekommt die Punkte.
* Die rot leuchtende Arenagrenze ist tödlich. Kommt der Spieler ihr nahe,
  pulsiert der Bildschirmrand als Warnung.
* Startlänge 15 Segmente, Maximallänge unbegrenzt (Darstellung bis 520 Segmente).

## Features

**Welt**
4400 × 4400 Einheiten, weich folgende Kamera mit automatischer Zoomanpassung an
die Schlangengröße, zweistufiges Hintergrundgitter, driftende Partikel,
leuchtende Arenagrenze.

**Nahrung**
Rund 1400 leuchtende Kugeln (je Grafikstufe 800–1400) in vier Größenklassen und
18 Neonfarben, automatischer Nachschub, Gold-Kugeln mit hohem Nährwert.

**Gegner**
30 KI-Schlangen mit unterschiedlichen Größen, Farben, Namen und
Geschwindigkeiten. Jede hat eine eigene „Persönlichkeit“ (Aggressivität,
Vorsicht, Gier) und entscheidet über gewichtete Richtungsvektoren: wandern,
Nahrung ansteuern, kleinere Schlangen abschneiden, vor größeren fliehen,
Körpern und Wand ausweichen. Gestorbene Gegner werden nach kurzer Zeit ersetzt.

**Effekte**
Glow für Nahrung und Schlangen, Schatten unter den Körpern, Todesexplosionen mit
Druckwelle, Boost-Schweif, Screenshake, Bildschirmblitze bei Events,
Countdown-Animation.

**Oberfläche**
Startmenü mit Namenseingabe und Skin-Auswahl, HUD (Score / Länge / Kills /
Boost oben rechts, FPS und Anzahl lebender Schlangen oben links), Leaderboard
mit angepinnter eigener Platzierung, Minimap unten rechts, Pausemenü,
Game-Over-Screen mit Endscore, größter Länge, Überlebenszeit und Platzierung.

**28 Skins**
Regenbogen, Feuer, Eis, Neon Aqua, Gold, Cyber, Galaxy, Lava, Emerald, Diamond,
Toxic, Sunset, Ocean, Blood, Void, Candy, Matrix, Plasma, Bumblebee, Aurora,
Magma Core, Frostbite, Radiant, Nebula Drift, Circuit, Shadow, Coral Reef, Venom.
Einige Muster sind animiert und wandern über den Körper.

**Sounds**
Prozedural erzeugt: Fressen (mit aufsteigender Kette bei Serien), Boost als
Dauerklang, Tod, Kill, Menü-Klicks, Countdown, Event-Fanfare — plus generative
Ambient-Musik (Pad-Akkorde, Arpeggio, Delay). Musik und Effekte getrennt
abschaltbar.

**Zufalls-Events**
Doppelte Nahrung, Kugelregen, Goldrausch, Speed Frenzy, Schwarm — mit Banner
und Restzeit-Anzeige im HUD.

**Einstellungen** (in `localStorage` gespeichert)
Musik an/aus, Soundeffekte an/aus, Grafikqualität (Niedrig / Mittel / Hoch),
Zoomstufe, Vollbild. Ebenso gespeichert: Name, Skin, Highscore, beste Länge,
Rundenzahl.

## Aufbau

```
snake-io/
├── index.html            Struktur, HUD und alle Menüs
├── build.js              baut dist/index.html (eine Datei, alles inline)
├── dist/index.html       Build-Artefakt für Deploys
├── css/style.css         Neon-/Glassmorphism-Design, responsiv
└── js/
    ├── utils.js          Mathe-Helfer, Spatial-Hashing, Objekt-Pool, Namen
    ├── settings.js       Einstellungen + Statistiken (localStorage)
    ├── audio.js          prozedurale Sounds und Musik (Web Audio)
    ├── skins.js          28 Skin-Definitionen
    ├── particles.js      gepooltes Partikelsystem
    ├── food.js           Nahrung, Sprite-Cache, Gitter
    ├── snake.js          Schlangenmodell (Pfad, Segmente, Wachstum, Boost)
    ├── ai.js             Gegnersteuerung
    ├── camera.js         Kamera, Auto-Zoom, Screenshake
    ├── input.js          Maus, Tastatur, Touch-Joystick
    ├── events.js         Zufalls-Events
    ├── renderer.js       Canvas-Rendering und Minimap
    ├── ui.js             DOM: Menüs, HUD, Leaderboard
    ├── game.js           Spielkern: Schleife, Kollisionen, Spawns, Zustände
    └── main.js           Einstiegspunkt
```

Alle Module hängen am globalen Namespace `SNK`. Die laufende Spielinstanz ist
als `window.SnakeIO` erreichbar — praktisch zum Ausprobieren in der Konsole:

```js
SnakeIO.events.trigger('gold');      // Event auslösen
SnakeIO.player.mass = 800;           // wachsen
SnakeIO.player.updateSize();
SnakeIO.setQuality('low');           // Grafikstufe wechseln
```

## Technische Entscheidungen

**Körpermodell.** Der Kopf schreibt seine Spur in einen Pfadpuffer; die
Segmente werden daraus per Bogenlänge in festem Abstand abgetastet. Dadurch
bleibt der Körper unabhängig von Geschwindigkeit, Boost und Bildrate exakt
gleich lang und gleich dick — im Gegensatz zur naiven „ein Segment pro Frame“-
Variante, die beim Boosten Lücken bekäme.

**Feste Simulationsschrittweite.** Die Physik läuft mit 1/60 s über einen
Akkumulator (maximal 5 Nachholschritte pro Frame), gerendert wird jeder Frame.
Damit verhält sich das Spiel auf 60- und 144-Hz-Displays identisch, und es gibt
kein Tunneling durch Kollisionen. Kameraglättung und Partikel nutzen die echte
Frame-Zeit, laufen also immer flüssig.

**Kollisionen.** Alle Körpersegmente landen pro Schritt in einem Spatial-Hash
(Zellgröße 120). Geprüft wird nur der Kopf gegen die Segmente der Nachbarzellen.
Es wird jedes zweite Segment eingetragen — die Segmente überlappen stark, die
Prüfung bleibt exakt und halbiert die Arbeit. Treffer werden erst gesammelt und
dann angewendet, damit bei Kopf-an-Kopf-Kollisionen korrekt beide sterben.

**Nahrung.** Der Glow jeder Kugel wird einmal pro Farbe in ein Offscreen-Canvas
gerendert; im Spiel ist jede Kugel nur noch ein `drawImage`. Gezeichnet wird
ausschließlich, was in den sichtbaren Gitterzellen liegt.

**Rendering in Weltkoordinaten.** Die Kamera steckt direkt in der Canvas-Matrix
(`setTransform`), die Projektion übernimmt also Canvas selbst. Der Schlangen-
körper wird als Polyline gestrichen (nicht als Kreiskette): Schatten, Glow und
Umrandung teilen sich ein einziges `Path2D`, die Farbbänder werden bandweise
gestrichen und einzeln gegen das Sichtfeld geprüft.

**Objekt-Pooling.** Pfadpunkte, Nahrungskugeln, Partikel und Kollisionseinträge
werden recycelt. Im laufenden Spiel entstehen praktisch keine neuen Objekte,
der Garbage Collector bleibt ruhig.

**KI-Budget.** Jede Gegnerschlange entscheidet nur ~8 × pro Sekunde (gestaffelt),
dazwischen läuft nur die weiche Drehung. Der Kostenanteil der KI ist damit
vernachlässigbar.

**Pixelbudget.** Statt blind `devicePixelRatio` zu übernehmen, wird die
Canvas-Auflösung auf ein Budget pro Grafikstufe begrenzt (1,3 / 2,0 / 2,6
Megapixel). Kleine Displays bekommen volle Schärfe, auf 4K-/Retina-Panels wäre
`dpr 2` reine Füllraten-Verschwendung.

### Messwerte

Gemessen in Chromium mit **Software-Rasterizer** (SwiftShader, ohne GPU) bei
1600 × 900:

| Szenario | Simulation | Zeichenaufrufe |
|---|---|---|
| Normal (30 KI, 1534 Segmente, 1400 Kugeln) | 0,36 ms/Schritt | 0,70 ms/Frame |
| Worst Case (11 445 Segmente, Spieler mit 520) | 0,65 ms/Schritt | 1,18 ms/Frame |
| Worst Case + 1966 Kugeln | 0,77 ms/Schritt | 1,39 ms/Frame |

Die JavaScript-Arbeit liegt damit auch im Extremfall bei rund 2 ms pro Frame —
etwa ein Achtel des 16,7-ms-Budgets für 60 FPS. Der restliche Aufwand ist reines
Rasterisieren, das auf echter Hardware die GPU übernimmt; in dieser
Software-Umgebung bleiben davon 45–60 FPS übrig.

## Balance-Schrauben

Die wichtigsten Werte an einer Stelle, falls du das Spielgefühl ändern willst:

* `js/snake.js` → `C`: Startmasse, Grundgeschwindigkeit, Boost-Faktor und
  -Kosten, Wachstumskurve, Segmentabstand, Drehrate.
* `js/game.js`: `AI_COUNT` (Anzahl Gegner), `world` (Kartengröße),
  `ZOOM_STEPS`, Größenverteilung der Gegner in `spawnAI()`.
* `js/settings.js` → `SNK.QUALITY`: alles, was die Grafikstufen unterscheiden.
* `js/ai.js`: Gewichte der Verhaltensvektoren und Persönlichkeitsbereiche.
* `js/events.js` → `EVENTS`: Zufalls-Events (neue lassen sich einfach anhängen).
* `js/skins.js`: Skins — Farbliste, Bandbreite, Animationsgeschwindigkeit.

## Browser

Getestet in Chromium. Benötigt Canvas 2D, `Path2D`, Web Audio und
`localStorage` — alles seit Jahren in Chrome, Edge, Firefox und Safari
vorhanden (Desktop und Mobil). Ohne `localStorage` (privater Modus) läuft das
Spiel weiter, speichert dann aber keine Einstellungen und Rekorde.
