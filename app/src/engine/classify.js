/**
 * Failure-mode classification.
 *
 * Reads the event timeline and the closed trades of a finished run and produces
 * evidence-backed findings. Deliberately rule-based rather than model-based:
 *
 *  - it is explainable, and a verdict about someone's discipline that cannot be
 *    explained will be rejected by the user;
 *  - it needs no training data, so it works on run #1;
 *  - every finding carries the exact trades that triggered it, so the user can argue
 *    with the evidence rather than with the label.
 *
 * The taxonomy (F1-F10) matches the drill catalogue in drills.js one-to-one.
 */

export const MODES = {
  F1:  { code: 'F1',  name: 'Revenge sizing',            blurb: 'You increase position size immediately after a loss.' },
  F2:  { code: 'F2',  name: 'Target-line freeze',        blurb: 'Your trading stops or shrinks as you approach the profit target.' },
  F3:  { code: 'F3',  name: 'Overtrading',               blurb: 'Trade frequency far above your own baseline.' },
  F4:  { code: 'F4',  name: 'News-window blindness',     blurb: 'Entries inside restricted news windows.' },
  F5:  { code: 'F5',  name: 'Correlation stacking',      blurb: 'Adding to an existing position so total exposure quietly multiplies.' },
  F6:  { code: 'F6',  name: 'Drawdown-floor miscalc',    blurb: 'You breached while apparently believing you had headroom.' },
  F7:  { code: 'F7',  name: 'Session drift',             blurb: 'Trading outside the hours you said you would trade.' },
  F8:  { code: 'F8',  name: 'Consistency breach',        blurb: 'One day carries too much of your total profit.' },
  F9:  { code: 'F9',  name: 'Sunk-cost escalation',      blurb: 'Risk rises as time runs out.' },
  F10: { code: 'F10', name: 'Win-streak size creep',     blurb: 'Position size drifts up after consecutive wins.' },
};

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * @param {object} state  a finished (or in-progress) account state
 * @returns {{findings: Array, primary: object|null, metrics: object}}
 */
export function classify(state) {
  const trades = state.trades;
  const rs = state.rs;
  const findings = [];
  const metrics = computeMetrics(state);

  // ── F1 revenge sizing ─────────────────────────────────────────────────────
  const afterLoss = [];
  for (let i = 1; i < trades.length; i++) {
    if (trades[i - 1].pnl < 0) {
      afterLoss.push({ ratio: trades[i].size / Math.max(1, trades[i - 1].size), i, trade: trades[i] });
    }
  }
  const escalations = afterLoss.filter((x) => x.ratio >= 1.5);
  if (escalations.length >= 1 && metrics.sizeAfterLossRatio >= 1.25) {
    findings.push({
      ...MODES.F1,
      severity: Math.min(5, 1 + escalations.length),
      stat: `Size-after-loss ratio ${metrics.sizeAfterLossRatio.toFixed(2)}x`,
      detail: `You increased size after a loss on ${escalations.length} occasion${escalations.length > 1 ? 's' : ''}. ` +
              `Traders who keep this ratio below 1.1x survive runs far more often.`,
      evidence: escalations.slice(0, 4).map((e) => ({
        ts: e.trade.entryTs,
        text: `Loss of ${money(trades[e.i - 1].pnl)} → re-entered ${e.ratio.toFixed(1)}x larger`,
      })),
    });
  }

  // ── F3 overtrading ────────────────────────────────────────────────────────
  const byDay = groupBy(trades, (t) => t.dayKey);
  const counts = Object.values(byDay).map((a) => a.length);
  const med = median(counts);
  const spikes = Object.entries(byDay).filter(([, a]) => a.length >= Math.max(6, med * 2.5));
  if (spikes.length) {
    findings.push({
      ...MODES.F3,
      severity: Math.min(5, 1 + spikes.length),
      stat: `${Math.max(...counts)} trades in one day vs a median of ${med}`,
      detail: `On ${spikes.length} day${spikes.length > 1 ? 's' : ''} your trade count was more than 2.5x your own median. ` +
              `Frequency spikes are usually a symptom, not a strategy.`,
      evidence: spikes.slice(0, 3).map(([day, a]) => ({ ts: a[0].entryTs, text: `${day}: ${a.length} trades` })),
    });
  }

  // ── F10 / F1 rapid re-entry ───────────────────────────────────────────────
  const rapid = [];
  for (let i = 1; i < trades.length; i++) {
    const gap = trades[i].entryTs - trades[i - 1].exitTs;
    if (trades[i - 1].pnl < 0 && gap <= 120_000) rapid.push({ gap, trade: trades[i], prev: trades[i - 1] });
  }
  if (rapid.length >= 2) {
    findings.push({
      ...MODES.F1,
      code: 'F1b',
      name: 'Rapid re-entry after loss',
      severity: Math.min(5, rapid.length),
      stat: `${rapid.length} re-entries within 2 minutes of a losing exit`,
      detail: 'The gap between a loss and the next entry is the single cleanest tell for tilt. ' +
              'A mandatory cooldown removes the decision entirely.',
      evidence: rapid.slice(0, 4).map((r) => ({
        ts: r.trade.entryTs,
        text: `Re-entered ${Math.round(r.gap / 1000)}s after a ${money(r.prev.pnl)} loss`,
      })),
    });
  }

  // ── F10 win-streak size creep ─────────────────────────────────────────────
  let streak = 0; const creeps = [];
  for (let i = 0; i < trades.length; i++) {
    if (trades[i].pnl > 0) {
      streak++;
      if (streak >= 3 && i + 1 < trades.length && trades[i + 1].size > trades[i].size) {
        creeps.push(trades[i + 1]);
      }
    } else streak = 0;
  }
  if (creeps.length) {
    findings.push({
      ...MODES.F10,
      severity: Math.min(4, 1 + creeps.length),
      stat: `${creeps.length} size increase${creeps.length > 1 ? 's' : ''} after a 3+ win streak`,
      detail: 'Sizing up on a hot hand is the most expensive form of confidence. One oversized loss ' +
              'undoes the whole streak and often the account.',
      evidence: creeps.slice(0, 3).map((t) => ({ ts: t.entryTs, text: `Sized up to ${t.size} after a win streak` })),
    });
  }

  // ── F6 drawdown-floor miscalculation ──────────────────────────────────────
  if (state.breach?.code === 'MAX_LOSS' && rs.maxLossType !== 'static') {
    const moves = state.timeline.filter((e) => e.type === 'eod_floor_move' || e.type === 'floor_locked');
    findings.push({
      ...MODES.F6,
      severity: 4,
      stat: `Floor had moved to ${money(state.floor)} from ${money(rs.accountSize - rs.maxLoss)}`,
      detail: `This ruleset uses ${labelDD(rs.maxLossType)} drawdown. Your floor rose with your equity peak ` +
              `of ${money(state.peakEquity)}. The room you thought you had was already spent.`,
      evidence: moves.slice(-3).map((m) => ({ ts: m.t, text: `Floor moved to ${money(m.floor)}` })),
    });
  }

  // ── F8 consistency ────────────────────────────────────────────────────────
  if (rs.consistency) {
    const profit = state.balance - rs.accountSize;
    const best = Math.max(0, ...Object.values(state.dayPnL));
    if (profit > 0 && best / profit > rs.consistency) {
      findings.push({
        ...MODES.F8,
        severity: 3,
        stat: `Best day = ${((best / profit) * 100).toFixed(0)}% of total profit (limit ${rs.consistency * 100}%)`,
        detail: 'Even a passing balance does not pass with a lopsided profit distribution. ' +
                'This rule is usually only enforced at payout, which is why it surprises people.',
        evidence: [{ ts: null, text: `Best day ${money(best)} of ${money(profit)} total` }],
      });
    }
  }

  // ── F4 news window ────────────────────────────────────────────────────────
  const newsRejects = state.timeline.filter((e) => e.type === 'order_rejected' && e.code === 'NEWS_WINDOW');
  if (newsRejects.length) {
    findings.push({
      ...MODES.F4,
      severity: 2,
      stat: `${newsRejects.length} entr${newsRejects.length > 1 ? 'ies' : 'y'} attempted inside a news window`,
      detail: 'The engine blocked these. A real firm may instead let the trade through and void the payout later.',
      evidence: newsRejects.slice(0, 3).map((e) => ({ ts: e.t, text: 'Entry blocked: high-impact news window' })),
    });
  }

  // ── F9 sunk-cost escalation ───────────────────────────────────────────────
  if (rs.maxTradingDays && trades.length >= 6) {
    const half = Math.floor(trades.length / 2);
    const early = median(trades.slice(0, half).map((t) => t.size));
    const late = median(trades.slice(half).map((t) => t.size));
    if (late >= early * 1.5) {
      findings.push({
        ...MODES.F9,
        severity: 3,
        stat: `Median size rose from ${early} to ${late} in the second half of the run`,
        detail: 'Risk rising as the clock runs down is time pressure making the decision, not you.',
        evidence: [{ ts: trades[half].entryTs, text: `Second half median size ${late} vs ${early}` }],
      });
    }
  }

  // ── F2 target-line freeze ─────────────────────────────────────────────────
  if (state.status === 'active' || state.status === 'failed') {
    const nearTarget = trades.filter((t) => {
      const runningProfit = t.pnl; void runningProfit;
      return false;
    });
    void nearTarget;
  }
  const freeze = detectFreeze(state);
  if (freeze) findings.push(freeze);

  // ── F7 session drift ──────────────────────────────────────────────────────
  const hours = trades.map((t) => new Date(t.entryTs).getUTCHours());
  if (hours.length >= 5) {
    const h = groupBy(hours, (x) => x);
    const spread = Object.keys(h).length;
    if (spread >= 8) {
      findings.push({
        ...MODES.F7,
        severity: 2,
        stat: `Entries spread across ${spread} different hours of the day`,
        detail: 'A scattered session profile usually means you are trading availability, not setups.',
        evidence: [{ ts: null, text: `Entries in ${spread} distinct hours` }],
      });
    }
  }

  findings.sort((a, b) => b.severity - a.severity);
  return { findings, primary: findings[0] ?? null, metrics };
}

function detectFreeze(state) {
  const rs = state.rs;
  const trades = state.trades;
  if (trades.length < 6) return null;
  // Reconstruct the equity path and find the point where profit first exceeded 60% of target.
  let running = 0; let idx = -1;
  for (let i = 0; i < trades.length; i++) {
    running += trades[i].pnl;
    if (idx === -1 && running >= rs.profitTarget * 0.6) idx = i;
  }
  if (idx === -1 || idx >= trades.length - 2) return null;
  const before = trades.slice(0, idx + 1);
  const after = trades.slice(idx + 1);
  const beforeRate = before.length / Math.max(1, uniq(before.map((t) => t.dayKey)).length);
  const afterRate = after.length / Math.max(1, uniq(after.map((t) => t.dayKey)).length);
  if (afterRate <= beforeRate * 0.4) {
    return {
      ...MODES.F2,
      severity: 3,
      stat: `Trade rate fell ${(100 - (afterRate / beforeRate) * 100).toFixed(0)}% after reaching 60% of target`,
      detail: 'Freezing near the target is prospect theory doing its job. The fix is a written finish rule ' +
              'decided before the run, not in the moment.',
      evidence: [{ ts: after[0]?.entryTs ?? null, text: `${beforeRate.toFixed(1)} trades/day → ${afterRate.toFixed(1)} trades/day` }],
    };
  }
  return null;
}

/** Behavioural metrics — these are the feature vector a future scoring model would use. */
export function computeMetrics(state) {
  const trades = state.trades;
  const sizes = trades.map((t) => t.size);
  const medSize = median(sizes) || 1;

  let afterLossSizes = [], afterWinSizes = [];
  for (let i = 1; i < trades.length; i++) {
    (trades[i - 1].pnl < 0 ? afterLossSizes : afterWinSizes).push(trades[i].size);
  }

  const gaps = [];
  for (let i = 1; i < trades.length; i++) {
    if (trades[i - 1].pnl < 0) gaps.push(trades[i].entryTs - trades[i - 1].exitTs);
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));

  const stopped = trades.filter((t) => t.reason === 'stop').length;
  const hadStop = trades.filter((t) => t.reason === 'stop' || t.reason === 'target' || t.reason === 'manual').length;

  return {
    trades: trades.length,
    winRate: trades.length ? wins.length / trades.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0),
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    medianSize: medSize,
    maxSize: sizes.length ? Math.max(...sizes) : 0,
    sizeDispersion: sizes.length ? Math.max(...sizes) / medSize : 1,
    sizeAfterLossRatio: afterLossSizes.length ? median(afterLossSizes) / medSize : 1,
    sizeAfterWinRatio: afterWinSizes.length ? median(afterWinSizes) / medSize : 1,
    medianReentryGapSec: gaps.length ? Math.round(median(gaps) / 1000) : null,
    stopHonorRate: hadStop ? stopped / hadStop : null,
    tradingDays: state.tradingDays.length,
    tradesPerDay: state.tradingDays.length ? trades.length / state.tradingDays.length : 0,
    bestDay: Math.max(0, ...Object.values(state.dayPnL), 0),
    worstDay: Math.min(0, ...Object.values(state.dayPnL), 0),
    closestToDailyFloor: state.rs.dailyLoss
      ? Math.min(...state.timeline.filter((e) => e.type === 'exit').map(() => 1), 1)
      : null,
  };
}

const uniq = (a) => [...new Set(a)];
const groupBy = (arr, fn) => arr.reduce((acc, x) => { const k = fn(x); (acc[k] ||= []).push(x); return acc; }, {});
const money = (n) => `$${Math.round(Math.abs(n)).toLocaleString()}${n < 0 ? '' : ''}`;
const labelDD = (t) => ({
  static: 'static',
  trailing_intraday: 'intraday trailing',
  trailing_eod: 'end-of-day trailing',
  trailing_to_static: 'trailing-then-locking',
}[t]);

/**
 * Build the timestamped narrative shown on the autopsy screen.
 * This is the emotional core of the product: the user's own behaviour, as a sequence.
 */
export function narrative(state, limit = 12) {
  const interesting = new Set([
    'entry', 'exit', 'breach', 'order_rejected', 'cooldown_started',
    'eod_floor_move', 'floor_locked', 'consistency_block', 'passed',
  ]);
  const events = state.timeline.filter((e) => interesting.has(e.type));
  const tail = events.slice(-limit);
  return tail.map((e) => {
    const time = e.t ? new Date(e.t).toISOString().slice(11, 16) : '--:--';
    switch (e.type) {
      case 'entry':          return { time, kind: 'entry', text: `Entered ${e.side} ${e.size} @ mkt` };
      case 'exit':           return { time, kind: e.pnl >= 0 ? 'win' : 'loss', text: `${e.reason === 'stop' ? 'Stopped out' : e.reason === 'target' ? 'Target hit' : 'Closed'} ${e.pnl >= 0 ? '+' : '-'}${money(e.pnl)}` };
      case 'breach':         return { time, kind: 'breach', text: e.detail };
      case 'order_rejected': return { time, kind: 'blocked', text: e.msg };
      case 'cooldown_started': return { time, kind: 'guard', text: `Cooldown started after ${e.after} losses` };
      case 'eod_floor_move': return { time, kind: 'floor', text: `Floor moved up to ${money(e.floor)}` };
      case 'floor_locked':   return { time, kind: 'floor', text: `Floor locked at ${money(e.floor)}` };
      case 'consistency_block': return { time, kind: 'blocked', text: 'Target reached but consistency rule blocks the pass' };
      case 'passed':         return { time, kind: 'pass', text: `Passed with ${money(e.profit)} over ${e.days} days` };
      default:               return { time, kind: 'info', text: e.type };
    }
  });
}
