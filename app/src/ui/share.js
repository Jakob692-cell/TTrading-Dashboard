/**
 * Share-card renderer.
 *
 * The research concluded that the most under-served shareable artifact in this niche is a
 * credible explanation of a LOSS — the trading internet is saturated with win screenshots.
 * So the primary card is the Breach Autopsy, not the pass certificate.
 *
 * Everything rendered here is marked SIMULATED. That is a legal requirement, not a style
 * choice: regulators have taken action against firms for presenting simulated trading as
 * live, and a share card is the artifact most likely to travel without its context.
 */

const W = 1200, H = 675;

export function renderCard(state, opts = {}) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');

  // Three outcomes, not two. Calling a profitable run that simply ended "CHALLENGE FAILED"
  // would be a misrepresentation, and the share card is the artifact most likely to travel
  // without its context.
  const passed = state.status === 'passed';
  const breached = state.status === 'failed' && !!state.breach;
  const accent = passed ? '#00C9A7' : breached ? '#FF4757' : '#FFB020';

  // background
  g.fillStyle = '#0B0E11';
  g.fillRect(0, 0, W, H);
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, passed ? 'rgba(0,201,167,.10)' : 'rgba(255,71,87,.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);

  // header
  g.fillStyle = '#E6EDF3';
  g.font = '700 22px Inter, system-ui, sans-serif';
  g.fillText('Challenge', 56, 62);
  const cw = g.measureText('Challenge').width;
  g.fillStyle = '#00C9A7';
  g.fillText(' Ready', 56 + cw, 62);

  badge(g, W - 56 - 116, 44, 116, 24, 'SIMULATED', '#FFB020');

  // verdict
  g.fillStyle = accent;
  g.font = '700 15px ui-monospace, monospace';
  g.fillText(passed ? 'CHALLENGE PASSED' : breached ? 'CHALLENGE FAILED' : 'RUN ENDED EARLY', 56, 138);

  g.fillStyle = '#E6EDF3';
  g.font = '700 46px Inter, system-ui, sans-serif';
  const headline = passed
    ? `${state.rs.firm} · ${money(state.balance - state.rs.accountSize)} in ${state.tradingDays.length} days`
    : breached
      ? (opts.primary ? opts.primary.name : breachLabel(state.breach.code))
      : (opts.primary ? opts.primary.name : 'Stopped before a verdict');
  g.fillText(clip(g, headline, W - 112), 56, 190);

  if (!passed && opts.primary) {
    g.fillStyle = '#8B99A6';
    g.font = '400 19px Inter, system-ui, sans-serif';
    g.fillText(clip(g, opts.primary.stat || '', W - 112), 56, 224);
  }

  // equity curve
  drawCurve(g, state, 56, 258, W - 112, 250, accent);

  // stat strip
  const profit = state.balance - state.rs.accountSize;
  const stats = [
    ['RESULT', (profit >= 0 ? '+' : '-') + money(profit)],
    ['TRADES', String(state.trades.length)],
    ['DAYS', String(state.tradingDays.length)],
    ['RULESET', `${state.rs.firm}`],
  ];
  if (opts.score !== null && opts.score !== undefined) {
    stats.push(['READINESS', `${opts.score} · ${opts.grade}`]);
  }
  const colW = (W - 112) / stats.length;
  stats.forEach(([k, v], i) => {
    const x = 56 + i * colW;
    g.fillStyle = '#5D6B78';
    g.font = '600 11px ui-monospace, monospace';
    g.fillText(k, x, H - 92);
    g.fillStyle = k === 'RESULT' ? (profit >= 0 ? '#00C9A7' : '#FF4757') : '#E6EDF3';
    g.font = '600 26px ui-monospace, monospace';
    g.fillText(clip(g, v, colW - 16), x, H - 58);
  });

  g.fillStyle = '#3A4552';
  g.font = '400 12px Inter, system-ui, sans-serif';
  g.fillText('Simulated result on synthetic data. Not a real trading record, and not a prediction.', 56, H - 24);

  return cv;
}

function drawCurve(g, state, x, y, w, h, accent) {
  // Build the realized equity path from closed trades.
  const pts = [state.rs.accountSize];
  for (const t of state.trades) pts.push(pts[pts.length - 1] + t.pnl);

  const floor = state.floor;
  let hi = Math.max(...pts, state.rs.accountSize + state.rs.profitTarget);
  let lo = Math.min(...pts, floor);
  const pad = (hi - lo) * 0.12 || 1;
  hi += pad; lo -= pad;

  const py = (v) => y + h - ((v - lo) / (hi - lo)) * h;
  const px = (i) => x + (pts.length === 1 ? 0 : (i / (pts.length - 1)) * w);

  // frame
  g.strokeStyle = '#232C36'; g.lineWidth = 1;
  g.strokeRect(x + .5, y + .5, w, h);

  // rule lines
  line(g, x, py(state.rs.accountSize + state.rs.profitTarget), w, '#00C9A7', 'TARGET', [5, 5]);
  line(g, x, py(floor), w, '#FF4757', 'FLOOR', [5, 5]);
  line(g, x, py(state.rs.accountSize), w, '#3A4552', '', [2, 4]);

  if (pts.length > 1) {
    // area
    g.beginPath();
    g.moveTo(px(0), py(pts[0]));
    for (let i = 1; i < pts.length; i++) g.lineTo(px(i), py(pts[i]));
    g.lineTo(px(pts.length - 1), y + h); g.lineTo(px(0), y + h); g.closePath();
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, accent + '38');
    grad.addColorStop(1, accent + '00');
    g.fillStyle = grad; g.fill();

    // line
    g.beginPath();
    g.moveTo(px(0), py(pts[0]));
    for (let i = 1; i < pts.length; i++) g.lineTo(px(i), py(pts[i]));
    g.strokeStyle = accent; g.lineWidth = 2.5; g.lineJoin = 'round';
    g.stroke();

    // final dot
    g.fillStyle = accent;
    g.beginPath(); g.arc(px(pts.length - 1), py(pts[pts.length - 1]), 5, 0, Math.PI * 2); g.fill();
  }
}

function line(g, x, y, w, color, label, dash) {
  g.save();
  g.setLineDash(dash); g.strokeStyle = color; g.globalAlpha = .65; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x, Math.round(y) + .5); g.lineTo(x + w, Math.round(y) + .5); g.stroke();
  g.restore();
  if (label) {
    g.fillStyle = color; g.globalAlpha = .8;
    g.font = '600 10px ui-monospace, monospace';
    g.fillText(label, x + w - g.measureText(label).width - 6, y - 5);
    g.globalAlpha = 1;
  }
}

function badge(g, x, y, w, h, text, color) {
  g.strokeStyle = color; g.globalAlpha = .5;
  g.strokeRect(x + .5, y + .5, w, h);
  g.globalAlpha = .12; g.fillStyle = color; g.fillRect(x, y, w, h);
  g.globalAlpha = 1; g.fillStyle = color;
  g.font = '700 11px ui-monospace, monospace';
  g.fillText(text, x + (w - g.measureText(text).width) / 2, y + h / 2 + 4);
}

function clip(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let t = text;
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
