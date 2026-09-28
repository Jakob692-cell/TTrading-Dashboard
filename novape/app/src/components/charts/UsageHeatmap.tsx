import { useState } from 'react';
import { formatHour, weekdayName } from '../../domain/dates';

const RAMP = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)', 'var(--heat-5)'];
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface Props {
  /** 7 × 24 average uses (Mon…Sun × hour). */
  grid: number[][];
  /** Hour to outline as the strongest habit window. */
  highlightHour?: number | null;
}

/** 24-hour × weekday heatmap in a single sage ramp. Hover or focus a cell for its value. */
export function UsageHeatmap({ grid, highlightHour }: Props) {
  const [active, setActive] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(0.0001, ...grid.flat());
  const bin = (v: number) => {
    const t = v / max;
    return v < 0.15 ? 0 : t < 0.3 ? 1 : t < 0.5 ? 2 : t < 0.68 ? 3 : t < 0.85 ? 4 : 5;
  };
  const showLabel = (h: number) =>
    h === highlightHour || (h % 6 === 0 && (highlightHour == null || Math.abs(h - highlightHour) > 1));

  return (
    <div className="heatmap" onPointerLeave={() => setActive(null)}>
      <div className="heatmap__grid heatmap__hours" aria-hidden="true">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className={h === highlightHour ? 'is-highlight' : undefined}>
            {showLabel(h) ? String(h).padStart(2, '0') : ''}
          </span>
        ))}
      </div>
      <div className="heatmap__body" role="grid" aria-label="Average uses by weekday and hour">
        {grid.map((row, d) => (
          <div key={d} className="heatmap__grid" role="row">
            <span className="heatmap__day" role="rowheader">
              {DAY_LETTERS[d]}
            </span>
            {row.map((v, h) => (
              <span
                key={h}
                role="gridcell"
                tabIndex={h === 0 && d === 0 ? 0 : -1}
                aria-label={`${weekdayName(d)} ${formatHour(h)}, ${v.toFixed(1)} uses on average`}
                className="heatmap__cell"
                style={{ background: RAMP[bin(v)], animationDelay: `${200 + h * 12 + d * 18}ms` }}
                onPointerEnter={() => setActive({ d, h })}
                onPointerDown={() => setActive({ d, h })}
                onFocus={() => setActive({ d, h })}
              />
            ))}
          </div>
        ))}
        {highlightHour != null && (
          <span
            className="heatmap__outline"
            aria-hidden="true"
            style={{ left: `calc(24px + (100% - 24px) * ${highlightHour} / 24 - 1px)`, width: `calc((100% - 24px) / 24 + 2px)` }}
          />
        )}
      </div>
      <div className="row between heatmap__foot">
        <span className="small muted" aria-live="polite">
          {active ? (
            <>
              <strong className="tabular" style={{ color: 'var(--text)' }}>
                {grid[active.d][active.h].toFixed(1)}
              </strong>{' '}
              avg · {weekdayName(active.d)} {formatHour(active.h)}
            </>
          ) : (
            ' '
          )}
        </span>
        <span className="heatmap__legend" aria-hidden="true">
          Less
          {RAMP.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
