// Leitstelle radio voice: German text-to-speech wrapped in radio squelch.
// Lines are queued so callouts never talk over each other (max 3 waiting; the oldest non-priority line
// is dropped first). Everything silently no-ops where the Web Speech API is missing, blocked or broken.
const STORE_KEY = 'pp.voice';
const MAX_PENDING = 3;
const LEAD_IN = 170; // ms of squelch before the voice starts
const GAP = 380; // ms after the closing squelch before the next line

const clean = (text) => String(text ?? '')
  .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '') // emoji / pictographs
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 300);
const norm = (lang) => String(lang || '').replace('_', '-').toLowerCase();
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class Voice {
  constructor(sound) {
    this.sound = sound || null;
    this.queue = [];
    this.current = null; // line being spoken (or in its squelch lead-in)
    this.cooling = false; // gap after a line
    this.timer = 0;
    this.voices = [];
    this.voiceCache = new Map();
    this.enabled = true;
    try {
      const v = localStorage.getItem(STORE_KEY);
      if (v !== null) this.enabled = !(v === '0' || v === 'false');
    } catch { /* storage blocked: keep default */ }
    this.synth = null;
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function') {
        this.synth = window.speechSynthesis;
      }
    } catch { this.synth = null; }
    if (this.synth) {
      this.loadVoices();
      const refresh = () => this.loadVoices(); // voices usually arrive asynchronously
      try {
        if (typeof this.synth.addEventListener === 'function') this.synth.addEventListener('voiceschanged', refresh);
        else this.synth.onvoiceschanged = refresh;
      } catch { /* ignore */ }
    }
  }

  get available() { return !!this.synth; }
  get speaking() { return !!this.current; }
  get pending() { return this.queue.length; }

  setEnabled(on) {
    this.enabled = !!on;
    try { localStorage.setItem(STORE_KEY, this.enabled ? '1' : '0'); } catch { /* ignore */ }
    if (!this.enabled) this.cancel();
  }

  say(text, { priority = false, rate = 1.05, pitch = 0.92, lang = 'de-DE' } = {}) {
    if (!this.enabled || !this.synth) return;
    const line = clean(text);
    if (!line) return;
    if (this.current?.text === line) return; // same line already on air
    const dup = this.queue.findIndex((q) => q.text === line);
    if (dup >= 0) {
      if (!priority || this.queue[dup].priority) return;
      this.queue.splice(dup, 1); // re-insert the duplicate as priority below
    }
    const item = { text: line, priority: !!priority, rate: +rate || 1, pitch: +pitch || 1, lang: lang || 'de-DE' };
    if (item.priority) {
      const i = this.queue.findIndex((q) => !q.priority); // after earlier priority lines, before the rest
      if (i < 0) this.queue.push(item); else this.queue.splice(i, 0, item);
    } else this.queue.push(item);
    while (this.queue.length > MAX_PENDING) {
      const i = this.queue.findIndex((q) => !q.priority);
      this.queue.splice(i < 0 ? 0 : i, 1);
    }
    this.pump();
  }

  cancel() {
    this.queue.length = 0;
    clearTimeout(this.timer);
    this.timer = 0;
    this.cooling = false;
    const was = this.current;
    this.current = null;
    if (was) was.u = null;
    if (!this.synth) return;
    try { if (was || this.synth.speaking || this.synth.pending) this.synth.cancel(); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------------ internals
  pump() {
    if (this.current || this.cooling || !this.queue.length || !this.synth || !this.enabled) return;
    const item = this.queue.shift();
    this.current = item;
    this.squelch();
    this.timer = setTimeout(() => this.speak(item), LEAD_IN);
  }

  speak(item) {
    if (this.current !== item) return;
    try {
      const u = new SpeechSynthesisUtterance(item.text);
      const v = this.pickVoice(item.lang);
      if (v) { u.voice = v; u.lang = v.lang || item.lang; } else u.lang = item.lang;
      u.rate = Math.max(0.5, Math.min(2, item.rate));
      u.pitch = Math.max(0, Math.min(2, item.pitch));
      const vol = this.sound && Number.isFinite(this.sound.volume) ? this.sound.volume : 1;
      u.volume = Math.max(0, Math.min(1, vol));
      const done = () => this.finish(item);
      u.onend = done;
      u.onerror = done;
      item.u = u; // keep a reference: Chrome drops the events of garbage-collected utterances
      if (this.synth.paused) this.synth.resume();
      this.synth.speak(u);
    } catch {
      this.finish(item);
      return;
    }
    // watchdog: some engines never fire onend (no voices installed, headless, autoplay-blocked)
    const est = 1.2 + (item.text.length * 0.085) / Math.max(0.5, item.rate);
    item.deadline = now() + Math.min(30000, est * 2500);
    this.arm(item, est * 1000 + 1500);
  }

  arm(item, ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.current !== item) return;
      let busy = false;
      try { busy = !!this.synth.speaking; } catch { /* ignore */ }
      if (busy && now() < item.deadline) { this.arm(item, 800); return; }
      this.finish(item);
      if (busy) { try { this.synth.cancel(); } catch { /* ignore */ } }
    }, ms);
  }

  finish(item) {
    if (this.current !== item) return;
    clearTimeout(this.timer);
    this.current = null;
    item.u = null;
    this.squelch();
    this.cooling = true;
    this.timer = setTimeout(() => {
      this.timer = 0;
      this.cooling = false;
      this.pump();
    }, GAP);
  }

  squelch() {
    try { this.sound?.play?.('squelch', 0.7); } catch { /* ignore */ }
  }

  loadVoices() {
    try { this.voices = (this.synth && this.synth.getVoices()) || []; } catch { this.voices = []; }
    this.voiceCache.clear();
  }

  // Best voice for `lang`: exact locale > same language > browser default > anything.
  // Within the language, prefer the higher-quality neural / online / Google voices.
  pickVoice(lang) {
    if (!this.voices.length) this.loadVoices();
    if (!this.voices.length) return null;
    const want = norm(lang);
    if (this.voiceCache.has(want)) return this.voiceCache.get(want);
    const base = want.split('-')[0];
    let best = null, bestScore = -1;
    for (const v of this.voices) {
      const l = norm(v.lang);
      let s = l === want ? 100 : l.split('-')[0] === base ? 60 : v.default ? 5 : 1;
      if (s >= 60) {
        const name = v.name || '';
        if (/natural|neural|online|premium|enhanced/i.test(name)) s += 20;
        else if (/google/i.test(name)) s += 12;
        if (v.default) s += 1;
      }
      if (s > bestScore) { bestScore = s; best = v; }
    }
    this.voiceCache.set(want, best);
    return best;
  }
}
