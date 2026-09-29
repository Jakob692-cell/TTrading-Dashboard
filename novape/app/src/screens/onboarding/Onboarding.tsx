import { useState } from 'react';
import { Logo } from '../../components/brand/Logo';
import { Icon } from '../../components/ui/Icon';
import { Callout, RangeSlider, Stepper } from '../../components/ui/primitives';
import { DeviceRender } from '../../components/device/DeviceRender';
import { BACKDROP, Scene3D } from '../../components/three/Scene3D';
import { useActions, useConnection } from '../../state/AppStore';
import { stepSizeFor, suggestWeeklyLimits } from '../../domain/plan';
import type { Intention } from '../../models';

type Step = 0 | 1 | 2 | 3 | 4;

const INTENTIONS: { id: Intention; title: string; sub: string }[] = [
  { id: 'quit', title: 'Stop vaping completely', sub: 'Step down gradually until you don’t need it anymore.' },
  { id: 'reduce', title: 'Vape less', sub: 'Find a level that feels right for you.' },
  { id: 'understand', title: 'Understand my habits', sub: 'Just track for now. Set goals when you’re ready.' },
];

export function Onboarding() {
  const actions = useActions();
  const [step, setStep] = useState<Step>(0);
  const [dir, setDir] = useState<'push' | 'pop'>('push');
  const [intention, setIntention] = useState<Intention>('quit');
  const [baseline, setBaseline] = useState(120);
  const [limits, setLimits] = useState<(number | null)[]>([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  const go = (next: Step) => {
    setDir(next > step ? 'push' : 'pop');
    if (next === 4 && step === 3) setLimits(suggestWeeklyLimits(baseline, intention));
    setStep(next);
  };

  const finish = async () => {
    setBusy(true);
    await actions.completeOnboarding({ intention, baselinePerDay: baseline, weeklyLimits: limits, deviceConnected: connected });
  };

  if (step === 0) {
    return (
      <div className="onboarding anim-fade">
        <div className="stack" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingTop: 28 }}>
          <Logo />
          <Scene3D
            className="hero3d enter"
            style={{ ['--i' as string]: 2 }}
            spec={{ kind: 'device', finish: 'champagne', led: 'on' }}
            options={{ backdrop: BACKDROP.page, motion: 'oscillate', float: true, interactive: true }}
            label="NoVape One, slowly turning"
            fallback={<DeviceRender height={250} led="on" className="float" />}
          />
          <div className="stack enter" style={{ alignItems: 'center', gap: 12, textAlign: 'center', ['--i' as string]: 4 }}>
            <h1>Take back control.</h1>
            <p className="lead" style={{ fontSize: 17, lineHeight: '25px', maxWidth: 290 }}>
              Understand your habits. Reduce them at your own pace.
            </p>
          </div>
        </div>
        <div className="onboarding__actions enter" style={{ ['--i' as string]: 6 }}>
          <button type="button" className="btn btn--primary btn--block" onClick={() => go(1)}>
            Get started
          </button>
          <button type="button" className="btn btn--ghost btn--block" onClick={() => actions.signIn()}>
            I already have an account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding">
      <div className="onboarding__top">
        <button type="button" className="icon-btn" style={{ marginLeft: -8 }} aria-label="Back" onClick={() => go((step - 1) as Step)}>
          <Icon name="chevronLeft" size={22} strokeWidth={2} />
        </button>
        <div className="progress-steps" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step}>
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className={i <= step ? 'is-done' : undefined} />
          ))}
        </div>
      </div>

      <div key={step} className={`onboarding__body ${dir === 'push' ? 'anim-push' : 'anim-pop'}`}>
        {step === 1 && <IntentionStep value={intention} onChange={setIntention} />}
        {step === 2 && <BaselineStep value={baseline} onChange={setBaseline} />}
        {step === 3 && <ConnectStep connected={connected} onConnected={() => setConnected(true)} onSkip={() => go(4)} />}
        {step === 4 && <PlanStep baseline={baseline} limits={limits} onChange={setLimits} />}
      </div>

      <div className="onboarding__actions">
        {step === 1 && (
          <button type="button" className="btn btn--primary btn--block" onClick={() => go(2)}>
            Continue
          </button>
        )}
        {step === 2 && (
          <button type="button" className="btn btn--primary btn--block" onClick={() => go(3)}>
            Continue
          </button>
        )}
        {step === 3 && connected && (
          <button type="button" className="btn btn--primary btn--block" onClick={() => go(4)}>
            Continue
          </button>
        )}
        {step === 4 && (
          <button type="button" className="btn btn--primary btn--block" disabled={busy} onClick={finish}>
            Start my plan
          </button>
        )}
      </div>
    </div>
  );
}

function IntentionStep({ value, onChange }: { value: Intention; onChange: (v: Intention) => void }) {
  return (
    <>
      <div className="stack" style={{ gap: 10, marginTop: 28 }}>
        <h1>What would you like to achieve?</h1>
        <p className="lead">There’s no wrong answer. You can change this anytime.</p>
      </div>
      <div className="stack" role="radiogroup" aria-label="Your intention" style={{ gap: 12, marginTop: 32 }}>
        {INTENTIONS.map((o) => {
          const selected = value === o.id;
          return (
            <button key={o.id} type="button" role="radio" aria-checked={selected} className={`choice${selected ? ' is-selected' : ''}`} onClick={() => onChange(o.id)}>
              <span className="stack grow" style={{ gap: 4 }}>
                <span className="choice__title">{o.title}</span>
                <span className="choice__sub">{o.sub}</span>
              </span>
              {selected ? (
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="12" fill="var(--accent)" />
                  <path d="M7.5 12.3l3 3 6-6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="11" fill="none" stroke="#dadade" strokeWidth="1.5" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

function BaselineStep({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <>
      <div className="stack" style={{ gap: 10, marginTop: 28 }}>
        <h1>How often do you currently vape?</h1>
        <p className="lead">A rough estimate is completely fine.</p>
      </div>
      <div className="stack" style={{ alignItems: 'center', gap: 36, marginTop: 48 }}>
        <Stepper value={value} onChange={onChange} step={5} min={5} max={300} unit="uses per day" size="xl" format={(v) => (v >= 300 ? '300+' : String(v))} />
        <div className="stack" style={{ width: '100%', gap: 8 }}>
          <RangeSlider value={value} min={5} max={300} step={5} onChange={onChange} label="Uses per day" />
          <div className="row between fineprint">
            <span>5</span>
            <span>300+</span>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 36 }}>
        <Callout icon="info" tone="neutral">
          <strong>This gives us your starting point.</strong> After a few days, NoVape can refine it from what you actually track.
        </Callout>
      </div>
    </>
  );
}

function ConnectStep({ connected, onConnected, onSkip }: { connected: boolean; onConnected: () => void; onSkip: () => void }) {
  const actions = useActions();
  const connection = useConnection();
  const searching = connection === 'scanning' || connection === 'connecting';
  const [failed, setFailed] = useState(false);

  const title = connected ? 'NoVape One connected' : searching ? 'Looking for your NoVape…' : 'Connect your NoVape';
  const sub = connected
    ? 'Your uses will now sync automatically.'
    : searching
      ? 'Keep your device close to your phone.'
      : 'Hold the button on your NoVape One for 3 seconds, until the light starts to pulse.';

  return (
    <>
      <Scene3D
        className="device-stage3d"
        style={{ marginTop: 8 }}
        spec={{ kind: 'device', finish: 'champagne', led: connected ? 'on' : searching ? 'pulse' : 'off', searching }}
        options={{ backdrop: BACKDROP.page, motion: 'oscillate', float: true, interactive: true }}
        label={connected ? 'NoVape One, connected' : 'NoVape One'}
        fallback={<DeviceRender height={272} led={connected ? 'on' : searching ? 'pulse' : 'off'} className="float" />}
      />
      <div className="stack" style={{ alignItems: 'center', gap: 10, textAlign: 'center', marginTop: 8 }}>
        <h1 style={{ fontSize: 28, lineHeight: '34px' }}>{title}</h1>
        <p className="lead" style={{ maxWidth: 310 }}>
          {sub}
        </p>
        {failed && !searching && (
          <p className="small" style={{ color: 'var(--warning)' }}>
            Couldn’t find it this time. Try again when the light pulses.
          </p>
        )}
      </div>
      <div style={{ flex: 1 }} />
      {!connected && (
        <div className="stack" style={{ gap: 8, paddingTop: 20 }}>
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={searching}
            onClick={async () => {
              setFailed(false);
              const ok = await actions.connectDevice();
              if (ok) onConnected();
              else setFailed(true);
            }}
          >
            {searching ? 'Searching…' : 'Connect device'}
          </button>
          <button type="button" className="btn btn--ghost btn--block" onClick={onSkip}>
            Set up later
          </button>
        </div>
      )}
      <p className="fineprint" style={{ textAlign: 'center', marginTop: 8 }}>
        NoVape One is nicotine-free and produces no vapor.
      </p>
    </>
  );
}

function PlanStep({ baseline, limits, onChange }: { baseline: number; limits: (number | null)[]; onChange: (l: (number | null)[]) => void }) {
  const step = stepSizeFor(baseline);
  const shown = limits.slice(0, 3);
  const rest = limits.slice(3);
  const set = (i: number, v: number) => onChange(limits.map((x, k) => (k === i ? Math.max(0, v) : x)));

  return (
    <>
      <div className="stack" style={{ gap: 10, marginTop: 28 }}>
        <h1>Your first plan</h1>
        <p className="lead">A gentle starting point. Adjust any week that doesn’t feel right.</p>
      </div>
      <section className="card card--flush" style={{ marginTop: 24 }}>
        <div className="row" style={{ minHeight: 58, padding: '0 18px', background: 'var(--bg-secondary)' }}>
          <span className="grow muted" style={{ fontSize: 15 }}>
            Current baseline
          </span>
          <span className="plan-target__value muted">
            {baseline}
            <small>/day</small>
          </span>
        </div>
        {shown.map((v, i) => (
          <div key={i} className="row" style={{ gap: 12, minHeight: 64, padding: '0 12px 0 18px', borderTop: '1px solid var(--divider)' }}>
            <span className="grow" style={{ fontSize: 15.5, fontWeight: 600 }}>
              Week {i + 1}
            </span>
            {v == null ? (
              <span className="small muted" style={{ paddingRight: 8 }}>
                Observe only
              </span>
            ) : (
              <>
                <button type="button" className="icon-btn icon-btn--round" style={{ width: 34, height: 34 }} aria-label={`Lower week ${i + 1} target`} onClick={() => set(i, v - step)}>
                  <Icon name="minus" size={14} strokeWidth={2.2} />
                </button>
                <span className="plan-target__value tabular" style={{ minWidth: 64, textAlign: 'center' }}>
                  {v}
                  <small className="muted">/day</small>
                </span>
                <button type="button" className="icon-btn icon-btn--round" style={{ width: 34, height: 34 }} aria-label={`Raise week ${i + 1} target`} onClick={() => set(i, v + step)}>
                  <Icon name="plus" size={14} strokeWidth={2.2} />
                </button>
              </>
            )}
          </div>
        ))}
        {rest.length > 0 && (
          <div className="row" style={{ minHeight: 56, padding: '0 18px', borderTop: '1px solid var(--divider)' }}>
            <span className="grow small muted" style={{ fontSize: 14 }}>
              Then {rest.map((x) => (x == null ? '—' : x)).join(' → ')}
            </span>
            <span className="small faint">
              {rest.length} more {rest.length === 1 ? 'week' : 'weeks'}
            </span>
          </div>
        )}
      </section>
      <div style={{ marginTop: 16 }}>
        <Callout icon="sliders">
          <strong>You’re in control.</strong> These are your goals, not rules. Change them any time in the Goals tab — slowing down is always
          allowed.
        </Callout>
      </div>
    </>
  );
}
