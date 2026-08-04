/**
 * Share-card renderer.
 *
 * Two decisions worth stating:
 *
 * 1. The card is PAPER, not the cockpit. Verdicts live in the report world, and a printed
 *    assessment stands out in a feed otherwise full of dark trading screenshots. It is the
 *    one place the design takes a real risk.
 * 2. The primary card is the finding, not a win screenshot. The research found the trading
 *    internet is saturated with wins and starved of credible explanations of a loss.
 *
 * Everything rendered here is marked SIMULATED, and the card distinguishes a breach from a
 * run that merely ended. That is not decoration: regulators have taken action against firms
 * for presenting simulated trading as live, and a share card travels without its context.
 */

const W = 1200, H = 675;
const M = 64;                       // margin — the sheet's edge

const PAPER = '#E8EBEF';
const RULE  = '#C3C9D2';
const INK   = '#15181D';
const INK2  = '#4A525E';
const INK3  = '#78818E';
const OXBLOOD = '#A6273A';
const ULTRA   = '#3B57D8';
const CAUTION = '#B87A12';

const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
const SANS  = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO  = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export function renderCard(state, opts = {}) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');

  const passed = state.status === 'passed';
  const breached = state.status === 'failed' && !!state.breach;
  const accent = passed ? ULTRA : breached ? OXBLOOD : CAUTION;

  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);

  // Masthead rule — a document header, not a hero.
  g.fillStyle = INK;
  g.font = `700 13px ${SANS}`;
  g.letterSpacing = '0.18em';
  g.fillText('CHALLENGE/READY', M, M);
  g.letterSpacing = '0px';

  label(g, 'SIMULATED', W - M, M, 'right', CAUTION);

  rule(g, M, M + 16, W - M * 2, INK, 1.5);

  // Verdict
  let y = M + 62;
  g.fillStyle = accent;
  g.font = `700 12px ${MONO}`;
  g.letterSpacing = '0.16em';
  g.fillText((passed ? 'PASSED' : breached ? 'FAILED' : 'ENDED EARLY').toUpperCase(), M, y);
  g.letterSpacing = '0px';

  // Two columns through the body: the finding reads left, the plate sits right.
  const plateW = 420, plateH = 300;
  const textW = W - M * 2 - plateW - 48;

  y += 48;
  g.fillStyle = INK;
  g.font = `400 42px ${SERIF}`;
  const headline = passed
    ? `Target reached in ${state.tradingDays.length} days`
    : breached
      ? (opts.primary ? opts.primary.name : breachLabel(state.breach.code))
      : (opts.primary ? opts.primary.name : 'Stopped before a verdict');
  y = wrap(g, headline, M, y, textW, 48);

  if (opts.primary) {
    g.fillStyle = accent;
    g.font = `400 15px ${MONO}`;
    y = wrap(g, opts.primary.stat || '', M, y + 12, textW, 22);

    // The explanation is the point of the card — it is what a win screenshot never carries.
    g.fillStyle = INK2;
    g.font = `400 16px ${SANS}`;
    wrap(g, opts.primary.detail || '', M, y + 14, textW, 24);
  } else {
    g.fillStyle = INK2;
    g.font = `400 16px ${SANS}`;
    wrap(g, passed
      ? 'Reached the target inside every rule, with no behavioural pattern flagged.'
      : 'No behavioural pattern was flagged in this run — one run is not yet evidence.',
      M, y + 14, textW, 24);
  }

  // Equity plate, right column — ruled like a figure in a report.
  const plateY = M + 62;
  drawCurve(g, state, W - M - plateW, plateY, plateW, plateH, accent);
  label(g, 'EQUITY, REALISED', W - M - plateW, plateY + plateH + 22, 'left', INK3);

  // Footing table
  const footY = H - M - 74;
  rule(g, M, footY, W - M * 2, INK, 1.5);

  const profit = state.balance - state.rs.accountSize;
  const cells = [
    ['RESULT', (profit >= 0 ? '+' : '−') + money(profit), profit >= 0 ? ULTRA : OXBLOOD],
    ['TRADES', String(state.trades.length), INK],
    ['DAYS', String(state.tradingDays.length), INK],
    ['PROGRAMME', state.rs.firm, INK],
  ];
  if (opts.score !== null && opts.score !== undefined) {
    cells.push(['READINESS', `${opts.score} · ${opts.grade}`, INK]);
  }

  const colW = (W - M * 2) / cells.length;
  cells.forEach(([k, v, col], i) => {
    const x = M + i * colW;
    if (i > 0) {
      g.strokeStyle = RULE; g.lineWidth = 1;
      g.beginPath(); g.moveTo(Math.round(x) - 14.5, footY + 12); g.lineTo(Math.round(x) - 14.5, footY + 58); g.stroke();
    }
    label(g, k, x, footY + 24, 'left', INK3);
    g.fillStyle = col;
    g.font = `500 25px ${MONO}`;
    g.fillText(clip(g, v, colW - 22), x, footY + 54);
  });

  g.fillStyle = INK3;
  g.font = `400 11.5px ${SANS}`;
  g.fillText('Simulated result on synthetic data. Not a real trading record, and not a prediction.', M, H - 24);

  return cv;
}

function drawCurve(g, state, x, y, w, h, accent) {
  const pts = [state.rs.accountSize];
  for (const t of state.trades) pts.push(pts[pts.length - 1] + t.pnl);

  const floor = state.floor;
  const target = state.rs.accountSize + state.rs.profitTarget;
  let hi = Math.max(...pts, target);
  let lo = Math.min(...pts, floor);
  const pad = (hi - lo) * 0.14 || 1;
  hi += pad; lo -= pad;

  const py = (v) => y + h - ((v - lo) / (hi - lo)) * h;
  const px = (i) => x + (pts.length === 1 ? 0 : (i / (pts.length - 1)) * w);

  g.fillStyle = '#DDE1E7';
  g.fillRect(x, y, w, h);

  gline(g, x, py(target), w, ULTRA, 'TARGET');
  gline(g, x, py(floor), w, OXBLOOD, 'FLOOR');
  gline(g, x, py(state.rs.accountSize), w, INK3, '');

  if (pts.length > 1) {
    g.save();
    g.beginPath();
    g.moveTo(px(0), py(pts[0]));
    for (let i = 1; i < pts.length; i++) g.lineTo(px(i), py(pts[i]));
    g.lineTo(px(pts.length - 1), y + h); g.lineTo(px(0), y + h); g.closePath();
    g.globalAlpha = 0.13; g.fillStyle = accent; g.fill();
    g.restore();

    g.beginPath();
    g.moveTo(px(0), py(pts[0]));
    for (let i = 1; i < pts.length; i++) g.lineTo(px(i), py(pts[i]));
    g.strokeStyle = accent; g.lineWidth = 2; g.lineJoin = 'round';
    g.stroke();

    g.fillStyle = accent;
    g.beginPath(); g.arc(px(pts.length - 1), py(pts[pts.length - 1]), 4, 0, Math.PI * 2); g.fill();
  }

  g.strokeStyle = INK; g.lineWidth = 1;
  g.strokeRect(x + .5, y + .5, w, h);
}

function gline(g, x, y, w, color, text) {
  g.save();
  g.setLineDash([4, 4]); g.strokeStyle = color; g.globalAlpha = .55; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x, Math.round(y) + .5); g.lineTo(x + w, Math.round(y) + .5); g.stroke();
  g.restore();
  if (text) {
    g.save();
    g.fillStyle = color; g.globalAlpha = .85;
    g.font = `600 9px ${SANS}`; g.letterSpacing = '0.14em';
    g.fillText(text, x + 6, y - 5);
    g.restore();
    g.letterSpacing = '0px';
  }
}

function rule(g, x, y, w, color, lw = 1) {
  g.strokeStyle = color; g.lineWidth = lw;
  g.beginPath(); g.moveTo(x, Math.round(y) + .5); g.lineTo(x + w, Math.round(y) + .5); g.stroke();
}

function label(g, text, x, y, align, color) {
  g.save();
  g.fillStyle = color;
  g.font = `600 10px ${SANS}`;
  g.letterSpacing = '0.15em';
  g.textAlign = align;
  g.fillText(text, x, y);
  g.restore();
  g.textAlign = 'left';
  g.letterSpacing = '0px';
}

/** Wrap headline text, returning the baseline after the last line. */
function wrap(g, text, x, y, maxW, lh) {
  const words = String(text).split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y);
      y += lh;
      line = w;
    } else line = test;
  }
  if (line) { g.fillText(line, x, y); y += lh; }
  return y;
}

function clip(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let t = String(text);
  while (t.length > 4 && g.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

const money = (n) => '$' + Math.round(Math.abs(n)).toLocaleString('en-US');

function breachLabel(code) {
  return {
    DAILY_LOSS: 'Daily loss limit',
    MAX_LOSS: 'Max drawdown floor',
    TIME_LIMIT: 'Ran out of time',
  }[code] || 'Rule breach';
}

export function download(canvas, filename) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
