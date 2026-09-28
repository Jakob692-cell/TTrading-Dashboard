import { useState } from 'react';
import { PushedHeader } from '../components/navigation/TabBar';
import { Icon } from '../components/ui/Icon';
import { SectionHeader } from '../components/ui/primitives';
import { ProgressRing } from '../components/ui/ProgressRing';
import { ShareBars } from '../components/charts/ShareBars';
import { useDerived } from '../state/useDerived';
import { useUi } from '../state/Ui';
import { formatHour, formatShortDate } from '../domain/dates';
import { formatPercent } from '../domain/format';
import { partOfDay, windowLabel } from '../domain/insights';
import { lowestCompletedDay } from '../domain/stats';

export function InsightsScreen() {
  const d = useDerived();
  const { openCraving } = useUi();
  const lowest = lowestCompletedDay(d.days);

  return (
    <>
      <PushedHeader back="Back" title="Insights" subtitle="Patterns in your own data." />

      {d.habit && (
        <section className="card stack enter" style={{ gap: 14, ['--i' as string]: 1 }} aria-labelledby="rhythm">
          <h2 className="label" id="rhythm">
            Your daily rhythm
          </h2>
          <p className="insight-text">
            You usually use NoVape most between {windowLabel(d.habit.windowStart, 2)}.
          </p>
          <RhythmBars profile={d.habit.profile} windowStart={d.habit.windowStart} peak={d.habit.peakHour} />
          <p className="small muted" style={{ fontSize: 14, lineHeight: '20px' }}>
            The single strongest hour is {partOfDay(d.habit.peakHour)} ({formatHour(d.habit.peakHour)}–{formatHour(d.habit.peakHour + 1)}). A short walk,
            a glass of water or a two-minute pause right before it can make that moment easier.
          </p>
        </section>
      )}

      <section className="section enter" style={{ ['--i' as string]: 2 }}>
        <SectionHeader label="What triggers cravings" aside={`${d.outcomes.answered} check-ins`} />
        <div className="card stack" style={{ gap: 16 }}>
          {d.triggers.length ? (
            <ShareBars items={d.triggers.map((t) => ({ label: t.label, share: t.share, count: t.count }))} />
          ) : (
            <p className="small muted">Use “Craving?” when you feel the urge. Your triggers will show up here.</p>
          )}
          <button type="button" className="btn btn--secondary" style={{ alignSelf: 'flex-start' }} onClick={openCraving}>
            <Icon name="wave" size={16} /> Log a craving
          </button>
        </div>
      </section>

      {d.outcomes.answered > 0 && (
        <section className="section enter" style={{ ['--i' as string]: 3 }}>
          <SectionHeader label="After waiting two minutes" />
          <div className="card row" style={{ gap: 16 }}>
            <ProgressRing size={64} stroke={7} value={d.outcomes.easedShare} label={`${formatPercent(d.outcomes.easedShare)} of cravings eased`}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{formatPercent(d.outcomes.easedShare)}</span>
            </ProgressRing>
            <p className="small muted" style={{ fontSize: 14, lineHeight: '20px' }}>
              <strong style={{ color: 'var(--text)' }}>Most cravings eased.</strong> {d.outcomes.gone} went away completely, {d.outcomes.lower} got
              weaker and {d.outcomes.same} stayed about the same.
            </p>
          </div>
        </section>
      )}

      <section className="section enter" style={{ ['--i' as string]: 4 }}>
        <SectionHeader label="Worth knowing" />
        <div className="list">
          {d.weekend != null && (
            <div className="list-row">
              <span className="list-row__icon">
                <Icon name="clock" />
              </span>
              <span className="list-row__text">
                <span className="list-row__title">
                  {Math.abs(d.weekend) < 0.05
                    ? 'Weekends look like weekdays'
                    : `Weekends run ${Math.round(Math.abs(d.weekend) * 100)}% ${d.weekend > 0 ? 'higher' : 'lower'}`}
                </span>
                <span className="list-row__sub">Use starts later and shifts into the evening.</span>
              </span>
            </div>
          )}
          {lowest && (
            <div className="list-row">
              <span className="list-row__icon">
                <Icon name="leaf" />
              </span>
              <span className="list-row__text">
                <span className="list-row__title">Lowest day so far: {lowest.uses}</span>
                <span className="list-row__sub">{formatShortDate(lowest.date)} · day {lowest.dayNumber}</span>
              </span>
            </div>
          )}
          <div className="list-row">
            <span className="list-row__icon">
              <Icon name="goals" />
            </span>
            <span className="list-row__text">
              <span className="list-row__title">Daily goal reached {d.goalsMet} times</span>
              <span className="list-row__sub">Missed days are data points, not failures.</span>
            </span>
          </div>
        </div>
      </section>

      <p className="fineprint" style={{ margin: '20px 4px 0' }}>
        Insights describe patterns in your own tracking. They aren’t medical advice.
      </p>
    </>
  );
}

function RhythmBars({ profile, windowStart, peak }: { profile: number[]; windowStart: number; peak: number }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0.1, ...profile);
  return (
    <div className="hourly" onPointerLeave={() => setActive(null)}>
      <div className="hourly__readout small" aria-live="polite">
        {active != null ? (
          <>
            <strong className="tabular">{profile[active].toFixed(1)}</strong>
            <span className="muted"> avg uses · {formatHour(active)}</span>
          </>
        ) : (
          <span className="faint">Average per hour, all days</span>
        )}
      </div>
      <div className="hourly__plot" style={{ height: 88 }} role="list" aria-label="Average uses per hour">
        {profile.map((v, h) => {
          const inWindow = h >= windowStart && h < windowStart + 2;
          return (
            <div
              key={h}
              role="listitem"
              tabIndex={0}
              aria-label={`${formatHour(h)}, ${v.toFixed(1)} uses on average`}
              className={`hourly__slot${active === h ? ' is-active' : ''}`}
              style={{ width: 9 }}
              onPointerEnter={() => setActive(h)}
              onPointerDown={() => setActive(h)}
              onFocus={() => setActive(h)}
            >
              <span
                className={`hourly__bar${h === peak || inWindow ? ' is-peak' : ''}`}
                style={{ width: 8, height: `${Math.max(2, (v / max) * 100)}%`, animationDelay: `${120 + h * 22}ms`, background: h === peak || inWindow ? undefined : '#cfe7d8' }}
              />
            </div>
          );
        })}
      </div>
      <div className="hourly__axis" aria-hidden="true">
        {profile.map((_, h) => (
          <span key={h} style={{ width: 9 }}>
            {h % 6 === 0 ? String(h).padStart(2, '0') : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
