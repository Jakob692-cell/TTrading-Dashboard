import { Icon } from '../components/ui/Icon';
import { MetricTile, SectionHeader } from '../components/ui/primitives';
import { ProgressRing } from '../components/ui/ProgressRing';
import { HourlyBars } from '../components/charts/HourlyBars';
import { useCountUp } from '../hooks/motion';
import { useConnection, useData } from '../state/AppStore';
import { useDerived } from '../state/useDerived';
import { useNav } from '../navigation/Navigator';
import { formatTime, greetingFor } from '../domain/dates';
import { formatEuro, formatPercent, plural } from '../domain/format';
import { windowLabel } from '../domain/insights';
import { typicalByNow } from '../domain/stats';

export function HomeScreen() {
  const { user, device } = useData();
  const d = useDerived();
  const nav = useNav();
  const connection = useConnection();

  const uses = d.today?.uses ?? 0;
  const goal = d.currentGoal?.dailyLimit ?? null;
  const shown = useCountUp(uses);
  const ringValue = goal == null ? Math.min(1, uses / user.baselinePerDay) : goal === 0 ? (uses > 0 ? 1 : 0) : uses / goal;
  const over = goal != null && uses > goal;
  const usual = Math.round(typicalByNow(d.days, d.now));
  const nowHour = new Date(d.now).getHours();

  let message: string;
  if (goal == null) message = 'Just noticing this week — no limits yet.';
  else if (over) message = `${uses - goal} above today’s goal`;
  else if (uses === goal) message = 'Right at your daily goal';
  else message = `${goal - uses} fewer than your daily goal`;

  return (
    <>
      <div className="row between enter" style={{ alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 4 }}>
          <h1 className="title-lg">
            {greetingFor(d.now)}, {user.firstName}
          </h1>
          <p className="subtitle">Day {d.dayNumber} of your journey</p>
        </div>
        <button
          type="button"
          className="device-chip pressable"
          onClick={() => nav.push({ name: 'device' })}
          aria-label={device ? `${device.name}, ${connection}, battery ${device.batteryLevel}%` : 'Connect your NoVape'}
        >
          <span className={`dot${connection === 'connected' ? '' : ' dot--off'}`} />
          {device ? (connection === 'connected' ? `${device.batteryLevel}%` : connection === 'disconnected' ? 'Offline' : '…') : 'Connect'}
        </button>
      </div>

      <section className="card hero-card enter" style={{ marginTop: 24, ['--i' as string]: 1 }} aria-label="Today">
        <div className="label">Today</div>
        <ProgressRing size={216} stroke={12} value={ringValue} label={`${uses} uses today${goal != null ? ` of a goal of ${goal}` : ''}`}>
          <span className="hero-number">{shown}</span>
          <span className="muted" style={{ fontSize: 15 }}>
            {uses === 1 ? 'use' : 'uses'}
          </span>
          <span className="pill" style={{ marginTop: 10 }}>
            {goal == null ? 'Observe week' : `Goal: ≤ ${goal}`}
          </span>
        </ProgressRing>
        <div className="hero-message">
          <span className="hero-message__main">
            {!over && goal != null && (
              <span className="check-dot">
                <Icon name="check" size={12} strokeWidth={2.4} />
              </span>
            )}
            {message}
          </span>
          {over && <span className="small muted">Tomorrow is another data point.</span>}
        </div>
      </section>

      <div className="metrics enter" style={{ marginTop: 12, ['--i' as string]: 2 }}>
        <MetricTile value={plural(d.streak, 'day')} label="Current streak" />
        <MetricTile value={d.avg7 == null ? '—' : formatPercent(Math.max(0, d.reduction))} label="Less than baseline" />
        <MetricTile value={formatEuro(d.savings)} label="Est. savings" />
      </div>

      <section className="section enter" style={{ ['--i' as string]: 3 }}>
        <SectionHeader label="Today’s progress" />
        <div className="card stack" style={{ gap: 12 }}>
          <div className="row between" style={{ alignItems: 'baseline' }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Uses per hour</span>
            <span className="small muted">Now {formatTime(d.now)}</span>
          </div>
          <HourlyBars byHour={d.today?.byHour ?? new Array(24).fill(0)} nowHour={nowHour} />
          {usual > 0 && (
            <p className="small muted">
              By this time you’d usually be at about <strong style={{ color: 'var(--text)' }}>{usual}</strong>.
            </p>
          )}
        </div>
      </section>

      {d.habit && (
        <section className="section enter" style={{ ['--i' as string]: 4 }}>
          <SectionHeader label="Insight" />
          <div className="card card--lg stack" style={{ gap: 14 }}>
            <span className="insight-icon">
              <Icon name="clock" size={20} />
            </span>
            <div className="stack" style={{ gap: 6 }}>
              <p className="insight-text">You usually use NoVape most between {windowLabel(d.habit.windowStart, 2)}.</p>
              <p className="small muted" style={{ fontSize: 14, lineHeight: '20px' }}>
                Knowing your triggers makes them easier to change.
              </p>
            </div>
            <button type="button" className="btn btn--secondary" style={{ alignSelf: 'flex-start' }} onClick={() => nav.push({ name: 'insights' })}>
              View insights
              <Icon name="chevronRight" size={14} strokeWidth={2} />
            </button>
          </div>
        </section>
      )}
    </>
  );
}
