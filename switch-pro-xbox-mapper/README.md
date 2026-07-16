# Switch Pro Controller → virtueller Xbox 360 Controller

Ein kleines Python-Programm für **Windows**, das einen Nintendo Switch Pro
Controller (per USB) direkt über HID ausliest und über **ViGEmBus/vgamepad**
als virtuellen **Xbox 360 Controller (XInput)** ausgibt. So erkennen Spiele wie
**EA Sports FC 26** den Controller sauber als Standard-XInput-Gerät.

## Features

- Direktes Auslesen über `hidapi` (USB VID `0x057E` / PID `0x2009`)
- Virtueller Xbox 360 Controller über `vgamepad` (ViGEmBus)
- Konfigurierbare, **radiale Deadzone** für beide Sticks (Standard **15 %**) gegen Stick-Drift
- **Debouncing**: Ein Tastenzustand muss X ms stabil sein, bevor er weitergegeben wird (filtert Geistersignale/Prellen)
- Optionale **Auto-Kalibrierung** der Stick-Mittelpunkte beim Start
- Übersichtliche **Konsolenausgabe** zum Debuggen (Tastenwechsel, optional Stick-Werte)
- Läuft dauerhaft und beendet sich **sauber per Strg+C** (setzt den virtuellen Controller zurück)

## Voraussetzungen

1. **Windows** mit **Python 3.8+** (64-Bit empfohlen)
2. **ViGEmBus** installiert (hast du bereits) – https://github.com/ViGEm/ViGEmBus/releases
3. Switch Pro Controller **per USB-Kabel** verbunden (die PID `0x2009` ist der USB-Modus)

## Installation der Python-Pakete

```powershell
pip install -r requirements.txt
```

oder direkt:

```powershell
pip install hidapi vgamepad
```

> **Hinweis zu `hidapi` unter Windows:** Das `pip`-Paket `hidapi` bringt die
> nötige `hidapi.dll` normalerweise mit. Falls beim Start ein Fehler wie
> `ImportError: DLL load failed` erscheint, installiere alternativ das Paket
> `hid` (`pip install hid`) und lege die passende `hidapi.dll`
> (aus den offiziellen hidapi-Releases) neben das Skript oder in einen Ordner
> im `PATH`. Der Import `import hid` funktioniert mit beiden Paketen.

## Start

```powershell
python switch_pro_to_xbox.py
```

Beim Start bitte die Sticks **kurz loslassen** (für die Auto-Kalibrierung).
Beenden jederzeit mit **Strg+C**.

## Konfiguration

Alle Einstellungen stehen oben im Skript im Abschnitt `KONFIGURATION`:

| Einstellung             | Standard | Bedeutung |
|-------------------------|----------|-----------|
| `STICK_DEADZONE`        | `0.15`   | Deadzone der Sticks (0.15 = 15 %) |
| `DEBOUNCE_MS`           | `20`     | ms, die ein Tastenzustand stabil sein muss |
| `AUTO_CALIBRATE`        | `True`   | Stick-Mitte beim Start automatisch messen |
| `SWAP_NINTENDO_LAYOUT`  | `True`   | Tasten nach **Position** auf Xbox mappen (empfohlen) |
| `PRINT_STICKS`          | `False`  | Stick-Werte mit ausgeben (kann fluten) |
| `STICK_HALF_RANGE`      | `1700`   | ungefährer Vollausschlag ab Mitte |

### Tasten-Mapping (`SWAP_NINTENDO_LAYOUT = True`)

Weil Switch und Xbox die Face-Buttons **gespiegelt** beschriften, wird nach
physischer Position gemappt, damit sich Spiele „richtig" anfühlen:

| Switch (Position) | Xbox |
|-------------------|------|
| B (unten)         | A    |
| A (rechts)        | B    |
| Y (links)         | X    |
| X (oben)          | Y    |
| L / R             | LB / RB |
| ZL / ZR           | LT / RT (voll) |
| L-Stick / R-Stick | LS / RS (Klick) |
| Plus / Minus      | Start / Back |
| Home              | Guide |
| D-Pad             | D-Pad |

Setze `SWAP_NINTENDO_LAYOUT = False`, wenn du stattdessen die Beschriftung
1:1 abbilden willst (A→A, B→B, …).

> **ZL/ZR:** Der Pro Controller hat digitale Schultertasten. Sie werden als
> **voll durchgedrückte** Xbox-Trigger (Wert 1.0) ausgegeben.

## Fehlerbehebung

- **„Pro Controller nicht gefunden/geöffnet"**
  Kabel prüfen. Häufigste Ursache: **Steam** (Steam Input) oder eine andere
  Controller-Software hat den Controller bereits belegt. Steam beenden bzw.
  in Steam die „Switch Pro Configuration Support"-Option deaktivieren.
- **„Controller sendet keine Standard-Reports"**
  Controller neu einstecken; anderes/kürzeres USB-Kabel testen (manche Kabel
  sind reine Ladekabel ohne Datenleitungen).
- **Spiel erkennt zwei Controller / Doppel-Eingaben**
  Steam Input für den echten Switch-Controller deaktivieren, damit nur der
  virtuelle Xbox-Controller ankommt.
- **Sticks driften trotz Deadzone**
  `STICK_DEADZONE` leicht erhöhen (z. B. `0.18`) oder `AUTO_CALIBRATE` aktiviert
  lassen und beim Start die Sticks wirklich loslassen.
- **DLL-/Import-Fehler bei `hid`** → siehe Hinweis unter *Installation*.

## Technischer Hintergrund

Über USB sendet der Pro Controller ohne Initialisierung nur einfache
HID-Reports (`0x3F`) mit ungenauen Sticks. Das Skript führt daher den
**USB-Handshake** (`0x80 0x01/0x02/0x03/0x04`) aus und schaltet per Subcommand
`0x03` auf den **Standard-Full-Report `0x30`** um – dieser liefert die
12-Bit-Analogsticks und alle Tasten. Report-Layout nach der bekannten
Reverse-Engineering-Dokumentation (dekunukem).
