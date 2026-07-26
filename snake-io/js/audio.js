/* ============================================================================
 *  audio.js
 *  Komplett prozedurale Audio-Engine (Web Audio API) – keine externen Dateien,
 *  damit das Spiel offline und ohne Assets sofort laeuft.
 *
 *  Effekte : Essen, Boost (Dauerklang), Tod, Kill, Menue-Klick
 *  Musik   : generativer Ambient-Loop mit Pad-Akkorden und Arpeggio
 * ==========================================================================*/
(function (global) {
  'use strict';

  const SNK = global.SNK || (global.SNK = {});

  /** Akkordfolge des Ambient-Pads (Halbtoene relativ zu A2 = 110 Hz). */
  const PROGRESSION = [
    [0, 3, 7, 10],   // Am7
    [-4, 0, 5, 8],   // Fmaj7
    [3, 7, 10, 14],  // Cmaj7
    [-2, 2, 5, 9]    // G
  ];

  class AudioManager {
    constructor(settings) {
      this.settings = settings;
      this.ctx = null;
      this.master = null;
      this.sfxBus = null;
      this.musicBus = null;
      this.noiseBuffer = null;

      this.boostNodes = null;
      this._lastEat = 0;
      this._eatChain = 0;

      this._musicTimer = 0;
      this._musicStep = 0;
      this._nextNoteTime = 0;
      this._musicRunning = false;
      this._unlocked = false;
    }

    /* ---------------------------------------------------------------- Setup */

    /** Muss aus einer Nutzeraktion heraus aufgerufen werden (Autoplay-Policy). */
    unlock() {
      if (this._unlocked) {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;

      try {
        this.ctx = new AC();
      } catch (e) {
        this.ctx = null;
        return;
      }

      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(ctx.destination);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.settings.data.sfx ? 1 : 0;
      this.sfxBus.connect(this.master);

      // Musik laeuft ueber einen eigenen Bus mit sanftem Delay-Hall.
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.master);

      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.42;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 2000;
      delay.connect(damp);
      damp.connect(fb);
      fb.connect(delay);
      delay.connect(this.musicBus);
      this.musicDelay = delay;

      this.noiseBuffer = this._makeNoise(1.2);
      this._unlocked = true;

      if (ctx.state === 'suspended') ctx.resume();
      if (this.settings.data.music) this.startMusic();
    }

    _makeNoise(seconds) {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }

    get ready() { return this._unlocked && this.ctx !== null; }
    get t() { return this.ctx.currentTime; }

    /* ------------------------------------------------------------- Settings */

    setSfx(on) {
      this.settings.set('sfx', on);
      if (this.ready) {
        this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.t, 0.05);
      }
      if (!on) this.stopBoost();
    }

    setMusic(on) {
      this.settings.set('music', on);
      if (!this.ready) return;
      if (on) this.startMusic(); else this.stopMusic();
    }

    /** Bei Pause/Tab-Wechsel: alles stumm, aber Kontext am Leben halten. */
    suspend() {
      if (!this.ready) return;
      this.stopBoost();
      this.master.gain.setTargetAtTime(0, this.t, 0.08);
    }

    resume() {
      if (!this.ready) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.master.gain.setTargetAtTime(0.9, this.t, 0.12);
    }

    /* ---------------------------------------------------------- Bausteine */

    /** Einfache Huellkurve: Attack -> Decay auf 0. */
    _env(gain, t0, peak, attack, decay) {
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    }

    _tone(type, f0, f1, dur, peak, dest) {
      const ctx = this.ctx, t0 = this.t;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t0);
      if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      this._env(g, t0, peak, Math.min(0.012, dur * 0.2), dur);
      osc.connect(g);
      g.connect(dest || this.sfxBus);
      osc.start(t0);
      osc.stop(t0 + dur + 0.06);
      return osc;
    }

    _noiseBurst(dur, peak, f0, f1, type) {
      const ctx = this.ctx, t0 = this.t;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const flt = ctx.createBiquadFilter();
      flt.type = type || 'lowpass';
      flt.frequency.setValueAtTime(f0, t0);
      flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
      flt.Q.value = 1.2;
      const g = ctx.createGain();
      this._env(g, t0, peak, 0.008, dur);
      src.connect(flt); flt.connect(g); g.connect(this.sfxBus);
      src.start(t0);
      src.stop(t0 + dur + 0.08);
    }

    /* ------------------------------------------------------------- Effekte */

    /**
     * Fress-Sound. `power` (0..1) verschiebt die Tonhoehe nach oben,
     * aufeinanderfolgende Bissen bilden eine kleine aufsteigende Kette.
     */
    playEat(power) {
      if (!this.ready || !this.settings.data.sfx) return;
      const now = this.t;
      if (now - this._lastEat < 0.045) return;      // Drossel gegen Sound-Spam
      this._eatChain = (now - this._lastEat < 0.42) ? Math.min(7, this._eatChain + 1) : 0;
      this._lastEat = now;

      const base = 520 + this._eatChain * 42 + (power || 0) * 260;
      this._tone('sine', base, base * 1.7, 0.085, 0.16);
      this._tone('triangle', base * 2, base * 2.4, 0.05, 0.05);
    }

    /** Groessere Beute (Gold-Kugel / Todes-Nahrung). */
    playBigEat() {
      if (!this.ready || !this.settings.data.sfx) return;
      this._tone('triangle', 300, 900, 0.22, 0.16);
      this._tone('sine', 600, 1500, 0.18, 0.08);
    }

    /** Dauerhafter Boost-Klang, laeuft bis stopBoost(). */
    startBoost() {
      if (!this.ready || !this.settings.data.sfx || this.boostNodes) return;
      const ctx = this.ctx, t0 = this.t;

      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 0.8;

      const sub = ctx.createOscillator();
      sub.type = 'sawtooth';
      sub.frequency.value = 74;

      const subG = ctx.createGain();
      subG.gain.value = 0.05;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.085, t0 + 0.07);

      // Leichtes Wobbeln macht den Klang lebendig.
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 5.5;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 260;
      lfo.connect(lfoG);
      lfoG.connect(bp.frequency);

      src.connect(bp); bp.connect(g);
      sub.connect(subG); subG.connect(g);
      g.connect(this.sfxBus);

      src.start(t0); sub.start(t0); lfo.start(t0);
      this.boostNodes = { src, sub, lfo, g };
    }

    stopBoost() {
      const n = this.boostNodes;
      if (!n || !this.ready) { this.boostNodes = null; return; }
      const t0 = this.t;
      n.g.gain.cancelScheduledValues(t0);
      n.g.gain.setValueAtTime(n.g.gain.value, t0);
      n.g.gain.linearRampToValueAtTime(0.0001, t0 + 0.1);
      try {
        n.src.stop(t0 + 0.16);
        n.sub.stop(t0 + 0.16);
        n.lfo.stop(t0 + 0.16);
      } catch (e) { /* bereits gestoppt */ }
      this.boostNodes = null;
    }

    /** Eigener Tod: tiefe Explosion + abfallender Ton. */
    playDeath() {
      if (!this.ready || !this.settings.data.sfx) return;
      this._noiseBurst(0.75, 0.3, 2600, 90, 'lowpass');
      this._tone('sawtooth', 340, 45, 0.7, 0.14);
      this._tone('sine', 170, 40, 0.9, 0.1);
    }

    /** Fremde Schlange gestorben (in Sichtweite) – kurzes Knacken. */
    playPop(power) {
      if (!this.ready || !this.settings.data.sfx) return;
      this._noiseBurst(0.28, 0.14 * (0.5 + 0.5 * (power || 0.5)), 1800, 240, 'lowpass');
      this._tone('triangle', 220, 90, 0.2, 0.06);
    }

    /** Eigener Kill – belohnender Doppelklang. */
    playKill() {
      if (!this.ready || !this.settings.data.sfx) return;
      this._tone('square', 440, 660, 0.1, 0.1);
      const self = this;
      setTimeout(function () {
        if (self.ready && self.settings.data.sfx) self._tone('square', 660, 990, 0.16, 0.1);
      }, 90);
    }

    /** Menue-Klick. */
    playClick() {
      if (!this.ready || !this.settings.data.sfx) return;
      this._tone('square', 620, 880, 0.055, 0.06);
    }

    /** Weicher Hover/Wechsel-Klick. */
    playSoft() {
      if (!this.ready || !this.settings.data.sfx) return;
      this._tone('sine', 900, 1200, 0.05, 0.035);
    }

    /** Countdown-Tick (last = "GO"). */
    playTick(last) {
      if (!this.ready || !this.settings.data.sfx) return;
      if (last) {
        this._tone('triangle', 660, 1320, 0.3, 0.16);
        this._tone('sine', 330, 660, 0.35, 0.1);
      } else {
        this._tone('triangle', 440, 440, 0.12, 0.11);
      }
    }

    /** Fanfare fuer Zufalls-Events. */
    playEvent() {
      if (!this.ready || !this.settings.data.sfx) return;
      const self = this;
      [0, 90, 180].forEach(function (ms, i) {
        setTimeout(function () {
          if (self.ready && self.settings.data.sfx) {
            self._tone('triangle', 523 * Math.pow(1.26, i), 523 * Math.pow(1.26, i + 1), 0.18, 0.09);
          }
        }, ms);
      });
    }

    /* --------------------------------------------------------------- Musik */

    startMusic() {
      if (!this.ready || this._musicRunning) return;
      this._musicRunning = true;
      this.musicBus.gain.setTargetAtTime(0.5, this.t, 1.2);
      this._nextNoteTime = this.t + 0.1;
      const self = this;
      this._musicTimer = global.setInterval(function () { self._schedule(); }, 160);
      this._schedule();
    }

    stopMusic() {
      if (!this._musicRunning) return;
      this._musicRunning = false;
      global.clearInterval(this._musicTimer);
      this._musicTimer = 0;
      if (this.ready) this.musicBus.gain.setTargetAtTime(0, this.t, 0.5);
    }

    /** Look-Ahead-Scheduler: plant Noten bis 0.7 s in die Zukunft. */
    _schedule() {
      if (!this.ready || !this._musicRunning) return;
      const spb = 0.34;                                  // Sekunden pro Achtel
      while (this._nextNoteTime < this.t + 0.7) {
        this._playStep(this._musicStep, this._nextNoteTime, spb);
        this._musicStep++;
        this._nextNoteTime += spb;
      }
    }

    _playStep(step, when, spb) {
      const ctx = this.ctx;
      const bar = Math.floor(step / 8) % PROGRESSION.length;
      const beat = step % 8;

      // Pad: zu jedem Taktbeginn ein weicher Akkord.
      if (beat === 0) {
        const chord = PROGRESSION[bar];
        for (let i = 0; i < chord.length; i++) {
          const f = 110 * Math.pow(2, chord[i] / 12);
          this._pad(f, when, spb * 8.4, 0.055);
          this._pad(f * 1.005, when, spb * 8.4, 0.035);   // leichtes Detune
        }
      }

      // Arpeggio: sparsame Blips auf ausgewaehlten Achteln.
      const pattern = [1, 0, 1, 0, 0, 1, 0, 1];
      if (pattern[beat] && Math.random() < 0.8) {
        const chord = PROGRESSION[bar];
        const semi = chord[(beat + bar) % chord.length];
        const f = 220 * Math.pow(2, semi / 12) * (Math.random() < 0.3 ? 2 : 1);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = f;
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(0.05, when + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
        osc.connect(g);
        g.connect(this.musicBus);
        g.connect(this.musicDelay);
        osc.start(when);
        osc.stop(when + 0.6);
      }

      // Sanfter Bass-Puls auf 1 und 5.
      if (beat === 0 || beat === 4) {
        const chord = PROGRESSION[bar];
        const f = 55 * Math.pow(2, chord[0] / 12);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(0.11, when + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, when + spb * 3);
        osc.connect(g); g.connect(this.musicBus);
        osc.start(when);
        osc.stop(when + spb * 3.2);
      }
    }

    _pad(freq, when, dur, peak) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const flt = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      flt.type = 'lowpass';
      flt.frequency.value = 620;
      flt.Q.value = 0.6;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(peak, when + dur * 0.35);
      g.gain.linearRampToValueAtTime(0.0001, when + dur);
      osc.connect(flt); flt.connect(g);
      g.connect(this.musicBus);
      osc.start(when);
      osc.stop(when + dur + 0.05);
    }
  }

  SNK.AudioManager = AudioManager;

})(typeof window !== 'undefined' ? window : this);
