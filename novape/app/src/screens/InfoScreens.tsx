import { useState } from 'react';
import { PushedHeader } from '../components/navigation/TabBar';
import { Icon } from '../components/ui/Icon';
import { Callout, ListRow, SectionHeader, SegmentedControl, Stepper, Toggle } from '../components/ui/primitives';
import { Sheet } from '../components/ui/Sheet';
import { productImages } from '../components/device/productImages';
import { BACKDROP, Scene3D } from '../components/three/Scene3D';
import { useActions, useData } from '../state/AppStore';
import { useUi } from '../state/Ui';
import { useNav } from '../navigation/Navigator';
import { storage } from '../services/storage';
import { INTENTION_LABELS } from '../domain/format';
import type { Intention } from '../models';

/* ---------------- Data & privacy ---------------- */

const SHARE_KEY = 'novape.pref.shareAnonymous';

export function PrivacyScreen() {
  const actions = useActions();
  const { toast } = useUi();
  const [share, setShare] = useState(() => storage.read<boolean>(SHARE_KEY) ?? false);
  const [confirm, setConfirm] = useState(false);

  const download = async () => {
    const json = await actions.exportData();
    if (window.self !== window.top) {
      // Embedded previews can't start downloads; hand the data over via the clipboard instead.
      try {
        await navigator.clipboard.writeText(json);
        toast('Your data was copied as JSON');
      } catch {
        toast('Export isn’t available in this preview');
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `novape-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Export ready');
  };

  return (
    <>
      <PushedHeader back="Profile" title="Data & privacy" subtitle="Your habits are personal. You stay in control." />

      <div className="enter" style={{ ['--i' as string]: 1 }}>
        <Callout icon="lock">
          <strong>What we store:</strong> when you use NoVape, your plan, and the craving check-ins you choose to log. No location, no contacts, no
          advertising IDs.
        </Callout>
      </div>

      <section className="section enter" style={{ ['--i' as string]: 2 }}>
        <SectionHeader label="Sharing" />
        <div className="list">
          <ListRow
            title="Help improve NoVape"
            sub="Share anonymous, aggregated usage patterns"
            trailing={
              <Toggle
                on={share}
                label="Help improve NoVape"
                onChange={(on) => {
                  setShare(on);
                  storage.write(SHARE_KEY, on);
                }}
              />
            }
          />
        </div>
      </section>

      <section className="section enter" style={{ ['--i' as string]: 3 }}>
        <SectionHeader label="Your data" />
        <div className="list">
          <ListRow icon={<Icon name="download" />} title="Export my data" sub="Everything, as a JSON file" onClick={download} />
          <ListRow icon={<Icon name="trash" />} title="Delete all data" sub="Removes your history and starts over" onClick={() => setConfirm(true)} />
        </div>
      </section>

      <Sheet open={confirm} onClose={() => setConfirm(false)} label="Delete all data">
        <div className="stack" style={{ gap: 12, paddingTop: 20, textAlign: 'center', alignItems: 'center' }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>Delete all data?</span>
          <p className="small muted" style={{ fontSize: 14, lineHeight: '20px', maxWidth: 300 }}>
            Your plan, check-ins and settings will be removed from this device and you’ll start with onboarding again.
          </p>
          <div className="stack" style={{ width: '100%', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn--primary btn--block" onClick={() => actions.resetAll()}>
              Delete everything
            </button>
            <button type="button" className="btn btn--ghost btn--block" onClick={() => setConfirm(false)}>
              Keep my data
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}

/* ---------------- Account ---------------- */

export function AccountScreen() {
  const { user } = useData();
  const actions = useActions();
  const { toast } = useUi();
  const nav = useNav();
  const [name, setName] = useState(user.firstName);
  const [spend, setSpend] = useState(user.weeklySpendBefore);
  const [baseline, setBaseline] = useState(user.baselinePerDay);
  const [intention, setIntention] = useState<Intention>(user.intention);
  const dirty = name.trim() !== user.firstName || spend !== user.weeklySpendBefore || baseline !== user.baselinePerDay || intention !== user.intention;

  return (
    <>
      <PushedHeader back="Profile" title="Account" />

      <section className="stack enter" style={{ gap: 16, ['--i' as string]: 1 }}>
        <label className="field">
          <span className="field__label">First name</span>
          <input className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span className="field__label">Your intention</span>
          <SegmentedControl<Intention>
            label="Your intention"
            value={intention}
            onChange={setIntention}
            options={[
              { value: 'quit', label: 'Stop' },
              { value: 'reduce', label: 'Vape less' },
              { value: 'understand', label: 'Understand' },
            ]}
          />
          <span className="fineprint">{INTENTION_LABELS[intention]}</span>
        </div>
      </section>

      <section className="section enter" style={{ ['--i' as string]: 2 }}>
        <SectionHeader label="Starting point" />
        <div className="card stack" style={{ gap: 20, alignItems: 'center' }}>
          <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
            <span className="small muted">Baseline before you started</span>
            <Stepper value={baseline} onChange={setBaseline} step={5} min={5} max={400} unit="uses/day" size="md" />
          </div>
          <hr className="divider" style={{ width: '100%' }} />
          <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
            <span className="small muted">What you spent on vaping per week</span>
            <Stepper value={spend} onChange={setSpend} step={5} min={0} max={300} unit="per week" format={(v) => `€${v}`} size="md" />
          </div>
        </div>
        <p className="fineprint" style={{ margin: '10px 2px 0' }}>
          Used for your “less than baseline” and savings estimates. Your plan targets stay as they are.
        </p>
      </section>

      <button
        type="button"
        className="btn btn--primary btn--block"
        style={{ marginTop: 24 }}
        disabled={!dirty || !name.trim()}
        onClick={async () => {
          await actions.updateUser({ firstName: name.trim(), weeklySpendBefore: spend, baselinePerDay: baseline, intention });
          toast('Saved');
        }}
      >
        Save changes
      </button>

      <section className="section enter" style={{ ['--i' as string]: 3 }}>
        <SectionHeader label="Demo" />
        <div className="list">
          <ListRow
            icon={<Icon name="device" />}
            title="Simulate a use"
            sub="Pretend your NoVape just registered a draw"
            onClick={() => {
              actions.simulateUse();
              toast('Use recorded');
              nav.switchTab('home');
            }}
          />
          <ListRow icon={<Icon name="refresh" />} title="Replay onboarding" sub="Starts over with fresh demo data" onClick={() => actions.resetAll()} />
        </div>
      </section>
    </>
  );
}

/* ---------------- Help ---------------- */

const FAQ = [
  {
    q: 'What is NoVape?',
    a: 'NoVape One is a nicotine-free device that produces no vapor. It gives your hands and routine something familiar while the app helps you understand the habit and need it less over time.',
  },
  {
    q: 'How does the app count uses?',
    a: 'Every draw on your NoVape One is recorded by the device and synced over Bluetooth. If your phone is out of range, the device keeps the records and syncs them the next time it connects.',
  },
  {
    q: 'What if I go over my goal?',
    a: 'Nothing bad happens. Tomorrow is another data point. You can also adjust any week of your plan in the Goals tab — slowing down is always allowed.',
  },
  {
    q: 'How is “estimated savings” calculated?',
    a: 'We take the weekly amount you spent on vaping before, convert it into a cost per use based on your baseline, and multiply it by the uses you’ve avoided. You can change the amount in Account.',
  },
  {
    q: 'Is NoVape a medical treatment?',
    a: 'No. NoVape is a habit-tracking companion. It does not diagnose, treat or cure nicotine addiction and does not guarantee that you will stop vaping. If you’d like support with quitting, please talk to a healthcare professional.',
  },
  {
    q: 'How do I pair a new device?',
    a: 'Go to Profile → My NoVape. If a device is paired, choose “Forget this device” first, then hold the button on the new device for 3 seconds and tap Connect.',
  },
];

export function HelpScreen() {
  return (
    <>
      <PushedHeader back="Profile" title="Help" />
      <div className="list enter" style={{ ['--i' as string]: 1 }}>
        {FAQ.map((f) => (
          <details key={f.q} className="disclosure">
            <summary>
              {f.q}
              <Icon name="chevronRight" size={15} strokeWidth={2} className="chevron" />
            </summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
      <section className="section enter" style={{ ['--i' as string]: 2 }}>
        <SectionHeader label="Still stuck?" />
        <div className="list">
          <ListRow icon={<Icon name="mail" />} title="Contact support" value="support@novape.app" chevron={false} />
        </div>
      </section>
    </>
  );
}

/* ---------------- About ---------------- */

export function AboutScreen() {
  return (
    <>
      <PushedHeader back="Profile" title="About NoVape" />
      <div className="photo enter" style={{ height: 260, ['--i' as string]: 1 }}>
        <Scene3D
          style={{ height: '100%' }}
          spec={{ kind: 'kit', finish: 'champagne' }}
          options={{ backdrop: BACKDROP.soft, motion: 'oscillate', interactive: true }}
          label="NoVape One with mint, lemon and berry cartridges"
          fallback={<img src={productImages.inTheBox} alt="" style={{ objectPosition: '50% 50%' }} />}
        />
      </div>

      <section className="stack enter" style={{ gap: 12, marginTop: 24, ['--i' as string]: 2 }}>
        <h2 className="title-md">Built to be needed less.</h2>
        <p className="body muted">
          Most apps want more of your attention. NoVape is designed the other way round: the less you reach for your device, the better we’re
          doing. We measure success by how much your dependency on the habit decreases — never by how much you use NoVape.
        </p>
      </section>

      <section className="section enter" style={{ ['--i' as string]: 3 }}>
        <SectionHeader label="How it works" />
        <div className="list">
          {[
            ['1', 'Baseline', 'Start from an honest picture of today.'],
            ['2', 'Awareness', 'See when and why the habit shows up.'],
            ['3', 'Reduction', 'Step down gently, at a pace you set.'],
            ['4', 'Independence', 'Need it less — and eventually not at all.'],
          ].map(([n, t, s]) => (
            <ListRow key={n} icon={<span className="num" style={{ fontSize: 15, color: 'var(--accent-ink)' }}>{n}</span>} title={t} sub={s} />
          ))}
        </div>
      </section>

      <p className="fineprint" style={{ marginTop: 20 }}>
        NoVape One is nicotine-free and produces no vapor or aerosol. NoVape is not a medical device and does not diagnose, treat or cure
        nicotine addiction, nor does it guarantee that you will stop vaping or smoking.
      </p>
      <p className="fineprint" style={{ marginTop: 8 }}>Version 0.1.0</p>
    </>
  );
}
