import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../../components/ui/Sheet';
import { Icon } from '../../components/ui/Icon';
import { ProgressRing } from '../../components/ui/ProgressRing';
import { useActions } from '../../state/AppStore';
import { useUi } from '../../state/Ui';
import { TRIGGER_LABELS, TRIGGER_ORDER } from '../../domain/insights';
import type { CravingOutcome, CravingTrigger } from '../../models';

const WAIT_SECONDS = 120;

type Step = 'trigger' | 'wait' | 'feel';

const OUTCOMES: { id: CravingOutcome; title: string; sub: string; intensity: number }[] = [
  { id: 'gone', title: 'Craving gone', sub: 'It passed', intensity: 0 },
  { id: 'lower', title: 'Lower', sub: 'Still there, but weaker', intensity: 0.4 },
  { id: 'same', title: 'Same', sub: 'About as strong as before', intensity: 0.85 },
];

const RESPONSES: Record<CravingOutcome, [string, string]> = {
  gone: ['You rode that one out.', 'Waiting worked this time. It’s saved to your insights.'],
  lower: ['That’s real progress.', 'A smaller craving is still one you handled. Saved to your insights.'],
  same: ['That’s okay.', 'Cravings vary — noticing it is what matters. Tomorrow is another data point.'],
};

/** Craving check-in: name the trigger, wait two minutes with a breathing guide, then reflect. */
export function CravingSheet() {
  const { cravingOpen, closeCraving } = useUi();
  return (
    <Sheet open={cravingOpen} onClose={closeCraving} label="Craving check-in" full>
      <CravingFlow onDone={closeCraving} />
    </Sheet>
  );
}

function CravingFlow({ onDone }: { onDone: () => void }) {
  const actions = useActions();
  const [step, setStep] = useState<Step>('trigger');
  const [trigger, setTrigger] = useState<CravingTrigger | null>(null);
  const [left, setLeft] = useState(WAIT_SECONDS);
  const [outcome, setOutcome] = useState<CravingOutcome | null>(null);
  const started = useRef(Date.now());
  const saved = useRef(false);

  // Countdown while waiting.
  useEffect(() => {
    if (step !== 'wait') return;
    started.current = Date.now();
    const id = window.setInterval(() => {
      const remaining = Math.max(0, WAIT_SECONDS - Math.floor((Date.now() - started.current) / 1000));
      setLeft(remaining);
      if (remaining === 0) window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, [step]);

  const waited = WAIT_SECONDS - left;
  const latest = useRef({ trigger, waited });
  latest.current = { trigger, waited };

  const save = useRef((final: CravingOutcome | null) => {
    const { trigger: t, waited: w } = latest.current;
    if (saved.current || !t) return;
    saved.current = true;
    actions.recordCraving({ timestamp: Date.now(), trigger: t, waitedSeconds: w, outcome: final });
  }).current;

  // Closing mid-way still keeps the trigger — it’s useful data.
  useEffect(() => () => save(null), [save]);

  const close = (
    <button type="button" className="icon-btn icon-btn--filled" aria-label="Close" onClick={onDone}>
      <Icon name="close" size={14} strokeWidth={2.4} />
    </button>
  );

  if (step === 'trigger') {
    return (
      <div className="stack anim-fade" style={{ flex: 1 }}>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>{close}</div>
        <div className="stack" style={{ gap: 10, marginTop: 8 }}>
          <span className="label">Craving check-in</span>
          <h2 className="title-lg" style={{ fontSize: 30, lineHeight: '36px' }}>
            What triggered it?
          </h2>
          <p className="muted" style={{ fontSize: 16, lineHeight: '23px' }}>
            Noticing is the first step. Pick what fits best.
          </p>
        </div>
        <div className="chip-grid" style={{ marginTop: 28 }}>
          {TRIGGER_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip${t === 'other' ? ' chip--wide' : ''}`}
              onClick={() => {
                setTrigger(t);
                setStep('wait');
              }}
            >
              {TRIGGER_LABELS[t]}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 24 }} />
        <p className="row fineprint" style={{ justifyContent: 'center', gap: 6 }}>
          <Icon name="lock" size={14} /> Private. Used only for your own insights.
        </p>
      </div>
    );
  }

  if (step === 'wait') {
    const m = Math.floor(left / 60);
    const s = left % 60;
    return (
      <div className="stack anim-fade" style={{ flex: 1 }}>
        <div className="row between" style={{ marginTop: 10 }}>
          <span className="pill">{trigger ? TRIGGER_LABELS[trigger] : ''}</span>
          {close}
        </div>
        <div className="stack" style={{ gap: 8, marginTop: 20, alignItems: 'center', textAlign: 'center' }}>
          <h2 className="title-lg" style={{ fontSize: 26, lineHeight: '32px', maxWidth: 300 }}>
            Try waiting 2 minutes before deciding.
          </h2>
          <p className="muted" style={{ fontSize: 15, lineHeight: '22px' }}>
            Most cravings peak and pass. Breathe with the circle.
          </p>
        </div>
        <div style={{ alignSelf: 'center', marginTop: 24 }}>
          <ProgressRing size={276} stroke={4} value={waited / WAIT_SECONDS} duration={0.4} label="Time waited">
            <div className="breath" aria-hidden="true">
              <span className="breath__outer" />
              <span className="breath__inner" />
              <span className="breath__label">
                <span>Breathe in</span>
                <span>Breathe out</span>
              </span>
            </div>
          </ProgressRing>
        </div>
        <div className="stack" style={{ alignItems: 'center', gap: 2, marginTop: 20 }}>
          <span className="num tabular" style={{ fontSize: 40, lineHeight: '44px' }} aria-live="off">
            {m}:{String(s).padStart(2, '0')}
          </span>
          <span className="small muted">{left > 0 ? 'remaining' : 'Two minutes. Well done.'}</span>
        </div>
        <div style={{ flex: 1, minHeight: 20 }} />
        {left === 0 ? (
          <button type="button" className="btn btn--primary btn--block" onClick={() => setStep('feel')}>
            Continue
          </button>
        ) : (
          <button type="button" className="btn btn--ghost btn--block" onClick={() => setStep('feel')}>
            I’m ready to check in
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="stack anim-fade" style={{ flex: 1 }}>
      <div className="row between" style={{ marginTop: 10 }}>
        <span className="pill">
          {trigger ? TRIGGER_LABELS[trigger] : ''} · waited {Math.floor(waited / 60)}:{String(waited % 60).padStart(2, '0')}
        </span>
        {close}
      </div>
      <div className="stack" style={{ gap: 10, marginTop: 24 }}>
        <h2 className="title-lg" style={{ fontSize: 30, lineHeight: '36px' }}>
          How do you feel?
        </h2>
        <p className="muted" style={{ fontSize: 16, lineHeight: '23px' }}>
          Any answer is useful. This isn’t a test.
        </p>
      </div>
      <div className="stack" role="radiogroup" aria-label="Craving now" style={{ gap: 10, marginTop: 28 }}>
        {OUTCOMES.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={outcome === o.id}
            className={`choice${outcome === o.id ? ' is-selected' : ''}`}
            style={{ padding: '14px 18px' }}
            onClick={() => setOutcome(o.id)}
          >
            <ProgressRing size={28} stroke={4} value={o.intensity} track="#ededef" duration={0.6} />
            <span className="stack grow" style={{ gap: 2 }}>
              <span className="choice__title">{o.title}</span>
              <span className="choice__sub" style={{ fontSize: 13.5 }}>
                {o.sub}
              </span>
            </span>
          </button>
        ))}
      </div>
      {outcome && (
        <div className="callout anim-fade" style={{ marginTop: 20, flexDirection: 'column', gap: 4 }}>
          <strong style={{ fontSize: 16 }}>{RESPONSES[outcome][0]}</strong>
          <span>{RESPONSES[outcome][1]}</span>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 20 }} />
      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={!outcome}
        onClick={() => {
          save(outcome);
          onDone();
        }}
      >
        Done
      </button>
    </div>
  );
}
