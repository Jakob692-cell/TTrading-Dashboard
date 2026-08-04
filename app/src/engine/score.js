/**
 * Readiness Score.
 *
 * HONESTY CONTRACT — do not remove:
 * This score is computed entirely from SIMULATED runs. It has NOT been validated against
 * real prop firm challenge outcomes, because that requires outcome-labelled data we do not
 * have yet. The UI must therefore never render a sentence of the form "you have an X% chance
 * of passing". It shows the components and says what the score is built from. When (and only
 * when) real outcome data exists, `calibration` below gets replaced with fitted values and
 * the disclosure text changes with it.
 *
 * Five components, each 0-100, weighted. Chosen because each one maps to a failure mode that
 * has a drill attached — a score you cannot act on is just a number.
 */

import { computeMetrics } from './classify.js';

export const COMPONENTS = [
  { key: 'risk',        label: 'Risk discipline',  weight: 0.30, blurb: 'Size stability, and what you do after a loss.' },
  { key: 'compliance',  label: 'Rule compliance',  weight: 0.25, blurb: 'How close you run to the limits, and whether you breach.' },
  { key: 'emotional',   label: 'Emotional control',weight: 0.20, blurb: 'Re-entry speed, trade-count spikes, tilt signature.' },
  { key: 'consistency', label: 'Consistency',      weight: 0.15, blurb: 'Whether profit is spread across days or carried by one.' },
  { key: 'edge',        label: 'Edge quality',     weight: 0.10, blurb: 'Profit factor and stop discipline. Weighted least on purpose.' },
];

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/**
 * @param {object[]} runs  finished account states, oldest first
 */
export function readinessScore(runs) {
  // 'ended' = the trader stopped early or the session data ran out. Those runs still contain
  // real behaviour, so they are scored — they are just not penalised as breaches.
  const finished = runs.filter((r) => ['passed', 'failed', 'ended'].includes(r.status));
  if (!finished.length) {
    return {
      score: null, grade: null, components: null, runs: 0,
      disclosure: 'Not enough data. Complete a run to be scored.',
    };
  }

  // Recency-weighted: the last 5 runs describe you better than your first.
  const weights = finished.map((_, i) => Math.pow(1.35, i));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const avg = (fn) => finished.reduce((a, r, i) => a + fn(r) * weights[i], 0) / wsum;

  const risk = avg((r) => {
    const m = computeMetrics(r);
    let s = 100;
    s -= clamp((m.sizeAfterLossRatio - 1) * 90, 0, 45);   // revenge sizing
    s -= clamp((m.sizeDispersion - 1) * 18, 0, 30);        // erratic sizing
    if (m.stopHonorRate !== null) s -= clamp((1 - m.stopHonorRate) * 25, 0, 25);
    return clamp(s);
  });

  const compliance = avg((r) => {
    let s = 100;
    if (r.status === 'failed') s -= r.breach?.code === 'MAX_LOSS' ? 55 : 40;
    const rejects = r.timeline.filter((e) => e.type === 'order_rejected' && e.code !== 'GUARD_TRADE_CAP' && e.code !== 'GUARD_COOLDOWN').length;
    s -= clamp(rejects * 8, 0, 24);
    if (r.tradingDays.length < r.rs.minTradingDays && r.status === 'passed') s -= 10;
    return clamp(s);
  });

  const emotional = avg((r) => {
    const m = computeMetrics(r);
    let s = 100;
    if (m.medianReentryGapSec !== null) {
      if (m.medianReentryGapSec < 60) s -= 35;
      else if (m.medianReentryGapSec < 180) s -= 20;
      else if (m.medianReentryGapSec < 600) s -= 8;
    }
    const perDay = Object.values(groupCount(r.trades, (t) => t.dayKey));
    if (perDay.length) {
      const mx = Math.max(...perDay), md = med(perDay) || 1;
      s -= clamp((mx / md - 1) * 14, 0, 30);
    }
    s -= clamp((m.sizeAfterWinRatio - 1) * 40, 0, 20);
    return clamp(s);
  });

  const consistency = avg((r) => {
    const profit = r.balance - r.rs.accountSize;
    const days = Object.values(r.dayPnL);
    if (profit <= 0 || days.length < 2) return 55;
    const best = Math.max(...days);
    const share = best / profit;
    let s = clamp(115 - share * 130);
    if (r.rs.consistency && share > r.rs.consistency) s -= 20;
    return clamp(s);
  });

  const edge = avg((r) => {
    const m = computeMetrics(r);
    if (!m.trades) return 50;
    const pf = m.profitFactor === Infinity ? 3 : m.profitFactor;
    let s = clamp(30 + pf * 28);
    if (m.stopHonorRate !== null) s += clamp(m.stopHonorRate * 12, 0, 12);
    return clamp(s);
  });

  const components = { risk, compliance, emotional, consistency, edge };
  const score = Math.round(
    COMPONENTS.reduce((a, c) => a + components[c.key] * c.weight, 0)
  );

  return {
    score,
    grade: grade(score),
    components,
    runs: finished.length,
    weakest: COMPONENTS.slice().sort((a, b) => components[a.key] - components[b.key])[0],
    disclosure:
      `Based on ${finished.length} simulated run${finished.length > 1 ? 's' : ''}. ` +
      `This measures your behaviour in this simulator. It is not calibrated against ` +
      `real challenge outcomes, and it does not predict what will happen at any firm.`,
    calibration: null, // becomes a fitted mapping only when real outcome labels exist
  };
}

export function grade(score) {
  if (score === null) return null;
  if (score >= 85) return 'A';
  if (score >= 75) return 'B';
  if (score >= 62) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

/**
 * The policy from the report that costs nothing and differentiates everything:
 * below 40, the product tells you NOT to buy a challenge yet.
 */
/** Minimum scored runs before the product is willing to say "you're ready". */
export const MIN_RUNS_FOR_READY = 3;

export function recommendation(score, runs = Infinity) {
  if (score === null) return { level: 'unknown', text: 'Run a challenge to get a recommendation.' };
  // A high score off one or two runs is noise, not evidence. Telling someone to go spend
  // $500 on that basis is the exact behaviour this product exists to argue against.
  if (score >= 62 && runs < MIN_RUNS_FOR_READY) return {
    level: 'wait',
    text: `Promising, but this is only ${runs} scored run${runs === 1 ? '' : 's'}. ` +
          `A score means nothing until it is stable — complete at least ${MIN_RUNS_FOR_READY} ` +
          `before treating it as a signal about anything.`,
  };
  if (score < 40) return {
    level: 'stop',
    text: 'Do not buy a challenge yet. At this level the money is very likely to be lost on ' +
          'behaviour you can fix for free. Work the prescribed drills first.',
  };
  if (score < 62) return {
    level: 'wait',
    text: 'Not yet. Your rule knowledge is getting there but your risk behaviour is still ' +
          'unstable. Two more clean runs before you spend anything.',
  };
  if (score < 75) return {
    level: 'close',
    text: 'Close. Clear your weakest component and run three consecutive clean challenges.',
  };
  if (score < 85) return {
    level: 'ready',
    text: 'Challenge Ready. Your behaviour in the simulator is consistent with the rules you ' +
          'would be trading under. Start with the smallest account size you can.',
  };
  return {
    level: 'ready',
    text: 'Challenge Ready, top band. Keep the guardrails switched on when you go live — ' +
          'they matter more with real money, not less.',
  };
}

const med = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const groupCount = (arr, fn) => arr.reduce((a, x) => { const k = fn(x); a[k] = (a[k] || 0) + 1; return a; }, {});
