// Zugerkennung – ohne Hardware-Abhängigkeiten, damit sie auf dem PC testbar ist
// (novape/firmware/test/puff_detector_test.cpp).
#pragma once
#include <math.h>
#include <stdint.h>
#include "config.h"

struct PuffEvent {
  bool     started = false;   // Zug hat begonnen (Feedback jetzt geben)
  bool     finished = false;  // Zug gültig beendet → speichern
  bool     rejected = false;  // zu kurz/zu lang → verwerfen
  uint64_t startMs = 0;
  uint32_t durationMs = 0;
  float    volumeMl = 0;
  float    peakPa = 0;
};

class PuffDetector {
 public:
  float baseline = NAN;
  float dp = 0;
  bool  inPuff = false;
  uint64_t belowSince = 0, aboveSince = 0, puffStart = 0, lastLowMs = 0, lastQuietMs = 0;
  float volumeMl = 0, peakPa = 0;
  float driftPaS = 0;          // Druckänderung der Umgebung (Aufzug, Auto), während eines Zugs fortgeschrieben

  // p: Absolutdruck in Pa, now: Millisekunden, dtS: Abstand zur letzten Messung in s
  PuffEvent update(float p, uint64_t now, float dtS) {
    PuffEvent ev;
    if (isnan(baseline)) baseline = p;
    dp = p - baseline;
    if (dp < WAKE_PA) lastLowMs = now;

    if (!inPuff) {
      if (dp > FREEZE_PA) lastQuietMs = now;
      // Ein Zug fällt schnell ab (< ONSET_MAX_MS von ruhig bis unter die Schwelle).
      // Langsame Änderungen (Aufzug, Wetter, Auto) sind kein Zug: dann weiter nachführen.
      bool slowDrift = now - lastQuietMs > ONSET_MAX_MS;
      if (dp > FREEZE_PA || slowDrift) {
        float k = dtS / (slowDrift ? DRIFT_TAU_S : BASELINE_TAU_S); if (k > 1) k = 1;
        float before = baseline;
        baseline += (p - baseline) * k;
        dp = p - baseline;
        if (dtS > 0) {
          float rate = (baseline - before) / dtS, kr = dtS / 2.0f; if (kr > 1) kr = 1;
          driftPaS += (rate - driftPaS) * kr;
          if (driftPaS > 100) driftPaS = 100;
          if (driftPaS < -100) driftPaS = -100;
        }
      }
      if (dp < START_PA && !slowDrift) {
        if (!belowSince) belowSince = now;
        if (now - belowSince >= START_CONFIRM_MS) {
          inPuff = true; puffStart = belowSince; aboveSince = 0; volumeMl = 0; peakPa = dp;
          ev.started = true; ev.startMs = puffStart;
        }
      } else belowSince = 0;
    }
    if (inPuff) {
      baseline += driftPaS * dtS;                             // Umgebungsdrift während des Zugs weiterführen
      dp = p - baseline;
      if (dp < 0) volumeMl += INLET_K * sqrtf(-dp) * dtS;
      if (dp < peakPa) peakPa = dp;
      if (dp > END_PA) {
        if (!aboveSince) aboveSince = now;
        if (now - aboveSince >= END_CONFIRM_MS) {
          uint32_t len = (uint32_t)(aboveSince - puffStart);
          inPuff = false; belowSince = 0;
          ev.startMs = puffStart; ev.durationMs = len; ev.volumeMl = volumeMl; ev.peakPa = peakPa;
          if (len >= MIN_PUFF_MS && len <= MAX_PUFF_MS) ev.finished = true; else ev.rejected = true;
        }
      } else aboveSince = 0;
      if (inPuff && now - puffStart > MAX_PUFF_MS + 2000) {   // hängt → Störung, Basislinie neu
        inPuff = false; belowSince = 0; baseline = p;
        ev.rejected = true; ev.startMs = puffStart; ev.durationMs = (uint32_t)(now - puffStart);
      }
    }
    return ev;
  }

  bool wantsFastSampling(uint64_t now) const {
    return inPuff || belowSince || (now - lastLowMs < FAST_HOLD_MS);
  }
};
