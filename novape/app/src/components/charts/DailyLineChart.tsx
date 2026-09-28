import { useState, type PointerEvent } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth';

export interface DailyPoint {
  label: string;
  uses: number;
  goal: number | null;
}

interface Props {
  points: DailyPoint[];
  baseline: number;
  height?: number;
  /** Changing it replays the draw-in animation. */
  animationKey?: string;
}

const PAD = { left: 32, right: 14, top: 18, bottom: 28 };

function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return '';
  const f = (n: number) => Math.round(n * 10) / 10;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(
      p2[1] - (p3[1] - p1[1]) / 6,
    )} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

function niceStep(max: number): number {
  if (max > 240) return 100;
  if (max > 90) return 50;
  if (max > 40) return 20;
  if (max > 16) return 10;
  return 5;
}

/** Smooth daily-uses line with goal steps, a baseline reference and a scrubbable crosshair. */
export function DailyLineChart({ points, baseline, height = 200, animationKey }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>(300);
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const maxV = Math.max(baseline, ...points.map((p) => p.uses));
  const step = niceStep(maxV);
  const yMax = Math.ceil((maxV * 1.08) / step) * step;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const X = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const Y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;

  const pts = points.map((p, i) => [X(i), Y(p.uses)] as [number, number]);
  const line = smoothPath(pts);
  const bottom = PAD.top + plotH;
  const area = n ? `${line} L${X(n - 1)} ${bottom} L${X(0)} ${bottom} Z` : '';

  let goal = '';
  points.forEach((p, i) => {
    if (p.goal == null) return;
    const prev = points[i - 1];
    if (!prev || prev.goal == null) goal += ` M${X(i)} ${Y(p.goal)}`;
    else if (prev.goal !== p.goal) goal += ` H${(X(i - 1) + X(i)) / 2} V${Y(p.goal)}`;
    if (!points[i + 1] || points[i + 1].goal !== p.goal) goal += ` H${X(i)}`;
  });

  const ticks: number[] = [];
  for (let v = 0; v <= yMax; v += step) ticks.push(v);
  const labelIdx = n <= 1 ? [0] : n <= 8 ? [0, Math.floor((n - 1) / 2), n - 1] : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const i = n <= 1 ? 0 : Math.round(((x - PAD.left) / plotW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const last = pts[n - 1];
  const h = hover != null ? points[hover] : null;
  const tipW = 118;
  const tipLeft = hover != null ? Math.max(0, Math.min(width - tipW, X(hover) - tipW / 2)) : 0;

  return (
    <div ref={ref} className="linechart" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label={`Daily uses from ${points[0]?.uses ?? 0} to ${points[n - 1]?.uses ?? 0}`}>
        <defs>
          <linearGradient id="linechart-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? '#e8e8ea' : '#f3f3f4'} />
            <text x={0} y={Y(v) + 4} className="chart-tick">
              {v}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={width - PAD.right} y1={Y(baseline)} y2={Y(baseline)} stroke="#9a9aa0" strokeWidth="1.2" strokeDasharray="4 3" />
        <text x={width - PAD.right} y={Y(baseline) - 6} textAnchor="end" className="chart-note">
          Baseline {baseline}
        </text>
        <path d={goal} fill="none" stroke="#bdbdc2" strokeWidth="1.5" strokeLinejoin="round" />
        <g key={animationKey}>
          <path d={area} fill="url(#linechart-area)" className="linechart__area" />
          <path d={line} pathLength={1} className="linechart__line" />
        </g>
        {last && <circle cx={last[0]} cy={last[1]} r="5" fill="var(--accent-strong)" stroke="#fff" strokeWidth="2" />}
        {last && hover == null && (
          <text x={last[0] - 8} y={last[1] - 10} textAnchor="end" className="chart-value">
            {points[n - 1].uses}
          </text>
        )}
        {labelIdx.map((i, k) => (
          <text
            key={i}
            x={X(i)}
            y={height - 6}
            textAnchor={k === 0 ? 'start' : k === labelIdx.length - 1 ? 'end' : 'middle'}
            className="chart-tick"
          >
            {points[i]?.label}
          </text>
        ))}
        {hover != null && (
          <>
            <line x1={X(hover)} x2={X(hover)} y1={PAD.top} y2={bottom} stroke="rgba(17,17,17,0.18)" />
            <circle cx={X(hover)} cy={Y(points[hover].uses)} r="5" fill="var(--accent-strong)" stroke="#fff" strokeWidth="2" />
          </>
        )}
      </svg>
      {h && (
        <div className="chart-tip" style={{ left: tipLeft, width: tipW }}>
          <strong>{h.uses} uses</strong>
          <span>
            {h.label}
            {h.goal != null ? ` · goal ${h.goal}` : ''}
          </span>
        </div>
      )}
      <div
        className="linechart__hit"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        onPointerCancel={() => setHover(null)}
      />
    </div>
  );
}
