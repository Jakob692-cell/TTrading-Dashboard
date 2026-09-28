import type { ReactNode } from 'react';
import { useAppeared } from '../../hooks/motion';

interface ProgressRingProps {
  size: number;
  stroke: number;
  /** 0–1 */
  value: number;
  color?: string;
  track?: string;
  children?: ReactNode;
  label?: string;
  duration?: number;
}

/** Circular progress that draws itself in on mount and animates between values. */
export function ProgressRing({
  size,
  stroke,
  value,
  color = 'var(--accent)',
  track = 'var(--bg-tertiary)',
  children,
  label,
  duration = 1.1,
}: ProgressRingProps) {
  const appeared = useAppeared();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const offset = appeared ? c * (1 - v) : c;
  return (
    <div
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: `stroke-dashoffset ${duration}s var(--ease-out)`, opacity: v === 0 ? 0 : 1 }}
        />
      </svg>
      {children && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
