/**
 * Candlestick renderer.
 *
 * Hand-rolled on canvas rather than pulling in a charting library, for one reason that
 * matters to this product: the rule lines (drawdown floor, daily floor, profit target)
 * have to be first-class citizens drawn in price space, not annotations bolted on top.
 * The floor is the most important line on the screen and it must never be subtle.
 */

const C = {
  bg: '#0B0E11',
  grid: '#161C24',
  axis: '#5D6B78',
  up: '#00C9A7',
  down: '#FF4757',
  wick: '#4A5764',
  floor: '#FF4757',
  daily: '#FFB020',
  target: '#00C9A7',
  entry: '#4C8DFF',
  news: '#FFB020',
};

export class Chart {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.pad = { l: 8, r: 70, t: 10, b: 22 };
    this._resize();
    window.addEventListener('resize', () => { this._resize(); this.render(); });
    this.data = null;
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.cv.getBoundingClientRect();
    this.w = Math.max(320, r.width);
    this.h = Math.max(220, r.height);
    this.cv.width = this.w * dpr;
    this.cv.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * @param {object} d
   *   bars      visible bars (already resampled)
   *   position  open position or null
   *   levels    [{price, color, label, dashed}]
   *   trades    closed trades to mark
   *   news      event timestamps
   */
  set(d) { this.data = d; this.render(); }

  render() {
    const { ctx } = this;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    const d = this.data;
    if (!d || !d.bars.length) return;

    const bars = d.bars;
    const plotW = this.w - this.pad.l - this.pad.r;
    const plotH = this.h - this.pad.t - this.pad.b;

    // Price range must include the rule lines, otherwise the floor can sit off-screen
    // exactly when it matters most.
    let hi = -Infinity, lo = Infinity;
    for (const b of bars) { if (b.h > hi) hi = b.h; if (b.l < lo) lo = b.l; }
    for (const l of d.levels || []) {
      if (l.inRangeOnly && (l.price > hi * 1.04 || l.price < lo * 0.96)) continue;
      hi = Math.max(hi, l.price); lo = Math.min(lo, l.price);
    }
    const span = (hi - lo) || 1;
    hi += span * 0.06; lo -= span * 0.06;
    const range = hi - lo;

    const y = (p) => this.pad.t + (hi - p) / range * plotH;
    const bw = plotW / bars.length;
    const x = (i) => this.pad.l + i * bw + bw / 2;
    this._y = y; this._x = x; this._bw = bw; this._hi = hi; this._lo = lo;

    // ── grid + price axis ──
    ctx.font = '10px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const p = lo + (range * i) / steps;
      const py = Math.round(y(p)) + 0.5;
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(this.pad.l, py); ctx.lineTo(this.w - this.pad.r, py); ctx.stroke();
      ctx.fillStyle = C.axis; ctx.textAlign = 'left';
      ctx.fillText(fmtPrice(p, d.digits), this.w - this.pad.r + 6, py);
    }

    // ── session separators + news markers ──
    let prevDay = null;
    for (let i = 0; i < bars.length; i++) {
      const day = new Date(bars[i].t).toISOString().slice(0, 10);
      if (prevDay && day !== prevDay) {
        ctx.strokeStyle = '#202932'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(x(i) - bw / 2) + 0.5, this.pad.t);
        ctx.lineTo(Math.round(x(i) - bw / 2) + 0.5, this.pad.t + plotH);
        ctx.stroke();
      }
      prevDay = day;
    }
    for (const n of d.news || []) {
      const i = bars.findIndex((b) => Math.abs(b.t - n.t) < 60_000 * (d.tf || 1));
      if (i < 0) continue;
      ctx.fillStyle = 'rgba(255,176,32,.14)';
      ctx.fillRect(x(i) - bw, this.pad.t, bw * 2, plotH);
    }

    // ── candles ──
    const cw = Math.max(1, Math.min(bw * 0.68, 11));
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const up = b.c >= b.o;
      const cx = x(i);
      ctx.strokeStyle = up ? C.up : C.down;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(cx) + 0.5, y(b.h));
      ctx.lineTo(Math.round(cx) + 0.5, y(b.l));
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = up ? C.up : C.down;
      const yo = y(b.o), yc = y(b.c);
      const top = Math.min(yo, yc);
      const hgt = Math.max(1, Math.abs(yc - yo));
      ctx.fillRect(Math.round(cx - cw / 2), Math.round(top), Math.round(cw), Math.round(hgt));
    }

    // ── trade markers ──
    for (const t of d.trades || []) {
      const ei = nearest(bars, t.entryTs);
      const xi = nearest(bars, t.exitTs);
      if (ei < 0 || xi < 0) continue;
      ctx.strokeStyle = t.pnl >= 0 ? 'rgba(0,201,167,.5)' : 'rgba(255,71,87,.5)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x(ei), y(t.entryPrice));
      ctx.lineTo(x(xi), y(t.exitPrice));
      ctx.stroke();
      ctx.setLineDash([]);
      tri(ctx, x(ei), y(t.entryPrice), t.side === 'long' ? 1 : -1, C.entry);
    }

    // ── open position ──
    if (d.position) {
      const p = d.position;
      ctx.strokeStyle = C.entry; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(this.pad.l, Math.round(y(p.entryPrice)) + 0.5);
      ctx.lineTo(this.w - this.pad.r, Math.round(y(p.entryPrice)) + 0.5);
      ctx.stroke(); ctx.setLineDash([]);
      tag(ctx, this.w - this.pad.r, y(p.entryPrice), `${p.side === 'long' ? 'L' : 'S'} ${p.size}`, C.entry);
      if (p.stop)   dashLine(ctx, this.pad.l, this.w - this.pad.r, y(p.stop), C.down, 'SL', this.w - this.pad.r);
      if (p.target) dashLine(ctx, this.pad.l, this.w - this.pad.r, y(p.target), C.up, 'TP', this.w - this.pad.r);
    }

    // ── rule levels: drawn last so nothing hides them ──
    for (const l of d.levels || []) {
      if (l.price > hi || l.price < lo) continue;
      const py = Math.round(y(l.price)) + 0.5;
      ctx.strokeStyle = l.color; ctx.lineWidth = l.bold ? 1.6 : 1;
      if (l.dashed) ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(this.pad.l, py); ctx.lineTo(this.w - this.pad.r, py); ctx.stroke();
      ctx.setLineDash([]);
      tag(ctx, this.w - this.pad.r, py, l.label, l.color);
    }

    // ── time axis ──
    ctx.fillStyle = C.axis; ctx.textAlign = 'center'; ctx.font = '10px ui-monospace, monospace';
    const every = Math.max(1, Math.floor(bars.length / 7));
    for (let i = 0; i < bars.length; i += every) {
      ctx.fillText(new Date(bars[i].t).toISOString().slice(11, 16), x(i), this.h - 9);
    }
  }
}

/** Map an equity-space value onto the chart's price axis so rule lines can be shown
 *  on a price chart. Returns the price at which the account would sit at `equity`. */
export function equityToPrice(position, price, pointValue, balance, targetEquity) {
  if (!position) return null;
  const dir = position.side === 'long' ? 1 : -1;
  // balance + (p - entry)*dir*size*pv = targetEquity
  return position.entryPrice + (targetEquity - balance) / (dir * position.size * pointValue);
}

function nearest(bars, t) {
  if (!bars.length) return -1;
  let best = -1, bd = Infinity;
  for (let i = 0; i < bars.length; i++) {
    const d = Math.abs(bars[i].t - t);
    if (d < bd) { bd = d; best = i; }
  }
  return bd > 1000 * 60 * 60 * 8 ? -1 : best;
}

function tri(ctx, cx, cy, dir, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const s = 4.5, off = dir > 0 ? 7 : -7;
  ctx.moveTo(cx, cy + off - dir * s);
  ctx.lineTo(cx - s, cy + off + dir * s * 0.5);
  ctx.lineTo(cx + s, cy + off + dir * s * 0.5);
  ctx.closePath(); ctx.fill();
}

function tag(ctx, xr, y, text, color) {
  ctx.font = '10px ui-monospace, monospace';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(xr + 2, y - 8, w, 16);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#08111A';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(text, xr + 7, y);
}

function dashLine(ctx, x1, x2, y, color, label, xr) {
  ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
  ctx.setLineDash([2, 5]);
  ctx.beginPath(); ctx.moveTo(x1, Math.round(y) + 0.5); ctx.lineTo(x2, Math.round(y) + 0.5); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  tag(ctx, xr, y, label, color);
}

export function fmtPrice(p, digits = 2) {
  return p.toFixed(digits);
}
