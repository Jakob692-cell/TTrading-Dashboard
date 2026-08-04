/**
 * Guardrails ("Ulysses contracts") and the drill catalogue.
 *
 * Guardrails are the closest this product gets to solving the psychology problem: the user
 * pre-commits, while calm, to a constraint the engine enforces later, while they are not.
 * They are deliberately enforced in the engine (account.js) rather than in the UI, so they
 * cannot be clicked away mid-session.
 */

export const DEFAULT_GUARDS = {
  maxTradesPerDay: null,     // number | null
  cooldownAfterLosses: null, // number | null
  cooldownMinutes: 15,
  sessionStartHour: null,    // UTC hour | null
  sessionEndHour: null,
  bound: false,              // when true the UI refuses to loosen them mid-run
};

export function normalizeGuards(g) {
  const out = { ...DEFAULT_GUARDS, ...(g || {}) };
  const n = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
  out.maxTradesPerDay = n(out.maxTradesPerDay);
  out.cooldownAfterLosses = n(out.cooldownAfterLosses);
  out.cooldownMinutes = n(out.cooldownMinutes) ?? 15;
  out.sessionStartHour = n(out.sessionStartHour);
  out.sessionEndHour = n(out.sessionEndHour);
  if (out.sessionStartHour === null || out.sessionEndHour === null) {
    out.sessionStartHour = null; out.sessionEndHour = null;
  }
  return out;
}

/**
 * Drills. Each one maps to a failure mode and applies a constraint on top of the ruleset,
 * so the drill IS the guardrail, practised deliberately.
 */
export const DRILLS = [
  {
    id: 'fixed-size',
    forMode: 'F1',
    name: 'Fixed size, no exceptions',
    goal: 'Complete 15 trades without a single size change.',
    why: 'Revenge sizing is the most common account-killer. Removing the size decision removes the failure.',
    guards: { maxTradesPerDay: 15 },
    lockSize: true,
    target: { type: 'trades', n: 15 },
    xp: 75,
  },
  {
    id: 'cooldown',
    forMode: 'F1b',
    name: 'The 15-minute wall',
    goal: 'Survive a session with a mandatory 15-minute cooldown after 2 losses.',
    why: 'The gap between a loss and the next entry is the cleanest measurable tell for tilt.',
    guards: { cooldownAfterLosses: 2, cooldownMinutes: 15 },
    target: { type: 'session', n: 1 },
    xp: 75,
  },
  {
    id: 'three-trade-cap',
    forMode: 'F3',
    name: 'Three trades. That is all.',
    goal: 'Finish a full trading day having taken no more than 3 trades.',
    why: 'Overtrading is usually a symptom of needing to feel busy. Scarcity forces selection.',
    guards: { maxTradesPerDay: 3 },
    target: { type: 'day', n: 1 },
    xp: 75,
  },
  {
    id: 'sit-out',
    forMode: 'F3',
    name: 'The sit-out',
    goal: 'Watch a full session and take zero trades. Log why you passed on three setups.',
    why: 'The hardest and most valuable skill in the entire discipline is not trading. ' +
         'This is the only drill here that most traders refuse to do.',
    guards: { maxTradesPerDay: 0 },
    target: { type: 'day', n: 1 },
    xp: 100,
  },
  {
    id: 'floor-math',
    forMode: 'F6',
    name: 'Read the floor',
    goal: 'Predict your drawdown floor correctly 10 times in a row before the engine reveals it.',
    why: 'If you cannot compute your floor in your head, you are trading on a number you do not know.',
    guards: {},
    hideFloor: true,
    target: { type: 'predictions', n: 10 },
    xp: 90,
  },
  {
    id: 'stop-honor',
    forMode: 'F1',
    name: 'Iron hands',
    goal: 'Ten consecutive trades where the stop is honoured and never widened.',
    why: 'A stop you move is not a stop. It is a wish.',
    guards: {},
    forceStop: true,
    target: { type: 'trades', n: 10 },
    xp: 80,
  },
  {
    id: 'session-lock',
    forMode: 'F7',
    name: 'Session lock',
    goal: 'Trade only inside your declared 3-hour window for a full run.',
    why: 'Availability is not a setup. Most scattered profiles are boredom, not opportunity.',
    guards: { sessionStartHour: 13, sessionEndHour: 16 },
    target: { type: 'session', n: 1 },
    xp: 70,
  },
  {
    id: 'throttle',
    forMode: 'F8',
    name: 'Profit throttle',
    goal: 'Reach the target with no single day above 30% of total profit.',
    why: 'Consistency rules are usually enforced at payout, when it is too late to fix.',
    guards: {},
    target: { type: 'consistency', n: 0.3 },
    xp: 110,
  },
  {
    id: 'finish-line',
    forMode: 'F2',
    name: 'Finish the run',
    goal: 'From 60% of target, reach 100% without reducing your trade rate.',
    why: 'Freezing near the target is prospect theory. A written finish rule beats willpower.',
    guards: {},
    target: { type: 'finish', n: 1 },
    xp: 100,
  },
  {
    id: 'streak-discipline',
    forMode: 'F10',
    name: 'Post-win discipline',
    goal: 'Complete a 3+ win streak without increasing size on the next trade.',
    why: 'Sizing up on a hot hand is the most expensive form of confidence.',
    guards: {},
    lockSize: true,
    target: { type: 'streak', n: 3 },
    xp: 85,
  },
  {
    id: 'news-blackout',
    forMode: 'F4',
    name: 'News blackout',
    goal: 'Trade a session containing two high-impact releases without entering a blocked window.',
    why: 'Firms often let the trade through and void the payout later instead of blocking it.',
    guards: {},
    newsOn: true,
    target: { type: 'session', n: 1 },
    xp: 70,
  },
  {
    id: 'time-pressure',
    forMode: 'F9',
    name: 'Clock discipline',
    goal: 'Finish the last 5 days of a timed run without your median size increasing.',
    why: 'Deadlines make the decision if you let them.',
    guards: {},
    lockSize: true,
    target: { type: 'days', n: 5 },
    xp: 95,
  },
];

export function drillsFor(findings) {
  const codes = new Set(findings.map((f) => f.code));
  const matched = DRILLS.filter((d) => codes.has(d.forMode));
  if (matched.length >= 3) return matched.slice(0, 3);
  const fallback = DRILLS.filter((d) => !matched.includes(d));
  return [...matched, ...fallback].slice(0, 3);
}

// ── progression ─────────────────────────────────────────────────────────────

export const LEVELS = [
  'Tourist', 'Rulebook', 'Survivor', 'Disciplined', 'Consistent', 'Risk Manager',
  'Challenge Ready', 'Verified', 'Funded', 'Sustained', 'Scaled', 'Professional',
];

export function levelFor(xp) {
  // Deliberately steep at level 7 — "Challenge Ready" has to be hard or the badge is worthless.
  const thresholds = [0, 150, 400, 800, 1400, 2200, 3200, 4600, 6500, 9000, 12500, 17000];
  let lvl = 0;
  for (let i = 0; i < thresholds.length; i++) if (xp >= thresholds[i]) lvl = i;
  return {
    level: lvl + 1,
    name: LEVELS[lvl],
    xp,
    into: xp - thresholds[lvl],
    need: (thresholds[lvl + 1] ?? thresholds[thresholds.length - 1]) - thresholds[lvl],
    max: lvl + 1 >= LEVELS.length,
  };
}

/**
 * XP is awarded for PROCESS, never for profit. This is the single most important
 * design rule in the gamification layer: rewarding P&L would train gambling.
 */
export function xpForRun(state, findings) {
  let xp = 0;
  const notes = [];
  const add = (n, why) => { xp += n; notes.push({ n, why }); };

  add(60, 'Completed a run');
  if (state.status === 'passed') add(120, 'Reached the target within the rules');
  if (!state.breach) add(90, 'No rule breach');

  const hasRevenge = findings.some((f) => f.code === 'F1' || f.code === 'F1b');
  if (!hasRevenge && state.trades.length >= 5) add(80, 'No revenge sizing detected');

  const cooldowns = state.timeline.filter((e) => e.type === 'cooldown_started').length;
  if (cooldowns) add(40 * cooldowns, 'Took a cooldown after losses');

  const guardStops = state.timeline.filter(
    (e) => e.type === 'order_rejected' && (e.code === 'GUARD_TRADE_CAP' || e.code === 'GUARD_COOLDOWN')
  ).length;
  if (guardStops) add(25 * Math.min(guardStops, 4), 'Your own guardrails held');

  const stops = state.trades.filter((t) => t.reason === 'stop').length;
  if (stops >= 3) add(50, 'Honoured your stops');

  return { xp, notes };
}
