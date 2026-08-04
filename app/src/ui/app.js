/**
 * Challenge Ready — application controller.
 *
 * Deliberately a plain module with a small hand-rolled view layer: no framework, no build
 * step, no dependencies. `python3 -m http.server` and it runs. The engine is the asset;
 * the UI should stay cheap enough to rewrite.
 */

import { RULESET_LIST, loadRuleSet, describeRules } from '../engine/rulesets.js';
import { createAccount, applyBar, submitOrder, closePosition, hud } from '../engine/account.js';
import { classify, narrative } from '../engine/classify.js';
import { readinessScore, recommendation, COMPONENTS } from '../engine/score.js';
import { normalizeGuards, drillsFor, levelFor, xpForRun, DRILLS } from '../engine/training.js';
import { loadSession, resample, inNewsWindow, instrumentsFor } from '../data/market.js';
import { Chart, equityToPrice } from './chart.js';
import { renderCard, download } from './share.js';

// ── persistence ─────────────────────────────────────────────────────────────
const KEY = 'challenge-ready/v1';

function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupt or unavailable storage must never break the app */ }
  return { runs: [], xp: 0, streak: 0, lastDay: null, completedDrills: [] };
}

function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
}

/** Runs are stored slimmed down — the full timeline of a long run is large. */
function slimRun(a) {
  return {
    status: a.status, breach: a.breach, balance: a.balance, floor: a.floor,
    peakEquity: a.peakEquity, trades: a.trades, dayPnL: a.dayPnL,
    tradingDays: a.tradingDays, timeline: a.timeline.slice(-400),
    rs: a.rs, finishedAt: Date.now(),
  };
}

// ── app state ───────────────────────────────────────────────────────────────
const S = {
  view: 'setup',
  profile: loadProfile(),
  rulesetId: 'topstep-50k-combine',
  symbol: 'MES',
  guards: normalizeGuards({}),
  drill: null,
  session: null,
  account: null,
  cursor: 0,
  tf: 5,
  speed: 8,
  playing: false,
  timer: null,
  orderSize: 1,
  stopPts: 12,
  targetPts: 18,
  toast: null,
  toastTimer: null,
  lastResult: null,
};

const root = document.getElementById('app');
const $ = (sel, el = document) => el.querySelector(sel);
const money = (n, sign = false) => (sign && n > 0 ? '+' : n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function go(view) { S.view = view; stop(); render(); window.scrollTo(0, 0); }

function toast(msg, kind = '') {
  S.toast = { msg, kind };
  clearTimeout(S.toastTimer);
  S.toastTimer = setTimeout(() => { S.toast = null; paintToast(); }, 3800);
  paintToast();
}

function paintToast() {
  let el = $('#toast');
  if (!S.toast) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.className = `toast ${S.toast.kind}`;
  el.textContent = S.toast.msg;
}

// ── render ──────────────────────────────────────────────────────────────────
function render() {
  const lvl = levelFor(S.profile.xp);
  const score = readinessScore(S.profile.runs);

  root.innerHTML = `
    <div class="topbar">
      <div class="logo">Challenge<span> Ready</span></div>
      <div class="sim-badge">SIMULATED</div>
      <div class="spacer"></div>
      <nav>
        <button data-nav="setup"     class="${S.view === 'setup' ? 'on' : ''}">New run</button>
        <button data-nav="dashboard" class="${S.view === 'dashboard' ? 'on' : ''}">Dashboard</button>
      </nav>
      <div class="lvl">
        <b>L${lvl.level}</b> ${esc(lvl.name)}
        <span class="bar"><i style="width:${lvl.max ? 100 : Math.round((lvl.into / lvl.need) * 100)}%"></i></span>
        <span class="num">${S.profile.xp} XP</span>
      </div>
    </div>
    <main id="main"></main>`;

  root.querySelectorAll('[data-nav]').forEach((b) =>
    b.addEventListener('click', () => go(b.dataset.nav)));

  const main = $('#main');
  ({ setup: viewSetup, trade: viewTrade, autopsy: viewAutopsy, dashboard: viewDashboard }[S.view])(main, score);
  paintToast();
}

// ── SETUP ───────────────────────────────────────────────────────────────────
function viewSetup(main) {
  const rs = loadRuleSet(S.rulesetId);
  const instruments = instrumentsFor(rs.assetClass);
  if (!instruments.some((i) => i.symbol === S.symbol)) S.symbol = instruments[0].symbol;
  const hasRuns = S.profile.runs.length > 0;

  main.innerHTML = `
    <div class="wrap">
      ${hasRuns ? '' : `
      <div class="hero">
        <h1>93% of traders fail their first prop firm challenge.<br>Find out why before you pay to find out.</h1>
        <p class="sub">Practise under the exact rule set you are about to buy. When you breach, this
          tells you the specific behaviour that did it — not just that it happened.</p>
        <div class="stat-row">
          <div><b class="num">16.8%</b><small>Combines passed</small></div>
          <div><b class="num">51.8%</b><small>Traders funded eventually</small></div>
          <div><b class="num">33.3%</b><small>Funded who got paid</small></div>
          <div><b class="num neg">0.71%</b><small>Reached live capital</small></div>
        </div>
        <p class="src">Source: Topstep's own published Trading Combine statistics, Jan–Dec 2025.
          Every number in this product is sourced or labelled as an estimate.</p>
      </div>`}

      <h2 style="margin-bottom:12px">${hasRuns ? 'Start a run' : '1 · Pick the rule set you are training for'}</h2>
      <div class="firm-grid" style="margin-bottom:26px">
        ${RULESET_LIST.map((r) => `
          <button class="firm ${r.id === S.rulesetId ? 'on' : ''}" data-rs="${r.id}">
            <b>${esc(r.firm)}</b>
            <small>${esc(r.label)}</small>
            <div class="dd">${ddLabel(r.maxLossType)} · ${money(r.maxLoss)} DD · ${money(r.profitTarget)} target</div>
          </button>`).join('')}
      </div>

      <div class="grid g2" style="margin-bottom:22px">
        <div class="card">
          <h3 style="margin-bottom:10px">The rules you will be trading under</h3>
          <table class="rules-table">
            ${describeRules(rs).map((r) => `<tr><td>${esc(r.k)}</td><td>${esc(r.v)}</td></tr>`).join('')}
          </table>
          <p class="src" style="margin-top:12px">
            Modelled from public documentation, last checked ${rs.verifiedOn}.
            <a href="${rs.sourceUrl}" target="_blank" rel="noopener">Verify current terms →</a>
          </p>
        </div>

        <div class="card">
          <h3 style="margin-bottom:10px">What usually kills this one</h3>
          ${rs.notes.map((n) => `<div class="note" style="margin-bottom:8px">${esc(n)}</div>`).join('')}
          <div class="field" style="border-top:1px solid var(--line);margin-top:12px">
            <label>Instrument</label>
            <select id="sym" style="width:auto">
              ${instruments.map((i) => `<option value="${i.symbol}" ${i.symbol === S.symbol ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:22px">
        <h3>Guardrails — your own limits, enforced by the engine</h3>
        <p style="font-size:13px;margin:6px 0 4px">
          Set these while you are calm. Once the run starts they cannot be loosened. This is the
          only mechanism here that works on the behaviour that actually ends most challenges.
        </p>
        <div class="grid g3" style="margin-top:8px">
          <div class="field">
            <label>Max trades / day<small>Blank = no limit</small></label>
            <input id="g-cap" type="number" min="0" value="${S.guards.maxTradesPerDay ?? ''}">
          </div>
          <div class="field">
            <label>Cooldown after N losses<small>Blocks entries for 15 min</small></label>
            <input id="g-cool" type="number" min="0" value="${S.guards.cooldownAfterLosses ?? ''}">
          </div>
          <div class="field">
            <label>Session hours (UTC)<small>e.g. 13 to 16</small></label>
            <span style="display:flex;gap:6px">
              <input id="g-s" type="number" min="0" max="23" style="width:56px" value="${S.guards.sessionStartHour ?? ''}">
              <input id="g-e" type="number" min="0" max="23" style="width:56px" value="${S.guards.sessionEndHour ?? ''}">
            </span>
          </div>
        </div>
      </div>

      ${S.drill ? `<div class="card" style="margin-bottom:22px;border-color:var(--teal)">
        <h3 style="color:var(--teal)">Drill loaded · ${esc(S.drill.name)}</h3>
        <p style="margin-top:6px">${esc(S.drill.goal)}</p>
        <button class="btn sm" id="clear-drill" style="margin-top:10px">Remove drill</button>
      </div>` : ''}

      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn primary big" id="start">Start the run →</button>
        <span style="font-size:12.5px;color:var(--dim)">
          Synthetic market data, deterministic seed. No real money, no real market data, no account required.
        </span>
      </div>
    </div>
    ${footer()}`;

  main.querySelectorAll('[data-rs]').forEach((b) =>
    b.addEventListener('click', () => { S.rulesetId = b.dataset.rs; render(); }));
  $('#sym', main).addEventListener('change', (e) => { S.symbol = e.target.value; });
  $('#clear-drill', main)?.addEventListener('click', () => { S.drill = null; render(); });
  $('#start', main).addEventListener('click', startRun);
}

function readGuards(main) {
  return normalizeGuards({
    maxTradesPerDay: $('#g-cap', main)?.value,
    cooldownAfterLosses: $('#g-cool', main)?.value,
    cooldownMinutes: 15,
    sessionStartHour: $('#g-s', main)?.value,
    sessionEndHour: $('#g-e', main)?.value,
  });
}

function startRun() {
  const main = $('#main');
  S.guards = readGuards(main);
  if (S.drill?.guards) S.guards = normalizeGuards({ ...S.guards, ...S.drill.guards });

  const rs = loadRuleSet(S.rulesetId);
  // Seed from the ruleset + attempt number so every run is a fresh but reproducible market.
  const seed = `${S.rulesetId}|${S.symbol}|${S.profile.runs.length}`;
  S.session = loadSession({
    symbol: S.symbol,
    days: rs.maxTradingDays ? Math.min(rs.maxTradingDays, 14) : 10,
    seed,
    barsPerDay: 300,
  });
  S.account = createAccount(rs, S.session.instrument, S.guards);
  // Warm up with enough history that the chart is populated on the first frame — an empty
  // chart on the most important screen reads as a broken product.
  S.cursor = 260;
  for (let i = 0; i < S.cursor; i++) S.account = applyBar(S.account, S.session.bars[i]);
  S.playing = false;
  go('trade');
  play();
}

// ── TRADE ───────────────────────────────────────────────────────────────────
let chart = null;

function viewTrade(main) {
  main.innerHTML = `
    <div class="trade-shell">
      <div class="hud" id="hud"></div>
      <div class="chart-area">
        <canvas id="cv"></canvas>
        <div class="chart-overlay" id="ov"></div>
        <div class="ticker" id="tk"></div>
      </div>
      <div class="pos-strip" id="ps"></div>
      <div class="order-bar">
        <div class="grp">
          <label>Size</label>
          <input id="o-size" type="number" min="1" value="${S.orderSize}" ${S.drill?.lockSize ? 'disabled' : ''}>
        </div>
        <div class="grp"><label>Stop pts</label><input id="o-stop" type="number" min="0" value="${S.stopPts}"></div>
        <div class="grp"><label>Target pts</label><input id="o-tgt" type="number" min="0" value="${S.targetPts}"></div>
        <div class="sep"></div>
        <button class="btn sm buy"  id="b-buy">Buy</button>
        <button class="btn sm sell" id="b-sell">Sell</button>
        <button class="btn sm flat" id="b-flat">Flatten</button>
        <div class="sep"></div>
        <div class="speed">
          ${[1, 4, 8, 25, 100].map((s) => `<button data-sp="${s}" class="${S.speed === s ? 'on' : ''}">${s}×</button>`).join('')}
        </div>
        <button class="btn sm" id="b-play">${S.playing ? '❚❚ Pause' : '▶ Play'}</button>
        <div class="sep"></div>
        <div class="speed">
          ${[1, 5, 15].map((t) => `<button data-tf="${t}" class="${S.tf === t ? 'on' : ''}">${t}m</button>`).join('')}
        </div>
        <div class="spacer" style="flex:1"></div>
        <button class="btn sm danger" id="b-end">End run</button>
      </div>
    </div>`;

  chart = new Chart($('#cv', main));

  $('#b-buy', main).addEventListener('click', () => order('long'));
  $('#b-sell', main).addEventListener('click', () => order('short'));
  $('#b-flat', main).addEventListener('click', flatten);
  $('#b-play', main).addEventListener('click', () => (S.playing ? stop(true) : play()));
  $('#b-end', main).addEventListener('click', () => finish('ended'));
  main.querySelectorAll('[data-sp]').forEach((b) => b.addEventListener('click', () => {
    S.speed = +b.dataset.sp; if (S.playing) { stop(); play(); } else render();
  }));
  main.querySelectorAll('[data-tf]').forEach((b) => b.addEventListener('click', () => {
    S.tf = +b.dataset.tf; paintTrade();
  }));
  ['o-size', 'o-stop', 'o-tgt'].forEach((id) => $('#' + id, main).addEventListener('change', (e) => {
    const v = Math.max(0, +e.target.value || 0);
    if (id === 'o-size') S.orderSize = Math.max(1, v); else if (id === 'o-stop') S.stopPts = v; else S.targetPts = v;
  }));

  document.onkeydown = (e) => {
    if (S.view !== 'trade' || e.target.tagName === 'INPUT') return;
    if (e.key === 'b') order('long');
    if (e.key === 's') order('short');
    if (e.key === 'f') flatten();
    if (e.key === ' ') { e.preventDefault(); S.playing ? stop(true) : play(); }
  };

  paintTrade();
}

function play() {
  if (S.playing) return;
  S.playing = true;
  const tick = () => {
    if (!S.playing) return;
    step();
    if (S.playing) S.timer = setTimeout(tick, Math.max(12, 420 / S.speed));
  };
  S.timer = setTimeout(tick, 200);
  const b = $('#b-play'); if (b) b.textContent = '❚❚ Pause';
}

function stop(repaint = false) {
  S.playing = false;
  clearTimeout(S.timer);
  const b = $('#b-play'); if (b) b.textContent = '▶ Play';
  if (repaint) paintTrade();
}

function step() {
  if (S.cursor >= S.session.bars.length - 1) { finish('out_of_data'); return; }
  S.account = applyBar(S.account, S.session.bars[S.cursor]);
  S.cursor++;
  if (S.account.status !== 'active') { finish(S.account.status); return; }
  paintTrade();
}

function order(side) {
  if (!S.account || S.account.status !== 'active') return;
  const bar = S.session.bars[S.cursor - 1];
  const size = S.drill?.lockSize ? 1 : S.orderSize;
  const o = { type: 'market', side, size };
  if (S.stopPts > 0)   o.stop   = side === 'long' ? bar.c - S.stopPts : bar.c + S.stopPts;
  if (S.targetPts > 0) o.target = side === 'long' ? bar.c + S.targetPts : bar.c - S.targetPts;

  const r = submitOrder(S.account, o, bar, {
    inNewsWindow: inNewsWindow(S.session, bar.t, S.account.rs.newsWindowMin),
  });
  S.account = r.state;
  if (r.rejected) {
    const isGuard = String(r.rejected).startsWith('GUARD');
    toast(r.message || 'Order rejected', isGuard ? 'guard' : 'block');
  }
  paintTrade();
}

function flatten() {
  if (!S.account?.position) return;
  const bar = S.session.bars[S.cursor - 1];
  S.account = closePosition(S.account, bar.c).state;
  if (S.account.status !== 'active') { finish(S.account.status); return; }
  paintTrade();
}

function paintTrade() {
  if (S.view !== 'trade' || !S.account) return;
  const a = S.account;
  const h = hud(a);
  const bar = S.session.bars[S.cursor - 1];

  // HUD — order is fixed and it never scrolls or collapses.
  const cells = [
    cell('Equity', money(h.equity), null, `Bal ${money(h.balance)}`),
    cell('Daily limit', h.dailyRoom === null ? '—' : money(h.dailyRoom) + ' left',
         h.dailyPct, h.dailyFloor === null ? 'No daily rule' : `Floor ${money(h.dailyFloor)}`),
    cell('Max loss floor', money(h.floorRoom) + ' left', h.floorPct,
         `${money(h.floor)}${h.floorLocked ? ' · LOCKED' : ddArrow(a.rs.maxLossType)}`),
    cell('Target', money(h.profit) + ' / ' + money(h.target), h.targetPct, `${Math.round(h.targetPct * 100)}%`, true),
    cell('Day', `${h.day}${h.maxDays ? ' / ' + h.maxDays : ''}`, null,
         `${h.tradingDays}/${h.minTradingDays} trading days`),
    cell('Trades today', `${h.tradesToday}${h.tradeCap !== null ? ' / ' + h.tradeCap : ''}`, null,
         h.consistencyPct !== null ? `Best day ${Math.round(h.consistencyPct * 100)}%` : 'No consistency rule'),
  ];
  $('#hud').innerHTML = cells.join('');

  // Chart
  const visible = 190;
  const from = Math.max(0, S.cursor - visible * S.tf);
  const bars = resample(S.session.bars.slice(from, S.cursor), S.tf);

  const levels = [];
  if (a.position) {
    const pv = a.instrument.pointValue;
    const fp = equityToPrice(a.position, bar.c, pv, a.balance, a.floor);
    if (fp !== null && Number.isFinite(fp)) levels.push({ price: fp, color: '#FF4757', label: 'FLOOR', dashed: false, bold: true, inRangeOnly: true });
    if (a.dailyFloor !== null) {
      const dp = equityToPrice(a.position, bar.c, pv, a.balance, a.dailyFloor);
      if (dp !== null && Number.isFinite(dp)) levels.push({ price: dp, color: '#FFB020', label: 'DAILY', dashed: true, inRangeOnly: true });
    }
  }
  chart.set({
    bars, position: a.position, levels, trades: a.trades.slice(-24),
    news: S.session.news, digits: a.instrument.digits, tf: S.tf,
  });

  const upl = a.position
    ? (bar.c - a.position.entryPrice) * (a.position.side === 'long' ? 1 : -1) * a.position.size * a.instrument.pointValue
    : 0;

  $('#ov').innerHTML = `${esc(a.instrument.name)} · ${S.tf}m<br>
    <span style="color:#5D6B78">synthetic seed ${esc(S.session.seed)}</span>`;
  $('#tk').innerHTML = `${bar.c.toFixed(a.instrument.digits)}<br>
    <span style="color:#5D6B78">${new Date(bar.t).toISOString().slice(0, 16).replace('T', ' ')}</span>`;

  const warn = h.warnings.filter((w) => w.code !== 'CONSISTENCY_BLOCK');
  const cd = h.cooldownUntil && bar.t < h.cooldownUntil
    ? `<span class="warn">COOLDOWN ${Math.ceil((h.cooldownUntil - bar.t) / 60000)}m</span>` : '';
  $('#ps').innerHTML = a.position
    ? `<span class="${a.position.side === 'long' ? 'pos' : ''}" style="color:${a.position.side === 'long' ? 'var(--teal)' : 'var(--blue)'}">
         ${a.position.side.toUpperCase()} ${a.position.size} @ ${a.position.entryPrice.toFixed(a.instrument.digits)}</span>
       <span class="${upl >= 0 ? 'pos' : 'neg'}">${money(upl, true)} open</span>
       ${a.position.stop ? `<span style="color:var(--dim)">SL ${a.position.stop.toFixed(a.instrument.digits)}</span>` : ''}
       ${a.position.target ? `<span style="color:var(--dim)">TP ${a.position.target.toFixed(a.instrument.digits)}</span>` : ''}
       ${cd}
       ${warn.map((w) => `<span class="${w.sev === 2 ? 'neg' : 'warn'}">${esc(w.msg)}</span>`).join('')}`
    : `<span style="color:var(--dim)">Flat</span> ${cd}
       ${warn.map((w) => `<span class="${w.sev === 2 ? 'neg' : 'warn'}">${esc(w.msg)}</span>`).join('')}`;
}

function cell(k, v, pct, sub, invert = false) {
  let cls = '';
  if (pct !== null && pct !== undefined) {
    // For headroom meters low is bad; for the target meter low is just early.
    if (!invert) cls = pct <= 0.15 ? 'red' : pct <= 0.3 ? 'amber' : '';
  }
  const width = pct === null || pct === undefined ? null : Math.round(pct * 100);
  return `<div class="cell ${cls}">
    <div class="k">${esc(k)}</div>
    <div class="v">${esc(v)}</div>
    ${width === null ? `<small>${esc(sub || '')}</small>`
      : `<div class="meter"><i style="width:${width}%"></i></div><small>${esc(sub || '')}</small>`}
  </div>`;
}

const ddArrow = (t) => (t === 'static' ? ' · fixed' : ' · trailing');
const ddLabel = (t) => ({
  static: 'Static DD', trailing_intraday: 'Intraday trailing',
  trailing_eod: 'EOD trailing', trailing_to_static: 'Trailing→lock',
}[t]);

// ── finish + autopsy ────────────────────────────────────────────────────────
function finish() {
  stop();
  // A run that neither passed nor breached still terminates — record it as 'ended' rather
  // than leaving it 'active', or it will never be scored and the dashboard has nothing to show.
  if (S.account.status === 'active') S.account = { ...S.account, status: 'ended' };
  const a = S.account;
  const { findings, primary, metrics } = classify(a);
  const { xp, notes } = xpForRun(a, findings);

  const profile = { ...S.profile };
  profile.runs = [...profile.runs, slimRun(a)].slice(-40);
  profile.xp += xp;
  const today = new Date().toISOString().slice(0, 10);
  if (profile.lastDay !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    profile.streak = profile.lastDay === yesterday ? profile.streak + 1 : 1;
    profile.lastDay = today;
  }
  S.profile = profile;
  saveProfile(profile);

  S.lastResult = { findings, primary, metrics, xp, notes, drills: drillsFor(findings) };
  go('autopsy');
}

function viewAutopsy(main, score) {
  const a = S.account;
  const { findings, primary, xp, notes, drills } = S.lastResult;
  const passed = a.status === 'passed';
  const events = narrative(a, 14);
  const profit = a.balance - a.rs.accountSize;

  main.innerHTML = `
    <div class="wrap">
      <div class="verdict ${passed ? 'pass' : 'fail'}">
        <div class="tag">${passed ? 'CHALLENGE PASSED' : a.breach ? 'CHALLENGE FAILED' : 'RUN ENDED'} · SIMULATED</div>
        <h1>${passed ? `Passed in ${a.tradingDays.length} trading days`
            : a.breach ? esc(a.breach.detail) : 'You ended the run early'}</h1>
        <p>${esc(a.rs.firm)} · ${esc(a.rs.label)} · result ${money(profit, true)} over ${a.trades.length} trades</p>
      </div>

      ${primary && !passed ? `
      <div class="card" style="margin-bottom:16px;border-color:rgba(255,71,87,.35)">
        <div class="finding" style="border:none;padding:0;margin:0">
          <div class="code">PRIMARY PATTERN · ${esc(primary.code)}</div>
          <h4 style="font-size:22px">${esc(primary.name)}</h4>
          <div class="stat">${esc(primary.stat)}</div>
          <p>${esc(primary.detail)}</p>
        </div>
      </div>` : ''}

      <div class="grid g2" style="margin-bottom:16px">
        <div class="card">
          <h3 style="margin-bottom:10px">What actually happened</h3>
          <div class="timeline">
            ${events.map((e) => `<div class="row ${e.kind}">
              <span class="t">${esc(e.time)}</span><span class="x">${esc(e.text)}</span></div>`).join('')}
          </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:10px">Everything we found</h3>
          ${findings.length ? findings.map((f) => `
            <div class="finding sev${f.severity >= 4 ? 3 : f.severity >= 2 ? 2 : 1}">
              <div class="code">${esc(f.code)}</div>
              <h4>${esc(f.name)}</h4>
              <div class="stat">${esc(f.stat)}</div>
              <p>${esc(f.detail)}</p>
              ${f.evidence?.length ? `<ul>${f.evidence.map((e) => `<li>${esc(e.text)}</li>`).join('')}</ul>` : ''}
            </div>`).join('')
            : `<p>No behavioural patterns flagged in this run. That is a good sign, and it is also
               only one run — the score weights recent runs, so do it again.</p>`}
        </div>
      </div>

      <div class="grid g2" style="margin-bottom:16px">
        <div class="card">
          <h3 style="margin-bottom:10px">Your drills</h3>
          ${drills.map((d, i) => `
            <div class="drill">
              <div class="n">${i + 1}</div>
              <div>
                <b>${esc(d.name)}</b>
                <div class="goal">${esc(d.goal)}</div>
                <div class="why">${esc(d.why)}</div>
                <button class="btn sm" data-drill="${d.id}" style="margin-top:8px">Load this drill →</button>
              </div>
            </div>`).join('')}
        </div>

        <div class="card">
          <h3 style="margin-bottom:10px">XP earned · +${xp}</h3>
          <div class="timeline">
            ${notes.map((n) => `<div class="row"><span class="t num">+${n.n}</span><span class="x">${esc(n.why)}</span></div>`).join('')}
          </div>
          <p class="src" style="margin-top:12px">
            XP is awarded for process, never for profit. A bigger winner earns exactly the same
            as a small one — rewarding P&amp;L would train gambling.
          </p>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <h3 style="margin-bottom:12px">Share this</h3>
        <div id="card-host" style="margin-bottom:12px"></div>
        <button class="btn" id="dl">Download the card</button>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn primary" id="again">Run it again →</button>
        <button class="btn" id="dash">See my readiness score</button>
      </div>
    </div>
    ${footer()}`;

  const cv = renderCard(a, { primary, score: score.score, grade: score.grade });
  cv.className = 'share-card';
  cv.style.width = '100%';
  $('#card-host', main).appendChild(cv);
  $('#dl', main).addEventListener('click', () => download(cv, `challenge-ready-${a.status}.png`));

  main.querySelectorAll('[data-drill]').forEach((b) => b.addEventListener('click', () => {
    S.drill = DRILLS.find((d) => d.id === b.dataset.drill);
    toast(`Drill loaded: ${S.drill.name}`, 'guard');
    go('setup');
  }));
  $('#again', main).addEventListener('click', startRun);
  $('#dash', main).addEventListener('click', () => go('dashboard'));
}

// ── DASHBOARD ───────────────────────────────────────────────────────────────
function viewDashboard(main, score) {
  const runs = S.profile.runs;
  if (!runs.length || !score.components) {
    main.innerHTML = `<div class="wrap narrow"><div class="card empty">
      <h2>Unscored</h2>
      <p>You haven't been tested yet. One 15-minute run will tell you more about your trading
         than fifteen videos will.</p>
      <button class="btn primary" id="go">Run the diagnostic →</button>
    </div></div>${footer()}`;
    $('#go', main).addEventListener('click', () => go('setup'));
    return;
  }

  const rec = recommendation(score.score, score.runs);
  const lvl = levelFor(S.profile.xp);
  const passes = runs.filter((r) => r.status === 'passed').length;

  main.innerHTML = `
    <div class="wrap">
      <div class="grid g2" style="margin-bottom:16px">
        <div class="card">
          <div class="score-hero">
            ${dial(score.score, score.grade)}
            <div style="flex:1;min-width:200px">
              <h2>Readiness Score</h2>
              <p style="font-size:13px">${esc(score.disclosure)}</p>
              <div style="margin-top:12px;display:flex;gap:18px;font-size:13px">
                <span><b class="num">${runs.length}</b> <span style="color:var(--dim)">runs</span></span>
                <span><b class="num">${passes}</b> <span style="color:var(--dim)">passed</span></span>
                <span><b class="num">${S.profile.streak}</b> <span style="color:var(--dim)">day streak</span></span>
              </div>
            </div>
          </div>
          <div class="rec ${rec.level}" style="margin-top:16px">${esc(rec.text)}</div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:12px">Components</h3>
          ${COMPONENTS.map((c) => {
            const v = Math.round(score.components[c.key]);
            const col = v >= 75 ? 'var(--teal)' : v >= 50 ? 'var(--amber)' : 'var(--red)';
            return `<div class="comp">
              <div class="top"><span>${esc(c.label)}</span><b class="num">${v}</b></div>
              <div class="track"><i style="width:${v}%;background:${col}"></i></div>
              <div style="font-size:11.5px;color:var(--dim);margin-top:3px">${esc(c.blurb)}</div>
            </div>`;
          }).join('')}
          ${score.weakest ? `<div class="note" style="margin-top:12px">
            Weakest component: <b style="color:var(--fg)">${esc(score.weakest.label)}</b>. Fix this one first —
            it carries ${Math.round(score.weakest.weight * 100)}% of the score.</div>` : ''}
        </div>
      </div>

      <div class="grid g2" style="margin-bottom:16px">
        <div class="card">
          <h3 style="margin-bottom:12px">Progression</h3>
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px">
            <b style="font-size:26px">L${lvl.level}</b>
            <span style="font-size:16px">${esc(lvl.name)}</span>
          </div>
          <div class="comp"><div class="track">
            <i style="width:${lvl.max ? 100 : Math.round((lvl.into / lvl.need) * 100)}%;background:var(--teal)"></i>
          </div></div>
          <div style="font-size:12.5px;color:var(--dim);margin-top:6px">
            ${lvl.max ? 'Max level' : `${lvl.need - lvl.into} XP to level ${lvl.level + 1}`}
          </div>
          <div class="note" style="margin-top:14px">
            Level 7 is "Challenge Ready" and it is deliberately hard to reach. A badge that is
            easy to get is a badge nobody respects.
          </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:12px">Available drills</h3>
          <div style="max-height:230px;overflow:auto">
            ${DRILLS.slice(0, 6).map((d) => `
              <div class="drill">
                <div class="n">${esc(d.forMode)}</div>
                <div style="flex:1">
                  <b>${esc(d.name)}</b>
                  <div class="goal">${esc(d.goal)}</div>
                </div>
                <button class="btn sm" data-drill="${d.id}">Load</button>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-bottom:12px">Run history</h3>
        <table class="hist">
          <tr><th>#</th><th>Ruleset</th><th>Result</th><th>P&amp;L</th><th>Trades</th><th>Days</th><th>Cause</th></tr>
          ${runs.slice().reverse().map((r, i) => {
            const p = r.balance - r.rs.accountSize;
            return `<tr>
              <td>${runs.length - i}</td>
              <td>${esc(r.rs.firm)}</td>
              <td class="${r.status === 'passed' ? 'pos' : r.status === 'failed' ? 'neg' : ''}">${esc(r.status)}</td>
              <td class="${p >= 0 ? 'pos' : 'neg'}">${money(p, true)}</td>
              <td>${r.trades.length}</td>
              <td>${r.tradingDays.length}</td>
              <td style="color:var(--dim)">${r.breach ? esc(r.breach.code) : '—'}</td>
            </tr>`;
          }).join('')}
        </table>
      </div>

      <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
        <button class="btn primary" id="new">New run →</button>
        <button class="btn danger" id="reset">Reset all my data</button>
      </div>
    </div>
    ${footer()}`;

  main.querySelectorAll('[data-drill]').forEach((b) => b.addEventListener('click', () => {
    S.drill = DRILLS.find((d) => d.id === b.dataset.drill);
    toast(`Drill loaded: ${S.drill.name}`, 'guard');
    go('setup');
  }));
  $('#new', main).addEventListener('click', () => go('setup'));
  $('#reset', main).addEventListener('click', () => {
    if (!confirm('Delete every run, your XP and your streak? This cannot be undone.')) return;
    S.profile = { runs: [], xp: 0, streak: 0, lastDay: null, completedDrills: [] };
    saveProfile(S.profile);
    go('dashboard');
  });
}

function dial(score, grade) {
  const r = 56, c = 2 * Math.PI * r;
  const pct = (score ?? 0) / 100;
  const col = score >= 75 ? '#00C9A7' : score >= 50 ? '#FFB020' : '#FF4757';
  return `<div class="dial">
    <svg width="132" height="132" viewBox="0 0 132 132">
      <circle cx="66" cy="66" r="${r}" fill="none" stroke="#171E26" stroke-width="10"/>
      <circle cx="66" cy="66" r="${r}" fill="none" stroke="${col}" stroke-width="10"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"
        transform="rotate(-90 66 66)"/>
    </svg>
    <div class="g"><b style="color:${col}">${score ?? '—'}</b><small>GRADE ${grade ?? '—'}</small></div>
  </div>`;
}

function footer() {
  return `<footer>
    Simulated trading on synthetic data. Nothing here is real market data, a real trading record,
    a prediction, or financial advice. Rule sets are models of publicly documented evaluation
    formats and are not affiliated with any firm — always verify current terms with the firm itself.
  </footer>`;
}

render();
