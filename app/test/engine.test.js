/**
 * Golden tests for the rule engine.
 *
 * These exist for a product reason, not just a hygiene one: the report's competitive
 * analysis concluded that rule FIDELITY is the only thing in a prop-firm simulator that
 * a weekend clone cannot fake. A published, readable test suite that shows exactly how each
 * firm's drawdown methodology is implemented is the demonstration of that fidelity.
 *
 * Run: node --test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { RULESETS, loadRuleSet } from '../src/engine/rulesets.js';
import { createAccount, applyBar, submitOrder, closePosition, hud, BREACH, REJECT } from '../src/engine/account.js';
import { classify } from '../src/engine/classify.js';
import { readinessScore, grade, recommendation, MIN_RUNS_FOR_READY } from '../src/engine/score.js';
import { loadSession, resample, inNewsWindow, INSTRUMENTS } from '../src/data/market.js';
import { normalizeGuards, levelFor, xpForRun, drillsFor } from '../src/engine/training.js';

const INST = { symbol: 'TEST', pointValue: 1, tickSize: 0.01, digits: 2 };
const T0 = Date.UTC(2026, 0, 5, 14, 0);
const bar = (t, price, h = price, l = price) => ({ t, o: price, h, l, c: price, v: 1 });

/** Helper: run a market order in and out at given prices. */
function trade(state, session, { at, entry, exit, side = 'long', size = 1 }) {
  let s = applyBar(state, bar(at, entry));
  const r = submitOrder(s, { type: 'market', side, size }, bar(at, entry), session);
  s = r.state;
  assert.equal(r.rejected, null, `order rejected: ${r.rejected}`);
  s = applyBar(s, bar(at + 60_000, exit));
  s = closePosition(s, exit).state;
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('determinism', () => {
  test('same seed produces byte-identical bars', () => {
    const a = loadSession({ symbol: 'MES', days: 3, seed: 'season-1' });
    const b = loadSession({ symbol: 'MES', days: 3, seed: 'season-1' });
    assert.deepEqual(a.bars, b.bars);
  });

  test('different seeds diverge', () => {
    const a = loadSession({ symbol: 'MES', days: 2, seed: 'x' });
    const b = loadSession({ symbol: 'MES', days: 2, seed: 'y' });
    assert.notDeepEqual(a.bars, b.bars);
  });

  test('identical order sequences produce identical final state', () => {
    const rs = loadRuleSet('ftmo-100k-2step');
    const run = () => {
      let s = createAccount(rs, INST);
      s = trade(s, {}, { at: T0, entry: 100, exit: 105 });
      s = trade(s, {}, { at: T0 + 3_600_000, entry: 105, exit: 101 });
      return s;
    };
    const a = run(), b = run();
    assert.equal(a.balance, b.balance);
    assert.deepEqual(a.trades, b.trades);
    assert.equal(a.timeline.length, b.timeline.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('drawdown: static (FTMO-style)', () => {
  const rs = loadRuleSet('ftmo-100k-2step');

  test('floor is fixed at start - maxLoss and never moves', () => {
    let s = createAccount(rs, INST);
    assert.equal(s.floor, 90_000);
    s = trade(s, {}, { at: T0, entry: 100, exit: 100 + 5000 }); // +$5,000
    assert.equal(s.balance, 105_000);
    assert.equal(s.floor, 90_000, 'static floor must not trail a new equity peak');
  });

  test('breaches only when equity reaches the fixed floor', () => {
    let s = createAccount(rs, INST);
    s = applyBar(s, bar(T0, 100));
    s = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(T0, 100)).state;
    // Unrealized -9,999 → still alive (daily loss is 5,000 though, so use a smaller account move)
    s = applyBar(s, bar(T0 + 60_000, 100 - 4_900));
    assert.equal(s.status, 'active');
    assert.equal(hud(s).floor, 90_000);
  });
});

describe('drawdown: trailing intraday (Apex-style)', () => {
  const rs = loadRuleSet('apex-50k');

  test('floor follows the UNREALIZED equity peak, tick by tick', () => {
    let s = createAccount(rs, INST);
    assert.equal(s.floor, 47_500);

    s = applyBar(s, bar(T0, 100));
    s = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(T0, 100)).state;

    // Price runs +800 → unrealized peak 50,800 → floor should trail to 48,300
    s = applyBar(s, bar(T0 + 60_000, 900));
    assert.equal(s.peakEquity, 50_800);
    assert.equal(s.floor, 48_300, 'intraday trailing must use unrealized equity');

    // Give it all back: balance still 50,000 but the floor stayed up.
    s = applyBar(s, bar(T0 + 120_000, 100));
    s = closePosition(s, 100).state;
    assert.equal(s.balance, 50_000);
    assert.equal(s.floor, 48_300, 'the floor does not come back down');
  });

  test('the give-back kills the account even though balance never lost money', () => {
    let s = createAccount(rs, INST);
    s = applyBar(s, bar(T0, 100));
    s = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(T0, 100)).state;
    s = applyBar(s, bar(T0 + 60_000, 2_600));   // +2,500 → floor 50,000
    assert.equal(s.floor, 50_000);
    s = applyBar(s, bar(T0 + 120_000, 90));     // equity 49,990 → below floor
    assert.equal(s.status, 'failed');
    assert.equal(s.breach.code, BREACH.MAX_LOSS);
  });

  test('floor locks once it reaches start + trailingLockAt', () => {
    let s = createAccount(rs, INST);
    s = applyBar(s, bar(T0, 100));
    s = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(T0, 100)).state;
    s = applyBar(s, bar(T0 + 60_000, 100 + 5_000));  // peak 55,000 → floor would be 52,500
    assert.equal(s.floorLocked, true);
    assert.equal(s.floor, 50_100, 'locks at accountSize + trailingLockAt, not above');
    s = applyBar(s, bar(T0 + 120_000, 100 + 9_000)); // even higher peak
    assert.equal(s.floor, 50_100, 'locked floor must not move again');
  });
});

describe('drawdown: trailing end-of-day (Topstep-style)', () => {
  const rs = loadRuleSet('topstep-50k-combine');

  test('floor does NOT move intraday, only at the day roll', () => {
    let s = createAccount(rs, INST);
    assert.equal(s.floor, 48_000);

    s = trade(s, {}, { at: T0, entry: 100, exit: 700 }); // +600 realized
    assert.equal(s.balance, 50_600);
    assert.equal(s.floor, 48_000, 'EOD trailing must not move during the day');

    // Roll into the next trading day (reset hour is 17:00 → shift by a full day)
    s = applyBar(s, bar(T0 + 86_400_000, 700));
    assert.equal(s.floor, 48_600, 'floor moves once, at the roll, using end-of-day balance');
  });
});

describe('drawdown: trailing-to-static (MyFundedFutures-style)', () => {
  const rs = loadRuleSet('mff-50k-lock');

  test('trails then freezes permanently at the lock point', () => {
    let s = createAccount(rs, INST);
    assert.equal(s.floor, 48_000);
    s = applyBar(s, bar(T0, 100));
    s = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(T0, 100)).state;
    s = applyBar(s, bar(T0 + 60_000, 100 + 1_500));   // peak 51,500 → floor 49,500, not yet locked
    assert.equal(s.floorLocked, false);
    assert.equal(s.floor, 49_500);
    s = applyBar(s, bar(T0 + 120_000, 100 + 2_200));  // peak 52,200 → floor would be 50,200 → clamps+locks
    assert.equal(s.floorLocked, true);
    assert.equal(s.floor, 50_100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('daily loss limit', () => {
  const rs = loadRuleSet('topstep-50k-combine'); // $1,000 daily

  test('breaches on unrealized equity, not just realized', () => {
    let s = createAccount(rs, INST);
    s = applyBar(s, bar(T0, 100));
    s = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(T0, 100)).state;
    s = applyBar(s, bar(T0 + 60_000, 100 - 1_050));
    assert.equal(s.status, 'failed');
    assert.equal(s.breach.code, BREACH.DAILY_LOSS);
  });

  test('re-anchors to the new balance at the day roll', () => {
    let s = createAccount(rs, INST);
    assert.equal(s.dailyFloor, 49_000);
    s = trade(s, {}, { at: T0, entry: 100, exit: 600 });   // +500
    assert.equal(s.dailyFloor, 49_000, 'daily floor is fixed within the day');
    s = applyBar(s, bar(T0 + 86_400_000, 600));
    assert.equal(s.dailyFloor, 49_500, 'new day anchors to the new balance');
  });

  test('a ruleset with no daily limit never breaches on it', () => {
    const apex = loadRuleSet('apex-50k');
    let s = createAccount(apex, INST);
    assert.equal(s.dailyFloor, null);
    assert.equal(hud(s).dailyRoom, null);
  });
});

describe('day roll semantics', () => {
  test('a 17:00 reset hour puts 18:00 into the NEXT trading day', () => {
    const rs = loadRuleSet('topstep-50k-combine'); // dailyResetHour 17
    let s = createAccount(rs, INST);
    const monday18 = Date.UTC(2026, 0, 5, 18, 0);
    s = applyBar(s, bar(monday18, 100));
    const d1 = s.dayKey;
    const monday16 = Date.UTC(2026, 0, 5, 16, 0);
    let s2 = createAccount(rs, INST);
    s2 = applyBar(s2, bar(monday16, 100));
    assert.notEqual(d1, s2.dayKey, '16:00 and 18:00 on the same date are different trading days');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('profit target and pass conditions', () => {
  test('an open winner does NOT pass the account — balance only', () => {
    const rs = loadRuleSet('the5ers-hyper-20k'); // target 1,200, min 3 days
    let s = createAccount(rs, INST);
    s = applyBar(s, bar(T0, 100));
    s = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(T0, 100)).state;
    s = applyBar(s, bar(T0 + 60_000, 100 + 5_000));
    assert.equal(s.status, 'active', 'unrealized profit must never trigger a pass');
  });

  test('minimum trading days gates the pass', () => {
    // FTMO-style: 4 minimum days, and no consistency rule, so days are the only gate.
    const rs = loadRuleSet('ftmo-100k-2step');
    let s = createAccount(rs, INST);
    s = trade(s, {}, { at: T0, entry: 100, exit: 10_600 }); // +10,500 > target on day 1
    assert.equal(s.status, 'active', 'target hit but only 1 trading day');
    assert.equal(s.balance, 110_500);

    s = trade(s, {}, { at: T0 + 86_400_000, entry: 100, exit: 110 });      // day 2
    assert.equal(s.status, 'active');
    s = trade(s, {}, { at: T0 + 2 * 86_400_000, entry: 100, exit: 110 });  // day 3
    assert.equal(s.status, 'active');
    s = trade(s, {}, { at: T0 + 3 * 86_400_000, entry: 100, exit: 110 });  // day 4
    assert.equal(s.status, 'passed');
  });

  test('a lopsided profit fails the consistency gate even with enough days', () => {
    // The5ers: 3 min days AND a 50% consistency rule. One huge day cannot pass.
    const rs = loadRuleSet('the5ers-hyper-20k');
    let s = createAccount(rs, INST);
    s = trade(s, {}, { at: T0, entry: 100, exit: 1_400 });                 // +1,300, day 1
    s = trade(s, {}, { at: T0 + 86_400_000, entry: 100, exit: 110 });      // day 2
    s = trade(s, {}, { at: T0 + 2 * 86_400_000, entry: 100, exit: 110 });  // day 3
    assert.equal(s.status, 'active', 'days satisfied, but one day carries ~98% of profit');
    assert.ok(s.warnings.some((w) => w.code === 'CONSISTENCY_BLOCK'));
  });

  test('consistency rule blocks a pass without failing the account', () => {
    const rs = loadRuleSet('topstep-50k-combine'); // target 3,000, min 2 days, consistency 50%
    let s = createAccount(rs, INST);
    s = trade(s, {}, { at: T0, entry: 100, exit: 3_200 });  // day 1: +3,100 = 100% of profit
    s = trade(s, {}, { at: T0 + 86_400_000, entry: 100, exit: 110 }); // day 2: +10
    assert.equal(s.status, 'active', 'balance passes but consistency blocks');
    assert.ok(s.warnings.some((w) => w.code === 'CONSISTENCY_BLOCK'));
    assert.equal(s.breach, null, 'a consistency block is not a breach');
  });

  test('diluting the best day unblocks the pass', () => {
    const rs = loadRuleSet('topstep-50k-combine');
    let s = createAccount(rs, INST);
    // Two identical days: best day is exactly 50% of total profit, which is the limit.
    s = trade(s, {}, { at: T0, entry: 100, exit: 1_700 });                  // +1,600
    s = trade(s, {}, { at: T0 + 86_400_000, entry: 100, exit: 1_700 });     // +1,600
    assert.equal(s.balance - rs.accountSize, 3_200);
    assert.equal(s.status, 'passed');
    assert.ok(s.balance - rs.accountSize >= rs.profitTarget);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('time limit', () => {
  test('fails when the day index exceeds maxTradingDays', () => {
    const rs = loadRuleSet('ftmo-100k-2step'); // 30 days
    let s = createAccount(rs, INST);
    s = applyBar(s, bar(T0, 100));
    for (let d = 1; d <= 31; d++) s = applyBar(s, bar(T0 + d * 86_400_000, 100));
    assert.equal(s.status, 'failed');
    assert.equal(s.breach.code, BREACH.TIME_LIMIT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('order handling', () => {
  const rs = loadRuleSet('apex-50k'); // maxContracts 10

  test('rejects an order that would exceed max position size', () => {
    let s = createAccount(rs, INST);
    s = applyBar(s, bar(T0, 100));
    const r = submitOrder(s, { type: 'market', side: 'long', size: 11 }, bar(T0, 100));
    assert.equal(r.rejected, REJECT.MAX_POSITION);
    assert.equal(r.state.position, null);
    assert.ok(r.state.timeline.some((e) => e.type === 'order_rejected'));
  });

  test('scaling in produces a volume-weighted average entry', () => {
    let s = createAccount(rs, INST);
    s = applyBar(s, bar(T0, 100));
    s = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(T0, 100)).state;
    s = applyBar(s, bar(T0 + 60_000, 200));
    s = submitOrder(s, { type: 'market', side: 'long', size: 3 }, bar(T0 + 60_000, 200)).state;
    assert.equal(s.position.size, 4);
    assert.equal(s.position.entryPrice, (100 * 1 + 200 * 3) / 4);
  });

  test('an opposite-side order closes the position first', () => {
    let s = createAccount(rs, INST);
    s = applyBar(s, bar(T0, 100));
    s = submitOrder(s, { type: 'market', side: 'long', size: 2 }, bar(T0, 100)).state;
    s = applyBar(s, bar(T0 + 60_000, 150));
    s = submitOrder(s, { type: 'market', side: 'short', size: 1 }, bar(T0 + 60_000, 150)).state;
    assert.equal(s.trades.length, 1);
    assert.equal(s.trades[0].pnl, 100);       // (150-100) * 2 * pointValue 1
    assert.equal(s.position.side, 'short');
  });

  test('a resting limit order fills only when the bar range reaches it', () => {
    let s = createAccount(rs, INST);
    s = applyBar(s, bar(T0, 100));
    s = submitOrder(s, { type: 'limit', side: 'long', size: 1, price: 95 }, bar(T0, 100)).state;
    assert.equal(s.pending.length, 1);
    s = applyBar(s, { t: T0 + 60_000, o: 99, h: 99, l: 97, c: 98, v: 1 });
    assert.equal(s.position, null, 'must not fill above the limit price');
    s = applyBar(s, { t: T0 + 120_000, o: 98, h: 98, l: 94, c: 96, v: 1 });
    assert.equal(s.position.entryPrice, 95, 'fills at the limit price, not the close');
    assert.equal(s.pending.length, 0);
  });

  test('stop is evaluated before target when a bar spans both (conservative)', () => {
    let s = createAccount(rs, INST);
    s = applyBar(s, bar(T0, 100));
    s = submitOrder(s, { type: 'market', side: 'long', size: 1, stop: 95, target: 110 }, bar(T0, 100)).state;
    s = applyBar(s, { t: T0 + 60_000, o: 100, h: 112, l: 94, c: 105, v: 1 });
    assert.equal(s.trades.length, 1);
    assert.equal(s.trades[0].reason, 'stop', 'the pessimistic fill must win');
    assert.equal(s.trades[0].pnl, -5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('news restriction', () => {
  test('blocks entries inside a news window when the ruleset says so', () => {
    const rs = loadRuleSet('fundednext-100k-1step'); // newsRestricted
    let s = createAccount(rs, INST);
    s = applyBar(s, bar(T0, 100));
    const r = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(T0, 100), { inNewsWindow: true });
    assert.equal(r.rejected, REJECT.NEWS_WINDOW);
  });

  test('rulesets without the rule are unaffected', () => {
    const rs = loadRuleSet('apex-50k');
    let s = createAccount(rs, INST);
    s = applyBar(s, bar(T0, 100));
    const r = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(T0, 100), { inNewsWindow: true });
    assert.equal(r.rejected, null);
  });

  test('inNewsWindow respects the window width', () => {
    const session = loadSession({ symbol: 'MES', days: 4, seed: 'news' });
    assert.ok(session.news.length > 0, 'generator must schedule events');
    const ev = session.news[0];
    assert.equal(inNewsWindow(session, ev.t, 2), true);
    assert.equal(inNewsWindow(session, ev.t + 60_000, 2), true);
    assert.equal(inNewsWindow(session, ev.t + 5 * 60_000, 2), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('guardrails (Ulysses contracts)', () => {
  const rs = loadRuleSet('apex-50k');

  test('daily trade cap is enforced by the engine, not the UI', () => {
    const guards = normalizeGuards({ maxTradesPerDay: 2 });
    let s = createAccount(rs, INST, guards);
    s = trade(s, {}, { at: T0, entry: 100, exit: 101 });
    s = trade(s, {}, { at: T0 + 600_000, entry: 100, exit: 101 });
    s = applyBar(s, bar(T0 + 1_200_000, 100));
    const r = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(T0 + 1_200_000, 100));
    assert.equal(r.rejected, REJECT.GUARD_TRADE_CAP);
  });

  test('cooldown triggers after N consecutive losses and blocks entries', () => {
    const guards = normalizeGuards({ cooldownAfterLosses: 2, cooldownMinutes: 15 });
    let s = createAccount(rs, INST, guards);
    s = trade(s, {}, { at: T0, entry: 100, exit: 90 });
    s = trade(s, {}, { at: T0 + 600_000, entry: 100, exit: 90 });
    assert.ok(s.cooldownUntil !== null, 'cooldown must arm after 2 losses');
    s = applyBar(s, bar(T0 + 1_260_000, 100));  // 1 minute later
    const r = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(T0 + 1_260_000, 100));
    assert.equal(r.rejected, REJECT.GUARD_COOLDOWN);
  });

  test('cooldown expires', () => {
    const guards = normalizeGuards({ cooldownAfterLosses: 2, cooldownMinutes: 5 });
    let s = createAccount(rs, INST, guards);
    s = trade(s, {}, { at: T0, entry: 100, exit: 90 });
    s = trade(s, {}, { at: T0 + 60_000, entry: 100, exit: 90 });
    const later = T0 + 60_000 + 60_000 + 6 * 60_000;
    s = applyBar(s, bar(later, 100));
    const r = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(later, 100));
    assert.equal(r.rejected, null);
  });

  test('session lock blocks entries outside declared hours', () => {
    const guards = normalizeGuards({ sessionStartHour: 13, sessionEndHour: 16 });
    let s = createAccount(rs, INST, guards);
    const t = Date.UTC(2026, 0, 5, 19, 0);
    s = applyBar(s, bar(t, 100));
    const r = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(t, 100));
    assert.equal(r.rejected, REJECT.GUARD_SESSION);
  });

  test('a blocked guard order is logged, so the autopsy can credit it', () => {
    const guards = normalizeGuards({ maxTradesPerDay: 1 });
    let s = createAccount(rs, INST, guards);
    s = trade(s, {}, { at: T0, entry: 100, exit: 101 });
    s = applyBar(s, bar(T0 + 600_000, 100));
    s = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(T0 + 600_000, 100)).state;
    const blocked = s.timeline.filter((e) => e.type === 'order_rejected' && e.code === REJECT.GUARD_TRADE_CAP);
    assert.equal(blocked.length, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('failure classification', () => {
  const rs = loadRuleSet('apex-50k');

  test('detects revenge sizing after a loss', () => {
    let s = createAccount(rs, INST);
    s = trade(s, {}, { at: T0, entry: 100, exit: 90, size: 1 });                 // loss
    s = trade(s, {}, { at: T0 + 600_000, entry: 100, exit: 95, size: 3 });       // 3x after loss
    s = trade(s, {}, { at: T0 + 1_200_000, entry: 100, exit: 90, size: 5 });     // 5x after loss
    const { findings } = classify(s);
    assert.ok(findings.some((f) => f.code === 'F1'), 'must flag revenge sizing');
    const f = findings.find((f) => f.code === 'F1');
    assert.ok(f.evidence.length > 0, 'a finding must carry its evidence');
  });

  test('detects rapid re-entry after a loss', () => {
    let s = createAccount(rs, INST);
    for (let i = 0; i < 3; i++) {
      const t = T0 + i * 130_000;
      s = applyBar(s, bar(t, 100));
      s = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(t, 100)).state;
      s = applyBar(s, bar(t + 30_000, 96));
      s = closePosition(s, 96).state;
    }
    const { findings } = classify(s);
    assert.ok(findings.some((f) => f.code === 'F1b'), 'must flag rapid re-entry');
  });

  test('clean disciplined trading produces no revenge findings', () => {
    let s = createAccount(rs, INST);
    for (let i = 0; i < 6; i++) {
      s = trade(s, {}, { at: T0 + i * 3_600_000, entry: 100, exit: i % 2 ? 104 : 98, size: 1 });
    }
    const { findings } = classify(s);
    assert.ok(!findings.some((f) => f.code === 'F1'), 'stable sizing must not be flagged');
  });

  test('explains a trailing-drawdown breach as a floor miscalculation', () => {
    let s = createAccount(rs, INST);
    s = applyBar(s, bar(T0, 100));
    s = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(T0, 100)).state;
    s = applyBar(s, bar(T0 + 60_000, 3_000));   // peak 52,900 lifts the floor to its lock at 50,100
    s = applyBar(s, bar(T0 + 120_000, 50));     // equity 49,950 → below the raised floor
    assert.equal(s.status, 'failed');
    const { findings } = classify(s);
    assert.ok(findings.some((f) => f.code === 'F6'));
  });

  test('metrics are computable on an empty run without throwing', () => {
    const s = createAccount(rs, INST);
    const { findings, metrics } = classify(s);
    assert.deepEqual(findings, []);
    assert.equal(metrics.trades, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('readiness score', () => {
  const rs = loadRuleSet('apex-50k');

  const cleanRun = () => {
    let s = createAccount(rs, INST);
    for (let i = 0; i < 8; i++) {
      s = trade(s, {}, { at: T0 + i * 3_600_000, entry: 100, exit: i % 3 ? 103 : 99, size: 1 });
    }
    return { ...s, status: 'passed' };
  };
  const messyRun = () => {
    let s = createAccount(rs, INST);
    s = trade(s, {}, { at: T0, entry: 100, exit: 90, size: 1 });
    s = trade(s, {}, { at: T0 + 40_000, entry: 100, exit: 88, size: 4 });
    s = trade(s, {}, { at: T0 + 80_000, entry: 100, exit: 85, size: 8 });
    return { ...s, status: 'failed', breach: { code: 'MAX_LOSS' } };
  };

  test('a run that ended early is still scored (it contains real behaviour)', () => {
    // Regression: the dashboard crashed when runs existed but none had passed or failed,
    // because readinessScore returned null components while the view expected an object.
    const ended = { ...cleanRun(), status: 'ended' };
    const r = readinessScore([ended]);
    assert.notEqual(r.score, null);
    assert.ok(r.components, 'components must be present for any scored run');
    assert.equal(r.runs, 1);
  });

  test('an active (in-progress) run is not scored', () => {
    const r = readinessScore([{ ...cleanRun(), status: 'active' }]);
    assert.equal(r.score, null);
    assert.equal(r.components, null);
  });

  test('ending early is not penalised as harshly as a breach', () => {
    const ended = readinessScore([{ ...messyRun(), status: 'ended', breach: null }]);
    const failed = readinessScore([messyRun()]);
    assert.ok(ended.score > failed.score, 'a breach must cost more than stopping early');
  });

  test('no runs → null score and an honest disclosure', () => {
    const r = readinessScore([]);
    assert.equal(r.score, null);
    assert.match(r.disclosure, /Complete a run/);
  });

  test('disciplined behaviour scores above undisciplined behaviour', () => {
    const clean = readinessScore([cleanRun()]);
    const messy = readinessScore([messyRun()]);
    assert.ok(clean.score > messy.score, `${clean.score} should beat ${messy.score}`);
  });

  test('score stays inside 0-100 and grades map correctly', () => {
    const r = readinessScore([cleanRun(), messyRun()]);
    assert.ok(r.score >= 0 && r.score <= 100);
    assert.equal(grade(90), 'A');
    assert.equal(grade(80), 'B');
    assert.equal(grade(65), 'C');
    assert.equal(grade(50), 'D');
    assert.equal(grade(20), 'F');
  });

  test('the disclosure never claims a real-world pass probability', () => {
    const r = readinessScore([cleanRun()]);
    assert.doesNotMatch(r.disclosure, /chance|probability of passing|likely to pass/i);
    assert.match(r.disclosure, /simulated/i);
    assert.equal(r.calibration, null, 'calibration must stay null until real outcome data exists');
  });

  test('below 40 the product tells the user NOT to buy a challenge', () => {
    const rec = recommendation(25, 10);
    assert.equal(rec.level, 'stop');
    assert.match(rec.text, /Do not buy a challenge yet/);
  });

  test('a high score off too few runs never says "ready"', () => {
    // Guards against the product telling someone to spend $500 on the strength of one run.
    for (const runs of [1, 2]) {
      const rec = recommendation(92, runs);
      assert.equal(rec.level, 'wait', `${runs} run(s) must not produce a ready verdict`);
      assert.match(rec.text, /only \d+ scored run/);
    }
    assert.equal(recommendation(92, MIN_RUNS_FOR_READY).level, 'ready');
  });

  test('recency weighting: improvement moves the score up', () => {
    const improving = readinessScore([messyRun(), messyRun(), cleanRun(), cleanRun()]);
    const declining = readinessScore([cleanRun(), cleanRun(), messyRun(), messyRun()]);
    assert.ok(improving.score > declining.score, 'recent runs must dominate');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('progression', () => {
  test('XP is never awarded for profit', () => {
    const rs = loadRuleSet('apex-50k');
    let big = createAccount(rs, INST);
    big = trade(big, {}, { at: T0, entry: 100, exit: 2_000, size: 1 });
    let small = createAccount(rs, INST);
    small = trade(small, {}, { at: T0, entry: 100, exit: 101, size: 1 });
    const a = xpForRun(big, []);
    const b = xpForRun(small, []);
    assert.equal(a.xp, b.xp, 'a bigger winner must not earn more XP than a small one');
  });

  test('guardrails holding earns XP', () => {
    const rs = loadRuleSet('apex-50k');
    const guards = normalizeGuards({ maxTradesPerDay: 1 });
    let s = createAccount(rs, INST, guards);
    s = trade(s, {}, { at: T0, entry: 100, exit: 101 });
    s = applyBar(s, bar(T0 + 600_000, 100));
    s = submitOrder(s, { type: 'market', side: 'long', size: 1 }, bar(T0 + 600_000, 100)).state;
    const withGuard = xpForRun(s, []).xp;

    let plain = createAccount(rs, INST);
    plain = trade(plain, {}, { at: T0, entry: 100, exit: 101 });
    assert.ok(withGuard > xpForRun(plain, []).xp);
  });

  test('levels advance and level 7 is deliberately hard to reach', () => {
    assert.equal(levelFor(0).level, 1);
    assert.equal(levelFor(0).name, 'Tourist');
    assert.equal(levelFor(3200).name, 'Challenge Ready');
    assert.ok(levelFor(3199).level < 7);
    assert.equal(levelFor(999999).max, true);
  });

  test('drills are prescribed from findings and always return three', () => {
    const d = drillsFor([{ code: 'F1' }, { code: 'F3' }]);
    assert.equal(d.length, 3);
    assert.ok(d.some((x) => x.forMode === 'F1'));
    assert.equal(drillsFor([]).length, 3, 'must fall back when there are no findings');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('market data', () => {
  test('generates the expected bar count and never produces invalid OHLC', () => {
    const s = loadSession({ symbol: 'MNQ', days: 3, seed: 42, barsPerDay: 60 });
    assert.equal(s.bars.length, 180);
    for (const b of s.bars) {
      assert.ok(b.h >= Math.max(b.o, b.c), 'high must be the highest');
      assert.ok(b.l <= Math.min(b.o, b.c), 'low must be the lowest');
      assert.ok(b.c > 0 && Number.isFinite(b.c));
      assert.ok(Number.isFinite(b.t));
    }
  });

  test('is flagged synthetic — the UI depends on this to label sessions honestly', () => {
    const s = loadSession({ symbol: 'MES', days: 1, seed: 1 });
    assert.equal(s.synthetic, true);
    assert.equal(s.provider, 'synthetic-v1');
  });

  test('resample preserves OHLC semantics', () => {
    const s = loadSession({ symbol: 'MES', days: 1, seed: 7, barsPerDay: 60 });
    const five = resample(s.bars, 5);
    assert.equal(five.length, 12);
    assert.equal(five[0].o, s.bars[0].o);
    assert.equal(five[0].c, s.bars[4].c);
    assert.equal(five[0].h, Math.max(...s.bars.slice(0, 5).map((b) => b.h)));
    assert.equal(five[0].l, Math.min(...s.bars.slice(0, 5).map((b) => b.l)));
  });

  test('resample(1) is the identity', () => {
    const s = loadSession({ symbol: 'MES', days: 1, seed: 3, barsPerDay: 10 });
    assert.deepEqual(resample(s.bars, 1), s.bars);
  });

  test('every instrument has the fields the engine needs', () => {
    for (const [k, i] of Object.entries(INSTRUMENTS)) {
      assert.equal(i.symbol, k);
      assert.ok(i.pointValue > 0, `${k} needs a pointValue`);
      assert.ok(i.tickSize > 0, `${k} needs a tickSize`);
      assert.ok(['futures', 'fx'].includes(i.assetClass));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ruleset integrity', () => {
  test('every preset is internally coherent', () => {
    for (const [id, rs] of Object.entries(RULESETS)) {
      assert.equal(rs.id, id);
      assert.ok(rs.accountSize > 0, `${id}: accountSize`);
      assert.ok(rs.profitTarget > 0, `${id}: profitTarget`);
      assert.ok(rs.maxLoss > 0 && rs.maxLoss < rs.accountSize, `${id}: maxLoss`);
      if (rs.dailyLoss !== null) {
        assert.ok(rs.dailyLoss <= rs.maxLoss, `${id}: daily loss must not exceed max loss`);
      }
      assert.ok(['static', 'trailing_intraday', 'trailing_eod', 'trailing_to_static'].includes(rs.maxLossType));
      if (rs.maxLossType === 'trailing_to_static') {
        assert.ok(rs.trailingLockAt !== null, `${id}: trailing_to_static needs a lock point`);
      }
      assert.ok(rs.minTradingDays >= 0);
      assert.ok(rs.maxContracts > 0);
      assert.ok(rs.dailyResetHour >= 0 && rs.dailyResetHour <= 23);
      assert.ok(rs.sourceUrl.startsWith('https://'), `${id}: must cite where the rules came from`);
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(rs.verifiedOn), `${id}: must record when it was verified`);
    }
  });

  test('presets are versioned so completed runs stay reproducible', () => {
    for (const rs of Object.values(RULESETS)) assert.ok(Number.isInteger(rs.version));
  });

  test('loadRuleSet returns an isolated copy', () => {
    const a = loadRuleSet('apex-50k');
    a.profitTarget = 1;
    assert.notEqual(loadRuleSet('apex-50k').profitTarget, 1);
  });

  test('unknown ruleset throws rather than silently defaulting', () => {
    assert.throws(() => loadRuleSet('nope'), /Unknown ruleset/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('end-to-end: a full run over generated data', () => {
  test('a mechanical strategy runs to a terminal state without throwing', () => {
    const rs = loadRuleSet('topstep-50k-combine');
    const session = loadSession({ symbol: 'MES', days: 8, seed: 'e2e', barsPerDay: 200 });
    let s = createAccount(rs, session.instrument, normalizeGuards({ maxTradesPerDay: 4 }));

    for (let i = 0; i < session.bars.length; i++) {
      const b = session.bars[i];
      s = applyBar(s, b);
      if (s.status !== 'active') break;
      if (i % 37 === 0 && !s.position) {
        const side = (i / 37) % 2 === 0 ? 'long' : 'short';
        const stop = side === 'long' ? b.c - 6 : b.c + 6;
        const target = side === 'long' ? b.c + 9 : b.c - 9;
        s = submitOrder(s, { type: 'market', side, size: 1, stop, target }, b,
          { inNewsWindow: inNewsWindow(session, b.t, rs.newsWindowMin) }).state;
      }
    }

    assert.ok(['active', 'passed', 'failed'].includes(s.status));
    assert.ok(s.timeline.length > 0);
    const h = hud(s);
    assert.ok(h.floorRoom !== undefined && Number.isFinite(h.equity));
    const { findings, metrics } = classify(s);
    assert.ok(Array.isArray(findings));
    assert.ok(metrics.trades === s.trades.length);
  });

  test('state is never mutated in place by an action', () => {
    const rs = loadRuleSet('apex-50k');
    const s0 = createAccount(rs, INST);
    const snapshot = JSON.stringify(s0);
    const s1 = applyBar(s0, bar(T0, 100));
    submitOrder(s1, { type: 'market', side: 'long', size: 1 }, bar(T0, 100));
    assert.equal(JSON.stringify(s0), snapshot, 'the original state must be untouched');
  });
});
