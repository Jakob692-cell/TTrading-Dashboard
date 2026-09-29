# NoVape One – Firmware (Funktionsmuster V0)

Firmware für das Funktionsmuster aus handelsüblichen Modulen. Sie erkennt Züge über den
Unterdruck in der Einlasskammer, gibt kurzes Feedback (Vibration + Lichtstreifen), speichert
jede Nutzung im Flash und spricht das Bluetooth-Protokoll der NoVape-App
(`novape/app/src/services/device/protocol.ts`).

| Datei | Inhalt |
| --- | --- |
| `novape-one/novape-one.ino` | Hauptprogramm: Sensor, Feedback, Taster, Speicher, Bluetooth |
| `novape-one/puff_detector.h` | Zugerkennung ohne Hardware-Abhängigkeit |
| `novape-one/config.h` | Pins, Schwellen, Kalibrierwerte |
| `test/puff_detector_test.cpp` | 14 simulierte Druckverläufe (Zug, Stoß, Autotür, Aufzug …) |
| `build/novape-one-v0.uf2` | fertig gebaut – per Drag-and-drop aufspielen |

## Aufspielen ohne Arduino (UF2)

1. XIAO per USB-C anschließen, **zweimal schnell** den Reset-Taster drücken.
2. Es erscheint ein USB-Laufwerk (Name je nach Bootloader, z. B. `XIAO-SENSE`).
3. `build/novape-one-v0.uf2` darauf ziehen – der XIAO startet neu.

Die UF2 ist mit den Standardwerten aus `config.h` gebaut. Wer Pins oder Schwellen ändert,
baut selbst (nächster Abschnitt). Die Firmware ist kompiliert und die Zugerkennung auf dem PC
getestet, auf echter Hardware aber noch nicht erprobt – der erste Aufbau ist der Test.

## Selbst bauen

Arduino IDE 2 (oder `arduino-cli`):

1. *Einstellungen → Zusätzliche Boardverwalter-URLs:*
   `https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json`
2. Boardverwalter: **Seeed nRF52 Boards** installieren (nicht „mbed-enabled“).
3. Bibliotheksverwalter: **Adafruit BMP3XX Library** (+ Abhängigkeiten).
4. Board **Seeed XIAO nRF52840** wählen, `novape-one/novape-one.ino` öffnen, hochladen.

```bash
arduino-cli compile --fqbn Seeeduino:nrf52:xiaonRF52840 novape-one
```

Test der Zugerkennung auf dem PC:

```bash
cd test && g++ -std=c++17 -O2 -I../novape-one puff_detector_test.cpp -o t && ./t
```

## Verdrahtung

| XIAO | an | Hinweis |
| --- | --- | --- |
| D1 | Taster → GND | interner Pull-up |
| D2 | Gate AO3400 (100 Ω in Serie, 100 kΩ Gate → GND) | Motor zwischen 3V3 und Drain, Diode 1N4148 antiparallel zum Motor |
| D3 | weiße LED (Anode) → 68 Ω → GND | Lichtstreifen |
| D4 / D5 | SDA / SCL BMP390 | 3V3 + GND; Adresse 0x77 (0x76 bei SDO an GND) |
| BAT+ / BAT− (Pads unten) | LiPo 401230 mit Schutzschaltung | Laden über USB-C mit 50 mA |

Sensor-Anschluss: Silikonschlauch 1,0 × 2,0 mm vom Port-Stutzen unter der Pod-Aufnahme zur
Öffnung des BMP390; mit einem Tropfen Silikon abdichten. Undichtigkeit = schwaches Signal.

## Bedienung

| Aktion | Wirkung |
| --- | --- |
| Zug | Vibration + Lichtstreifen, Nutzung wird gespeichert/gesendet |
| Taste 1× | Akkustand: 1–4 Blinker |
| Taste 2× | neue Kartusche eingesetzt (Zähler auf 100 %) |
| Taste 3 s | Koppeln: 60 s schnelles Werben |
| 5× schnelles Blinken beim Start | Drucksensor nicht gefunden |

## Kalibrieren

`INLET_K` in `config.h` rechnet den Unterdruck in einen Luftstrom um (Q = K · √|Δp|).
Kartusche einsetzen, mit einer 50-ml-Spritze am Mundstück gleichmäßig 35 ml in etwa 2 s
ziehen (`DEBUG_SERIAL 1` zeigt Volumen und Spitzendruck an) und K anpassen, bis ≈ 35 ml
angezeigt werden. Mit anderem Einlass-Ø ändert sich K quadratisch mit dem Durchmesser.

## Bluetooth-Protokoll

Service `6e6f7661-7065-4f6e-6500-000000000001`, alle Werte little-endian:

| UUID-Ende | Eigenschaften | Inhalt |
| --- | --- | --- |
| `…10` usage | notify | u32 Unixzeit (s) + u16 Dauer (ms) je Zug |
| `…11` usageSync | write/read | write u32 „seit“ → read bis zu 40 Datensätze (älteste zuerst) |
| `…20` cartridge | read/notify/write | u8 Rest in %; write u16 = neue Kartusche mit N Standardzügen |
| `…30` settings | write | u8 Haptik 0–3, u8 Licht an/aus |
| `…31` name | write | UTF-8, max. 20 Byte (gilt ab dem nächsten Werben) |
| `…32` find | write | u16 Dauer in ms: vibrieren + blinken |
| `…33` clock | write | u32 aktuelle Unixzeit – die App schreibt sie beim Verbinden |

Dazu die Standard-Services *Battery* und *Device Information* (Firmware-Version).
Züge vor dem ersten Stellen der Uhr bleiben im RAM und werden beim Stellen umgerechnet;
fällt vorher der Akku aus, gehen sie verloren.
