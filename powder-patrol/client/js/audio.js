// Fully procedural audio: wind, carving, impacts, beacon beeps, explosions and a little alpine folk loop.
export class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.musicVolume = 0.5;
    this.pluckCache = new Map();
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      this.ctx = new C();
    } catch { return; }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicVolume * 0.5;
    this.music.connect(this.master);
    // noise buffers
    const len = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0), b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last * 3.5;
    }
    // wind loop
    this.wind = this.loop(this.brown, 'lowpass', 600);
    this.carve = this.loop(this.white, 'bandpass', 2400);
    this.carve.filter.Q.value = 0.7;
    this.startMusic();
  }

  loop(buffer, type, freq) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.sfx);
    src.start();
    return { src, filter, gain };
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setMusic(v) { this.musicVolume = v; if (this.music) this.music.gain.setTargetAtTime(v * (this.inGame ? 0.25 : 0.5), this.ctx.currentTime, 0.3); }
  setInGame(on) { this.inGame = on; this.setMusic(this.musicVolume); }

  // continuous skiing sounds
  updateMotion(speed, skid, airborne, muffled) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const w = Math.min(1, speed / 28);
    this.wind.gain.gain.setTargetAtTime(muffled ? 0.02 : 0.05 + w * 0.35, t, 0.15);
    this.wind.filter.frequency.setTargetAtTime(300 + w * 1400, t, 0.2);
    const c = airborne || muffled ? 0 : Math.min(0.5, skid / 60) + Math.min(0.12, speed / 200);
    this.carve.gain.gain.setTargetAtTime(c, t, 0.06);
  }

  // continuous engine drone for the vehicle the local player drives
  updateEngine(on, load, throttle) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.engine) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 45;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 90;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      const g = ctx.createGain(); g.gain.value = 0;
      const g2 = ctx.createGain(); g2.gain.value = 0.35;
      o.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(this.sfx);
      o.start(); o2.start();
      this.engine = { o, o2, f, g };
    }
    const e = this.engine;
    const rpm = 40 + Math.min(1.2, load) * 110 + (throttle ? 15 : 0);
    e.o.frequency.setTargetAtTime(rpm, t, 0.08);
    e.o2.frequency.setTargetAtTime(rpm * 2.01, t, 0.08);
    e.f.frequency.setTargetAtTime(350 + load * 1300, t, 0.1);
    e.g.gain.setTargetAtTime(on ? 0.06 + (throttle ? 0.05 : 0) : 0, t, 0.12);
  }

  noiseBurst({ dur = 0.3, freq = 800, type = 'lowpass', gain = 0.5, q = 1, sweep = 0, at = 0, buffer = 'white' }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = buffer === 'brown' ? this.brown : this.white;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  tone({ freq = 440, dur = 0.2, type = 'sine', gain = 0.3, slide = 0, at = 0, attack = 0.005 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name, vol = 1) {
    if (!this.ctx || vol <= 0.01) return;
    switch (name) {
      case 'ui': this.tone({ freq: 660, dur: 0.07, type: 'triangle', gain: 0.15 * vol }); this.tone({ freq: 990, dur: 0.08, type: 'triangle', gain: 0.1 * vol, at: 0.04 }); break;
      case 'jump': this.noiseBurst({ dur: 0.18, freq: 1800, type: 'bandpass', gain: 0.25 * vol, sweep: 0.5 }); break;
      case 'land': this.noiseBurst({ dur: 0.25, freq: 500, gain: 0.5 * vol, buffer: 'brown' }); this.noiseBurst({ dur: 0.3, freq: 3000, type: 'highpass', gain: 0.15 * vol }); break;
      case 'crash':
        this.noiseBurst({ dur: 0.45, freq: 300, gain: 0.9 * vol, buffer: 'brown' });
        this.tone({ freq: 110, dur: 0.3, type: 'sine', gain: 0.5 * vol, slide: 0.5 });
        for (let i = 0; i < 4; i++) this.tone({ freq: 900 + Math.random() * 1400, dur: 0.06, type: 'square', gain: 0.04 * vol, at: 0.1 + i * 0.09 }); // yard sale clatter
        break;
      case 'bonk': this.tone({ freq: 180, dur: 0.15, type: 'triangle', gain: 0.4 * vol, slide: 0.6 }); break;
      case 'beep': this.tone({ freq: 2200, dur: 0.07, type: 'sine', gain: 0.18 * vol, attack: 0.002 }); break;
      case 'radio':
        this.noiseBurst({ dur: 0.12, freq: 2500, type: 'bandpass', gain: 0.25 * vol, q: 3 });
        this.tone({ freq: 1320, dur: 0.08, type: 'square', gain: 0.07 * vol, at: 0.12 });
        this.tone({ freq: 1760, dur: 0.1, type: 'square', gain: 0.07 * vol, at: 0.21 });
        break;
      case 'boom':
        this.noiseBurst({ dur: 1.8, freq: 900, gain: 1.0 * vol, sweep: 0.08, buffer: 'brown' });
        this.tone({ freq: 70, dur: 1.2, type: 'sine', gain: 0.9 * vol, slide: 0.4 });
        this.noiseBurst({ dur: 0.25, freq: 4000, type: 'highpass', gain: 0.5 * vol });
        break;
      case 'rumble':
        this.noiseBurst({ dur: 7, freq: 220, gain: 0.9 * vol, sweep: 0.6, buffer: 'brown' });
        this.tone({ freq: 45, dur: 6, type: 'sine', gain: 0.5 * vol, attack: 1.2 });
        break;
      case 'crack': this.noiseBurst({ dur: 0.5, freq: 1500, type: 'bandpass', gain: 0.6 * vol, q: 2, sweep: 0.3 }); this.tone({ freq: 60, dur: 1.5, gain: 0.3 * vol, attack: 0.3 }); break;
      case 'cash':
        [0, 0.08, 0.16].forEach((at, i) => this.tone({ freq: [1046, 1318, 1568][i], dur: 0.25, type: 'triangle', gain: 0.2 * vol, at }));
        this.tone({ freq: 2093, dur: 0.5, type: 'sine', gain: 0.12 * vol, at: 0.24 });
        break;
      case 'load': this.tone({ freq: 520, dur: 0.12, type: 'triangle', gain: 0.25 * vol }); this.tone({ freq: 780, dur: 0.18, type: 'triangle', gain: 0.25 * vol, at: 0.1 }); break;
      case 'dig': this.noiseBurst({ dur: 0.18, freq: 900, gain: 0.4 * vol, buffer: 'brown' }); break;
      case 'bad': this.tone({ freq: 330, dur: 0.25, type: 'sawtooth', gain: 0.12 * vol, slide: 0.7 }); this.tone({ freq: 247, dur: 0.4, type: 'sawtooth', gain: 0.12 * vol, at: 0.2, slide: 0.7 }); break;
      case 'clunk': this.tone({ freq: 140, dur: 0.12, type: 'square', gain: 0.15 * vol, slide: 0.7 }); this.noiseBurst({ dur: 0.1, freq: 600, gain: 0.3 * vol }); break;
      case 'whistle': this.tone({ freq: 1800, dur: 0.35, type: 'sine', gain: 0.2 * vol, slide: 1.3 }); break;
      case 'heli': for (let i = 0; i < 18; i++) this.noiseBurst({ dur: 0.1, freq: 160, gain: 0.35 * vol, at: i * 0.11, buffer: 'brown' }); break;
      case 'trick': [0, 0.07, 0.14, 0.21].forEach((at, i) => this.tone({ freq: [784, 988, 1175, 1568][i], dur: 0.15, type: 'square', gain: 0.07 * vol, at })); break;
      case 'tick': this.tone({ freq: 880, dur: 0.06, type: 'square', gain: 0.1 * vol }); break;
      case 'go': this.tone({ freq: 1320, dur: 0.4, type: 'square', gain: 0.12 * vol }); break;
      case 'engine': this.noiseBurst({ dur: 0.6, freq: 180, gain: 0.5 * vol, buffer: 'brown' }); this.tone({ freq: 55, dur: 0.7, type: 'sawtooth', gain: 0.18 * vol, slide: 1.8 }); break;
      case 'horn': this.tone({ freq: 392, dur: 0.45, type: 'square', gain: 0.12 * vol }); this.tone({ freq: 494, dur: 0.45, type: 'square', gain: 0.1 * vol }); break;
    }
  }

  // ---------- music: plucked folk loop (Karplus-Strong rendered into buffers) ----------
  pluck(freq) {
    const key = Math.round(freq);
    if (this.pluckCache.has(key)) return this.pluckCache.get(key);
    const sr = this.ctx.sampleRate, dur = 1.6, n = Math.floor(sr * dur);
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const next = (idx + 1) % period;
      const v = 0.996 * 0.5 * (ring[idx] + ring[next]);
      d[i] = ring[idx];
      ring[idx] = v;
      idx = next;
    }
    this.pluckCache.set(key, buf);
    return buf;
  }

  startMusic() {
    const ctx = this.ctx;
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // I - vi - IV - V in G with a yodel-ish melody
    const chords = [[55, 59, 62, 67], [52, 55, 59, 64], [48, 52, 55, 60], [50, 54, 57, 62]];
    const melody = [74, 76, 79, 76, 74, 71, 74, null, 72, 71, 69, 71, 72, 74, 76, null, 72, 74, 76, 79, 81, 79, 76, 74, 74, 72, 71, 69, 71, null, 67, null];
    const bpm = 104, step = 60 / bpm / 2;
    let nextTime = ctx.currentTime + 0.3, beat = 0;
    const play = (freq, t, gain, rate = 1) => {
      const src = ctx.createBufferSource();
      src.buffer = this.pluck(freq);
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(this.music);
      src.start(t);
    };
    const bell = (freq, t, gain) => {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g).connect(this.music);
      o.start(t); o.stop(t + 1.5);
    };
    const tick = () => {
      if (!this.ctx) return;
      while (nextTime < ctx.currentTime + 0.25) {
        const bar = Math.floor(beat / 8) % chords.length;
        const ch = chords[bar];
        const pos = beat % 8;
        if (pos === 0 || pos === 4) play(midi(ch[0] - 12), nextTime, 0.5);
        play(midi(ch[[1, 2, 3, 2, 1, 2, 3, 2][pos]]), nextTime, 0.18);
        const mel = melody[beat % melody.length];
        if (mel && Math.floor(beat / 32) % 2 === 1) bell(midi(mel), nextTime, 0.05);
        nextTime += step;
        beat++;
      }
    };
    this.musicTimer = setInterval(tick, 60);
  }
}
