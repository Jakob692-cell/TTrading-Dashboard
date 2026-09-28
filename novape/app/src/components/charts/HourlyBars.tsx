import { useState } from 'react';
import { formatHour } from '../../domain/dates';

interface HourlyBarsProps {
  byHour: number[];
  /** Current hour; later hours are drawn as empty slots. */
  nowHour: number;
  fromHour?: number;
  toHour?: number;
}

/** Uses per hour for today. Peak bar is emphasised and labelled; every bar has a hover/focus readout. */
export function HourlyBars({ byHour, nowHour, fromHour = 6, toHour = 23 }: HourlyBarsProps) {
  const [active, setActive] = useState<number | null>(null);
  const hours = Array.from({ length: toHour - fromHour + 1 }, (_, i) => fromHour + i);
  const past = hours.filter((h) => h <= nowHour);
  const max = Math.max(4, ...past.map((h) => byHour[h] ?? 0));
  const peak = past.reduce<number | null>((best, h) => (best == null || byHour[h] > byHour[best] ? h : best), null);
  const peakHasValue = peak != null && byHour[peak] > 0;
  const shown = active ?? null;

  return (
    <div className="hourly" onPointerLeave={() => setActive(null)}>
      <div className="hourly__readout small" aria-live="polite">
        {shown != null ? (
          <>
            <strong className="tabular">{byHour[shown] ?? 0}</strong>
            <span className="muted"> {byHour[shown] === 1 ? 'use' : 'uses'} · {formatHour(shown)}</span>
          </>
        ) : (
          <span className="faint">Tap a bar for details</span>
        )}
      </div>
      <div className="hourly__plot" role="list" aria-label="Uses per hour today">
        {hours.map((h, i) => {
          const future = h > nowHour;
          const v = byHour[h] ?? 0;
          const height = future ? 4 : v === 0 ? 2 : Math.max(6, (v / max) * 100);
          const isPeak = peakHasValue && h === peak;
          return (
            <div
              key={h}
              role="listitem"
              tabIndex={future ? -1 : 0}
              aria-label={future ? `${formatHour(h)}, upcoming` : `${formatHour(h)}, ${v} uses`}
              className={`hourly__slot${active === h ? ' is-active' : ''}`}
              onPointerEnter={() => !future && setActive(h)}
              onPointerDown={() => !future && setActive(h)}
              onFocus={() => !future && setActive(h)}
              onBlur={() => setActive(null)}
            >
              {isPeak && <span className="hourly__peak tabular">{v}</span>}
              <span
                className={`hourly__bar${future ? ' is-future' : ''}${isPeak ? ' is-peak' : ''}`}
                style={{ height: `${height}%`, animationDelay: `${150 + i * 28}ms` }}
              />
            </div>
          );
        })}
      </div>
      <div className="hourly__axis" aria-hidden="true">
        {hours.map((h) => (
          <span key={h}>{(h - fromHour) % 3 === 0 ? formatHour(h).slice(0, 2) : ''}</span>
        ))}
      </div>
    </div>
  );
}
