// NoVape One – Firmware-Konfiguration für das Funktionsmuster V0
// Board: Seeed XIAO nRF52840 (Arduino-Core "Seeed nRF52 Boards", nicht "mbed")
#pragma once

#define FW_VERSION "0.1.0"
#define MODEL_NAME "NoVape One V0"
#define DEFAULT_NAME "NoVape One"
#define DEBUG_SERIAL 0  // 1 = Diagnose über USB-Seriell (115200), kostet Strom

// ---------- Verdrahtung (siehe Bauplan › Elektronik) ----------
#define PIN_BUTTON D1   // Taster nach GND, interner Pull-up
#define PIN_MOTOR  D2   // Gate des N-MOSFET (AO3400), 100 Ω in Serie, 100 kΩ nach GND
#define PIN_FRONT_LED D3 // weiße LED + 68 Ω nach GND (Lichtstreifen)
// I²C: D4 = SDA, D5 = SCL → BMP390 (Adresse 0x77, bei SDO an GND 0x76)

// ---------- Luftweg / Zugerkennung ----------
// Der Sensor misst den Unterdruck in der Einlasskammer = Druckabfall an der Einlassbohrung.
#define START_PA        (-150.0f)  // Zug beginnt unter −150 Pa ...
#define START_CONFIRM_MS 100       // ... wenn das mindestens 100 ms anhält
#define END_PA          (-60.0f)   // Zug endet über −60 Pa (Hysterese) ...
#define END_CONFIRM_MS   150       // ... für mindestens 150 ms
#define MIN_PUFF_MS      300       // kürzer = Stoß/Störung, wird verworfen
#define MAX_PUFF_MS     8000       // länger = Störung (Wetter, Aufzug, verstopft), verworfen
#define BASELINE_TAU_S   3.0f      // Zeitkonstante der Ruhedruck-Nachführung
#define FREEZE_PA       (-40.0f)   // unter diesem Wert wird die Basislinie eingefroren ...
#define ONSET_MAX_MS     600       // ... aber nur, wenn der Abfall schnell kommt (Zug statt Aufzug)
#define DRIFT_TAU_S      0.5f      // langsame Druckänderung: Basislinie zügig nachziehen
#define WAKE_PA         (-60.0f)   // ab hier auf schnelle Abtastung umschalten
#define IDLE_PERIOD_MS   100       // 10 Hz in Ruhe
#define FAST_PERIOD_MS    40       // 25 Hz um einen Zug herum
#define FAST_HOLD_MS    2000       // so lange nach dem letzten Unterdruck schnell bleiben

// Volumenschätzung über die Einlassblende: Q = K · sqrt(|Δp|)
// K = Cd · A · sqrt(2/ρ) in ml/s pro sqrt(Pa). Ø 1,0 mm, Cd ≈ 0,7 → K ≈ 0,71.
// Kalibrieren: 35-ml-Spritze in 2 s gleichmäßig ziehen, K so anpassen, dass ≈ 35 ml angezeigt werden.
#define INLET_K          0.71f
#define STD_PUFF_ML      35.0f     // "Standardzug" (ISO-Zugvolumen) für die Kartuschen-Rechnung
#define DEFAULT_CART_USES 600      // Standardzüge pro Kartusche, bis die App etwas anderes schreibt
#define CART_LOW_PCT     15        // ab hier Hinweis "Kartusche fast leer"

// ---------- Speicher ----------
#define LOG_FILE      "/usage.bin"
#define CFG_FILE      "/config.bin"
#define LOG_MAX_RECS  1024         // Flash: danach werden die ältesten 512 verworfen
#define RING_MAX       512         // RAM-Spiegel für den Sync (≈ 2–3 Wochen Nutzung)
#define PENDING_MAX   256          // Züge ohne gestellte Uhr (nur RAM, bis die App die Zeit setzt)
#define SYNC_PAGE     40           // Datensätze pro Lesevorgang (40 × 6 = 240 Byte)
