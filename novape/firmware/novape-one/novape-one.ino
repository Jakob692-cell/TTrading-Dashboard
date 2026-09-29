// NoVape One – Firmware für das Funktionsmuster V0
// ================================================
// Seeed XIAO nRF52840 + BMP390 + Münzmotor + weiße LED + Taster.
// Erkennt Züge über den Unterdruck in der Einlasskammer, gibt kurzes Feedback,
// speichert jede Nutzung (auch offline) und spricht das Bluetooth-Protokoll der
// NoVape-App (novape/app/src/services/device/protocol.ts).
//
// Build: Arduino IDE / arduino-cli, Board "Seeed XIAO nRF52840" (Core Seeeduino:nrf52),
// Bibliothek "Adafruit BMP3XX Library". Details: novape/firmware/README.md

#include <bluefruit.h>
#include <Adafruit_LittleFS.h>
#include <InternalFileSystem.h>
#include <Wire.h>
#include <Adafruit_BMP3XX.h>
#include "config.h"
#include "puff_detector.h"

using namespace Adafruit_LittleFS_Namespace;

#if DEBUG_SERIAL
#define LOG(...) Serial.printf(__VA_ARGS__)
#else
#define LOG(...)
#endif

/* ------------------------------------------------------------------ */
/* Bluetooth: UUIDs 6e6f7661-7065-4f6e-6500-0000000000XX              */
/* ------------------------------------------------------------------ */
#define NOVAPE_UUID(last) { (last), 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x65, 0x6e, 0x4f, 0x65, 0x70, 0x61, 0x76, 0x6f, 0x6e }
static const uint8_t UUID_SERVICE[16]    = NOVAPE_UUID(0x01);
static const uint8_t UUID_USAGE[16]      = NOVAPE_UUID(0x10); // notify: u32 Sekunden + u16 ms
static const uint8_t UUID_USAGE_SYNC[16] = NOVAPE_UUID(0x11); // write u32 "seit", read ≤ 40 Datensätze
static const uint8_t UUID_CARTRIDGE[16]  = NOVAPE_UUID(0x20); // read/notify u8 %, write u16 = neue Kartusche
static const uint8_t UUID_SETTINGS[16]   = NOVAPE_UUID(0x30); // write u8 Haptik 0–3, u8 Licht an/aus
static const uint8_t UUID_NAME[16]       = NOVAPE_UUID(0x31); // write UTF-8, max 20 Byte
static const uint8_t UUID_FIND[16]       = NOVAPE_UUID(0x32); // write u16 Dauer in ms
static const uint8_t UUID_CLOCK[16]      = NOVAPE_UUID(0x33); // write u32 aktuelle Unixzeit (s)

BLEService        svc(UUID_SERVICE);
BLECharacteristic chrUsage(UUID_USAGE);
BLECharacteristic chrSync(UUID_USAGE_SYNC);
BLECharacteristic chrCart(UUID_CARTRIDGE);
BLECharacteristic chrSettings(UUID_SETTINGS);
BLECharacteristic chrName(UUID_NAME);
BLECharacteristic chrFind(UUID_FIND);
BLECharacteristic chrClock(UUID_CLOCK);
BLEDis bledis;
BLEBas blebas;

Adafruit_BMP3XX bmp;

/* ------------------------------------------------------------------ */
/* Zustand                                                             */
/* ------------------------------------------------------------------ */
struct __attribute__((packed)) UsageRecord { uint32_t ts; uint16_t durMs; };

struct __attribute__((packed)) Config {
  uint32_t magic;
  char     name[21];
  uint8_t  haptic;       // 0 aus, 1 leicht, 2 mittel, 3 stark
  uint8_t  light;        // Lichtstreifen als Rückmeldung
  uint16_t cartUses;     // Standardzüge pro Kartusche
  float    cartUsedStd;  // verbrauchte Standardzüge
};
static const uint32_t CFG_MAGIC = 0x4E560001;
Config cfg;

// Uhr: die App schreibt beim Verbinden die aktuelle Zeit; bis dahin landen Züge im RAM.
bool     clockSet = false;
int64_t  epochOffsetMs = 0;           // Unixzeit(ms) = uptime(ms) + Offset
UsageRecord pending[PENDING_MAX];     // ts = Uptime in s, bis die Uhr gestellt ist
uint16_t pendingCount = 0;

// Druck und Zugerkennung
PuffDetector detector;
bool     sensorOk = false;

// Feedback
uint64_t motorOffAt = 0, ledFadeStart = 0, findUntil = 0;
bool     ledActive = false;

// Flags aus BLE-Callbacks (werden im loop() abgearbeitet)
volatile bool     wantNewCart = false;
volatile uint16_t newCartUses = 0;
volatile bool     wantSaveCfg = false;
volatile bool     wantRename = false;
volatile bool     wantClock = false;
volatile uint32_t clockEpoch = 0;
volatile uint16_t findMs = 0;

uint8_t lastCartPct = 255;
uint8_t lastBattPct = 255;

/* ------------------------------------------------------------------ */
/* Zeit                                                                */
/* ------------------------------------------------------------------ */
uint64_t uptimeMs() {                  // millis() läuft nach 49 Tagen über
  static uint32_t last = 0; static uint64_t high = 0;
  uint32_t now = millis();
  if (now < last) high += (1ULL << 32);
  last = now;
  return high + now;
}

/* ------------------------------------------------------------------ */
/* Speicher: Konfiguration + Nutzungsprotokoll im internen Flash       */
/* ------------------------------------------------------------------ */
void saveConfig() {
  InternalFS.remove(CFG_FILE);
  File f(InternalFS);
  if (f.open(CFG_FILE, FILE_O_WRITE)) { f.write((const uint8_t*)&cfg, sizeof(cfg)); f.close(); }
}
void loadConfig() {
  memset(&cfg, 0, sizeof(cfg));
  File f(InternalFS);
  if (f.open(CFG_FILE, FILE_O_READ)) { f.read(&cfg, sizeof(cfg)); f.close(); }
  if (cfg.magic != CFG_MAGIC) {
    memset(&cfg, 0, sizeof(cfg));
    cfg.magic = CFG_MAGIC;
    strncpy(cfg.name, DEFAULT_NAME, sizeof(cfg.name) - 1);
    cfg.haptic = 2; cfg.light = 1;
    cfg.cartUses = DEFAULT_CART_USES; cfg.cartUsedStd = 0;
    saveConfig();
  }
}

// RAM-Spiegel der letzten RING_MAX Datensätze: der Sync-Callback liest nur hier,
// nie gleichzeitig mit loop() aus dem Flash.
UsageRecord ring[RING_MAX];
uint16_t ringHead = 0, ringCount = 0;
void ringPush(const UsageRecord& r) {
  taskENTER_CRITICAL();
  ring[ringHead] = r; ringHead = (ringHead + 1) % RING_MAX; if (ringCount < RING_MAX) ringCount++;
  taskEXIT_CRITICAL();
}

uint32_t logCount() {
  File f(InternalFS);
  if (!f.open(LOG_FILE, FILE_O_READ)) return 0;
  uint32_t n = f.size() / sizeof(UsageRecord);
  f.close();
  return n;
}
void compactLog() {                    // behält die neuesten LOG_MAX_RECS/2 Datensätze
  uint32_t n = logCount(), keep = LOG_MAX_RECS / 2;
  if (n <= keep) return;
  static UsageRecord buf[LOG_MAX_RECS / 2];
  File f(InternalFS);
  if (!f.open(LOG_FILE, FILE_O_READ)) return;
  f.seek((n - keep) * sizeof(UsageRecord));
  f.read(buf, keep * sizeof(UsageRecord));
  f.close();
  InternalFS.remove(LOG_FILE);
  if (f.open(LOG_FILE, FILE_O_WRITE)) { f.write((const uint8_t*)buf, keep * sizeof(UsageRecord)); f.close(); }
}
void appendLog(const UsageRecord& r) {
  ringPush(r);
  if (logCount() >= LOG_MAX_RECS) compactLog();
  File f(InternalFS);
  if (f.open(LOG_FILE, FILE_O_WRITE)) { f.seek(f.size()); f.write((const uint8_t*)&r, sizeof(r)); f.close(); }
}
void loadRing() {                     // beim Start: letzte RING_MAX Datensätze aus dem Flash
  uint32_t n = logCount(), skip = n > RING_MAX ? n - RING_MAX : 0;
  File f(InternalFS);
  if (!f.open(LOG_FILE, FILE_O_READ)) return;
  f.seek(skip * sizeof(UsageRecord));
  UsageRecord r;
  while (f.read(&r, sizeof(r)) == sizeof(r)) ringPush(r);
  f.close();
}
// Bis zu SYNC_PAGE Datensätze mit ts ≥ since, älteste zuerst.
uint16_t readSince(uint32_t since, UsageRecord* out) {
  uint16_t n = 0;
  taskENTER_CRITICAL();
  uint16_t start = (ringHead + RING_MAX - ringCount) % RING_MAX;
  for (uint16_t i = 0; i < ringCount && n < SYNC_PAGE; i++) {
    const UsageRecord& r = ring[(start + i) % RING_MAX];
    if (r.ts >= since) out[n++] = r;
  }
  taskEXIT_CRITICAL();
  return n;
}

/* ------------------------------------------------------------------ */
/* Feedback: Motor, Lichtstreifen                                      */
/* ------------------------------------------------------------------ */
void motorPulse(uint16_t ms, uint8_t duty) {
  analogWrite(PIN_MOTOR, duty);
  motorOffAt = uptimeMs() + ms;
}
void hapticForUse() {
  static const uint16_t dur[4] = { 0, 35, 60, 90 };
  static const uint8_t duty[4] = { 0, 150, 200, 255 };
  if (cfg.haptic > 0 && cfg.haptic < 4) motorPulse(dur[cfg.haptic], duty[cfg.haptic]);
}
void ledGlow() { if (cfg.light) { ledActive = true; ledFadeStart = uptimeMs(); } }
void ledBlink(uint8_t times, uint16_t onMs = 120, uint16_t offMs = 180) {
  for (uint8_t i = 0; i < times; i++) { analogWrite(PIN_FRONT_LED, 200); delay(onMs); analogWrite(PIN_FRONT_LED, 0); delay(offMs); }
}
void serviceFeedback() {
  uint64_t now = uptimeMs();
  if (motorOffAt && now >= motorOffAt) { analogWrite(PIN_MOTOR, 0); motorOffAt = 0; }
  if (findUntil) {                                  // "Gerät finden": pulsieren
    if (now >= findUntil) { findUntil = 0; analogWrite(PIN_MOTOR, 0); analogWrite(PIN_FRONT_LED, 0); }
    else { bool on = ((now / 250) % 2) == 0; analogWrite(PIN_MOTOR, on ? 220 : 0); analogWrite(PIN_FRONT_LED, on ? 255 : 0); }
    return;
  }
  if (ledActive) {                                  // 150 ms an, 450 ms ausblenden
    uint32_t t = now - ledFadeStart;
    uint8_t v = t < 150 ? 255 : (t < 600 ? (uint8_t)(255 - (t - 150) * 255 / 450) : 0);
    analogWrite(PIN_FRONT_LED, v);
    if (t >= 600) ledActive = false;
  }
}

/* ------------------------------------------------------------------ */
/* Kartusche + Akku                                                    */
/* ------------------------------------------------------------------ */
uint8_t cartPct() {
  if (cfg.cartUses == 0) return 0;
  float left = 100.0f * (1.0f - cfg.cartUsedStd / cfg.cartUses);
  return (uint8_t)constrain((int)(left + 0.5f), 0, 100);
}
void publishCartridge() {
  uint8_t pct = cartPct();
  chrCart.write8(pct);
  if (pct != lastCartPct) {
    if (Bluefruit.connected() && chrCart.notifyEnabled()) chrCart.notify8(pct);
    if (lastCartPct != 255 && lastCartPct > CART_LOW_PCT && pct <= CART_LOW_PCT) ledBlink(2, 80, 120); // "fast leer"
    lastCartPct = pct;
  }
}
uint16_t batteryMv() {
  analogReference(AR_INTERNAL_2_4);
  analogReadResolution(12);
  uint32_t raw = 0;
  for (int i = 0; i < 8; i++) raw += analogRead(PIN_VBAT);
  raw /= 8;
  return (uint16_t)(raw * 2400.0f / 4095.0f * (1510.0f / 510.0f)); // Teiler 1 MΩ / 510 kΩ auf dem XIAO
}
uint8_t batteryPct(uint16_t mv) {                    // LiPo-Entladekurve, grob
  static const uint16_t v[] = { 3300, 3500, 3600, 3700, 3750, 3800, 3850, 3900, 4000, 4100, 4200 };
  static const uint8_t  p[] = {    0,    5,   10,   20,   30,   40,   50,   60,   75,   90,  100 };
  if (mv <= v[0]) return 0;
  for (int i = 1; i < 11; i++) if (mv < v[i]) return p[i - 1] + (uint32_t)(mv - v[i - 1]) * (p[i] - p[i - 1]) / (v[i] - v[i - 1]);
  return 100;
}
void publishBattery() {
  uint8_t pct = batteryPct(batteryMv());
  if (pct != lastBattPct) { blebas.write(pct); if (Bluefruit.connected()) blebas.notify(pct); lastBattPct = pct; }
}

/* ------------------------------------------------------------------ */
/* Nutzung speichern + melden                                          */
/* ------------------------------------------------------------------ */
void recordUse(uint64_t startMs, uint16_t durMs, float volumeMl, float peakPa) {
  UsageRecord r;
  r.durMs = durMs;
  if (clockSet) {
    r.ts = (uint32_t)(((int64_t)startMs + epochOffsetMs) / 1000);
    appendLog(r);
    if (Bluefruit.connected() && chrUsage.notifyEnabled()) chrUsage.notify((uint8_t*)&r, sizeof(r));
  } else if (pendingCount < PENDING_MAX) {
    r.ts = (uint32_t)(startMs / 1000);               // Uptime, wird beim Stellen der Uhr umgerechnet
    pending[pendingCount++] = r;
  }
  cfg.cartUsedStd += volumeMl / STD_PUFF_ML;
  static uint8_t sinceSave = 0;
  if (++sinceSave >= 10) { sinceSave = 0; saveConfig(); }
  publishCartridge();
  LOG("Zug: %u ms, %.1f ml, Spitze %.0f Pa, Kartusche %u %%\n", durMs, volumeMl, peakPa, cartPct());
  (void)peakPa;
}
void flushPending() {
  for (uint16_t i = 0; i < pendingCount; i++) {
    UsageRecord r = pending[i];
    r.ts = (uint32_t)(((int64_t)r.ts * 1000 + epochOffsetMs) / 1000);
    appendLog(r);
  }
  pendingCount = 0;
}

/* ------------------------------------------------------------------ */
/* Zugerkennung (Logik in puff_detector.h)                             */
/* ------------------------------------------------------------------ */
void processPressure(float p, float dtS) {
  PuffEvent ev = detector.update(p, uptimeMs(), dtS);
  if (ev.started) { hapticForUse(); ledGlow(); }      // Feedback sofort, nicht erst am Ende
  if (ev.finished) recordUse(ev.startMs, (uint16_t)ev.durationMs, ev.volumeMl, ev.peakPa);
  if (ev.rejected) { LOG("verworfen: %lu ms\n", (unsigned long)ev.durationMs); }
}

/* ------------------------------------------------------------------ */
/* Taster: kurz = Akkustand, doppelt = neue Kartusche, 3 s = koppeln   */
/* ------------------------------------------------------------------ */
void serviceButton() {
  static bool wasDown = false; static uint64_t downAt = 0, lastRelease = 0; static uint8_t clicks = 0; static bool longDone = false;
  bool down = digitalRead(PIN_BUTTON) == LOW;
  uint64_t now = uptimeMs();
  if (down && !wasDown) { downAt = now; longDone = false; }
  if (down && !longDone && now - downAt >= 3000) {   // koppeln: 60 s schnell werben
    longDone = true; clicks = 0;
    Bluefruit.Advertising.stop();
    Bluefruit.Advertising.setFastTimeout(60);
    Bluefruit.Advertising.start(0);
    motorPulse(120, 255);
    ledBlink(3, 60, 60);
  }
  if (!down && wasDown && !longDone && now - downAt > 30) { clicks++; lastRelease = now; }
  if (clicks && !down && now - lastRelease > 400) {
    if (clicks == 1) {                                // Akkustand: 1–4 Blinker
      uint8_t pct = batteryPct(batteryMv());
      ledBlink(pct >= 75 ? 4 : pct >= 50 ? 3 : pct >= 25 ? 2 : 1);
    } else if (clicks == 2) {                         // neue Kartusche eingesetzt
      cfg.cartUsedStd = 0; saveConfig(); publishCartridge();
      for (int i = 0; i < 2; i++) { analogWrite(PIN_MOTOR, 220); delay(60); analogWrite(PIN_MOTOR, 0); delay(100); }
    }
    clicks = 0;
  }
  wasDown = down;
}

/* ------------------------------------------------------------------ */
/* BLE-Callbacks (kurz halten, Arbeit im loop())                       */
/* ------------------------------------------------------------------ */
uint32_t rdU32(const uint8_t* d) { return d[0] | (d[1] << 8) | (d[2] << 16) | ((uint32_t)d[3] << 24); }
uint16_t rdU16(const uint8_t* d) { return d[0] | (d[1] << 8); }

void onSyncWrite(uint16_t, BLECharacteristic* c, uint8_t* d, uint16_t len) {
  if (len < 4) return;
  static UsageRecord page[SYNC_PAGE];
  uint16_t n = readSince(rdU32(d), page);            // sofort beantworten, die App liest direkt danach
  c->write((uint8_t*)page, n * sizeof(UsageRecord));
}
void onCartWrite(uint16_t, BLECharacteristic*, uint8_t* d, uint16_t len) { if (len >= 2) { newCartUses = rdU16(d); wantNewCart = true; } }
void onSettingsWrite(uint16_t, BLECharacteristic*, uint8_t* d, uint16_t len) {
  if (len >= 2) { cfg.haptic = min<uint8_t>(d[0], 3); cfg.light = d[1] ? 1 : 0; wantSaveCfg = true; }
}
void onNameWrite(uint16_t, BLECharacteristic*, uint8_t* d, uint16_t len) {
  len = min<uint16_t>(len, 20);
  memset(cfg.name, 0, sizeof(cfg.name)); memcpy(cfg.name, d, len);
  wantRename = true;
}
void onFindWrite(uint16_t, BLECharacteristic*, uint8_t* d, uint16_t len) { if (len >= 2) findMs = rdU16(d); }
void onClockWrite(uint16_t, BLECharacteristic*, uint8_t* d, uint16_t len) { if (len >= 4) { clockEpoch = rdU32(d); wantClock = true; } }

void onConnect(uint16_t) { LOG("verbunden\n"); }
void onDisconnect(uint16_t, uint8_t reason) { LOG("getrennt (0x%02X)\n", reason); }

void setupChr(BLECharacteristic& c, uint8_t props, uint16_t maxLen, BLECharacteristic::write_cb_t cb) {
  c.setProperties(props);
  c.setPermission(SECMODE_OPEN, (props & (CHR_PROPS_WRITE | CHR_PROPS_WRITE_WO_RESP)) ? SECMODE_OPEN : SECMODE_NO_ACCESS);
  c.setMaxLen(maxLen);
  if (cb) c.setWriteCallback(cb);
  c.begin();
}

void setupBle() {
  Bluefruit.configPrphBandwidth(BANDWIDTH_MAX);     // MTU bis 247 → 240-Byte-Seiten beim Sync
  Bluefruit.begin();
  Bluefruit.autoConnLed(false);
  Bluefruit.setTxPower(0);
  Bluefruit.setName(cfg.name);
  Bluefruit.Periph.setConnectCallback(onConnect);
  Bluefruit.Periph.setDisconnectCallback(onDisconnect);

  bledis.setManufacturer("NoVape");
  bledis.setModel(MODEL_NAME);
  bledis.setFirmwareRev(FW_VERSION);
  bledis.begin();
  blebas.begin();

  svc.begin();
  setupChr(chrUsage, CHR_PROPS_NOTIFY, sizeof(UsageRecord), nullptr);
  setupChr(chrSync, CHR_PROPS_READ | CHR_PROPS_WRITE, SYNC_PAGE * sizeof(UsageRecord), onSyncWrite);
  setupChr(chrCart, CHR_PROPS_READ | CHR_PROPS_NOTIFY | CHR_PROPS_WRITE, 2, onCartWrite);
  setupChr(chrSettings, CHR_PROPS_WRITE, 2, onSettingsWrite);
  setupChr(chrName, CHR_PROPS_WRITE, 20, onNameWrite);
  setupChr(chrFind, CHR_PROPS_WRITE, 2, onFindWrite);
  setupChr(chrClock, CHR_PROPS_WRITE, 4, onClockWrite);

  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addService(svc);
  Bluefruit.ScanResponse.addName();
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(160, 1636);     // 100 ms schnell, ≈ 1 s langsam (Einheit 0,625 ms)
  Bluefruit.Advertising.setFastTimeout(30);
  Bluefruit.Advertising.start(0);
}

/* ------------------------------------------------------------------ */
void setup() {
#if DEBUG_SERIAL
  Serial.begin(115200);
  delay(1500);
#endif
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_MOTOR, OUTPUT);   analogWrite(PIN_MOTOR, 0);
  pinMode(PIN_FRONT_LED, OUTPUT); analogWrite(PIN_FRONT_LED, 0);
  pinMode(LED_RED, OUTPUT);   digitalWrite(LED_RED, HIGH);   // Onboard-LEDs aus (active low)
  pinMode(LED_GREEN, OUTPUT); digitalWrite(LED_GREEN, HIGH);
  pinMode(LED_BLUE, OUTPUT);  digitalWrite(LED_BLUE, HIGH);
  pinMode(VBAT_ENABLE, OUTPUT); digitalWrite(VBAT_ENABLE, LOW); // Spannungsteiler aktiv, schützt P0.31 beim Laden

  InternalFS.begin();
  loadConfig();
  loadRing();

  Wire.begin();
  sensorOk = bmp.begin_I2C(0x77, &Wire) || bmp.begin_I2C(0x76, &Wire);
  if (sensorOk) {
    bmp.setPressureOversampling(BMP3_OVERSAMPLING_4X);  // ≈ 0,7 Pa Rauschen
    bmp.setTemperatureOversampling(BMP3_NO_OVERSAMPLING);
    bmp.setIIRFilterCoeff(BMP3_IIR_FILTER_DISABLE);     // kein Filter: schnelle Reaktion
  } else {
    ledBlink(5, 60, 60);                              // Sensorfehler anzeigen
  }

  setupBle();
  publishCartridge();
  publishBattery();
  LOG("NoVape One %s bereit, Sensor %s\n", FW_VERSION, sensorOk ? "ok" : "FEHLT");
}

void loop() {
  static uint64_t lastSample = 0, lastBatt = 0;
  uint64_t now = uptimeMs();

  // --- Arbeit aus BLE-Callbacks ---
  if (wantClock) {
    wantClock = false;
    epochOffsetMs = (int64_t)clockEpoch * 1000 - (int64_t)now;
    clockSet = true;
    flushPending();
  }
  if (wantNewCart) {
    wantNewCart = false;
    cfg.cartUses = newCartUses ? newCartUses : DEFAULT_CART_USES;
    cfg.cartUsedStd = 0;
    saveConfig();
    publishCartridge();
  }
  if (wantSaveCfg) { wantSaveCfg = false; saveConfig(); }
  if (wantRename) { wantRename = false; saveConfig(); Bluefruit.setName(cfg.name); } // gilt ab der nächsten Werbung
  if (findMs) { findUntil = now + findMs; findMs = 0; }

  // --- Druck abtasten: 10 Hz in Ruhe, 25 Hz um einen Zug herum ---
  bool fast = detector.wantsFastSampling(now);
  uint32_t period = fast ? FAST_PERIOD_MS : IDLE_PERIOD_MS;
  if (sensorOk && now - lastSample >= period) {
    float dtS = lastSample ? (now - lastSample) / 1000.0f : period / 1000.0f;
    lastSample = now;
    if (bmp.performReading()) processPressure((float)bmp.pressure, dtS);
  }

  serviceButton();
  serviceFeedback();

  if (!detector.inPuff && now - lastBatt >= 60000) { lastBatt = now; publishBattery(); }

  // Rest der Periode schlafen (FreeRTOS legt die CPU schlafen), bei Feedback kurz takten
  bool busy = motorOffAt || ledActive || findUntil || digitalRead(PIN_BUTTON) == LOW;
  delay(busy ? 10 : (fast ? 20 : 50));
}
