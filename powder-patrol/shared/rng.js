// Deterministic helpers shared by server and client so both build the exact same river.

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Value noise, cheap and good enough for low-poly terrain.
export function makeNoise2D(seed) {
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  const r = mulberry32(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) vals[i] = r() * 2 - 1;
  const fade = (t) => t * t * (3 - 2 * t);
  const v = (ix, iz) => vals[perm[(ix & 255) + perm[iz & 255]]];
  const noise = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const u = fade(fx), w = fade(fz);
    const a = v(ix, iz), b = v(ix + 1, iz), c = v(ix, iz + 1), d = v(ix + 1, iz + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), w);
  };
  noise.fbm = (x, z, oct = 4) => {
    let amp = 1, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += noise(x * f, z * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  };
  return noise;
}

export function dailySeedString(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}
