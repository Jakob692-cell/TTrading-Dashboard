#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Switch Pro Controller  ->  virtueller Xbox 360 Controller (XInput)
==================================================================

Liest einen Nintendo Switch Pro Controller (USB) direkt ueber HID aus und
gibt die Eingaben ueber ViGEmBus/vgamepad als virtuellen Xbox 360 Controller
weiter, damit Spiele wie EA Sports FC 26 den Controller sauber als XInput-
Geraet erkennen.

Features:
  * Direktes Auslesen ueber hidapi (USB VID 0x057E / PID 0x2009)
  * Virtueller Xbox 360 Controller ueber vgamepad (ViGEmBus)
  * Konfigurierbare, radiale Deadzone fuer beide Analogsticks (Standard 15%)
  * Debouncing gegen "Geister"-Tastensignale (Zustand muss X ms stabil sein)
  * Optionale Auto-Kalibrierung der Stick-Mittelpunkte beim Start
  * Uebersichtliche Konsolenausgabe zum Debuggen
  * Laeuft dauerhaft und laesst sich sauber per Strg+C beenden

Voraussetzungen: ViGEmBus installiert, Controller per USB-Kabel verbunden.
Siehe README.md fuer Details.
"""

import math
import signal
import sys
import time

# ---------------------------------------------------------------------------
# Abhaengigkeiten pruefen (mit hilfreicher Fehlermeldung)
# ---------------------------------------------------------------------------
try:
    import hid  # Paket: hidapi
except ImportError:
    sys.exit(
        "FEHLER: 'hid' nicht gefunden.\n"
        "  pip install hidapi\n"
        "(Unter Windows ggf. zusaetzlich die hidapi.dll bereitstellen - "
        "siehe README.)"
    )

try:
    import vgamepad as vg
except ImportError:
    sys.exit(
        "FEHLER: 'vgamepad' nicht gefunden.\n"
        "  pip install vgamepad\n"
        "(ViGEmBus muss separat installiert sein.)"
    )


# ===========================================================================
#  KONFIGURATION  -  hier kannst du alles anpassen
# ===========================================================================

VENDOR_ID = 0x057E          # Nintendo
PRODUCT_ID = 0x2009         # Switch Pro Controller (USB)

# Deadzone der Analogsticks als Anteil des vollen Ausschlags (0.15 = 15%).
STICK_DEADZONE = 0.15

# Debounce-Zeit: Ein Tastenzustand muss so lange (in Millisekunden) stabil
# anliegen, bevor die Aenderung an den virtuellen Controller weitergegeben
# wird. Filtert kurze "Geister"-Signale / Prellen.
DEBOUNCE_MS = 20

# Nominelle Stick-Werte (12 Bit, 0..4095). Mitte ~2048.
STICK_CENTER = 2048
STICK_HALF_RANGE = 1700     # ungefaehrer Vollausschlag ab Mitte

# Stick-Mittelpunkte beim Start automatisch messen (Sticks dabei loslassen!).
# Kompensiert leichten Drift und Fertigungstoleranzen.
AUTO_CALIBRATE = True
CALIBRATE_SECONDS = 0.6

# Tasten nach physischer POSITION auf Xbox-Layout abbilden.
#   True  : Switch-B(unten)->A, A(rechts)->B, Y(links)->X, X(oben)->Y
#           -> fuehlt sich in Spielen "richtig" an (empfohlen fuer FC 26)
#   False : Beschriftung 1:1 (A->A, B->B, X->X, Y->Y)
SWAP_NINTENDO_LAYOUT = True

# Debug-Ausgabe der Stick-Positionen (kann die Konsole fluten).
PRINT_STICKS = False
STICK_PRINT_INTERVAL = 0.25   # Sekunden zwischen Stick-Ausgaben

# Poll-Pause in Sekunden (0.002 = ~500 Hz, mehr als genug, wenig CPU-Last).
POLL_SLEEP = 0.002


# ===========================================================================
#  Report-Parsing (Standard-Input-Report 0x30 des Pro Controllers)
# ===========================================================================
#
# Aufbau (dekunukem, Switch Reverse Engineering):
#   Byte 0 : Report-ID (0x30)
#   Byte 3 : rechte Tasten  (Y,X,B,A,SR,SL,R,ZR)
#   Byte 4 : geteilte Tasten (Minus,Plus,RStick,LStick,Home,Capture,-,-)
#   Byte 5 : linke Tasten   (Down,Up,Right,Left,SR,SL,L,ZL)
#   Byte 6-8  : linker Stick  (2x 12 Bit)
#   Byte 9-11 : rechter Stick (2x 12 Bit)

def parse_standard_report(data):
    """Zerlegt einen 0x30-Report in (buttons, (lx,ly), (rx,ry))."""
    b_right = data[3]
    b_shared = data[4]
    b_left = data[5]

    buttons = {
        "Y":       bool(b_right & 0x01),
        "X":       bool(b_right & 0x02),
        "B":       bool(b_right & 0x04),
        "A":       bool(b_right & 0x08),
        "R":       bool(b_right & 0x40),
        "ZR":      bool(b_right & 0x80),
        "MINUS":   bool(b_shared & 0x01),
        "PLUS":    bool(b_shared & 0x02),
        "RSTICK":  bool(b_shared & 0x04),
        "LSTICK":  bool(b_shared & 0x08),
        "HOME":    bool(b_shared & 0x10),
        "CAPTURE": bool(b_shared & 0x20),
        "DOWN":    bool(b_left & 0x01),
        "UP":      bool(b_left & 0x02),
        "RIGHT":   bool(b_left & 0x04),
        "LEFT":    bool(b_left & 0x08),
        "L":       bool(b_left & 0x40),
        "ZL":      bool(b_left & 0x80),
    }

    lx = data[6] | ((data[7] & 0x0F) << 8)
    ly = (data[7] >> 4) | (data[8] << 4)
    rx = data[9] | ((data[10] & 0x0F) << 8)
    ry = (data[10] >> 4) | (data[11] << 4)

    return buttons, (lx, ly), (rx, ry)


# ===========================================================================
#  Stick-Verarbeitung
# ===========================================================================

def normalize_axis(raw, center, half_range):
    """Rohwert -> -1.0 .. +1.0 relativ zur Mitte."""
    value = (raw - center) / float(half_range)
    return max(-1.0, min(1.0, value))


def apply_radial_deadzone(x, y, deadzone):
    """Radiale Deadzone + Reskalierung, damit direkt hinter der Deadzone
    sauber bei 0 begonnen wird (kein Sprung)."""
    magnitude = math.hypot(x, y)
    if magnitude <= deadzone:
        return 0.0, 0.0
    scale = (magnitude - deadzone) / (1.0 - deadzone)
    scale = min(scale, 1.0) / magnitude
    return x * scale, y * scale


# ===========================================================================
#  Debouncing
# ===========================================================================

class Debouncer:
    """Gibt einen Tastenzustand erst weiter, wenn er >= delay stabil war."""

    def __init__(self, debounce_ms):
        self.delay = debounce_ms / 1000.0
        self._stable = {}      # zuletzt weitergegebener Zustand
        self._candidate = {}   # zuletzt gesehener Rohzustand
        self._since = {}       # Zeitpunkt, seit dem der Kandidat anliegt

    def update(self, name, raw_state, now):
        if name not in self._stable:
            self._stable[name] = raw_state
            self._candidate[name] = raw_state
            self._since[name] = now
            return raw_state

        if raw_state != self._candidate[name]:
            self._candidate[name] = raw_state
            self._since[name] = now

        if (self._candidate[name] != self._stable[name]
                and (now - self._since[name]) >= self.delay):
            self._stable[name] = self._candidate[name]

        return self._stable[name]


# ===========================================================================
#  Tasten-Mapping Switch -> Xbox (vgamepad)
# ===========================================================================

def build_button_map(swap_layout):
    X = vg.XUSB_BUTTON
    if swap_layout:
        face = {
            "B": X.XUSB_GAMEPAD_A,   # unten  -> A
            "A": X.XUSB_GAMEPAD_B,   # rechts -> B
            "Y": X.XUSB_GAMEPAD_X,   # links  -> X
            "X": X.XUSB_GAMEPAD_Y,   # oben   -> Y
        }
    else:
        face = {
            "A": X.XUSB_GAMEPAD_A,
            "B": X.XUSB_GAMEPAD_B,
            "X": X.XUSB_GAMEPAD_X,
            "Y": X.XUSB_GAMEPAD_Y,
        }
    face.update({
        "UP":     X.XUSB_GAMEPAD_DPAD_UP,
        "DOWN":   X.XUSB_GAMEPAD_DPAD_DOWN,
        "LEFT":   X.XUSB_GAMEPAD_DPAD_LEFT,
        "RIGHT":  X.XUSB_GAMEPAD_DPAD_RIGHT,
        "L":      X.XUSB_GAMEPAD_LEFT_SHOULDER,
        "R":      X.XUSB_GAMEPAD_RIGHT_SHOULDER,
        "LSTICK": X.XUSB_GAMEPAD_LEFT_THUMB,
        "RSTICK": X.XUSB_GAMEPAD_RIGHT_THUMB,
        "PLUS":   X.XUSB_GAMEPAD_START,
        "MINUS":  X.XUSB_GAMEPAD_BACK,
        "HOME":   X.XUSB_GAMEPAD_GUIDE,
    })
    return face


# ZL/ZR sind am Pro Controller digital -> auf die Xbox-Trigger als Vollausschlag.
TRIGGER_BUTTONS = {"ZL": "left", "ZR": "right"}


# ===========================================================================
#  Controller oeffnen + USB-Handshake / Full-Report-Modus aktivieren
# ===========================================================================

def open_controller():
    device = hid.device()
    device.open(VENDOR_ID, PRODUCT_ID)
    device.set_nonblocking(True)
    return device


_packet_number = 0

def send_subcommand(device, subcommand, args):
    """Sendet ein Output-Report 0x01 mit Subcommand (neutrales Rumble)."""
    global _packet_number
    rumble_neutral = [0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40]
    buf = [0x01, _packet_number & 0x0F] + rumble_neutral + [subcommand] + list(args)
    _packet_number += 1
    device.write(buf)


def initialize(device):
    """USB-Handshake + Umschalten auf Standard-Full-Report (0x30).

    Ohne diese Sequenz sendet der Controller ueber USB nur einfache
    HID-Reports (0x3F) mit ungenauen Sticks.
    """
    # USB-Handshake-Sequenz
    for cmd in ([0x80, 0x01], [0x80, 0x02], [0x80, 0x03],
                [0x80, 0x02], [0x80, 0x04]):
        try:
            device.write(cmd)
        except Exception:
            pass
        time.sleep(0.05)
        _drain(device)

    # Input-Report-Modus auf 0x30 (Standard Full) setzen
    send_subcommand(device, 0x03, [0x30])
    time.sleep(0.05)
    _drain(device)

    # Spieler-LED 1 setzen (rein kosmetisch, bestaetigt aber die Verbindung)
    send_subcommand(device, 0x30, [0x01])
    time.sleep(0.05)
    _drain(device)


def _drain(device, limit=16):
    """Wartende Reports abholen und verwerfen."""
    for _ in range(limit):
        data = device.read(64)
        if not data:
            break


def read_standard_report(device, timeout=1.0):
    """Blockiert (weich) bis ein 0x30-Report kommt oder timeout ablaeuft."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        data = device.read(64)
        if data and data[0] == 0x30 and len(data) >= 12:
            return data
        time.sleep(POLL_SLEEP)
    return None


def auto_calibrate(device):
    """Misst die Stick-Mittelpunkte ueber CALIBRATE_SECONDS."""
    print(f"  Kalibriere Stick-Mitte ({CALIBRATE_SECONDS:.1f}s) - "
          "bitte Sticks NICHT beruehren ...")
    samples = []
    end = time.monotonic() + CALIBRATE_SECONDS
    while time.monotonic() < end:
        data = device.read(64)
        if data and data[0] == 0x30 and len(data) >= 12:
            _, (lx, ly), (rx, ry) = parse_standard_report(data)
            samples.append((lx, ly, rx, ry))
        time.sleep(POLL_SLEEP)

    if len(samples) < 5:
        print("  Zu wenige Samples - nutze Standardwerte.")
        return (STICK_CENTER, STICK_CENTER, STICK_CENTER, STICK_CENTER)

    n = len(samples)
    clx = sum(s[0] for s in samples) / n
    cly = sum(s[1] for s in samples) / n
    crx = sum(s[2] for s in samples) / n
    cry = sum(s[3] for s in samples) / n

    # Plausibilitaet: falls weit weg von 2048, lieber Standard nehmen
    for c in (clx, cly, crx, cry):
        if abs(c - STICK_CENTER) > 800:
            print("  Werte unplausibel (Stick bewegt?) - nutze Standardwerte.")
            return (STICK_CENTER, STICK_CENTER, STICK_CENTER, STICK_CENTER)

    print(f"  Mitte: LX={clx:.0f} LY={cly:.0f} RX={crx:.0f} RY={cry:.0f}")
    return (clx, cly, crx, cry)


# ===========================================================================
#  Debug-Ausgabe
# ===========================================================================

_prev_button_out = {}
_last_stick_print = 0.0

def log_button_changes(out_state):
    for name, state in out_state.items():
        if state != _prev_button_out.get(name, False):
            marker = "DOWN" if state else " UP "
            print(f"  [{marker}] {name}")
        _prev_button_out[name] = state


def log_sticks(lx, ly, rx, ry):
    global _last_stick_print
    if not PRINT_STICKS:
        return
    now = time.monotonic()
    if now - _last_stick_print >= STICK_PRINT_INTERVAL:
        _last_stick_print = now
        if abs(lx) > 0.001 or abs(ly) > 0.001 or abs(rx) > 0.001 or abs(ry) > 0.001:
            print(f"  Stick L=({lx:+.2f},{ly:+.2f})  R=({rx:+.2f},{ry:+.2f})")


# ===========================================================================
#  Hauptprogramm
# ===========================================================================

def main():
    print("=" * 62)
    print("  Switch Pro Controller  ->  virtueller Xbox 360 Controller")
    print("=" * 62)

    # Virtuellen Xbox-Controller erzeugen
    try:
        gamepad = vg.VX360Gamepad()
    except Exception as exc:
        sys.exit(f"FEHLER: Virtueller Xbox-Controller nicht erstellbar: {exc}\n"
                 "Ist ViGEmBus installiert?")
    print("  [OK] Virtueller Xbox 360 Controller erstellt.")

    # Realen Controller oeffnen
    try:
        device = open_controller()
    except Exception as exc:
        sys.exit(f"FEHLER: Pro Controller (057E:2009) nicht gefunden/geoeffnet: {exc}\n"
                 "  * Per USB-Kabel verbunden?\n"
                 "  * Wird er evtl. schon von Steam/anderer Software belegt?")
    print("  [OK] Pro Controller geoeffnet (057E:2009).")

    # Handshake + Full-Report-Modus
    print("  Initialisiere Controller (USB-Handshake) ...")
    initialize(device)

    # Pruefen, ob wir 0x30-Reports bekommen
    probe = read_standard_report(device, timeout=1.5)
    if probe is None:
        print("  WARNUNG: Keine 0x30-Reports empfangen. Versuche erneut ...")
        initialize(device)
        probe = read_standard_report(device, timeout=1.5)
        if probe is None:
            device.close()
            sys.exit("FEHLER: Controller sendet keine Standard-Reports.\n"
                     "  * Kabel/Verbindung pruefen\n"
                     "  * Steam Input / andere Controller-Tools schliessen\n"
                     "  * Controller neu einstecken")
    print("  [OK] Standard-Report-Modus (0x30) aktiv.")

    # Kalibrierung
    if AUTO_CALIBRATE:
        clx, cly, crx, cry = auto_calibrate(device)
    else:
        clx = cly = crx = cry = STICK_CENTER

    debouncer = Debouncer(DEBOUNCE_MS)
    button_map = build_button_map(SWAP_NINTENDO_LAYOUT)

    print("-" * 62)
    print(f"  Deadzone: {STICK_DEADZONE*100:.0f}%   Debounce: {DEBOUNCE_MS} ms   "
          f"Layout-Swap: {'an' if SWAP_NINTENDO_LAYOUT else 'aus'}")
    print("  Laeuft. Beenden mit Strg+C.")
    print("-" * 62)

    # Sauberes Beenden per Strg+C
    running = {"flag": True}

    def handle_sigint(_sig, _frame):
        running["flag"] = False

    signal.signal(signal.SIGINT, handle_sigint)

    try:
        while running["flag"]:
            data = device.read(64)
            if not data:
                time.sleep(POLL_SLEEP)
                continue
            if data[0] != 0x30 or len(data) < 12:
                # z.B. Subcommand-Antworten (0x21) - ignorieren
                continue

            buttons, (lx_raw, ly_raw), (rx_raw, ry_raw) = parse_standard_report(data)
            now = time.monotonic()

            # --- Tasten entprellen ---
            out = {name: debouncer.update(name, state, now)
                   for name, state in buttons.items()}

            # --- Tasten anwenden ---
            for name, xbtn in button_map.items():
                if out[name]:
                    gamepad.press_button(button=xbtn)
                else:
                    gamepad.release_button(button=xbtn)

            # --- Trigger (ZL/ZR digital) ---
            gamepad.left_trigger_float(value_float=1.0 if out["ZL"] else 0.0)
            gamepad.right_trigger_float(value_float=1.0 if out["ZR"] else 0.0)

            # --- Sticks: normalisieren + Deadzone ---
            lx = normalize_axis(lx_raw, clx, STICK_HALF_RANGE)
            ly = normalize_axis(ly_raw, cly, STICK_HALF_RANGE)
            rx = normalize_axis(rx_raw, crx, STICK_HALF_RANGE)
            ry = normalize_axis(ry_raw, cry, STICK_HALF_RANGE)
            lx, ly = apply_radial_deadzone(lx, ly, STICK_DEADZONE)
            rx, ry = apply_radial_deadzone(rx, ry, STICK_DEADZONE)

            gamepad.left_joystick_float(x_value_float=lx, y_value_float=ly)
            gamepad.right_joystick_float(x_value_float=rx, y_value_float=ry)

            gamepad.update()

            # --- Debug-Ausgabe ---
            log_button_changes({**out})
            log_sticks(lx, ly, rx, ry)

    finally:
        print("\n  Beende ... setze virtuellen Controller zurueck.")
        try:
            gamepad.reset()
            gamepad.update()
        except Exception:
            pass
        try:
            device.close()
        except Exception:
            pass
        print("  Fertig. Tschuess!")


if __name__ == "__main__":
    main()
