// Host-Test der Zugerkennung mit simulierten Druckverläufen.
// g++ -std=c++17 -O2 -I../novape-one puff_detector_test.cpp -o t && ./t
#include <cstdio>
#include <cmath>
#include <functional>
#include <vector>
#include <string>
#include "puff_detector.h"

// Unterdruck in der Einlasskammer bei Durchfluss Q (ml/s): Δp = (Q/K)²
static float dpForFlow(float q) { return -(q / INLET_K) * (q / INLET_K); }
// Zugprofil: weich an- und abschwellend (sin²-Rampen), Spitzenfluss qPeak, Dauer durS
static float puffFlow(float t, float t0, float durS, float qPeak) {
  float x = t - t0; if (x < 0 || x > durS) return 0;
  float ramp = fminf(0.35f, durS / 3);
  float a = x < ramp ? sinf(x / ramp * M_PI / 2) : (x > durS - ramp ? sinf((durS - x) / ramp * M_PI / 2) : 1);
  return qPeak * a * a;
}

struct Result { int finished = 0, rejected = 0; std::vector<PuffEvent> events; };

// Simuliert wie die Firmware: 10 Hz in Ruhe, 25 Hz um einen Zug herum; ±1 Pa Sensorrauschen.
static Result run(float seconds, std::function<float(float)> dpAt, float drift = 0) {
  PuffDetector d; Result r;
  uint32_t seed = 12345;
  auto noise = [&]() { float s = 0; for (int i = 0; i < 4; i++) { seed = seed * 1664525u + 1013904223u; s += (seed >> 8) / 16777216.0f - 0.5f; } return s * 1.7f; };
  uint64_t now = 0; float t = 0;
  while (t < seconds) {
    float p = 101325.0f + drift * t + dpAt(t) + noise();
    uint32_t period = d.wantsFastSampling(now) ? FAST_PERIOD_MS : IDLE_PERIOD_MS;
    PuffEvent e = d.update(p, now, period / 1000.0f);
    if (e.finished) { r.finished++; r.events.push_back(e); }
    if (e.rejected) r.rejected++;
    now += period; t = now / 1000.0f;
  }
  return r;
}

int fails = 0;
static void expect(const char* name, bool ok, const std::string& info) {
  printf("%s %-46s %s\n", ok ? "OK  " : "FAIL", name, info.c_str());
  if (!ok) fails++;
}
static std::string fmt(const Result& r) {
  char b[160]; std::string s = "gezählt " + std::to_string(r.finished) + ", verworfen " + std::to_string(r.rejected);
  for (auto& e : r.events) { snprintf(b, sizeof b, " | %.2f s, %.0f ml, %.0f Pa", e.durationMs / 1000.0, e.volumeMl, e.peakPa); s += b; }
  return s;
}

int main() {
  // 1) Normaler Zug: 35 ml in ≈ 2,4 s (Spitze 17,5 ml/s)
  auto r = run(8, [](float t) { return dpForFlow(puffFlow(t, 2, 2.4f, 17.5f)); });
  expect("normaler Zug (35 ml, 2,4 s)", r.finished == 1 && fabsf(r.events[0].durationMs / 1000.0f - 2.2f) < 0.4f && fabsf(r.events[0].volumeMl - 33) < 8, fmt(r));
  // 2) sanfter Zug 10 ml/s
  r = run(8, [](float t) { return dpForFlow(puffFlow(t, 2, 2.0f, 10.5f)); });
  expect("sanfter Zug (10,5 ml/s)", r.finished == 1, fmt(r));
  // 3) sehr schwacher Zug 7 ml/s (≈ 100 Pa) – bewusst unter der Schwelle
  r = run(8, [](float t) { return dpForFlow(puffFlow(t, 2, 2.0f, 7.0f)); });
  expect("sehr schwacher Zug (7 ml/s) wird nicht gezählt", r.finished == 0, fmt(r));
  // 4) kräftiger, kurzer Zug 30 ml/s, 0,8 s
  r = run(6, [](float t) { return dpForFlow(puffFlow(t, 2, 0.8f, 30)); });
  expect("kurzer kräftiger Zug (0,8 s)", r.finished == 1, fmt(r));
  // 5) zwei Züge kurz hintereinander
  r = run(10, [](float t) { return dpForFlow(puffFlow(t, 2, 1.8f, 17.5f) + puffFlow(t, 4.6f, 1.8f, 17.5f)); });
  expect("zwei Züge mit 0,8 s Pause", r.finished == 2, fmt(r));
  // 6) Stoß / Klopfen: −400 Pa für 60 ms
  r = run(5, [](float t) { return (t > 2 && t < 2.06f) ? -400.0f : 0.0f; });
  expect("Stoß 60 ms wird ignoriert", r.finished == 0, fmt(r));
  // 7) Autotür: +250 / −250 Pa Welle über 0,25 s
  r = run(5, [](float t) { float x = t - 2; return (x > 0 && x < 0.25f) ? 250.0f * sinf(x / 0.25f * 2 * M_PI) : 0.0f; });
  expect("Autotür-Druckwelle wird ignoriert", r.finished == 0, fmt(r));
  // 8) schneller Aufzug: −60 Pa/s über 12 s (5 m/s, 60 m)
  r = run(25, [](float t) { float x = fminf(fmaxf(t - 3, 0), 12); return -60.0f * x; });
  expect("schneller Aufzug (−60 Pa/s, 12 s)", r.finished == 0, fmt(r));
  // 9) normaler Aufzug: −25 Pa/s über 5 s
  r = run(15, [](float t) { float x = fminf(fmaxf(t - 3, 0), 5); return -25.0f * x; });
  expect("Aufzug (−25 Pa/s, 5 s)", r.finished == 0, fmt(r));
  // 10) Zug während einer Aufzugfahrt
  r = run(20, [](float t) { float x = fminf(fmaxf(t - 2, 0), 12); return -30.0f * x + dpForFlow(puffFlow(t, 7, 2.0f, 17.5f)); });
  expect("Zug während der Aufzugfahrt", r.finished == 1, fmt(r));
  // 10b) Zug während der Fahrt nach oben (Druck steigt)
  r = run(20, [](float t) { float x = fminf(fmaxf(t - 2, 0), 12); return 30.0f * x + dpForFlow(puffFlow(t, 7, 2.0f, 17.5f)); });
  expect("Zug während der Fahrt nach oben", r.finished == 1, fmt(r));
  // 11) Dauer-Unterdruck 12 s (verstopft / Störung)
  r = run(20, [](float t) { return (t > 2 && t < 14) ? -500.0f : 0.0f; });
  expect("12 s Dauer-Unterdruck wird verworfen", r.finished == 0 && r.rejected >= 1, fmt(r));
  // 12) nur Rauschen + Wetterdrift (100 Pa/h), 10 min
  r = run(600, [](float) { return 0.0f; }, 100.0f / 3600);
  expect("10 min Ruhe mit Wetterdrift", r.finished == 0, fmt(r));
  // 13) langer ruhiger Zug 5 s
  r = run(10, [](float t) { return dpForFlow(puffFlow(t, 2, 5.0f, 12.0f)); });
  expect("langer ruhiger Zug (5 s)", r.finished == 1, fmt(r));
  printf("\n%s: %d Fehler\n", fails ? "NICHT BESTANDEN" : "BESTANDEN", fails);
  return fails ? 1 : 0;
}
