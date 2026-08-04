/**
 * Challenge Ready — application controller.
 *
 * Two grounds, per the identity in styles.css: the cockpit (trading) is an instrument
 * panel, everything else is a printed report on paper. View functions that render into
 * `.paper > .sheet` belong to the report world; `viewTrade` is the only cockpit view.
 *
 * Deliberately a plain module with a small hand-rolled view layer: no framework, no build
 * step, no runtime dependencies. The engine is the asset; the UI should stay cheap to redo.
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
const money = (n, sign = false) =>
  (sign && n > 0 ? '+' : n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function go(view) { S.view = view; stop(); render(); window.scrollTo(0, 0); }

function toast(msg, kind = '') {
  S.toast = { msg, kind };
  clearTimeout(S.toastTimer);
  S.toastTimer = setTimeout(() => { S.toast = null; paintToast(); }, 4200);
  paintToast();
}

function paintToast() {
  let el = $('#toast');
  if (!S.toast) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.className = `toast ${S.toast.kind}`;
  el.textContent = S.toast.msg;
}

// ── shell ───────────────────────────────────────────────────────────────────
function render() {
  const lvl = levelFor(S.profile.xp);
  const score = readinessScore(S.profile.runs);

  root.innerHTML = `
    <div class="topbar">
      <div class="logo">Challenge<span>/</span>Ready</div>
      <div class="sim-badge">SIMULATED</div>
      <div class="spacer"></div>
      <nav>
        <button data-nav="setup"     class="${S.view === 'setup' ? 'on' : ''}">New run</button>
        <button data-nav="dashboard" class="${S.view === 'dashboard' ? 'on' : ''}">Record</button>
      </nav>
      <div class="lvl">
        <b>L${lvl.level}</b>
        <span class="lname">${esc(lvl.name)}</span>
        <span class="bar"><i style="width:${lvl.max ? 100 : Math.round((lvl.into / lvl.need) * 100)}%"></i></span>
        <span class="num">${S.profile.xp}&thinsp;XP</span>
      </div>
    </div>
    <main id="main"></main>`;

  root.querySelectorAll('[data-nav]').forEach((b) =>
    b.addEventListener('click', () => go(b.dataset.nav)));

  const main = $('#main');
  ({ setup: viewSetup, trade: viewTrade, autopsy: viewAutopsy, dashboard: viewDashboard }[S.view])(main, score);
  paintToast();
}

// ═══ SETUP — report ground ══════════════════════════════════════════════════
function viewSetup(main) {
  const rs = loadRuleSet(S.rulesetId);
  const instruments = instrumentsFor(rs.assetClass);
  if (!instruments.some((i) => i.symbol === S.symbol)) S.symbol = instruments[0].symbol;
  const returning = S.profile.runs.length > 0;

  main.innerHTML = `<div class="paper"><div class="sheet">

    ${returning ? '' : `
    <div class="masthead">
      <div>
        <div class="lbl kicker">Pre-evaluation training</div>
        <h1>Find out what ends your challenge before it costs you $500 to find out.</h1>
        <p>Trade a real firm's rule set against the clock. When you breach, this tells you
           the specific behaviour that did it — not just that it happened.</p>
      </div>
      <div>
        <table class="figures">
          <caption>What the funnel actually looks like</caption>
          <tbody>
            <tr><td>16.8%</td><td>of Trading Combines are completed successfully</td></tr>
            <tr><td>51.8%</td><td>of participants reach Funded in at least one attempt</td></tr>
            <tr><td>33.3%</td><td>of funded participants ever receive a payout</td></tr>
            <tr class="low"><td>0.71%</td><td>of Express-Funded traders reach live capital</td></tr>
          </tbody>
        </table>
        <p class="src">
          Topstep's own published Trading Combine statistics, January–December 2025. Every figure
          in this product is either sourced or explicitly labelled an estimate.
        </p>
      </div>
    </div>`}

    <div class="band">
      <span class="lbl">${returning ? 'Select programme' : 'I · Select programme'}</span>
      <span class="rest">6 rule sets</span>
    </div>
    <div class="firm-grid">
      ${RULESET_LIST.map((r) => `
        <button class="firm ${r.id === S.rulesetId ? 'on' : ''}" data-rs="${r.id}">
          <b>${esc(r.firm)}</b>
          <span class="prog">${esc(r.label)}</span>
          <span class="dd"><em>${ddLabel(r.maxLossType)}</em> · ${money(r.maxLoss)} DD · ${money(r.profitTarget)} target</span>
        </button>`).join('')}
    </div>

    <div class="cols c-wide" style="margin-top:44px">
      <div>
        <div class="band">
          <span class="lbl">II · Specification</span>
          <span class="rest">${esc(rs.firm)} · ${esc(rs.label)}</span>
        </div>
        <table class="rules-table">
          ${describeRules(rs).map((r) => `<tr><td>${esc(r.k)}</td><td>${esc(r.v)}</td></tr>`).join('')}
        </table>
        <p class="src">
          Modelled from public documentation, last checked ${esc(rs.verifiedOn)}. Not affiliated with
          any firm. <a href="${esc(rs.sourceUrl)}" target="_blank" rel="noopener">Verify current terms&nbsp;→</a>
        </p>
      </div>

      <div>
        <div class="band"><span class="lbl">What ends this one</span></div>
        ${rs.notes.map((n) => `<div class="note">${esc(n)}</div>`).join('')}
        <div class="field" style="margin-top:20px">
          <label>Instrument</label>
          <select id="sym" style="width:auto">
            ${instruments.map((i) => `<option value="${i.symbol}" ${i.symbol === S.symbol ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <div style="margin-top:44px">
      <div class="band">
        <span class="lbl">III · Guardrails</span>
        <span class="rest">enforced by the engine, not the interface</span>
      </div>
      <p style="margin-bottom:18px">
        Set these now, while you are calm. Once the run starts they cannot be loosened. This is the
        only mechanism here that acts on the behaviour that actually ends most challenges.
      </p>
      <div class="cols c3">
        <div class="field">
          <label>Max trades per day<small>Blank for no limit</small></label>
          <input id="g-cap" type="number" min="0" value="${S.guards.maxTradesPerDay ?? ''}">
        </div>
        <div class="field">
          <label>Cooldown after N losses<small>Blocks entries for 15 minutes</small></label>
          <input id="g-cool" type="number" min="0" value="${S.guards.cooldownAfterLosses ?? ''}">
        </div>
        <div class="field">
          <label>Session hours<small>UTC, e.g. 13 to 16</small></label>
          <span class="pair">
            <input id="g-s" type="number" min="0" max="23" value="${S.guards.sessionStartHour ?? ''}">
            <input id="g-e" type="number" min="0" max="23" value="${S.guards.sessionEndHour ?? ''}">
          </span>
        </div>
      </div>
    </div>

    ${S.drill ? `
    <div style="margin-top:40px">
      <div class="band"><span class="lbl" style="color:var(--ultra)">Drill loaded</span></div>
      <div class="cols c2">
        <div>
          <h2 style="margin-bottom:6px">${esc(S.drill.name)}</h2>
          <p>${esc(S.drill.goal)}</p>
        </div>
        <div style="align-self:end"><button class="btn sm quiet" id="clear-drill">Remove drill</button></div>
      </div>
    </div>` : ''}

    <div class="actions">
      <button class="btn primary big" id="start">Begin run</button>
      <span class="caption">Synthetic market data on a fixed seed. No real money, no real market
        data, no account needed.</span>
    </div>

    ${colophon()}
  </div></div>`;

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
  // Seed from the ruleset + attempt number: a fresh but reproducible market each run.
  const seed = `${S.rulesetId}|${S.symbol}|${S.profile.runs.length}`;
  S.session = loadSession({
    symbol: S.symbol,
    days: rs.maxTradingDays ? Math.min(rs.maxTradingDays, 14) : 10,
    seed,
    barsPerDay: 300,
  });
  S.account = createAccount(rs, S.session.instrument, S.guards);
  // Warm up so the chart is populated on the first frame — an empty chart on the most
  // important screen reads as a broken product.
  S.cursor = 260;
  for (let i = 0; i < S.cursor; i++) S.account = applyBar(S.account, S.session.bars[i]);
  S.playing = false;
  go('trade');
  play();
}

// ═══ TRADE — cockpit ground ═════════════════════════════════════════════════
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
        <div class="grp"><label for="o-size">Size</label>
          <input id="o-size" type="number" min="1" value="${S.orderSize}" ${S.drill?.lockSize ? 'disabled' : ''}></div>
        <div class="grp"><label for="o-stop">Stop</label><input id="o-stop" type="number" min="0" value="${S.stopPts}"></div>
        <div class="grp"><label for="o-tgt">Target</label><input id="o-tgt" type="number" min="0" value="${S.targetPts}"></div>
        <div class="sep"></div>
        <button class="ctl buy"  id="b-buy">Buy</button>
        <button class="ctl sell" id="b-sell">Sell</button>
        <button class="ctl"      id="b-flat">Flatten</button>
        <div class="sep"></div>
        <div class="seg">${[1, 4, 8, 25, 100].map((s) => `<button data-sp="${s}" class="${S.speed === s ? 'on' : ''}">${s}×</button>`).join('')}</div>
        <button class="ctl" id="b-play">${S.playing ? 'Pause' : 'Play'}</button>
        <div class="sep"></div>
        <div class="seg">${[1, 5, 15].map((t) => `<button data-tf="${t}" class="${S.tf === t ? 'on' : ''}">${t}m</button>`).join('')}</div>
        <div class="spacer"></div>
        <button class="ctl end" id="b-end">End run</button>
      </div>
    </div>`;

  chart = new Chart($('#cv', main));

  $('#b-buy', main).addEventListener('click', () => order('long'));
  $('#b-sell', main).addEventListener('click', () => order('short'));
  $('#b-flat', main).addEventListener('click', flatten);
  $('#b-play', main).addEventListener('click', () => (S.playing ? stop(true) : play()));
  $('#b-end', main).addEventListener('click', () => finish());
  main.querySelectorAll('[data-sp]').forEach((b) => b.addEventListener('click', () => {
    S.speed = +b.dataset.sp;
    main.querySelectorAll('[data-sp]').forEach((x) => x.classList.toggle('on', x === b));
    if (S.playing) { stop(); play(); }
  }));
  main.querySelectorAll('[data-tf]').forEach((b) => b.addEventListener('click', () => {
    S.tf = +b.dataset.tf;
    main.querySelectorAll('[data-tf]').forEach((x) => x.classList.toggle('on', x === b));
    paintTrade();
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
  const b = $('#b-play'); if (b) b.textContent = 'Pause';
}

function stop(repaint = false) {
  S.playing = false;
  clearTimeout(S.timer);
  const b = $('#b-play'); if (b) b.textContent = 'Play';
  if (repaint) paintTrade();
}

function step() {
  if (S.cursor >= S.session.bars.length - 1) { finish(); return; }
  S.account = applyBar(S.account, S.session.bars[S.cursor]);
  S.cursor++;
  if (S.account.status !== 'active') { finish(); return; }
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
    toast(r.message || 'Order rejected', String(r.rejected).startsWith('GUARD') ? 'guard' : 'block');
  }
  paintTrade();
}

function flatten() {
  if (!S.account?.position) return;
  const bar = S.session.bars[S.cursor - 1];
  S.account = closePosition(S.account, bar.c).state;
  if (S.account.status !== 'active') { finish(); return; }
  paintTrade();
}

function paintTrade() {
  if (S.view !== 'trade' || !S.account) return;
  const a = S.account;
  const h = hud(a);
  const bar = S.session.bars[S.cursor - 1];

  // Instrument order is fixed. It never scrolls, collapses or reorders.
  $('#hud').innerHTML = [
    cell('Equity', money(h.equity), null, `Balance ${money(h.balance)}`),
    cell('Daily limit', h.dailyRoom === null ? '—' : money(h.dailyRoom),
         h.dailyPct, h.dailyFloor === null ? 'No daily rule' : `Floor ${money(h.dailyFloor)}`),
    cell('Loss floor', money(h.floorRoom), h.floorPct,
         `${money(h.floor)}${h.floorLocked ? ' · locked' : ddArrow(a.rs.maxLossType)}`),
    cell('Target', money(h.profit), null, `of ${money(h.target)} · ${Math.round(h.targetPct * 100)}%`,
         h.targetPct > 0 ? 'armed' : '', h.targetPct),
    cell('Day', `${h.day}${h.maxDays ? '/' + h.maxDays : ''}`, null,
         `${h.tradingDays} of ${h.minTradingDays} min days`),
    cell('Trades today', `${h.tradesToday}${h.tradeCap !== null ? '/' + h.tradeCap : ''}`, null,
         h.consistencyPct !== null ? `Best day ${Math.round(h.consistencyPct * 100)}%` : 'No consistency rule'),
  ].join('');

  const visible = 190;
  const from = Math.max(0, S.cursor - visible * S.tf);
  const bars = resample(S.session.bars.slice(from, S.cursor), S.tf);

  const levels = [];
  if (a.position) {
    const pv = a.instrument.pointValue;
    const fp = equityToPrice(a.position, bar.c, pv, a.balance, a.floor);
    if (fp !== null && Number.isFinite(fp)) levels.push({ price: fp, color: '#D45C6E', label: 'FLOOR', bold: true, inRangeOnly: true });
    if (a.dailyFloor !== null) {
      const dp = equityToPrice(a.position, bar.c, pv, a.balance, a.dailyFloor);
      if (dp !== null && Number.isFinite(dp)) levels.push({ price: dp, color: '#E0A33C', label: 'DAILY', dashed: true, inRangeOnly: true });
    }
  }
  chart.set({
    bars, position: a.position, levels, trades: a.trades.slice(-24),
    news: S.session.news, digits: a.instrument.digits, tf: S.tf,
  });

  const upl = a.position
    ? (bar.c - a.position.entryPrice) * (a.position.side === 'long' ? 1 : -1) * a.position.size * a.instrument.pointValue
    : 0;

  $('#ov').innerHTML = `${esc(a.instrument.name)} · ${S.tf}m<br>synthetic · seed ${esc(S.session.seed)}`;
  $('#tk').innerHTML = `<b>${bar.c.toFixed(a.instrument.digits)}</b>${new Date(bar.t).toISOString().slice(0, 16).replace('T', ' ')}Z`;

  const warn = h.warnings.filter((w) => w.code !== 'CONSISTENCY_BLOCK');
  const cd = h.cooldownUntil && bar.t < h.cooldownUntil
    ? `<span class="caution">Cooldown ${Math.ceil((h.cooldownUntil - bar.t) / 60000)}m</span>` : '';
  $('#ps').innerHTML = (a.position
    ? `<span class="side">${a.position.side.toUpperCase()} ${a.position.size} @ ${a.position.entryPrice.toFixed(a.instrument.digits)}</span>
       <span class="${upl >= 0 ? 'pos' : 'neg'}">${money(upl, true)} open</span>
       ${a.position.stop ? `<span class="prot">SL ${a.position.stop.toFixed(a.instrument.digits)}</span>` : ''}
       ${a.position.target ? `<span class="prot">TP ${a.position.target.toFixed(a.instrument.digits)}</span>` : ''}`
    : `<span class="flat">Flat</span>`)
    + cd
    + warn.map((w) => `<span class="${w.sev === 2 ? 'alarm' : 'caution'}">${esc(w.msg)}</span>`).join('');
}

/** One instrument in the HUD strip. `state` forces a class; otherwise proximity decides. */
function cell(k, v, pct, sub, state = '', meterPct = null) {
  let cls = state;
  if (!cls && pct !== null && pct !== undefined) {
    cls = pct <= 0.15 ? 'alarm' : pct <= 0.3 ? 'caution' : '';
  }
  const width = meterPct ?? pct;
  return `<div class="cell ${cls}">
    <div class="k">${esc(k)}</div>
    <div class="v">${esc(v)}</div>
    ${width === null || width === undefined ? ''
      : `<div class="meter"><i style="width:${Math.round(width * 100)}%"></i></div>`}
    <small>${esc(sub || '')}</small>
  </div>`;
}

const ddArrow = (t) => (t === 'static' ? ' · fixed' : ' · trailing');
const ddLabel = (t) => ({
  static: 'Static', trailing_intraday: 'Intraday trail',
  trailing_eod: 'EOD trail', trailing_to_static: 'Trail → lock',
}[t]);

// ── finish ──────────────────────────────────────────────────────────────────
function finish() {
  stop();
  // A run that neither passed nor breached still terminates — record it as 'ended' rather
  // than leaving it 'active', or it will never be scored and the record has nothing to show.
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

// ═══ AUTOPSY — report ground ════════════════════════════════════════════════
function viewAutopsy(main, score) {
  const a = S.account;
  const { findings, primary, xp, notes, drills } = S.lastResult;
  const passed = a.status === 'passed';
  const breached = a.status === 'failed' && !!a.breach;
  const kind = passed ? 'pass' : breached ? 'fail' : 'ended';
  const events = narrative(a, 14);
  const profit = a.balance - a.rs.accountSize;

  main.innerHTML = `<div class="paper"><div class="sheet">

    <div class="verdict ${kind}">
      <div class="tag">${passed ? 'Passed' : breached ? 'Failed' : 'Ended early'} · Simulated</div>
      <h1>${passed ? `Target reached in ${a.tradingDays.length} trading days`
          : breached ? esc(a.breach.detail)
          : 'You stopped before a verdict'}</h1>
      <div class="meta">
        <span>${esc(a.rs.firm)} · ${esc(a.rs.label)}</span>
        <span>Result <b class="${profit >= 0 ? 'pos' : 'neg'}">${money(profit, true)}</b></span>
        <span>Trades <b>${a.trades.length}</b></span>
        <span>Days <b>${a.tradingDays.length}</b></span>
      </div>
    </div>

    ${primary && !passed ? `
    <div class="primary">
      <div class="code">Primary pattern · ${esc(primary.code)}</div>
      <h2>${esc(primary.name)}</h2>
      <div class="stat">${esc(primary.stat)}</div>
      <p>${esc(primary.detail)}</p>
    </div>` : ''}

    <div class="cols c-wide">
      <div>
        <div class="band"><span class="lbl">What actually happened</span><span class="rest">last ${events.length} events</span></div>
        <div class="timeline">
          ${events.map((e, i) => {
            // Break the log by session, or the clock appears to run backwards at a day roll.
            const newDay = e.day && e.day !== events[i - 1]?.day;
            return `${newDay ? `<div class="daybreak"><span>${esc(dayLabel(e.day))}</span></div>` : ''}
              <div class="row ${e.kind}">
                <span class="t">${esc(e.time)}</span><span class="x">${esc(e.text)}</span>
              </div>`;
          }).join('')}
        </div>
      </div>

      <div>
        <div class="band"><span class="lbl">Findings</span><span class="rest">${findings.length}</span></div>
        ${findings.length ? findings.map((f) => `
          <div class="finding sev${f.severity >= 4 ? 3 : f.severity >= 2 ? 2 : 1}">
            <div class="code">${esc(f.code)}</div>
            <h4>${esc(f.name)}</h4>
            <div class="stat">${esc(f.stat)}</div>
            <p>${esc(f.detail)}</p>
            ${f.evidence?.length ? `<ul>${f.evidence.map((e) => `<li>${esc(e.text)}</li>`).join('')}</ul>` : ''}
          </div>`).join('')
          : `<p>No behavioural patterns flagged in this run. That is a good sign, and it is also
             one run — the score weights recent runs, so do it again.</p>`}
      </div>
    </div>

    <div class="cols c-wide" style="margin-top:44px">
      <div>
        <div class="band"><span class="lbl">Prescription</span><span class="rest">in order</span></div>
        ${drills.map((d, i) => `
          <div class="drill">
            <span class="n">${String(i + 1).padStart(2, '0')}</span>
            <div>
              <b>${esc(d.name)}</b>
              <div class="goal">${esc(d.goal)}</div>
              <div class="why">${esc(d.why)}</div>
            </div>
            <button class="btn sm quiet" data-drill="${esc(d.id)}">Load</button>
          </div>`).join('')}
      </div>

      <div>
        <div class="band"><span class="lbl">XP earned</span><span class="rest">+${xp}</span></div>
        <div class="ledger">
          ${notes.map((n) => `<div class="row"><span class="amt">+${n.n}</span><span class="why">${esc(n.why)}</span></div>`).join('')}
        </div>
        <p class="src">XP is awarded for process, never for profit. A larger winner earns exactly
          the same as a small one — rewarding P&amp;L would train gambling.</p>
      </div>
    </div>

    <div style="margin-top:44px">
      <div class="band"><span class="lbl">Share</span></div>
      <div class="cols c2">
        <div id="card-host"></div>
        <div>
          <p>The card carries the finding, not a win screenshot. It is marked simulated, and it
             distinguishes a breach from a run that simply ended.</p>
          <div class="actions" style="margin-top:16px"><button class="btn sm" id="dl">Download card</button></div>
        </div>
      </div>
    </div>

    <div class="actions">
      <button class="btn primary" id="again">Run it again</button>
      <button class="btn quiet" id="dash">See my record</button>
    </div>

    ${colophon()}
  </div></div>`;

  const cv = renderCard(a, { primary, score: score.score, grade: score.grade });
  cv.className = 'share-card';
  $('#card-host', main).appendChild(cv);
  $('#dl', main).addEventListener('click', () => download(cv, `challenge-ready-${a.status}.png`));

  main.querySelectorAll('[data-drill]').forEach((b) => b.addEventListener('click', () => {
    S.drill = DRILLS.find((d) => d.id === b.dataset.drill);
    toast(`Drill loaded — ${S.drill.name}`, 'guard');
    go('setup');
  }));
  $('#again', main).addEventListener('click', startRun);
  $('#dash', main).addEventListener('click', () => go('dashboard'));
}

// ═══ RECORD — report ground ═════════════════════════════════════════════════
function viewDashboard(main, score) {
  const runs = S.profile.runs;
  if (!runs.length || !score.components) {
    main.innerHTML = `<div class="paper"><div class="sheet narrow">
      <div class="empty">
        <div class="lbl" style="margin-bottom:12px">Unscored</div>
        <h2>You have not been tested yet.</h2>
        <p>One fifteen-minute run will tell you more about how you trade than fifteen videos will.</p>
        <button class="btn primary" id="go">Run the diagnostic</button>
      </div>
      ${colophon()}
    </div></div>`;
    $('#go', main).addEventListener('click', () => go('setup'));
    return;
  }

  const rec = recommendation(score.score, score.runs);
  const lvl = levelFor(S.profile.xp);
  const passes = runs.filter((r) => r.status === 'passed').length;

  main.innerHTML = `<div class="paper"><div class="sheet">

    <div class="band">
      <span class="lbl">Assessment</span>
      <span class="rest">${runs.length} run${runs.length === 1 ? '' : 's'} · ${passes} passed · ${S.profile.streak}-day streak</span>
    </div>

    <div class="cols c-wide">
      <div>
        <div class="score-head">
          ${dial(score.score, score.grade)}
          <div>
            <h2>Readiness</h2>
            <p id="disclosure" style="margin-top:8px;font-size:13px">${esc(score.disclosure)}</p>
          </div>
        </div>
        <div class="rec ${rec.level}">
          <span class="lbl">Recommendation</span>
          <p>${esc(rec.text)}</p>
        </div>
      </div>

      <div>
        <div class="band"><span class="lbl">Components</span><span class="rest">weighted</span></div>
        ${COMPONENTS.map((c) => {
          const v = Math.round(score.components[c.key]);
          const col = v >= 75 ? 'var(--ultra)' : v >= 50 ? 'var(--caution)' : 'var(--oxblood)';
          return `<div class="comp">
            <div class="top"><span>${esc(c.label)}</span><b style="color:${col}">${v}</b></div>
            <div class="track"><i style="width:${v}%;background:${col}"></i></div>
            <div class="blurb">${esc(c.blurb)}</div>
          </div>`;
        }).join('')}
        ${score.weakest ? `<div class="note" style="margin-top:16px">
          Weakest component: <em>${esc(score.weakest.label)}</em>. Fix this one first — it carries
          ${Math.round(score.weakest.weight * 100)}% of the score.</div>` : ''}
      </div>
    </div>

    <div class="cols c-wide" style="margin-top:44px">
      <div>
        <div class="band"><span class="lbl">Progression</span><span class="rest">${S.profile.xp} XP</span></div>
        <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:10px">
          <b class="num" style="font-size:30px;color:var(--ink-1)">L${lvl.level}</b>
          <span class="serif" style="font-size:20px">${esc(lvl.name)}</span>
        </div>
        <div class="comp" style="border:none;padding:0">
          <div class="track"><i style="width:${lvl.max ? 100 : Math.round((lvl.into / lvl.need) * 100)}%;background:var(--ink-1)"></i></div>
        </div>
        <p class="src">${lvl.max ? 'Maximum level.' : `${lvl.need - lvl.into} XP to level ${lvl.level + 1}.`}
          Level 7 is “Challenge Ready” and it is deliberately hard to reach — a badge that is easy
          to get is a badge nobody respects.</p>
      </div>

      <div>
        <div class="band"><span class="lbl">Drills</span><span class="rest">${DRILLS.length} available</span></div>
        ${DRILLS.slice(0, 5).map((d) => `
          <div class="drill">
            <span class="n">${esc(d.forMode)}</span>
            <div><b>${esc(d.name)}</b><div class="goal">${esc(d.goal)}</div></div>
            <button class="btn sm quiet" data-drill="${esc(d.id)}">Load</button>
          </div>`).join('')}
      </div>
    </div>

    <div style="margin-top:44px">
      <div class="band"><span class="lbl">Run record</span></div>
      <table class="hist">
        <thead><tr>
          <th>#</th><th>Programme</th><th>Outcome</th>
          <th class="r">Result</th><th class="r">Trades</th><th class="r">Days</th><th class="r">Cause</th>
        </tr></thead>
        <tbody>
        ${runs.slice().reverse().map((r, i) => {
          const p = r.balance - r.rs.accountSize;
          return `<tr>
            <td>${runs.length - i}</td>
            <td class="name">${esc(r.rs.firm)}</td>
            <td>${esc(r.status)}</td>
            <td class="r ${p >= 0 ? 'pos' : 'neg'}">${money(p, true)}</td>
            <td class="r">${r.trades.length}</td>
            <td class="r">${r.tradingDays.length}</td>
            <td class="r">${r.breach ? esc(r.breach.code.replace('_', ' ').toLowerCase()) : '—'}</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>

    <div class="actions">
      <button class="btn primary" id="new">New run</button>
      <button class="btn danger sm" id="reset">Erase my record</button>
    </div>

    ${colophon()}
  </div></div>`;

  main.querySelectorAll('[data-drill]').forEach((b) => b.addEventListener('click', () => {
    S.drill = DRILLS.find((d) => d.id === b.dataset.drill);
    toast(`Drill loaded — ${S.drill.name}`, 'guard');
    go('setup');
  }));
  $('#new', main).addEventListener('click', () => go('setup'));
  $('#reset', main).addEventListener('click', () => {
    if (!confirm('Erase every run, your XP and your streak? This cannot be undone.')) return;
    S.profile = { runs: [], xp: 0, streak: 0, lastDay: null, completedDrills: [] };
    saveProfile(S.profile);
    go('dashboard');
  });
}

function dial(score, grade) {
  const r = 62, c = 2 * Math.PI * r;
  const pct = (score ?? 0) / 100;
  const col = score >= 75 ? 'var(--ultra)' : score >= 50 ? 'var(--caution)' : 'var(--oxblood)';
  return `<div class="dial">
    <svg width="148" height="148" viewBox="0 0 148 148" aria-hidden="true">
      <circle cx="74" cy="74" r="${r}" fill="none" stroke="var(--paper-rule)" stroke-width="6"/>
      <circle cx="74" cy="74" r="${r}" fill="none" stroke="${col}" stroke-width="6"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" transform="rotate(-90 74 74)"/>
    </svg>
    <div class="g"><b>${score ?? '—'}</b><small>GRADE ${grade ?? '—'}</small></div>
  </div>`;
}

/** "Mon 5 Jan" — enough to orient without competing with the event times. */
function dayLabel(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function colophon() {
  return `<div class="colophon">
    Simulated trading on synthetic data. Nothing here is real market data, a real trading record,
    a prediction, or financial advice. Rule sets are models of publicly documented evaluation
    formats and are not affiliated with any firm — always verify current terms with the firm itself.
  </div>`;
}

render();
