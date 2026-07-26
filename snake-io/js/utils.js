/* ============================================================================
 *  utils.js
 *  Mathematik-Helfer, Spatial-Hashing, Objekt-Pooling und Namensgenerator.
 *  Alle Module haengen am globalen Namespace `SNK`.
 * ==========================================================================*/
(function (global) {
  'use strict';

  /** Globaler Namespace des Spiels. */
  const SNK = global.SNK || (global.SNK = {});

  const TAU = Math.PI * 2;

  /* --------------------------------------------------------------------------
   * Utils – kleine, allokationsfreie Helfer fuer die Hot-Loops.
   * ------------------------------------------------------------------------*/
  const Utils = {
    TAU: TAU,

    clamp(v, min, max) { return v < min ? min : (v > max ? max : v); },

    lerp(a, b, t) { return a + (b - a) * t; },

    /**
     * Framerate-unabhaengiges exponentielles Glaetten.
     * Ergebnis naehert sich `b` mit der Rate `lambda` pro Sekunde.
     */
    damp(a, b, lambda, dt) { return b + (a - b) * Math.exp(-lambda * dt); },

    rand(min, max) { return min + Math.random() * (max - min); },

    randInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); },

    pick(arr) { return arr[(Math.random() * arr.length) | 0]; },

    /** Winkel auf das Intervall (-PI, PI] normieren. */
    normAngle(a) {
      a %= TAU;
      if (a > Math.PI) a -= TAU;
      else if (a <= -Math.PI) a += TAU;
      return a;
    },

    /** Kuerzeste Winkeldifferenz von `from` nach `to`. */
    angleDiff(from, to) { return Utils.normAngle(to - from); },

    /** Winkel `cur` maximal um `maxStep` in Richtung `target` drehen. */
    approachAngle(cur, target, maxStep) {
      const d = Utils.normAngle(target - cur);
      if (d > maxStep) return Utils.normAngle(cur + maxStep);
      if (d < -maxStep) return Utils.normAngle(cur - maxStep);
      return target;
    },

    /** "1.234" bzw. "12.4K" – kurze, lesbare Zahlen fuer das HUD. */
    formatNum(n) {
      n = Math.floor(n);
      if (n < 10000) return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      if (n < 1000000) return (n / 1000).toFixed(1).replace('.', ',') + 'K';
      return (n / 1000000).toFixed(2).replace('.', ',') + 'M';
    },

    /** Sekunden -> "m:ss". */
    formatTime(sec) {
      sec = Math.max(0, sec);
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
    },

    /** #rrggbb / #rgb -> {r,g,b} (mit Cache, da im Renderer verwendet). */
    hexToRgb(hex) {
      let c = _rgbCache[hex];
      if (c) return c;
      let h = hex.trim();
      if (h[0] === '#') h = h.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const v = parseInt(h, 16);
      c = { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
      _rgbCache[hex] = c;
      return c;
    },

    /** "rgba(...)"-String aus Hexfarbe + Alpha (gecacht). */
    rgba(hex, alpha) {
      const key = hex + '|' + alpha;
      let s = _rgbaCache[key];
      if (s) return s;
      const c = Utils.hexToRgb(hex);
      s = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
      _rgbaCache[key] = s;
      return s;
    },

    /** Farbe abdunkeln (0 = schwarz, 1 = unveraendert). */
    shade(hex, f) {
      const key = hex + '#' + f;
      let s = _shadeCache[key];
      if (s) return s;
      const c = Utils.hexToRgb(hex);
      const r = Utils.clamp(Math.round(c.r * f), 0, 255);
      const g = Utils.clamp(Math.round(c.g * f), 0, 255);
      const b = Utils.clamp(Math.round(c.b * f), 0, 255);
      s = 'rgb(' + r + ',' + g + ',' + b + ')';
      _shadeCache[key] = s;
      return s;
    },

    /** Farbe in Richtung Weiss aufhellen. */
    tint(hex, f) {
      const key = hex + '+' + f;
      let s = _shadeCache[key];
      if (s) return s;
      const c = Utils.hexToRgb(hex);
      const r = Math.round(c.r + (255 - c.r) * f);
      const g = Math.round(c.g + (255 - c.g) * f);
      const b = Math.round(c.b + (255 - c.b) * f);
      s = 'rgb(' + r + ',' + g + ',' + b + ')';
      _shadeCache[key] = s;
      return s;
    },

    /** Erkennung von Touch-Geraeten (fuer Joystick/Standardqualitaet). */
    isTouchDevice() {
      return ('ontouchstart' in global) ||
        (global.navigator && global.navigator.maxTouchPoints > 0);
    }
  };

  const _rgbCache = Object.create(null);
  const _rgbaCache = Object.create(null);
  const _shadeCache = Object.create(null);

  /* --------------------------------------------------------------------------
   * SpatialHash – wird pro Simulationsschritt neu aufgebaut.
   * Wird fuer Schlangen-Koerpersegmente benutzt (Kollision + KI-Sensorik).
   * Buckets werden recycelt, damit der GC nichts zu tun hat.
   * ------------------------------------------------------------------------*/
  class SpatialHash {
    constructor(cellSize) {
      this.cellSize = cellSize;
      this.inv = 1 / cellSize;
      this.buckets = new Map();
      this._used = [];
    }

    _key(cx, cy) { return (cx + 4096) * 16384 + (cy + 4096); }

    clear() {
      const used = this._used;
      for (let i = 0; i < used.length; i++) used[i].length = 0;
      used.length = 0;
    }

    insert(x, y, item) {
      const k = this._key(Math.floor(x * this.inv), Math.floor(y * this.inv));
      let b = this.buckets.get(k);
      if (b === undefined) { b = []; this.buckets.set(k, b); }
      if (b.length === 0) this._used.push(b);
      b.push(item);
    }

    /** Alle Items in den Zellen rund um den Kreis (x,y,r) in `out` sammeln. */
    query(x, y, r, out) {
      out.length = 0;
      const inv = this.inv;
      const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv);
      const y0 = Math.floor((y - r) * inv), y1 = Math.floor((y + r) * inv);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const b = this.buckets.get(this._key(cx, cy));
          if (b !== undefined) {
            for (let i = 0; i < b.length; i++) out.push(b[i]);
          }
        }
      }
      return out;
    }

    /** Zaehlt Items im Umkreis, ohne Array-Aufbau (fuer KI-Sonden). */
    countNear(x, y, r, exclude) {
      const inv = this.inv, r2 = r * r;
      const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv);
      const y0 = Math.floor((y - r) * inv), y1 = Math.floor((y + r) * inv);
      let n = 0;
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const b = this.buckets.get(this._key(cx, cy));
          if (b === undefined) continue;
          for (let i = 0; i < b.length; i++) {
            const it = b[i];
            if (it.sn === exclude) continue;
            const dx = it.x - x, dy = it.y - y;
            if (dx * dx + dy * dy < r2) n++;
          }
        }
      }
      return n;
    }
  }

  /* --------------------------------------------------------------------------
   * IndexedHash – persistentes Gitter mit add()/remove(), fuer Nahrung.
   * Jedes Item merkt sich seinen Bucket-Key.
   * ------------------------------------------------------------------------*/
  class IndexedHash {
    constructor(cellSize) {
      this.cellSize = cellSize;
      this.inv = 1 / cellSize;
      this.buckets = new Map();
      this.count = 0;
    }

    _key(cx, cy) { return (cx + 4096) * 16384 + (cy + 4096); }

    add(item) {
      const k = this._key(Math.floor(item.x * this.inv), Math.floor(item.y * this.inv));
      let b = this.buckets.get(k);
      if (b === undefined) { b = []; this.buckets.set(k, b); }
      b.push(item);
      item._hk = k;
      this.count++;
    }

    remove(item) {
      const b = this.buckets.get(item._hk);
      if (b === undefined) return;
      const i = b.indexOf(item);
      if (i < 0) return;
      b[i] = b[b.length - 1];
      b.pop();
      item._hk = -1;
      this.count--;
    }

    /** Nach einer Positionsaenderung neu einsortieren (nur bei Zellwechsel). */
    update(item) {
      const k = this._key(Math.floor(item.x * this.inv), Math.floor(item.y * this.inv));
      if (k === item._hk) return;
      const b = this.buckets.get(item._hk);
      if (b !== undefined) {
        const i = b.indexOf(item);
        if (i >= 0) { b[i] = b[b.length - 1]; b.pop(); }
      }
      let nb = this.buckets.get(k);
      if (nb === undefined) { nb = []; this.buckets.set(k, nb); }
      nb.push(item);
      item._hk = k;
    }

    clear() { this.buckets.clear(); this.count = 0; }

    query(x, y, r, out) {
      out.length = 0;
      const inv = this.inv;
      const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv);
      const y0 = Math.floor((y - r) * inv), y1 = Math.floor((y + r) * inv);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const b = this.buckets.get(this._key(cx, cy));
          if (b !== undefined) {
            for (let i = 0; i < b.length; i++) out.push(b[i]);
          }
        }
      }
      return out;
    }

    /** Rechteck-Abfrage (Renderer: nur sichtbare Nahrung zeichnen). */
    queryRect(x0, y0, x1, y1, out) {
      out.length = 0;
      const inv = this.inv;
      const cx0 = Math.floor(x0 * inv), cx1 = Math.floor(x1 * inv);
      const cy0 = Math.floor(y0 * inv), cy1 = Math.floor(y1 * inv);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          const b = this.buckets.get(this._key(cx, cy));
          if (b !== undefined) {
            for (let i = 0; i < b.length; i++) out.push(b[i]);
          }
        }
      }
      return out;
    }
  }

  /* --------------------------------------------------------------------------
   * Pool – generisches Objekt-Pooling.
   * ------------------------------------------------------------------------*/
  class Pool {
    constructor(create, reset, initial) {
      this._create = create;
      this._reset = reset || null;
      this._free = [];
      for (let i = 0; i < (initial || 0); i++) this._free.push(create());
    }
    obtain() {
      return this._free.length > 0 ? this._free.pop() : this._create();
    }
    release(o) {
      if (this._reset) this._reset(o);
      this._free.push(o);
    }
    get free() { return this._free.length; }
  }

  /* --------------------------------------------------------------------------
   * Namensgenerator fuer die KI-Schlangen.
   * ------------------------------------------------------------------------*/
  const NAME_CORE = [
    'Vortex', 'Nebula', 'Zephyr', 'Kilo', 'Onyx', 'Rasp', 'Quasar', 'Pixel',
    'Cobra', 'Mamba', 'Viper', 'Python', 'Adder', 'Krait', 'Boa', 'Sidewinder',
    'Hydra', 'Kraken', 'Phantom', 'Specter', 'Wraith', 'Blitz', 'Havoc', 'Rogue',
    'Comet', 'Pulsar', 'Photon', 'Quantum', 'Vertex', 'Helix', 'Prism', 'Flux',
    'Echo', 'Delta', 'Sigma', 'Omega', 'Zenith', 'Apex', 'Nova', 'Solaris',
    'Frost', 'Ember', 'Ashen', 'Cinder', 'Glacier', 'Tundra', 'Magma', 'Obsid',
    'Neon', 'Chrome', 'Cyber', 'Vaporr', 'Glitch', 'Static', 'Byte', 'Nibble',
    'Wasabi', 'Mochi', 'Ramen', 'Sushi', 'Bubble', 'Noodle', 'Wiggle', 'Squirm',
    'Turbo', 'Nitro', 'Boost', 'Drift', 'Slide', 'Coil', 'Loop', 'Twist',
    'Luna', 'Sol', 'Astra', 'Orion', 'Lyra', 'Vega', 'Rigel', 'Altair',
    'Karma', 'Zen', 'Kaido', 'Ronin', 'Shogun', 'Ninja', 'Samurai', 'Kaiju',
    'Grim', 'Void', 'Abyss', 'Umbra', 'Eclipse', 'Solstice', 'Aurora', 'Mirage'
  ];
  const NAME_TAG = [
    '', '', '', '', '_X', 'XD', '99', '_pro', 'ito', 'zz', '_TV', '007',
    'ling', 'ito', '_YT', 'ex', 'or', 'iq', '_1', '2k', 'us', 'ia'
  ];

  Utils.randomName = function () {
    let n = Utils.pick(NAME_CORE) + Utils.pick(NAME_TAG);
    if (Math.random() < 0.12) n = n.toUpperCase();
    return n;
  };

  /** Namen fuer die Anzeige entschaerfen (kein HTML, begrenzte Laenge). */
  Utils.sanitizeName = function (raw, fallback) {
    let s = String(raw == null ? '' : raw)
      .replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (s.length > 14) s = s.slice(0, 14);
    if (!s) s = fallback || 'Spieler';
    return s;
  };

  SNK.Utils = Utils;
  SNK.SpatialHash = SpatialHash;
  SNK.IndexedHash = IndexedHash;
  SNK.Pool = Pool;

})(typeof window !== 'undefined' ? window : this);
