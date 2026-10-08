// Fully procedural audio: wind, carving, impacts, beacon beeps, explosions, radio / pager alarms,
// the Martinshorn siren, a helicopter rotor and a little alpine folk loop.
// Every public method is a silent no-op until unlock() has created the AudioContext, so callers never
// need to check; a suspended context just schedules into the void.
export class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.musicVolume = 0.5;
    this.pluckCache = new Map();
    this.texCache = new Map();
    this.engine = null;
    this.siren = null;
    this.rotor = null;
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
  setInGame(on) {
    this.inGame = on;
    this.setMusic(this.musicVolume);
    if (!on) this.stopLoops(); // leaving a shift: no engine / siren / rotor left droning in the menu
  }

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

  stopEngine() {
    if (!this.ctx || !this.engine) return;
    this.engine.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
  }

  // fade out every continuous loop (engine, siren, rotor)
  stopLoops() {
    this.stopEngine();
    this.updateSiren(false);
    this.updateRotor(0);
  }

  // ---------------------------------------------------------------- one-shot building blocks
  noiseBurst({ dur = 0.3, freq = 800, type = 'lowpass', gain = 0.5, q = 1, sweep = 0, at = 0, buffer = 'white', attack = 0, hold = 0, lp = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = buffer === 'brown' ? this.brown : this.white;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = ctx.createGain();
    if (attack > 0) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + attack);
    } else g.gain.setValueAtTime(gain, t);
    if (hold > 0) g.gain.setValueAtTime(gain, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = src.connect(f);
    if (lp) { const l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp; node = node.connect(l); }
    node.connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  tone({ freq = 440, dur = 0.2, type = 'sine', gain = 0.3, slide = 0, at = 0, attack = 0.005, hold = 0, lp = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    if (hold > 0) g.gain.setValueAtTime(gain, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (lp) { const l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp; node = node.connect(l); }
    node.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Cached procedural texture made of many tiny decaying noise grains whose density wanders in
  // clusters: snow crunch, rescue-foil crinkle, velcro hooks. Two variants per kind for variety.
  texture(kind) {
    const key = kind + (Math.random() < 0.5 ? 0 : 1);
    let buf = this.texCache.get(key);
    if (buf) return buf;
    const P = TEXTURES[kind];
    const sr = this.ctx.sampleRate, n = Math.max(1, Math.floor(sr * P.dur));
    buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const seg = Math.max(1, Math.floor(P.cluster * sr));
    let dens = 1, next = 0.2 + Math.random() * 1.8;
    for (let i = 0; i < n; i++) {
      if (i % seg === 0) { dens = next; next = 0.15 + Math.random() * 1.85; }
      const e = P.env(i / n);
      const local = dens + (next - dens) * ((i % seg) / seg);
      if (P.bed) d[i] += P.bed * e * local * (Math.random() * 2 - 1);
      if (Math.random() < (P.rate * e * local) / sr) {
        const len = Math.max(2, Math.floor(sr * (P.grain[0] + Math.random() * (P.grain[1] - P.grain[0]))));
        const amp = e * Math.pow(Math.random(), P.power);
        for (let k = 0; k < len && i + k < n; k++) d[i + k] += amp * (Math.random() * 2 - 1) * Math.exp((-4 * k) / len);
      }
    }
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < n; i++) d[i] *= 0.9 / peak;
    this.texCache.set(key, buf);
    return buf;
  }

  // filters: [[type, freq, q?, gainDb?], ...]
  playBuffer(buf, { at = 0, gain = 0.3, rate = 1, filters = [] } = {}) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    let node = src;
    for (const [type, freq, q, db] of filters) {
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq;
      if (q !== undefined) f.Q.value = q;
      if (db !== undefined) f.gain.value = db;
      node = node.connect(f);
    }
    const g = ctx.createGain();
    g.gain.value = gain;
    node.connect(g).connect(this.sfx);
    src.start(t);
  }

  // radio squelch tail: band-limited (voice channel) noise that is cut off by the squelch gate
  squelch(vol, at = 0) {
    this.noiseBurst({ dur: 0.18, freq: 1700, type: 'bandpass', q: 0.55, gain: 0.2 * vol, attack: 0.004, hold: 0.115, lp: 3400, at });
    this.noiseBurst({ dur: 0.05, freq: 3000, type: 'highpass', gain: 0.05 * vol, at: at + 0.005 });
    this.tone({ freq: 180, dur: 0.035, type: 'square', gain: 0.02 * vol, at: at + 0.16, lp: 900, attack: 0.002 }); // gate closing
  }

  // German BOS pager (Funkmeldeempfänger): three trills of rapidly alternating high beeps
  pager(vol) {
    const ctx = this.ctx, t0 = ctx.currentTime + 0.01;
    const o = ctx.createOscillator(); o.type = 'square';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200; // soften the square
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900; // tiny piezo speaker
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(lp).connect(hp).connect(g).connect(this.sfx);
    const peak = 0.05 * vol, beep = 0.048, step = 0.062;
    let t = t0;
    for (let grp = 0; grp < 3; grp++) {
      for (let i = 0; i < 7; i++) {
        o.frequency.setValueAtTime(i % 2 ? 2600 : 2100, t);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + 0.004);
        g.gain.setValueAtTime(peak, t + beep - 0.006);
        g.gain.linearRampToValueAtTime(0, t + beep);
        t += step;
      }
      t += 0.08;
    }
    o.start(t0);
    o.stop(t);
  }

  play(name, vol = 1) {
    if (!this.ctx || !(vol > 0.01)) return;
    try {
      this.playOne(name, vol);
    } catch { /* never let a sound effect break the game loop */ }
  }

  playOne(name, vol) {
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
      case 'radio': // key-up click, two-tone call chirp, then the squelch tail
        this.noiseBurst({ dur: 0.06, freq: 2000, type: 'bandpass', q: 0.7, gain: 0.15 * vol, attack: 0.003, hold: 0.03, lp: 3400 });
        this.tone({ freq: 1200, dur: 0.07, type: 'square', gain: 0.06 * vol, at: 0.06, attack: 0.004, hold: 0.05, lp: 2800 });
        this.tone({ freq: 1750, dur: 0.1, type: 'square', gain: 0.06 * vol, at: 0.135, attack: 0.004, hold: 0.08, lp: 2800 });
        this.squelch(vol, 0.27);
        break;
      case 'squelch': this.squelch(vol); break;
      case 'pager': this.pager(vol); break;
      case 'ack': // two short confirm beeps
        for (const at of [0, 0.11]) this.tone({ freq: 1480, dur: 0.065, type: 'square', gain: 0.05 * vol, at, attack: 0.003, hold: 0.05, lp: 3000 });
        break;
      case 'callout':
        this.tone({ freq: 1250, dur: 0.06, type: 'sine', gain: 0.14 * vol, slide: 1.3, attack: 0.003 });
        this.tone({ freq: 2500, dur: 0.045, type: 'triangle', gain: 0.03 * vol, slide: 1.3, attack: 0.002 });
        break;
      case 'wrong': // gentle low double buzz
        for (const at of [0, 0.17]) {
          this.tone({ freq: 150, dur: 0.12, type: 'sawtooth', gain: 0.1 * vol, at, attack: 0.008, hold: 0.08, lp: 650 });
          this.tone({ freq: 151.5, dur: 0.12, type: 'square', gain: 0.04 * vol, at, attack: 0.008, hold: 0.08, lp: 650 });
        }
        break;
      case 'probeHit': // probe slides through snow, then a dull thunk on something soft (+ a tiny tick of the pole)
        this.playBuffer(this.texture('crunch'), { gain: 0.1 * vol, rate: 1.4, filters: [['bandpass', 1500, 0.7]] });
        this.tone({ freq: 150, dur: 0.14, type: 'sine', gain: 0.32 * vol, slide: 0.55, at: 0.045, attack: 0.003 });
        this.noiseBurst({ dur: 0.1, freq: 260, gain: 0.35 * vol, buffer: 'brown', at: 0.045 });
        this.tone({ freq: 3300, dur: 0.02, type: 'triangle', gain: 0.04 * vol, at: 0.047, attack: 0.001 });
        break;
      case 'probeMiss': // soft snow crunch
        this.playBuffer(this.texture('crunch'), { gain: 0.32 * vol, rate: 0.85 + Math.random() * 0.35, filters: [['highpass', 450], ['lowpass', 4200]] });
        this.noiseBurst({ dur: 0.09, freq: 220, gain: 0.1 * vol, buffer: 'brown' });
        break;
      case 'treat': // velcro straps ripping, then a short rustle of fabric
        this.playBuffer(this.texture('velcro'), { gain: 0.26 * vol, rate: 0.9 + Math.random() * 0.25, filters: [['highpass', 900], ['peaking', 3200, 1, 5]] });
        this.noiseBurst({ dur: 0.22, freq: 1400, type: 'bandpass', q: 0.5, gain: 0.07 * vol, at: 0.36, attack: 0.05 });
        this.noiseBurst({ dur: 0.18, freq: 2300, type: 'bandpass', q: 0.5, gain: 0.05 * vol, at: 0.5, attack: 0.04 });
        break;
      case 'foil': // crinkly rescue blanket
        this.playBuffer(this.texture('foil'), { gain: 0.3 * vol, rate: 0.9 + Math.random() * 0.2, filters: [['highpass', 2400], ['peaking', 6500, 0.8, 4]] });
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

  // ---------------------------------------------------------------- continuous loops (siren, rotor)
  // Shared gain logic for a lazily-built loop: only touches AudioParams when the target really
  // changes, and unplugs the graph after it has been silent for a while so it costs nothing.
  driveLoop(L, target, t, upTc, downTc) {
    if (target > 0) {
      L.offAt = 0;
      if (!L.connected) { L.out.connect(this.sfx); L.connected = true; L.onWake?.(t); }
    } else if (!L.offAt) L.offAt = t;
    if (target !== L.target && (Math.abs(target - L.target) > 0.0008 || target === 0 || L.target === 0)) {
      L.out.gain.setTargetAtTime(target, t, target === 0 ? downTc : target > L.target ? upTc : 0.12);
      L.target = target;
    }
    if (L.connected && target === 0 && t - L.offAt > downTc * 7) {
      L.out.disconnect();
      L.connected = false;
      L.onSleep?.();
    }
  }

  // German Martinshorn (Folgetonhorn): a' 440 Hz / d'' 585 Hz, ~0.65 s each, brassy.
  // vol = caller's distance attenuation 0..1. Cheap to call every frame.
  updateSiren(on, vol = 1) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const v = on ? Math.max(0, Math.min(1, +vol || 0)) : 0;
      if (!this.siren) { if (v <= 0) return; this.siren = this.makeSiren(); }
      const s = this.siren;
      this.driveLoop(s, v * 0.09, t, 0.09, 0.3);
      const cut = 1500 + 3700 * v; // distant horns lose their brassy top end
      if (v > 0 && Math.abs(cut - s.cut) > 80) { s.lp.frequency.setTargetAtTime(cut, t, 0.15); s.cut = cut; }
    } catch { /* audio must never break the frame */ }
  }

  makeSiren() {
    const ctx = this.ctx;
    const center = Math.sqrt(440 * 585); // both tones sit symmetrically (in cents) around this
    const half = (1200 * Math.log2(585 / 440)) / 2;
    // square LFO (1.3 s period) -> gentle low-pass for a short pneumatic glide -> detune (cents) of every oscillator
    const glide = ctx.createBiquadFilter(); glide.type = 'lowpass'; glide.frequency.value = 16; glide.Q.value = -6;
    const depth = ctx.createGain(); depth.gain.value = -half; // negative: a fresh cycle starts on the low tone
    glide.connect(depth);
    const mix = ctx.createGain(); mix.gain.value = 0.5;
    const oscs = [['sawtooth', 1, 0, 0.55], ['square', 1, 7, 0.32], ['sawtooth', 2, -5, 0.16]].map(([type, mul, det, gv]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = center * mul; o.detune.value = det;
      const g = ctx.createGain(); g.gain.value = gv;
      depth.connect(o.detune);
      o.connect(g).connect(mix);
      o.start();
      return o;
    });
    const shaper = ctx.createWaveShaper(); shaper.curve = tanhCurve(2.2); shaper.oversample = '2x';
    const honk = ctx.createBiquadFilter(); honk.type = 'peaking'; honk.frequency.value = 1350; honk.Q.value = 1.1; honk.gain.value = 7;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 230;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
    const out = ctx.createGain(); out.gain.value = 0;
    mix.connect(shaper).connect(honk).connect(hp).connect(lp).connect(out);
    const s = { oscs, glide, depth, lp, out, lfo: null, target: 0, cut: 5200, connected: false, offAt: 0 };
    s.onWake = (t) => { // restart the tone cycle so a freshly switched-on horn begins with the first tone
      if (s.lfo) { try { s.lfo.stop(); } catch { /* already stopped */ } s.lfo.disconnect(); }
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 1 / 1.3;
      lfo.connect(glide);
      lfo.start(t);
      s.lfo = lfo;
    };
    return s;
  }

  // Helicopter rotor: low-passed noise amplitude-modulated by a ~19 Hz blade-slap pulse train plus a
  // faint turbine whine. vol 0..1 (distance); silent and unplugged when 0. Cheap to call every frame.
  updateRotor(vol) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const v = Math.max(0, Math.min(1, +vol || 0));
      if (!this.rotor) { if (v <= 0) return; this.rotor = this.makeRotor(); }
      const r = this.rotor;
      this.driveLoop(r, v * 0.55, t, 0.25, 0.35);
      if (v > 0 && Math.abs(v - r.v) > 0.01) {
        r.v = v;
        r.slapLp.frequency.setTargetAtTime(380 + 1300 * v, t, 0.2); // far away only the low thump carries
        r.whine.gain.setTargetAtTime(0.05 * v, t, 0.25); // whine falls off faster (≈ vol²)
      }
    } catch { /* audio must never break the frame */ }
  }

  makeRotor() {
    const ctx = this.ctx;
    // blade-pass pulse train: one Gaussian bump per period from cosine harmonics
    const N = 12, sigma = 2.3;
    const real = new Float32Array(N + 1), imag = new Float32Array(N + 1);
    for (let n = 1; n <= N; n++) real[n] = Math.exp(-(n * n) / (2 * sigma * sigma));
    let max = -Infinity, min = Infinity; // the browser normalises the wave to peak 1: find its trough
    for (let i = 0; i < 512; i++) {
      const th = (i / 512) * Math.PI * 2;
      let s = 0;
      for (let n = 1; n <= N; n++) s += real[n] * Math.cos(n * th);
      max = Math.max(max, s); min = Math.min(min, s);
    }
    const trough = min / max; // < 0
    const lfo = ctx.createOscillator();
    lfo.setPeriodicWave(ctx.createPeriodicWave(real, imag));
    lfo.frequency.value = 19;
    // AM stage whose gain never dips below `floor`
    const am = (depthV, floor) => {
      const g = ctx.createGain(); g.gain.value = floor - trough * depthV;
      const d = ctx.createGain(); d.gain.value = depthV;
      lfo.connect(d).connect(g.gain);
      return g;
    };
    const noise = (buffer) => { const s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true; s.start(0, Math.random() * 1.5); return s; };
    const mix = ctx.createGain(); mix.gain.value = 1;
    // body: deep thump
    const bodyLp = ctx.createBiquadFilter(); bodyLp.type = 'lowpass'; bodyLp.frequency.value = 170;
    noise(this.brown).connect(bodyLp).connect(am(0.8, 0.35)).connect(mix);
    // slap: brighter chop at every blade pass
    const slapBp = ctx.createBiquadFilter(); slapBp.type = 'bandpass'; slapBp.frequency.value = 650; slapBp.Q.value = 0.6;
    const slapLp = ctx.createBiquadFilter(); slapLp.type = 'lowpass'; slapLp.frequency.value = 1600;
    const slapG = ctx.createGain(); slapG.gain.value = 0.55;
    noise(this.white).connect(slapBp).connect(slapLp).connect(am(1, 0.03)).connect(slapG).connect(mix);
    // turbine whine (~1.1 kHz) with a slightly detuned partner for shimmer
    const whine = ctx.createGain(); whine.gain.value = 0;
    for (const [f, gv] of [[1100, 1], [1107, 0.5], [2210, 0.25]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = gv;
      o.connect(g).connect(whine);
      o.start();
    }
    whine.connect(mix);
    const out = ctx.createGain(); out.gain.value = 0;
    mix.connect(out);
    lfo.start();
    return { lfo, slapLp, whine, out, target: 0, v: -1, connected: false, offAt: 0 };
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

// soft-clip curve for the brassy siren
function tanhCurve(k) {
  const n = 1024, c = new Float32Array(n), norm = Math.tanh(k);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / norm;
  return c;
}

// Grain-texture recipes (see Sound.texture). env(x) shapes loudness and grain density over 0..1.
const TEXTURES = {
  // packed snow compressing under a probe / boot
  crunch: { dur: 0.24, rate: 1400, grain: [0.001, 0.005], power: 1.5, bed: 0.12, cluster: 0.025, env: (x) => (x < 0.12 ? x / 0.12 : Math.pow(1 - (x - 0.12) / 0.88, 1.6)) },
  // thousands of velcro hooks letting go: dense, jerky, ends abruptly
  velcro: { dur: 0.36, rate: 2600, grain: [0.0002, 0.0012], power: 1.8, bed: 0.22, cluster: 0.012, env: (x) => (x < 0.05 ? x / 0.05 : x > 0.86 ? (1 - x) / 0.14 : 1 - 0.3 * x) },
  // rescue blanket being unfolded: sparse sharp crackles in two crumple gestures
  foil: {
    dur: 0.62, rate: 520, grain: [0.0003, 0.002], power: 2.5, bed: 0.03, cluster: 0.03,
    env: (x) => Math.min(1, Math.max(0, Math.sin(Math.PI * Math.min(1, x / 0.45))) + 0.75 * Math.max(0, Math.sin((Math.PI * (x - 0.35)) / 0.65))),
  },
};
