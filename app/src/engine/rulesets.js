/**
 * Firm rule presets.
 *
 * IMPORTANT — these are MODELS of publicly documented evaluation formats, used for
 * training. They are not affiliated with, endorsed by, or guaranteed to match any
 * firm's current terms. Firms change rules. `verifiedOn` records when the preset was
 * last checked against public documentation; `sourceUrl` is where to re-check.
 *
 * Every preset is versioned. A completed run stores the ruleset version it ran under,
 * so results stay reproducible even after a preset is updated.
 *
 * @typedef {'static'|'trailing_intraday'|'trailing_eod'|'trailing_to_static'} DrawdownType
 */

/**
 * @typedef {Object} RuleSet
 * @property {string} id
 * @property {number} version
 * @property {string} firm            Display name of the modelled firm
 * @property {string} label           Display name of the programme
 * @property {string} assetClass      'futures' | 'fx'
 * @property {number} accountSize     Starting balance in account currency
 * @property {number} profitTarget    Absolute $ needed above start to pass
 * @property {number} maxLoss         Absolute $ of total drawdown allowance
 * @property {DrawdownType} maxLossType
 * @property {number|null} trailingLockAt  For trailing_to_static: floor freezes once it
 *                                          reaches accountSize + this offset.
 * @property {number|null} dailyLoss  Absolute $ daily loss allowance (null = no rule)
 * @property {'balance'|'equity'} dailyLossBasis  What the day-start anchor is measured on
 * @property {boolean} equityBasedBreach  true = unrealized P&L can breach; false = realized only
 * @property {number} minTradingDays
 * @property {number|null} maxTradingDays  null = unlimited time
 * @property {number|null} consistency  Best day must be <= this fraction of total profit
 * @property {number} maxContracts    Max aggregate open position size
 * @property {boolean} newsRestricted  Block entries inside high-impact news windows
 * @property {number} newsWindowMin    Minutes either side of an event
 * @property {number} dailyResetHour   Hour (exchange local, 0-23) the trading day rolls
 * @property {string} sourceUrl
 * @property {string} verifiedOn
 * @property {string[]} notes
 */

const K = 1000;

/** @type {Record<string, RuleSet>} */
export const RULESETS = {
  'ftmo-100k-2step': {
    id: 'ftmo-100k-2step',
    version: 1,
    firm: 'FTMO-style',
    label: '2-Step Evaluation · $100k',
    assetClass: 'fx',
    accountSize: 100 * K,
    profitTarget: 10 * K,          // 10% phase 1
    maxLoss: 10 * K,               // 10% static
    maxLossType: 'static',
    trailingLockAt: null,
    dailyLoss: 5 * K,              // 5%
    dailyLossBasis: 'balance',
    equityBasedBreach: true,
    minTradingDays: 4,
    maxTradingDays: 30,
    consistency: null,
    maxContracts: 20,
    newsRestricted: false,
    newsWindowMin: 2,
    dailyResetHour: 0,
    sourceUrl: 'https://ftmo.com/en/trading-objectives/',
    verifiedOn: '2026-08-04',
    notes: [
      'Static max loss: the floor never moves from 90% of the starting balance.',
      'Daily loss anchors to the balance at the daily reset, and unrealized P&L counts.',
    ],
  },

  'topstep-50k-combine': {
    id: 'topstep-50k-combine',
    version: 1,
    firm: 'Topstep-style',
    label: 'Trading Combine · $50k',
    assetClass: 'futures',
    accountSize: 50 * K,
    profitTarget: 3 * K,
    maxLoss: 2 * K,
    maxLossType: 'trailing_eod',   // trails on end-of-day balance
    trailingLockAt: 0,             // stops trailing once floor reaches the start balance
    dailyLoss: 1 * K,
    dailyLossBasis: 'balance',
    equityBasedBreach: true,
    minTradingDays: 2,
    maxTradingDays: null,
    consistency: 0.50,
    maxContracts: 5,
    newsRestricted: false,
    newsWindowMin: 2,
    dailyResetHour: 17,            // CME session roll, 17:00 ET
    sourceUrl: 'https://www.topstep.com/our-program',
    verifiedOn: '2026-08-04',
    notes: [
      'End-of-day trailing: the floor only moves up at the session close, not intraday.',
      'The floor stops trailing once it reaches your starting balance.',
      'Consistency: your best day must not exceed 50% of total profit.',
    ],
  },

  'apex-50k': {
    id: 'apex-50k',
    version: 1,
    firm: 'Apex-style',
    label: 'Evaluation · $50k',
    assetClass: 'futures',
    accountSize: 50 * K,
    profitTarget: 3 * K,
    maxLoss: 2.5 * K,
    maxLossType: 'trailing_intraday',  // trails on unrealized peak, tick by tick
    trailingLockAt: 100,
    dailyLoss: null,                   // no daily loss limit
    dailyLossBasis: 'balance',
    equityBasedBreach: true,
    minTradingDays: 1,
    maxTradingDays: null,
    consistency: 0.30,
    maxContracts: 10,
    newsRestricted: false,
    newsWindowMin: 2,
    dailyResetHour: 17,
    sourceUrl: 'https://apextraderfunding.com/',
    verifiedOn: '2026-08-04',
    notes: [
      'Intraday trailing is the harshest drawdown type: the floor follows your peak',
      'UNREALIZED equity. Going +$800 then giving it back moves the floor up $800.',
      'No daily loss limit — the trailing floor is the only thing protecting you.',
    ],
  },

  'mff-50k-lock': {
    id: 'mff-50k-lock',
    version: 1,
    firm: 'MyFundedFutures-style',
    label: 'Starter · $50k',
    assetClass: 'futures',
    accountSize: 50 * K,
    profitTarget: 3 * K,
    maxLoss: 2 * K,
    maxLossType: 'trailing_to_static',
    trailingLockAt: 100,           // freezes at start + $100 once reached
    dailyLoss: 1.25 * K,
    dailyLossBasis: 'balance',
    equityBasedBreach: true,
    minTradingDays: 1,
    maxTradingDays: null,
    consistency: 0.40,
    maxContracts: 5,
    newsRestricted: false,
    newsWindowMin: 2,
    dailyResetHour: 17,
    sourceUrl: 'https://myfundedfutures.com/',
    verifiedOn: '2026-08-04',
    notes: [
      'Trails intraday until the floor reaches start + $100, then it locks permanently.',
      'Once locked you can never breach on drawdown while above the start balance.',
    ],
  },

  'fundednext-100k-1step': {
    id: 'fundednext-100k-1step',
    version: 1,
    firm: 'FundedNext-style',
    label: '1-Step Evaluation · $100k',
    assetClass: 'fx',
    accountSize: 100 * K,
    profitTarget: 10 * K,
    maxLoss: 6 * K,
    maxLossType: 'static',
    trailingLockAt: null,
    dailyLoss: 3 * K,
    dailyLossBasis: 'balance',
    equityBasedBreach: true,
    minTradingDays: 5,
    maxTradingDays: null,
    consistency: null,
    maxContracts: 20,
    newsRestricted: true,
    newsWindowMin: 2,
    dailyResetHour: 0,
    sourceUrl: 'https://fundednext.com/',
    verifiedOn: '2026-08-04',
    notes: [
      'One phase, but a tighter 6% max loss against a 10% target.',
      'News restriction: entries blocked +/-2 minutes around high-impact releases.',
    ],
  },

  'the5ers-hyper-20k': {
    id: 'the5ers-hyper-20k',
    version: 1,
    firm: 'The5ers-style',
    label: 'Hyper Growth · $20k',
    assetClass: 'fx',
    accountSize: 20 * K,
    profitTarget: 1.2 * K,         // 6%
    maxLoss: 1.2 * K,              // 6%
    maxLossType: 'static',
    trailingLockAt: null,
    dailyLoss: 0.6 * K,            // 3%
    dailyLossBasis: 'balance',
    equityBasedBreach: true,
    minTradingDays: 3,
    maxTradingDays: null,
    consistency: 0.50,
    maxContracts: 10,
    newsRestricted: false,
    newsWindowMin: 2,
    dailyResetHour: 0,
    sourceUrl: 'https://the5ers.com/',
    verifiedOn: '2026-08-04',
    notes: [
      'A 1:1 target-to-drawdown ratio. Mathematically the hardest ratio in this list.',
    ],
  },
};

export const RULESET_LIST = Object.values(RULESETS);

/** Clone a preset so a run can carry its own mutable copy. */
export function loadRuleSet(id) {
  const rs = RULESETS[id];
  if (!rs) throw new Error(`Unknown ruleset: ${id}`);
  return structuredClone(rs);
}

/** Human-readable rule list for the challenge setup screen. */
export function describeRules(rs) {
  const pct = (v) => `${((v / rs.accountSize) * 100).toFixed(1)}%`;
  const ddNames = {
    static: 'Static',
    trailing_intraday: 'Trailing (intraday, unrealized)',
    trailing_eod: 'Trailing (end of day)',
    trailing_to_static: 'Trailing, then locks',
  };
  const out = [
    { k: 'Profit target', v: `$${rs.profitTarget.toLocaleString()} (${pct(rs.profitTarget)})` },
    { k: 'Max loss', v: `$${rs.maxLoss.toLocaleString()} (${pct(rs.maxLoss)}) — ${ddNames[rs.maxLossType]}` },
    {
      k: 'Daily loss',
      v: rs.dailyLoss ? `$${rs.dailyLoss.toLocaleString()} (${pct(rs.dailyLoss)})` : 'No daily limit',
    },
    { k: 'Min trading days', v: String(rs.minTradingDays) },
    { k: 'Time limit', v: rs.maxTradingDays ? `${rs.maxTradingDays} days` : 'Unlimited' },
    { k: 'Consistency', v: rs.consistency ? `Best day <= ${rs.consistency * 100}% of total profit` : 'None' },
    { k: 'Max position', v: `${rs.maxContracts} contracts` },
    { k: 'News restriction', v: rs.newsRestricted ? `Blocked +/-${rs.newsWindowMin} min` : 'None' },
  ];
  return out;
}
