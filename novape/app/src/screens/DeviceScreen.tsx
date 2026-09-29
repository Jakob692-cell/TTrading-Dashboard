import { useEffect, useState } from 'react';
import { PushedHeader } from '../components/navigation/TabBar';
import { Icon } from '../components/ui/Icon';
import { ListRow, ProgressBar, SectionHeader, SegmentedControl, Toggle } from '../components/ui/primitives';
import { Sheet } from '../components/ui/Sheet';
import { DeviceRender } from '../components/device/DeviceRender';
import { productImages } from '../components/device/productImages';
import { BACKDROP, Scene3D } from '../components/three/Scene3D';
import type { DeviceView } from '../three/stage';
import { useActions, useConnection, useData } from '../state/AppStore';
import { useUi } from '../state/Ui';
import { useNav } from '../navigation/Navigator';
import { flavorById } from '../data/catalog';
import { formatRelative } from '../domain/dates';
import type { HapticStrength } from '../models';
import type { FirmwareStatus } from '../services/device';

const FINISH_LABELS = { champagne: 'Champagne', black: 'Black', graphite: 'Graphite', sage: 'Sage' } as const;

export function DeviceScreen() {
  const { device } = useData();
  return device ? <PairedDevice /> : <ConnectDevice />;
}

function ConnectDevice() {
  const actions = useActions();
  const connection = useConnection();
  const { toast } = useUi();
  const busy = connection === 'scanning' || connection === 'connecting';
  const [failed, setFailed] = useState(false);

  return (
    <>
      <PushedHeader back="Profile" title="My NoVape" />
      <Scene3D
        className="device-stage3d"
        spec={{ kind: 'device', finish: 'champagne', led: busy ? 'pulse' : 'off', searching: busy }}
        options={{ backdrop: BACKDROP.page, motion: 'oscillate', float: true, interactive: true }}
        label="NoVape One"
        fallback={<DeviceRender height={270} led={busy ? 'pulse' : 'off'} className="float" />}
      />
      <div className="stack" style={{ alignItems: 'center', gap: 10, textAlign: 'center' }}>
        <h2 className="title-md">{busy ? 'Looking for your NoVape…' : 'Connect your NoVape'}</h2>
        <p className="muted" style={{ fontSize: 15, lineHeight: '22px', maxWidth: 310 }}>
          {busy
            ? 'Keep your device close to your phone.'
            : 'Hold the button on your NoVape One for 3 seconds, until the light starts to pulse.'}
        </p>
        {failed && !busy && <p className="small" style={{ color: 'var(--warning)' }}>Couldn’t find it this time. Try again when the light pulses.</p>}
      </div>
      <button
        type="button"
        className="btn btn--primary btn--block"
        style={{ marginTop: 28 }}
        disabled={busy}
        onClick={async () => {
          setFailed(false);
          const ok = await actions.connectDevice();
          if (ok) toast('NoVape One connected');
          else setFailed(true);
        }}
      >
        {busy ? 'Searching…' : 'Connect device'}
      </button>
      <p className="fineprint" style={{ textAlign: 'center', marginTop: 12 }}>
        NoVape One is nicotine-free and produces no vapor.
      </p>
    </>
  );
}

function PairedDevice() {
  const { device, cartridge } = useData();
  const connection = useConnection();
  const actions = useActions();
  const nav = useNav();
  const { toast } = useUi();
  const [finding, setFinding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [firmwareOpen, setFirmwareOpen] = useState(false);
  const [view, setView] = useState<DeviceView | 'colors'>('hero');
  if (!device) return null;

  const connected = connection === 'connected';
  const busy = connection === 'scanning' || connection === 'connecting';
  const flavor = cartridge ? flavorById(cartridge.flavorId) : null;
  const settings = device.settings;

  const find = async () => {
    setFinding(true);
    await actions.findDevice();
    setFinding(false);
  };

  return (
    <>
      <PushedHeader back="Profile" title="My NoVape" />

      <div className="device-photo device-photo--3d enter" style={{ ['--i' as string]: 1 }}>
        <Scene3D
          spec={
            view === 'colors'
              ? { kind: 'finishes', active: device.finish }
              : {
                  kind: 'device',
                  finish: device.finish,
                  flavor: cartridge?.flavorId,
                  view,
                  led: finding ? 'blink' : connected ? 'pulse' : 'off',
                  buzz: finding,
                }
          }
          options={{ backdrop: BACKDROP.studio, motion: 'oscillate', interactive: true }}
          label={`${device.model} in ${FINISH_LABELS[device.finish].toLowerCase()}, 3D view`}
          fallback={<img src={productImages.front} alt="" />}
        />
        <span className={`pill device-photo__status ${connected ? 'pill--accent' : ''}`} style={{ background: connected ? 'rgba(238,246,241,.92)' : 'rgba(255,255,255,.9)' }}>
          <span className={`dot${connected ? '' : ' dot--off'}`} />
          {connected ? 'Connected' : busy ? 'Connecting…' : 'Not connected'}
        </span>
        <span className="device-photo__hint" aria-hidden="true">
          <Icon name="rotate" size={14} strokeWidth={2} /> Drag to turn
        </span>
      </div>

      <div className="enter" style={{ marginTop: 12, ['--i' as string]: 2 }}>
        <SegmentedControl
          label="3D view"
          value={view}
          onChange={setView}
          options={[
            { value: 'hero', label: 'Device' },
            { value: 'head', label: 'Close-up' },
            { value: 'exploded', label: 'Cartridge' },
            { value: 'colors', label: 'Colors' },
          ]}
        />
      </div>

      <div className="stack enter" style={{ alignItems: 'center', gap: 4, marginTop: 20, ['--i' as string]: 3 }}>
        <h2 className="title-md">{device.name}</h2>
        <p className="small muted">
          {device.model} · {FINISH_LABELS[device.finish]}
          {device.lastSyncedAt && connected ? ` · synced ${formatRelative(device.lastSyncedAt, Date.now())}` : ''}
        </p>
      </div>

      <div className="stat-tiles enter" style={{ marginTop: 20, ['--i' as string]: 4 }}>
        <div className="tile stat-tile">
          <span className="small muted">Battery</span>
          <span className="metric__value">{connected ? `${device.batteryLevel}%` : '—'}</span>
          <ProgressBar value={connected ? device.batteryLevel / 100 : 0} thin color={device.batteryLevel <= 20 ? 'var(--warning)' : 'var(--text)'} label="Battery" />
        </div>
        <button type="button" className="tile stat-tile pressable" onClick={() => nav.push({ name: 'flavors' })}>
          <span className="small muted">Flavor</span>
          <span className="metric__value">{flavor?.name ?? '—'}</span>
          <span className="flavor-accent" style={{ background: flavor?.accent ?? 'var(--border)' }} />
        </button>
        <button type="button" className="tile stat-tile pressable" onClick={() => nav.push({ name: 'flavors' })}>
          <span className="small muted">Cartridge</span>
          <span className="metric__value">{cartridge ? `${Math.round(cartridge.remainingPct)}%` : '—'}</span>
          <ProgressBar value={(cartridge?.remainingPct ?? 0) / 100} thin color={(cartridge?.remainingPct ?? 100) <= 15 ? 'var(--warning)' : undefined} label="Cartridge remaining" />
        </button>
      </div>

      <section className="section enter" style={{ ['--i' as string]: 5 }}>
        <SectionHeader label="Settings" />
        <div className="list">
          <div className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12, padding: '16px 18px' }}>
            <div className="row between" style={{ alignItems: 'baseline' }}>
              <span className="list-row__title">Haptic strength</span>
              <span className="list-row__sub">Gentle pulse on each use</span>
            </div>
            <SegmentedControl<HapticStrength>
              label="Haptic strength"
              value={settings.hapticStrength}
              onChange={(v) => actions.updateDeviceSettings({ ...settings, hapticStrength: v })}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'light', label: 'Light' },
                { value: 'medium', label: 'Medium' },
                { value: 'strong', label: 'Strong' },
              ]}
            />
          </div>
          <ListRow
            title="Light feedback"
            sub="Soft glow when your daily goal is close"
            trailing={<Toggle on={settings.lightFeedback} onChange={(on) => actions.updateDeviceSettings({ ...settings, lightFeedback: on })} label="Light feedback" />}
          />
          <ListRow title="Device name" value={device.name} onClick={() => setRenaming(true)} />
          <ListRow title="Firmware update" value={`${device.firmwareVersion}`} onClick={() => setFirmwareOpen(true)} />
          <ListRow
            title="Find my NoVape"
            sub={finding ? 'Vibrating and glowing…' : 'Makes it vibrate and glow for a few seconds'}
            trailing={
              <button type="button" className="btn btn--secondary btn--sm" disabled={!connected || finding} onClick={find} style={{ opacity: connected ? 1 : 0.4 }}>
                {finding ? 'Finding…' : 'Find'}
              </button>
            }
          />
        </div>
      </section>

      <div className="stack" style={{ marginTop: 16 }}>
        {connected ? (
          <button type="button" className="btn btn--ghost" onClick={() => actions.disconnectDevice()}>
            Disconnect
          </button>
        ) : (
          <button type="button" className="btn btn--secondary" style={{ alignSelf: 'center', height: 44 }} disabled={busy} onClick={() => actions.connectDevice()}>
            <Icon name="bluetooth" size={16} /> {busy ? 'Connecting…' : 'Reconnect'}
          </button>
        )}
        <button
          type="button"
          className="btn btn--ghost"
          style={{ color: 'var(--text-tertiary)', fontSize: 14 }}
          onClick={async () => {
            await actions.forgetDevice();
            toast('Device removed');
          }}
        >
          Forget this device
        </button>
      </div>

      <RenameSheet
        open={renaming}
        initial={device.name}
        onClose={() => setRenaming(false)}
        onSave={async (name) => {
          await actions.renameDevice(name);
          setRenaming(false);
          toast('Name updated');
        }}
      />
      <FirmwareSheet open={firmwareOpen} onClose={() => setFirmwareOpen(false)} check={actions.checkFirmware} />
    </>
  );
}

function RenameSheet({ open, initial, onClose, onSave }: { open: boolean; initial: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  return (
    <Sheet open={open} onClose={onClose} label="Rename device">
      <form
        className="stack"
        style={{ gap: 20, paddingTop: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name);
        }}
      >
        <span style={{ fontSize: 17, fontWeight: 600, textAlign: 'center' }}>Device name</span>
        <label className="field">
          <span className="field__label">Shown in the app and when pairing</span>
          <input className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <button type="submit" className="btn btn--primary btn--block" disabled={!name.trim()}>
          Save
        </button>
      </form>
    </Sheet>
  );
}

function FirmwareSheet({ open, onClose, check }: { open: boolean; onClose: () => void; check: () => Promise<FirmwareStatus> }) {
  const [status, setStatus] = useState<FirmwareStatus | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setStatus(null);
    check()
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus({ current: 'unknown', latest: 'unknown', updateAvailable: false }));
    return () => {
      alive = false;
    };
  }, [open, check]);
  return (
    <Sheet open={open} onClose={onClose} label="Firmware update">
      <div className="stack" style={{ alignItems: 'center', gap: 12, padding: '24px 0 8px', textAlign: 'center' }}>
        <span className="insight-icon" style={{ width: 52, height: 52, borderRadius: 16 }}>
          <Icon name={status ? 'check' : 'refresh'} size={24} className={status ? undefined : 'spin'} />
        </span>
        <span style={{ fontSize: 18, fontWeight: 600 }}>{status ? (status.updateAvailable ? `Version ${status.latest} is available` : 'You’re up to date') : 'Checking for updates…'}</span>
        <span className="small muted">{status ? `NoVape One firmware ${status.current}` : 'This only takes a moment.'}</span>
        <button type="button" className="btn btn--primary btn--block" style={{ marginTop: 12 }} onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
