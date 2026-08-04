/**
 * The rule engine.
 *
 * Design contract (do not break these — the whole product's credibility rests on them):
 *
 *  1. DETERMINISTIC. Same ruleset + same bar sequence + same orders => same result, forever.
 *     No Date.now(), no Math.random(), no floating-point accumulation across ticks.
 *  2. EVENT SOURCED. Every state change appends to `timeline`. The autopsy, the evidence
 *     export and the failure classifier all read the timeline, never a mutated summary.
 *  3. PURE-ISH. Actions take a state and return a NEW state. Callers never mutate.
 *  4. NO LOOKAHEAD. Within a bar we only ever use OHLC in a fixed, conservative order.
 *
 * Conservative intra-bar assumption: if a bar's range touches both the stop and the target
 * of an open position, the STOP is assumed to fill first. This is the pessimistic choice and
 * it is the honest one — the alternative flatters the trader and would corrupt the score.
 */

/** @typedef {import('./rulesets.js').RuleSet} RuleSet */

export const BREACH = {
  DAILY_LOSS: 'DAILY_LOSS',
  MAX_LOSS: 'MAX_LOSS',
  TIME_LIMIT: 'TIME_LIMIT',
};

export const REJECT = {
  MAX_POSITION: 'MAX_POSITION',
  NEWS_WINDOW: 'NEWS_WINDOW',
  NOT_ACTIVE: 'NOT_ACTIVE',
  GUARD_TRADE_CAP: 'GUARD_TRADE_CAP',
  GUARD_COOLDOWN: 'GUARD_COOLDOWN',
  GUARD_SESSION: 'GUARD_SESSION',
  NO_POSITION: 'NO_POSITION',
};

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {RuleSet} rs
 * @param {object} instrument  {symbol, pointValue, tickSize}
 * @param {object} [guards]    user-set Ulysses contract, see guards.js
 */
export function createAccount(rs, instrument, guards = null) {
  const floor = initialFloor(rs);
  return Object.freeze({
    rs,
    instrument,
    guards,
    startedAt: null,
    ts: null,
    dayKey: null,
    dayIndex: 0,

    balance: rs.accountSize,
    equity: rs.accountSize,
    peakEquity: rs.accountSize,
    peakEodBalance: rs.accountSize,

    floor,
    floorLocked: false,
    dayStartBalance: rs.accountSize,
    dailyFloor: rs.dailyLoss ? rs.accountSize - rs.dailyLoss : null,

    position: null,
    pending: [],
    trades: [],
    dayPnL: {},
    tradingDays: [],
    tradesToday: 0,
    cooldownUntil: null,

    status: 'active',
    breach: null,
    passedAt: null,
    warnings: [],
    timeline: [],
  });
}

function initialFloor(rs) {
  // All four methodologies start at the same place; they differ in how the floor MOVES.
  return rs.accountSize - rs.maxLoss;
}

// ── internal helpers ────────────────────────────────────────────────────────

function log(state, type, payload) {
  return { ...state, timeline: [...state.timeline, { t: state.ts, type, ...payload }] };
}

function unrealized(position, price, pointValue) {
  if (!position) return 0;
  const dir = position.side === 'long' ? 1 : -1;
  return round2((price - position.entryPrice) * dir * position.size * pointValue);
}

function dayKeyOf(ts, resetHour) {
  // Roll the calendar day at the ruleset's reset hour, so a 17:00 CME roll puts
  // Monday 18:00 into Tuesday's trading day — the single most common source of
  // "why did my daily loss reset then?" confusion.
  const d = new Date(ts);
  const shifted = new Date(ts - resetHour * 3600_000);
  void d;
  return shifted.toISOString().slice(0, 10);
}

/**
 * Recompute derived values and evaluate every rule. This is the single place a breach
 * can be declared, which is what makes the engine auditable.
 */
function evaluate(state, price) {
  const { rs } = state;
  if (state.status !== 'active') return state;

  let s = state;
  const upl = unrealized(s.position, price, s.instrument.pointValue);
  const equity = round2(s.balance + upl);
  s = { ...s, equity };

  // ── floor movement ────────────────────────────────────────────────────────
  let floor = s.floor;
  let floorLocked = s.floorLocked;
  let peakEquity = Math.max(s.peakEquity, rs.equityBasedBreach ? equity : s.balance);

  if (!floorLocked) {
    if (rs.maxLossType === 'trailing_intraday' || rs.maxLossType === 'trailing_to_static') {
      floor = Math.max(floor, round2(peakEquity - rs.maxLoss));
    }
    // trailing_eod moves only in rollDay(); static never moves.

    const lockTarget = rs.trailingLockAt === null ? null : rs.accountSize + rs.trailingLockAt;
    if (lockTarget !== null && floor >= lockTarget) {
      floor = lockTarget;
      floorLocked = true;
      s = log(s, 'floor_locked', { floor });
    }
  }
  s = { ...s, floor, floorLocked, peakEquity };

  // ── breach checks (order matters: daily is the tighter, more common one) ──
  const measured = rs.equityBasedBreach ? equity : s.balance;

  if (s.dailyFloor !== null && measured <= s.dailyFloor) {
    return fail(s, BREACH.DAILY_LOSS, {
      measured,
      limit: s.dailyFloor,
      detail: `Equity ${fmt(measured)} hit the daily floor of ${fmt(s.dailyFloor)}.`,
    }, price);
  }

  if (measured <= s.floor) {
    return fail(s, BREACH.MAX_LOSS, {
      measured,
      limit: s.floor,
      detail: `Equity ${fmt(measured)} hit the max-loss floor of ${fmt(s.floor)}.`,
    }, price);
  }

  if (rs.maxTradingDays !== null && s.dayIndex > rs.maxTradingDays) {
    return fail(s, BREACH.TIME_LIMIT, {
      measured: s.dayIndex,
      limit: rs.maxTradingDays,
      detail: `Ran out of time on day ${s.dayIndex} of ${rs.maxTradingDays}.`,
    }, price);
  }

  // ── pass check ────────────────────────────────────────────────────────────
  // Deliberately measured on BALANCE, not equity: an open winner is not a pass.
  const profit = round2(s.balance - rs.accountSize);
  if (profit >= rs.profitTarget && s.tradingDays.length >= rs.minTradingDays) {
    if (!consistencyOk(s)) {
      // Not a breach — a blocked pass. The trader keeps trading to dilute their best day.
      if (!s.warnings.some((w) => w.code === 'CONSISTENCY_BLOCK')) {
        s = log(s, 'consistency_block', { best: bestDay(s), profit });
        s = {
          ...s,
          warnings: [...s.warnings, {
            code: 'CONSISTENCY_BLOCK',
            msg: `Target reached, but your best day is ${(bestDay(s) / profit * 100).toFixed(0)}% ` +
                 `of total profit. The limit is ${rs.consistency * 100}%. Keep trading to dilute it.`,
          }],
        };
      }
      return s;
    }
    s = log(s, 'passed', { profit, days: s.tradingDays.length });
    return { ...s, status: 'passed', passedAt: s.ts };
  }

  return withWarnings(s, measured);
}

function consistencyOk(s) {
  if (!s.rs.consistency) return true;
  const profit = s.balance - s.rs.accountSize;
  if (profit <= 0) return true;
  return bestDay(s) / profit <= s.rs.consistency + 1e-9;
}

function bestDay(s) {
  const vals = Object.values(s.dayPnL);
  return vals.length ? Math.max(...vals) : 0;
}

function withWarnings(s, measured) {
  const warnings = [];
  const dailyRoom = s.dailyFloor === null ? Infinity : measured - s.dailyFloor;
  const maxRoom = measured - s.floor;

  if (s.dailyFloor !== null && dailyRoom <= s.rs.dailyLoss * 0.3) {
    warnings.push({ code: 'DAILY_NEAR', msg: `${fmt(dailyRoom)} from your daily limit.`, sev: dailyRoom <= s.rs.dailyLoss * 0.15 ? 2 : 1 });
  }
  if (maxRoom <= s.rs.maxLoss * 0.3) {
    warnings.push({ code: 'MAXLOSS_NEAR', msg: `${fmt(maxRoom)} from your max-loss floor.`, sev: maxRoom <= s.rs.maxLoss * 0.15 ? 2 : 1 });
  }
  const keep = s.warnings.filter((w) => w.code === 'CONSISTENCY_BLOCK');
  return { ...s, warnings: [...keep, ...warnings] };
}

function fail(state, code, info, price) {
  let s = state;
  if (s.position) s = closeAt(s, price, 'liquidated').state;
  s = log(s, 'breach', { code, ...info });
  return {
    ...s,
    status: 'failed',
    breach: { code, at: s.ts, ...info },
    position: null,
    pending: [],
  };
}

const fmt = (n) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

// ── public actions ──────────────────────────────────────────────────────────

/** Advance the clock by one bar. This is the only function that moves time. */
export function applyBar(state, bar) {
  if (state.status !== 'active') return state;
  let s = { ...state, ts: bar.t };
  if (s.startedAt === null) s = { ...s, startedAt: bar.t, dayIndex: 1 };

  const key = dayKeyOf(bar.t, s.rs.dailyResetHour);
  if (s.dayKey === null) {
    s = { ...s, dayKey: key, dayStartBalance: s.balance };
  } else if (key !== s.dayKey) {
    s = rollDay(s, key);
    if (s.status !== 'active') return s;
  }

  // 1. resting entry orders, checked against the bar's range
  s = fillPending(s, bar);
  // 2. protective orders on the open position
  s = checkProtective(s, bar);
  // 3. mark to the close and evaluate every rule
  return evaluate(s, bar.c);
}

function rollDay(s, newKey) {
  let next = s;

  if (next.rs.maxLossType === 'trailing_eod' && !next.floorLocked) {
    const peak = Math.max(next.peakEodBalance, next.balance);
    let floor = Math.max(next.floor, round2(peak - next.rs.maxLoss));
    let locked = false;
    const lockTarget = next.rs.trailingLockAt === null ? null : next.rs.accountSize + next.rs.trailingLockAt;
    if (lockTarget !== null && floor >= lockTarget) { floor = lockTarget; locked = true; }
    next = { ...next, peakEodBalance: peak, floor, floorLocked: locked };
    next = log(next, 'eod_floor_move', { floor });
  }

  next = {
    ...next,
    dayKey: newKey,
    dayIndex: next.dayIndex + 1,
    dayStartBalance: next.balance,
    dailyFloor: next.rs.dailyLoss ? round2(next.balance - next.rs.dailyLoss) : null,
    tradesToday: 0,
    cooldownUntil: null,
  };
  next = log(next, 'day_roll', { day: next.dayIndex, dailyFloor: next.dailyFloor });

  if (next.rs.maxTradingDays !== null && next.dayIndex > next.rs.maxTradingDays) {
    return fail(next, BREACH.TIME_LIMIT, {
      measured: next.dayIndex,
      limit: next.rs.maxTradingDays,
      detail: `Ran out of time. Day ${next.dayIndex} of ${next.rs.maxTradingDays}.`,
    }, next.position ? next.position.entryPrice : 0);
  }
  return next;
}

/**
 * Submit an order. Returns {state, rejected}. Rejections are logged too — a blocked
 * revenge trade is one of the most informative events in the whole timeline.
 */
export function submitOrder(state, order, bar, ctx = {}) {
  let s = state;
  if (s.status !== 'active') return { state: s, rejected: REJECT.NOT_ACTIVE };

  const reject = (code, msg) => {
    const next = log({ ...s }, 'order_rejected', { code, msg, order });
    return { state: next, rejected: code, message: msg };
  };

  // Guardrails first — these are the user's own pre-committed constraints.
  const g = s.guards;
  if (g) {
    if (g.maxTradesPerDay && s.tradesToday >= g.maxTradesPerDay) {
      return reject(REJECT.GUARD_TRADE_CAP, `Your own limit: ${g.maxTradesPerDay} trades per day. You are done for today.`);
    }
    if (s.cooldownUntil && bar.t < s.cooldownUntil) {
      const mins = Math.ceil((s.cooldownUntil - bar.t) / 60000);
      return reject(REJECT.GUARD_COOLDOWN, `Cooldown active for another ${mins} min. You set this.`);
    }
    if (g.sessionStartHour !== null && g.sessionEndHour !== null) {
      const h = new Date(bar.t).getUTCHours();
      if (h < g.sessionStartHour || h >= g.sessionEndHour) {
        return reject(REJECT.GUARD_SESSION, `Outside your declared session (${g.sessionStartHour}:00-${g.sessionEndHour}:00 UTC).`);
      }
    }
  }

  if (s.rs.newsRestricted && ctx.inNewsWindow) {
    return reject(REJECT.NEWS_WINDOW, `High-impact news window. Entries blocked +/-${s.rs.newsWindowMin} min.`);
  }

  const currentSize = s.position ? s.position.size : 0;
  const sameSide = s.position && s.position.side === order.side;
  const resulting = sameSide || !s.position ? currentSize + order.size : Math.abs(currentSize - order.size);
  if (resulting > s.rs.maxContracts) {
    return reject(REJECT.MAX_POSITION, `Max position is ${s.rs.maxContracts} contracts. That order would make ${resulting}.`);
  }

  if (order.type === 'market') {
    s = log(s, 'order_submitted', { order });
    return { state: fillEntry(s, order, bar.c, bar.t), rejected: null };
  }
  s = log(s, 'order_submitted', { order });
  return { state: { ...s, pending: [...s.pending, { ...order, id: s.timeline.length }] }, rejected: null };
}

function fillPending(s, bar) {
  if (!s.pending.length) return s;
  let next = s;
  const remaining = [];
  for (const o of next.pending) {
    const hit =
      (o.type === 'limit' && (o.side === 'long' ? bar.l <= o.price : bar.h >= o.price)) ||
      (o.type === 'stop' && (o.side === 'long' ? bar.h >= o.price : bar.l <= o.price));
    if (hit) {
      next = log(next, 'order_filled', { order: o, price: o.price });
      next = fillEntry(next, o, o.price, bar.t);
    } else {
      remaining.push(o);
    }
  }
  return { ...next, pending: remaining };
}

function fillEntry(s, order, price, t) {
  let next = s;
  if (next.position && next.position.side !== order.side) {
    next = closeAt(next, price, 'reversed').state;
  }
  if (next.position) {
    // scale in: volume-weighted average entry
    const p = next.position;
    const size = p.size + order.size;
    const entryPrice = (p.entryPrice * p.size + price * order.size) / size;
    next = { ...next, position: { ...p, size, entryPrice } };
  } else {
    next = {
      ...next,
      position: {
        side: order.side,
        size: order.size,
        entryPrice: price,
        entryTs: t,
        stop: order.stop ?? null,
        target: order.target ?? null,
        tag: order.tag ?? null,
      },
    };
  }
  next = { ...next, tradesToday: next.tradesToday + 1 };
  return log(next, 'entry', { side: order.side, size: order.size, price, tradesToday: next.tradesToday });
}

function checkProtective(s, bar) {
  const p = s.position;
  if (!p) return s;
  // Conservative: stop is evaluated before target when a bar spans both.
  if (p.stop !== null) {
    const hit = p.side === 'long' ? bar.l <= p.stop : bar.h >= p.stop;
    if (hit) return closeAt(s, p.stop, 'stop').state;
  }
  if (p.target !== null) {
    const hit = p.side === 'long' ? bar.h >= p.target : bar.l <= p.target;
    if (hit) return closeAt(s, p.target, 'target').state;
  }
  return s;
}

/** Close the open position at `price`. */
export function closePosition(state, price, reason = 'manual') {
  if (!state.position) return { state, rejected: REJECT.NO_POSITION };
  const r = closeAt(state, price, reason);
  return { state: evaluate(r.state, price), rejected: null };
}

function closeAt(s, price, reason) {
  const p = s.position;
  const dir = p.side === 'long' ? 1 : -1;
  const pnl = round2((price - p.entryPrice) * dir * p.size * s.instrument.pointValue);
  const balance = round2(s.balance + pnl);

  const trade = {
    side: p.side,
    size: p.size,
    entryPrice: p.entryPrice,
    exitPrice: price,
    entryTs: p.entryTs,
    exitTs: s.ts,
    pnl,
    reason,
    dayKey: s.dayKey,
    holdMs: s.ts - p.entryTs,
    tag: p.tag,
  };

  const dayPnL = { ...s.dayPnL, [s.dayKey]: round2((s.dayPnL[s.dayKey] ?? 0) + pnl) };
  const tradingDays = s.tradingDays.includes(s.dayKey) ? s.tradingDays : [...s.tradingDays, s.dayKey];

  let next = { ...s, position: null, balance, trades: [...s.trades, trade], dayPnL, tradingDays };

  // Guardrail: mandatory cooldown after N consecutive losses.
  const g = s.guards;
  if (g && g.cooldownAfterLosses) {
    const recent = next.trades.slice(-g.cooldownAfterLosses);
    if (recent.length === g.cooldownAfterLosses && recent.every((t) => t.pnl < 0)) {
      next = {
        ...next,
        cooldownUntil: next.ts + (g.cooldownMinutes ?? 15) * 60000,
      };
      next = log(next, 'cooldown_started', { minutes: g.cooldownMinutes ?? 15, after: g.cooldownAfterLosses });
    }
  }

  return { state: log(next, 'exit', { pnl, price, reason, side: p.side, size: p.size }) };
}

/** Derived read-model for the HUD. Never mutates. */
export function hud(state) {
  const { rs } = state;
  const measured = rs.equityBasedBreach ? state.equity : state.balance;
  const profit = round2(state.balance - rs.accountSize);
  return {
    equity: state.equity,
    balance: state.balance,
    profit,
    target: rs.profitTarget,
    targetPct: Math.max(0, Math.min(1, profit / rs.profitTarget)),
    floor: state.floor,
    floorLocked: state.floorLocked,
    floorRoom: round2(measured - state.floor),
    floorPct: Math.max(0, Math.min(1, (measured - state.floor) / rs.maxLoss)),
    dailyFloor: state.dailyFloor,
    dailyRoom: state.dailyFloor === null ? null : round2(measured - state.dailyFloor),
    dailyPct: state.dailyFloor === null ? null
      : Math.max(0, Math.min(1, (measured - state.dailyFloor) / rs.dailyLoss)),
    day: state.dayIndex,
    maxDays: rs.maxTradingDays,
    tradingDays: state.tradingDays.length,
    minTradingDays: rs.minTradingDays,
    tradesToday: state.tradesToday,
    tradeCap: state.guards?.maxTradesPerDay ?? null,
    bestDay: bestDay(state),
    consistencyPct: rs.consistency && profit > 0 ? bestDay(state) / profit : null,
    consistencyLimit: rs.consistency,
    status: state.status,
    warnings: state.warnings,
    cooldownUntil: state.cooldownUntil,
  };
}
