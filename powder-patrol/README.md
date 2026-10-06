# ⛑️ POWDER PATROL

**Koop-Ski-Rettungs-Chaos für 1–4 Spieler · Low-Poly mit modernem Licht · Browser-Prototyp (Three.js + Node.js)**

> Ihr seid die Bergwacht eines viel zu vollen Skigebiets. Funksprüche gehen rein, rote Rauchsäulen steigen auf,
> irgendwo steckt ein Tourist kopfüber in einer Baumgrube. Schnappt euch einen Rettungsschlitten, rast den Berg
> runter, sprengt Lawinen kontrolliert ab, grabt eure Freunde mit dem LVS-Gerät aus und bringt die Patienten
> heil in die Klinik, bevor um 16:30 die Lifte schließen.


| | |
|---|---|
| ![Menü](docs/screenshots/menu.jpg) | ![Lobby mit Skipässen](docs/screenshots/lobby.jpg) |
| ![Rettung bei Sonnenuntergang](docs/screenshots/sunset-rescue.jpg) | ![Sessellift](docs/screenshots/chairlift.jpg) |
| ![Piste mit Wald und Lift](docs/screenshots/piste.jpg) | ![Lawine](docs/screenshots/avalanche.jpg) |
| ![Einsatzbericht](docs/screenshots/results.jpg) | |

---

## 1. Warum diese Idee? (Recherche)

| Erkenntnis | Quelle |
|---|---|
| Koop-Spiele haben im 1. Halbjahr 2025 auf Steam **4,1 Mrd. $** umgesetzt, so viel wie noch nie in einem Halbjahr. Treiber sind Indie-„Friendslop“-Hits wie R.E.P.O. und PEAK. | [Game Developer](https://www.gamedeveloper.com/design/what-developers-can-learn-from-the-indie-social-co-op-games-topping-the-steam-charts) |
| PEAK hat ~10 Mio. Kopien verkauft. Erfolgsrezept: Physik-Chaos, Fehler sind lustig statt frustrierend, **täglich wechselnde Map**. | [Game Developer](https://www.gamedeveloper.com/design/what-developers-can-learn-from-the-indie-social-co-op-games-topping-the-steam-charts), [GameRant](https://gamerant.com/coop-games-like-peak/) |
| RV There Yet? erreichte 100.000 gleichzeitige Spieler mit einem simplen Physik-Koop-Spiel. „Failure is entertaining, not punishing.“ | [GamesRadar](https://www.gamesradar.com/games/co-op/with-a-peak-of-100-000-concurrent-players-sending-it-straight-into-steams-best-sellers-chart-the-latest-indie-hit-is-a-silly-physics-based-co-op-game-about-driving-an-rv/), [80.lv](https://80.lv/articles/new-indie-co-op-adventure-where-you-drive-an-rv-reaches-100-000-players) |
| Lonely Mountains: Snow Riders (Low-Poly-Ski mit Mehrspieler) bekam Metacritic 87. Das zeigt, dass **Low-Poly-Ski + Multiplayer** ankommt, dort aber nur als Rennen. | [WayTooMany.games](https://waytoomany.games/2025/01/21/review-lonely-mountains-snow-riders/) |
| Ski-Patrol-Spiele gibt es nur als **Einzelspieler** (Ski Patrol 2024, Snow Scout VR). Ein **Koop-Rettungsspiel mit Lawinen gibt es nicht**. | [Steam: Ski Patrol](https://store.steampowered.com/app/1662570/_/), [Snow Scout](https://rawg.io/games/snow-scout) |
| Low-Poly-Stil: Flat Shading, starke gerichtete Sonne, farbiges Umgebungslicht, Nebel für Tiefe, Verlaufshimmel, Blob-AO. Muss auch als Thumbnail lesbar sein. | [Bugnet: Low-Poly Style Guide](https://bugnet.io/blog/low-poly-3d-a-style-guide-for-small-teams) |
| UI-Trend: minimalistisch, diegetisch, kontextabhängig („Clean Screen“), wenig Dauer-Overlays. | [Bonn University HUD-Studie](https://bonndoc.ulb.uni-bonn.de/xmlui/handle/20.500.11811/14207), [dev.to UI Trends](https://dev.to/red_apple_technologies/game-uiux-design-trends-and-best-practices-for-2025-e25) |
| Pistenpläne als Panorama mit Farben (grün/blau/schwarz) sind sofort lesbar. Davon ist die Trail-Map inspiriert. | [Cartographic Perspectives](https://cartographicperspectives.org/index.php/journal/article/view/cp67-tait) |

**Hook in einem Satz:** *„Lethal Company trifft Lonely Mountains auf der Skipiste: Rettet Touristen, sprengt Lawinen und grabt eure Freunde aus.“*

Clip-Momente für Streamer: fliegende Rettungsschlitten, Kollisionen mit Teamkollegen („Bowling Ball“-Award),
360°-Sprünge mit Patient, Lawinen, die einen Mitspieler verschütten, Hubschrauber-Evakuierung, „FIRED!“-Stempel.

---

## 2. Gameplay

**Schicht-Loop (≈ 6 Min, 09:00 → 16:30 Uhr im Spiel):**
1. **Funkruf** → ein Patient erscheint irgendwo am Berg (rote Rauchsäule, Kompass, Funk-Liste)
2. **Toboggan holen** (Rack an der Bergwacht-Hütte am Gipfel) → am Seil hinter sich herziehen
3. **Patient befreien** (`E` halten): verletzt / steckt kopfüber in einer Baumgrube / verschüttet
4. **Aufladen** und **sanft** zur Klinik an der Talstation fahren. Jeder Crash kostet Zustand, zu schnelles Querrutschen kippt den Schlitten.
5. **Sessellift** zurück nach oben (Zeit zum Quatschen, Ausblick auf neue Rauchsäulen)

**Lawinen:** Vier Lawinenhänge (orange Flaggen, Wechte). Die Gefahrenstufe steigt im Laufe des Tages (europäische Skala 1–5).
Natürliche Abgänge werden 8 s vorher angekündigt („CORNICE CRACKING!“). Mit **Sprengladungen** (`G`, Kiste an der Hütte)
löst ihr kontrollierte Lawinen aus (+30 $). Wer erwischt wird, ist **verschüttet**: Bildschirm verschneit, 75 s Luft.
Das Team sucht mit dem **LVS-Gerät** (Piepen + Distanz + Pfeil) und gräbt gemeinsam (`E`, zu mehreren schneller).

**Roguelite-Run:** Tagesquote erfüllen → nächste Schicht (höhere Quote, mehr Lawinen, mehr Notrufe) + **Shop**
(Race Wax, Pro Toboggan, Beacon Pro, Kakao-Thermoskanne, Extra-Schlitten). Quote verfehlt → **FIRED!**

**Daily Mountain:** Wie bei PEAK gibt es täglich einen neuen, für alle gleichen Berg (Seed = Datum). Alternativ zufällig.

**End-of-Shift-Awards:** Mountain Medic, Yard Sale, Speed Demon, Avalanche Magnet, Bowling Ball, Boom Boom,
Snow Mole, Toboggan Tosser, Chairlift Romantic.

### Steuerung
| Taste | Aktion |
|---|---|
| `A` / `D` | Carven links/rechts (in der Luft: Spins → „360!“) |
| `W` | Hocke (schnell) / Skaten auf flachem Gelände |
| `S` | Schneepflug-Bremse |
| `Space` | Sprung |
| `E` | Interagieren: Schlitten nehmen, befreien/graben (halten), aufladen, Lift, Ladungen |
| `Q` | Schlitten abstellen |
| `G` | Sprengladung werfen |
| `F` | Ping setzen |
| `Tab` | Pistenplan |
| `T` / `Enter` | Chat |
| `R` (halten) | Zurück zur Gipfelhütte |
| Maus | Kamera (Klick zum Fangen, `Esc` = Pause) |

---

## 3. Grafik & UI

- **Low Poly mit modernem Licht:** facettiertes Heightfield-Terrain (Flat Shading), ACES-Tonemapping, Bloom,
  Vignette und Split-Toning (kühle Schatten, warme Lichter), weiche Schatten, die dem Spieler folgen, Exp²-Nebel.
- **Tageszeit als diegetischer Timer:** Morgenlicht, dann Mittag, dann Alpenglühen beim Liftschluss.
- **Schnee-Shader:** Glitzer (zufällige Funkel-Pixel, die durch Bloom leuchten) und Cord-Muster auf präparierten Pisten.
- Instanzierte Wälder mit Schneekappen, Blob-AO unter Bäumen, prozedurale Bergkette, Dorf im Tal, Wolken.
- Low-Poly-Partikel: Schneespray beim Carven, Pulverwolken, Lawinenwalze plus Schuttfeld, Explosionen, rote Signalrauch-Säulen, Schneefall (wird mit der Lawinenstufe dichter).
- **UI im Pistenschild-Design:** Menü-Buttons als grün/blau/schwarze Pistenschilder, Lobby als **Skipässe am Lanyard**,
  Kompassleiste mit Markern, Lawinen-Warnstufe als Raute (1–5), **gelbes LVS-Gerät** mit LCD, Funk-Feed,
  gemalter Pistenplan (Hillshade), Ergebnis als **Einsatzbericht auf dem Klemmbrett** mit Stempel.
- 100 % prozedural: keine externen Assets, Sound per WebAudio (inkl. kleiner Folk-Loop via Karplus-Strong).

---

## 4. Starten

```bash
cd powder-patrol
npm install
npm start            # → http://localhost:3000
```

Dann **„Start a Patrol“** klicken und den 4-stelligen Code an Freunde schicken (dasselbe Netzwerk oder Server mit offenem Port 3000).
Für Tests mit kurzer Schicht: `PP_SHIFT_SECONDS=90 npm start`.

```bash
npm test             # 8 Tests: kompletter Rettungs-Loop über WebSockets, Skiphysik, Lift, Schlitten, Determinismus
```

---

## 5. Architektur

```
powder-patrol/
├── shared/            # läuft auf Server UND Client (deterministisch)
│   ├── mountain.js    # Berg-Generator: Heightfield, Pisten, Lawinenpfade, Lift, Bäume, Kollision
│   ├── constants.js   # Balancing, Shop, Awards, Patienten-Sprüche
│   └── rng.js         # Seeded RNG + Noise
├── server/
│   ├── index.js       # HTTP (statische Dateien) + WebSocket, Raum-Codes
│   └── room.js        # autoritative Spiellogik: Notrufe, Patienten, Schlitten, Lawinen, Ladungen, Quote, Awards
├── client/
│   ├── index.html / style.css
│   └── js/
│       ├── main.js       # App-Zustände, Menü-Cinematic mit KI-Skifahrern, Input
│       ├── game.js       # eine Schicht: Netzwerk-Entitäten, Interaktionen, Kamera, HUD
│       ├── skier.js      # Skiphysik (Carven, Hocke, Sprünge, Crashes, Lift, Schlitten am Seil)
│       ├── renderer.js   # Himmel-Shader, Tageszeit, Schatten, Post-Processing
│       ├── world.js      # Terrain-Mesh + Schnee-Shader, Wald, Lift, Hütten, Bergkette
│       ├── models.js     # prozedurale Low-Poly-Modelle (Patroller, Touristen, Toboggan, Heli…)
│       ├── effects.js / avalanche.js / audio.js / ui.js / net.js
└── test/
```

**Netzcode:** Der Server simuliert mit 20 Hz und sendet Snapshots mit 15 Hz. Clients interpolieren mit 120 ms Verzögerung.
Die eigene Skiphysik läuft **client-seitig** (120-Hz-Substeps) für null Input-Lag. Der Server validiert Distanzen bei allen
Interaktionen. Berg und Lawinenfront sind deterministisch aus Seed und Zeit, deshalb sieht jeder Client dieselbe Lawine,
ohne dass Partikel übertragen werden.

---

## 6. Weg nach Steam (Roadmap)

**Vertical Slice (dieser Stand):** kompletter Loop, 1–4 Spieler, Lawinen, Shop, Awards, Daily Mountain.

1. **Desktop-Build:** mit Electron (oder NW.js) verpacken. Der Node-Server läuft im Host-Client mit
   („Host & Play“, kein eigener Server nötig).
2. **Steamworks:** [steamworks.js](https://github.com/ceifa/steamworks.js) für Lobbys, Freundes-Einladungen,
   Achievements (Awards bieten sich an) und **Steam Networking Sockets/Relay** statt offener Ports.
3. **Proximity Voice Chat:** Treiber der Friendslop-Hits. Patienten, die „ins Funkgerät“ schreien, wären lustig.
4. **Content:** weitere Berge/Biome (Gletscher mit Gletscherspalten, Nacht-Schicht mit Stirnlampen),
   neue Patienten (Snowboarder im Lift festgefroren, Yeti-Selfie), Schneemobil, Rettungshund.
5. **Juice:** Ragdolls, Proximity-Chat-Lipsync, Kosmetik (Mützen sind schon da) als freischaltbare Belohnung.
6. **Steam-Seite früh live** (Wishlists sammeln), Demo zum Steam Next Fest, Preisziel **7,99–9,99 $**
   (Friendslop-Sweetspot, Friend-Pass/4-Pack).
7. Lokalisierung (DE/EN zuerst, dann ES/PT-BR/RU/ZH), Controller-Support (Steam Deck).

> Status: spielbarer Prototyp und kein fertiges Steam-Produkt. Für einen Release braucht es noch Playtests,
> Balancing, Audio/Art-Polish und die Steamworks-Integration (Steam Direct Gebühr 100 $).
