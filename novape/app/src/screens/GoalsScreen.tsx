import { useState } from 'react';
import { Icon } from '../components/ui/Icon';
import { Callout, ProgressBar, ScreenHeader, SectionHeader, Stepper, Toggle } from '../components/ui/primitives';
import { Sheet } from '../components/ui/Sheet';
import { useActions, useData } from '../state/AppStore';
import { useDerived } from '../state/useDerived';
import { useUi } from '../state/Ui';
import { diffDays, formatDateRange, toISODate } from '../domain/dates';
import { INTENTION_LABELS, formatPercent } from '../domain/format';
import { stepSizeFor } from '../domain/plan';
import { weekAverage } from '../domain/stats';
import type { Goal } from '../models';

export function GoalsScreen() {
  const { user, goals } = useData();
  const d = useDerived();
  const actions = useActions();
  const { toast } = useUi();
  const [editing, setEditing] = useState<Goal | null>(null);

  const today = toISODate(d.now);
  const current = d.currentGoal;
  const currentIdx = current?.weekIndex ?? 0;
  const uses = d.today?.uses ?? 0;
  const limit = current?.dailyLimit ?? null;
  const planEnded = goals.length > 0 && today > goals[goals.length - 1].endDate;

  const pastWeeks = goals.filter((g) => g.endDate < today);
  const missedWeeks = pastWeeks.filter((g) => {
    const avg = weekAverage(d.days, g);
    return g.dailyLimit != null && avg != null && avg > g.dailyLimit;
  });
  const thisWeekDays = d.days.filter((x) => current && x.complete && x.date >= current.startDate && x.date <= current.endDate);
  const thisWeekMet = thisWeekDays.filter((x) => x.goal == null || x.uses <= x.goal).length;
  const daysLeft = current ? Math.max(0, diffDays(today, current.endDate)) : 0;

  let support: { title: string; body: string };
  if (limit != null && uses > limit) {
    support = { title: 'Tomorrow is another data point.', body: 'A higher day doesn’t undo your progress. Notice what was different — that’s useful too.' };
  } else if (missedWeeks.length > 0) {
    const names = missedWeeks.map((g) => g.weekIndex + 1);
    const which = names.length === 1 ? `Week ${names[0]}` : `Weeks ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    support = {
      title: 'Progress doesn’t need to be perfect.',
      body: `${which} ran a little above target — and your daily use is still ${formatPercent(Math.max(0, d.reduction))} below where you started.`,
    };
  } else {
    support = { title: 'Steady and gentle.', body: 'Small, consistent steps tend to stick. Adjust the pace whenever you need to.' };
  }

  return (
    <>
      <ScreenHeader
        title="Your plan"
        subtitle={`${INTENTION_LABELS[user.intention]} · week ${Math.min(currentIdx + 1, goals.length)} of ${goals.length}`}
      />

      <section className="card card--lg stack enter" style={{ gap: 18, ['--i' as string]: 1 }} aria-labelledby="current-goal">
        <div className="row between">
          <h2 className="label" id="current-goal">
            Current goal
          </h2>
          <span className="pill pill--accent">
            {planEnded ? 'Maintaining' : `Week ${currentIdx + 1} · ${daysLeft === 0 ? 'ends today' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}`}
          </span>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          <span className="num" style={{ fontSize: 72, lineHeight: '72px', letterSpacing: '-0.055em' }}>
            {limit == null ? '—' : limit}
          </span>
          <span className="muted" style={{ fontSize: 17 }}>
            {limit == null ? 'observe only' : 'uses/day'}
          </span>
        </div>
        {limit != null && (
          <div className="stack" style={{ gap: 10 }}>
            <div className="row between" style={{ fontSize: 14 }}>
              <span className="muted">Today</span>
              <span className="tabular" style={{ fontWeight: 600 }}>
                {uses} / {limit}
              </span>
            </div>
            <ProgressBar value={limit === 0 ? (uses > 0 ? 1 : 0) : uses / limit} label="Today against goal" />
            {thisWeekDays.length > 0 && (
              <span className="small muted">
                This week: at or under goal on {thisWeekMet} of {thisWeekDays.length} days so far.
              </span>
            )}
          </div>
        )}
      </section>

      <div className="enter" style={{ marginTop: 12, ['--i' as string]: 2 }}>
        <Callout icon="leaf">
          <strong>{support.title}</strong>
          <br />
          {support.body}
        </Callout>
      </div>

      <section className="section enter" style={{ ['--i' as string]: 3 }}>
        <SectionHeader label="Reduction plan" aside="Tap a week to edit" />
        <div className="card card--flush" style={{ padding: '6px 0' }}>
          <div className="plan-row" style={{ borderTop: 0 }}>
            <span className="plan-marker">
              <span className="dot dot--off" style={{ width: 8, height: 8 }} />
            </span>
            <span className="grow stack" style={{ gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Starting point</span>
              <span className="small muted">Your baseline</span>
            </span>
            <span className="plan-target__value muted">
              {user.baselinePerDay}
              <small>/day</small>
            </span>
          </div>
          {goals.map((g) => {
            const past = g.endDate < today;
            const isCurrent = g.id === current?.id && !planEnded;
            const avg = past ? weekAverage(d.days, g) : null;
            return (
              <button
                key={g.id}
                type="button"
                className={`plan-row${isCurrent ? ' is-current' : ''}`}
                onClick={() => setEditing(g)}
                aria-label={`Week ${g.weekIndex + 1}, ${g.dailyLimit == null ? 'observe only' : `${g.dailyLimit} uses per day`}. Edit target`}
              >
                <span className="plan-marker">
                  <WeekMarker state={past ? 'done' : isCurrent ? 'current' : 'future'} />
                </span>
                <span className="grow stack" style={{ gap: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>Week {g.weekIndex + 1}</span>
                  <span className="small muted">{formatDateRange(g.startDate, g.endDate)}</span>
                </span>
                <span className="plan-target">
                  <span className="plan-target__value" style={{ color: past || isCurrent ? 'var(--text)' : 'var(--text-secondary)' }}>
                    {g.dailyLimit == null ? 'Observe' : g.dailyLimit}
                    {g.dailyLimit != null && <small>/day</small>}
                  </span>
                  <span
                    className="small"
                    style={{
                      fontWeight: past || isCurrent ? 600 : 500,
                      color: past ? 'var(--accent-ink)' : isCurrent ? 'var(--text)' : 'var(--text-tertiary)',
                    }}
                  >
                    {past ? `Completed ✓${avg != null ? ` · avg ${Math.round(avg)}` : ''}` : isCurrent ? 'Current' : 'Edit'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--block"
          style={{ marginTop: 8 }}
          onClick={async () => {
            await actions.addGoalWeek();
            toast('Week added to your plan');
          }}
        >
          <Icon name="plus" size={16} strokeWidth={2} /> Add a week
        </button>
        <p className="fineprint" style={{ margin: '4px 4px 0' }}>
          Your plan, your pace. Every target can be changed at any time — slowing down is always allowed.
        </p>
      </section>

      <GoalEditor
        goal={editing}
        previous={editing ? (editing.weekIndex === 0 ? user.baselinePerDay : goals[editing.weekIndex - 1]?.dailyLimit ?? user.baselinePerDay) : 0}
        step={stepSizeFor(user.baselinePerDay)}
        onClose={() => setEditing(null)}
        onSave={async (value) => {
          if (!editing) return;
          await actions.updateGoal(editing.id, value);
          setEditing(null);
          toast(`Week ${editing.weekIndex + 1} updated`);
        }}
      />
    </>
  );
}

function WeekMarker({ state }: { state: 'done' | 'current' | 'future' }) {
  if (state === 'done')
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r="11" fill="var(--accent)" />
        <path d="M6.8 11.3l2.8 2.8 5.6-5.6" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (state === 'current')
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r="9.5" fill="#fff" stroke="var(--accent)" strokeWidth="3" />
        <circle cx="11" cy="11" r="3.5" fill="var(--accent)" />
      </svg>
    );
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="9.5" fill="none" stroke="#dadade" strokeWidth="1.5" />
    </svg>
  );
}

function GoalEditor({
  goal,
  previous,
  step,
  onClose,
  onSave,
}: {
  goal: Goal | null;
  previous: number | null;
  step: number;
  onClose: () => void;
  onSave: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState<number>(0);
  const [observe, setObserve] = useState(false);
  const [forId, setForId] = useState<string | null>(null);

  if (goal && goal.id !== forId) {
    setForId(goal.id);
    setDraft(goal.dailyLimit ?? previous ?? 0);
    setObserve(goal.dailyLimit == null);
  }

  const prev = previous ?? draft;
  const hint = observe
    ? 'No limit this week — just notice when and why you reach for it.'
    : draft > prev
      ? 'That’s above the week before — completely fine if you need more time.'
      : draft === 0
        ? 'A day without NoVape. Take it one week at a time.'
        : draft === prev
          ? 'Same as the week before. Holding steady is progress too.'
          : `${prev - draft} fewer than the week before. Small steps tend to stick.`;

  return (
    <Sheet open={goal != null} onClose={onClose} label="Edit weekly target">
      {goal && (
        <div className="stack" style={{ alignItems: 'center', gap: 20, paddingTop: 16 }}>
          <div className="stack" style={{ alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>Week {goal.weekIndex + 1} target</span>
            <span className="small muted">{formatDateRange(goal.startDate, goal.endDate)}</span>
          </div>
          <div style={{ opacity: observe ? 0.35 : 1, pointerEvents: observe ? 'none' : 'auto', transition: 'opacity .2s ease' }}>
            <Stepper value={draft} onChange={setDraft} step={step} min={0} max={400} unit="uses/day" />
          </div>
          <p className="small muted" style={{ textAlign: 'center', fontSize: 13.5, lineHeight: '19px', minHeight: 38 }}>
            {hint}
          </p>
          <div className="list" style={{ width: '100%' }}>
            <div className="list-row">
              <span className="list-row__text">
                <span className="list-row__title">Observe only</span>
                <span className="list-row__sub">Track without a daily limit</span>
              </span>
              <Toggle on={observe} onChange={setObserve} label="Observe only" />
            </div>
          </div>
          <div className="stack" style={{ width: '100%', gap: 8 }}>
            <button type="button" className="btn btn--primary btn--block" onClick={() => onSave(observe ? null : draft)}>
              Save target
            </button>
            <button type="button" className="btn btn--ghost btn--block" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
