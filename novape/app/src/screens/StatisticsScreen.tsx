import { useMemo, useState } from 'react';
import { Icon } from '../components/ui/Icon';
import { MetricTile, ScreenHeader, SectionHeader, SegmentedControl } from '../components/ui/primitives';
import { DailyLineChart } from '../components/charts/DailyLineChart';
import { UsageHeatmap } from '../components/charts/UsageHeatmap';
import { useData } from '../state/AppStore';
import { useDerived } from '../state/useDerived';
import { useNav } from '../navigation/Navigator';
import { completeDays } from '../domain/stats';
import { formatShortDate, formatHour } from '../domain/dates';
import { formatEuro, formatSignedPercent } from '../domain/format';
import { partOfDay, windowLabel } from '../domain/insights';

type Range = '7D' | '30D' | '3M' | 'ALL';
const RANGE_DAYS: Record<Range, number> = { '7D': 7, '30D': 30, '3M': 90, ALL: Infinity };

export function StatisticsScreen() {
  const { user } = useData();
  const d = useDerived();
  const nav = useNav();
  const [range, setRange] = useState<Range>('30D');

  const done = completeDays(d.days);
  const slice = useMemo(() => {
    const n = RANGE_DAYS[range];
    return n === Infinity ? done : done.slice(-n);
  }, [done, range]);

  const points = slice.map((day) => ({ label: formatShortDate(day.date), uses: day.uses, goal: day.goal }));
  const avg = slice.length ? Math.round(slice.reduce((a, x) => a + x.uses, 0) / slice.length) : 0;
  const coversAll = slice.length === done.length;
  const caption = slice.length
    ? coversAll
      ? `Since you started · ${slice.length} ${slice.length === 1 ? 'day' : 'days'}`
      : `${formatShortDate(slice[0].date)} – ${formatShortDate(slice[slice.length - 1].date)}`
    : 'Your first full day will appear here tomorrow.';

  const peak = d.habit?.peakHour ?? null;
  const windowStart = d.habit?.windowStart ?? null;

  return (
    <>
      <ScreenHeader title="Your progress" subtitle={`Day ${d.dayNumber} · since ${formatShortDate(user.journeyStartDate)}`} />

      <div className="enter" style={{ ['--i' as string]: 1 }}>
        <SegmentedControl<Range>
          label="Time range"
          value={range}
          onChange={setRange}
          options={[
            { value: '7D', label: '7D' },
            { value: '30D', label: '30D' },
            { value: '3M', label: '3M' },
            { value: 'ALL', label: 'ALL' },
          ]}
        />
      </div>

      <section className="card stack enter" style={{ marginTop: 16, gap: 14, ['--i' as string]: 2 }} aria-labelledby="daily-uses">
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="label" id="daily-uses">
            Daily uses
          </h2>
          <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
            <span className="num" style={{ fontSize: 40, lineHeight: '44px', letterSpacing: '-0.045em' }}>
              {avg}
            </span>
            <span className="muted" style={{ fontSize: 15 }}>
              avg / day
            </span>
            {slice.length > 0 && (
              <span className="pill pill--accent" style={{ marginLeft: 'auto' }}>
                {formatSignedPercent(avg / user.baselinePerDay - 1)} vs baseline
              </span>
            )}
          </div>
          <span className="small muted">{caption}</span>
        </div>
        <div className="legend" aria-hidden="true">
          <span>
            <i className="legend__line" style={{ background: 'var(--accent-strong)' }} />
            Daily uses
          </span>
          <span>
            <i className="legend__line" style={{ background: '#bdbdc2' }} />
            Goal
          </span>
          <span>
            <i className="legend__dash" />
            Baseline
          </span>
        </div>
        {points.length > 0 && <DailyLineChart points={points} baseline={user.baselinePerDay} animationKey={range} />}
      </section>

      <section className="section enter" style={{ ['--i' as string]: 3 }}>
        <SectionHeader label="Since starting" />
        <div className="metrics">
          <MetricTile value={d.avg7 == null ? '—' : formatSignedPercent(-d.reduction)} label="Daily usage" />
          <MetricTile value={d.avoided.toLocaleString('en-US')} label="Vape uses avoided" />
          <MetricTile value={formatEuro(d.savings)} label="Estimated savings" />
        </div>
        <p className="fineprint" style={{ margin: '10px 2px 0' }}>
          Daily usage compares your last 7 days with your baseline. Savings are estimated from the €{user.weeklySpendBefore}/week you spent
          before — change it in Account.
        </p>
      </section>

      <section className="section enter" style={{ ['--i' as string]: 4 }}>
        <SectionHeader label="When do you use it?" />
        <div className="card stack" style={{ gap: 14 }}>
          <div className="row between" style={{ alignItems: 'baseline' }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Average uses by hour</span>
            <span className="small muted">Last 3 weeks</span>
          </div>
          <UsageHeatmap grid={d.heatmap} highlightHour={peak} />
          {peak != null && windowStart != null && (
            <>
              <hr className="divider" />
              <div className="stack" style={{ gap: 4 }}>
                <p style={{ fontSize: 16, lineHeight: '23px', fontWeight: 600, letterSpacing: '-0.015em' }}>
                  Your strongest habit window is {partOfDay(peak)}, between {formatHour(peak)}–{formatHour(peak + 1)}.
                </p>
                <p className="small muted" style={{ fontSize: 13.5, lineHeight: '19px' }}>
                  {windowStart !== peak && windowStart + 1 !== peak
                    ? `${windowLabel(windowStart, 2)} is a close second. `
                    : ''}
                  {d.weekend != null && Math.abs(d.weekend) >= 0.05
                    ? `On weekends you use it ${Math.round(Math.abs(d.weekend) * 100)}% ${d.weekend > 0 ? 'more' : 'less'}, later in the day.`
                    : 'Weekdays and weekends look similar.'}
                </p>
              </div>
            </>
          )}
        </div>
      </section>

      <button type="button" className="card row pressable enter" style={{ marginTop: 12, width: '100%', gap: 14, textAlign: 'left', ['--i' as string]: 5 }} onClick={() => nav.push({ name: 'insights' })}>
        <span className="insight-icon">
          <Icon name="sparkle" size={20} />
        </span>
        <span className="grow stack" style={{ gap: 2 }}>
          <span style={{ fontSize: 15.5, fontWeight: 600 }}>Triggers & craving check-ins</span>
          <span className="small muted">{d.outcomes.answered} check-ins so far</span>
        </span>
        <Icon name="chevronRight" size={15} strokeWidth={2} className="chevron" />
      </button>
    </>
  );
}
