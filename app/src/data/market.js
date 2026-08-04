/**
 * Market data.
 *
 * V1 ships a DETERMINISTIC SYNTHETIC generator, not real exchange data. This is a
 * deliberate decision, not a shortcut, for three reasons:
 *
 *  1. LEGAL. Redistributing exchange data to end users requires a distribution licence
 *     (CME charges per-subscriber and differentiates professional/non-professional; the
 *     cheap vendor tiers explicitly exclude external distribution). Shipping V1 on
 *     synthetic data means no licensing exposure while the product is being validated.
 *  2. INTEGRITY. Ranked seasons require every entrant to face the identical sequence.
 *     A seeded generator gives that for free and cannot leak.
 *  3. HONESTY. The UI labels every session SYNTHETIC. We never imply this is real market
 *     data, and we never imply a simulated result is a live one.
 *
 * The interface below (`loadSession`) is the seam. Swapping in a licensed historical feed
 * later means implementing the same shape and changing the provider id — nothing above
 * this file knows the difference.
 */

export const PROVIDER = 'synthetic-v1';

export const INSTRUMENTS = {
  MES: { symbol: 'MES', name: 'Micro E-mini S&P 500', pointValue: 5,   tickSize: 0.25, start: 5400, vol: 0.0055, assetClass: 'futures', digits: 2 },
  MNQ: { symbol: 'MNQ', name: 'Micro E-mini Nasdaq',  pointValue: 2,   tickSize: 0.25, start: 19000, vol: 0.0080, assetClass: 'futures', digits: 2 },
  MGC: { symbol: 'MGC', name: 'Micro Gold',           pointValue: 10,  tickSize: 0.10, start: 2380, vol: 0.0045, assetClass: 'futures', digits: 1 },
  EURUSD: { symbol: 'EURUSD', name: 'EUR/USD', pointValue: 100000, tickSize: 0.00001, start: 1.0850, vol: 0.0022, assetClass: 'fx', digits: 5 },
  GBPUSD: { symbol: 'GBPUSD', name: 'GBP/USD', pointValue: 100000, tickSize: 0.00001, start: 1.2650, vol: 0.0028, assetClass: 'fx', digits: 5 },
  XAUUSD: { symbol: 'XAUUSD', name: 'Gold spot', pointValue: 100, tickSize: 0.01, start: 2380, vol: 0.0048, assetClass: 'fx', digits: 2 },
};

export function instrumentsFor(assetClass) {
  return Object.values(INSTRUMENTS).filter((i) => i.assetClass === assetClass);
}

/** mulberry32 — small, fast, and identical across every JS engine. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller, driven by the seeded rng so the whole series stays reproducible. */
function gauss(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Generate a multi-day session of 1-minute bars.
 *
 * Structure is deliberately not a plain random walk — a plain walk is trivially unlike a
 * market and traders notice immediately. This produces:
 *   - an intraday volatility smile (open and close hotter than midday)
 *   - regime switching between trend and chop, with persistence
 *   - occasional gaps at the session open
 *   - scheduled high-impact events with a volatility burst, used by the news rule
 *
 * @param {object} opts
 * @param {string} opts.symbol
 * @param {number} opts.days
 * @param {string|number} opts.seed
 * @param {number} [opts.barsPerDay]  minutes of session per day
 * @param {number} [opts.startTs]     epoch ms of the first bar
 */
export function loadSession({ symbol, days = 10, seed = 'default', barsPerDay = 390, startTs = Date.UTC(2026, 0, 5, 13, 30) }) {
  const inst = INSTRUMENTS[symbol];
  if (!inst) throw new Error(`Unknown instrument ${symbol}`);
  const rand = rng(typeof seed === 'number' ? seed : hashSeed(String(seed) + symbol + days));

  const bars = [];
  const news = [];
  let price = inst.start;
  let regime = 0;          // -1 down-trend, 0 chop, +1 up-trend
  let regimeLeft = 0;
  const minuteVol = inst.vol / Math.sqrt(barsPerDay);

  for (let d = 0; d < days; d++) {
    const dayStart = startTs + d * 86400_000;

    // Weekend skip keeps day-roll semantics realistic.
    const dow = new Date(dayStart).getUTCDay();
    if (dow === 0 || dow === 6) { days++; continue; }

    // Overnight gap.
    price *= 1 + gauss(rand) * inst.vol * 0.35;

    // Two scheduled events per run, on fixed days, so the news drill is reproducible.
    const eventMinute = d % 3 === 1 ? Math.floor(barsPerDay * 0.12) : null;
    if (eventMinute !== null) {
      news.push({ t: dayStart + eventMinute * 60_000, name: 'High-impact release', impact: 'high' });
    }

    for (let m = 0; m < barsPerDay; m++) {
      const t = dayStart + m * 60_000;

      if (regimeLeft <= 0) {
        const r = rand();
        regime = r < 0.36 ? 1 : r < 0.72 ? -1 : 0;
        regimeLeft = 25 + Math.floor(rand() * 110);
      }
      regimeLeft--;

      // Volatility smile: hot open, quiet lunch, firm close.
      const prog = m / barsPerDay;
      const smile = 1.55 * Math.exp(-Math.pow(prog / 0.16, 2))
                  + 0.85
                  + 0.75 * Math.exp(-Math.pow((prog - 1) / 0.13, 2));

      // News burst.
      let burst = 1;
      if (eventMinute !== null) {
        const dist = Math.abs(m - eventMinute);
        if (dist < 14) burst = 1 + 3.4 * Math.exp(-dist / 4);
      }

      const drift = regime * minuteVol * 0.16;
      const sigma = minuteVol * smile * burst;
      const ret = drift + gauss(rand) * sigma;

      const o = price;
      const c = o * (1 + ret);
      const wick = Math.abs(gauss(rand)) * sigma * o * 0.85;
      const h = Math.max(o, c) + wick * rand();
      const l = Math.min(o, c) - wick * rand();
      price = c;

      bars.push({
        t,
        o: round(o, inst.digits),
        h: round(h, inst.digits),
        l: round(l, inst.digits),
        c: round(c, inst.digits),
        v: Math.round(400 + rand() * 2600 * smile * burst),
      });
    }
  }

  return {
    provider: PROVIDER,
    synthetic: true,
    symbol,
    instrument: inst,
    seed: String(seed),
    barsPerDay,
    bars,
    news,
  };
}

function round(v, digits) {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

/** Aggregate 1-minute bars up to a higher timeframe. Pure, no lookahead. */
export function resample(bars, minutes) {
  if (minutes <= 1) return bars;
  const out = [];
  let bucket = null;
  for (const b of bars) {
    const key = Math.floor(b.t / (minutes * 60_000));
    if (!bucket || bucket.key !== key) {
      if (bucket) out.push(bucket.bar);
      bucket = { key, bar: { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v } };
    } else {
      const x = bucket.bar;
      x.h = Math.max(x.h, b.h);
      x.l = Math.min(x.l, b.l);
      x.c = b.c;
      x.v += b.v;
    }
  }
  if (bucket) out.push(bucket.bar);
  return out;
}

/** Is `t` inside a restricted window around any scheduled event? */
export function inNewsWindow(session, t, windowMin) {
  const w = windowMin * 60_000;
  return session.news.some((n) => Math.abs(t - n.t) <= w);
}
