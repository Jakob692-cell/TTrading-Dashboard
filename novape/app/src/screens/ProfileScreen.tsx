import { Icon } from '../components/ui/Icon';
import { ListRow } from '../components/ui/primitives';
import { productImages } from '../components/device/productImages';
import { useConnection, useData } from '../state/AppStore';
import { useDerived } from '../state/useDerived';
import { useNav } from '../navigation/Navigator';
import { formatShortDate } from '../domain/dates';
import { INTENTION_LABELS } from '../domain/format';
import { flavorById } from '../data/catalog';

export function ProfileScreen() {
  const { user, device, cartridge, goals } = useData();
  const d = useDerived();
  const nav = useNav();
  const connection = useConnection();
  const reached = d.achievements.filter((a) => a.progress >= 1).length;
  const currentWeek = (d.currentGoal?.weekIndex ?? 0) + 1;

  const deviceStatus = device
    ? connection === 'connected'
      ? `${device.model} · Connected · ${device.batteryLevel}%`
      : connection === 'disconnected'
        ? `${device.model} · Not connected`
        : `${device.model} · Connecting…`
    : 'Not set up yet';

  return (
    <>
      <header className="stack enter" style={{ alignItems: 'center', gap: 14 }}>
        <div className="avatar" aria-hidden="true">
          {user.firstName.slice(0, 1).toUpperCase()}
        </div>
        <div className="stack" style={{ alignItems: 'center', gap: 4 }}>
          <h1 className="title-md" style={{ fontSize: 24, lineHeight: '30px' }}>
            {user.firstName}
          </h1>
          <p className="small muted" style={{ fontSize: 14 }}>
            {INTENTION_LABELS[user.intention]}
          </p>
        </div>
      </header>

      <section className="profile-stats enter" style={{ marginTop: 24, ['--i' as string]: 1 }} aria-label="Your numbers">
        <div>
          <strong>{formatShortDate(user.journeyStartDate)}</strong>
          <span>Member since</span>
        </div>
        <div>
          <strong>{user.baselinePerDay}/day</strong>
          <span>Starting baseline</span>
        </div>
        <div>
          <strong>{d.avg7 == null ? '—' : `${Math.round(d.avg7)}/day`}</strong>
          <span>Current average</span>
        </div>
      </section>

      <button
        type="button"
        className="card card--flush device-card pressable enter"
        style={{ marginTop: 24, ['--i' as string]: 2 }}
        onClick={() => nav.push({ name: 'device' })}
      >
        <span className="device-card__thumb">
          <img src={productImages.front} alt="" />
        </span>
        <span className="grow stack" style={{ gap: 3 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>My NoVape</span>
          <span className="row small muted" style={{ gap: 6 }}>
            <span className={`dot${connection === 'connected' ? '' : ' dot--off'}`} style={{ width: 6, height: 6 }} />
            {deviceStatus}
          </span>
        </span>
        <Icon name="chevronRight" size={16} strokeWidth={2} className="chevron" />
      </button>

      <nav className="list enter" style={{ marginTop: 24, ['--i' as string]: 3 }} aria-label="Your NoVape">
        <ListRow icon={<Icon name="goals" />} title="My plan" value={`Week ${Math.min(currentWeek, goals.length)} of ${goals.length}`} onClick={() => nav.switchTab('goals')} />
        <ListRow icon={<Icon name="medal" />} title="Achievements" value={`${reached} of ${d.achievements.length}`} onClick={() => nav.push({ name: 'achievements' })} />
        <ListRow
          icon={<Icon name="cartridge" />}
          title="Cartridges & flavors"
          value={cartridge ? `${flavorById(cartridge.flavorId).name} · ${Math.round(cartridge.remainingPct)}%` : undefined}
          onClick={() => nav.push({ name: 'flavors' })}
        />
        <ListRow icon={<Icon name="bell" />} title="Notifications" onClick={() => nav.push({ name: 'notifications' })} />
      </nav>

      <nav className="list enter" style={{ marginTop: 16, ['--i' as string]: 4 }} aria-label="Settings">
        <ListRow icon={<Icon name="shield" />} title="Data & privacy" onClick={() => nav.push({ name: 'privacy' })} />
        <ListRow icon={<Icon name="user" />} title="Account" onClick={() => nav.push({ name: 'account' })} />
        <ListRow icon={<Icon name="help" />} title="Help" onClick={() => nav.push({ name: 'help' })} />
        <ListRow icon={<Icon name="info" />} title="About NoVape" onClick={() => nav.push({ name: 'about' })} />
      </nav>

      <p className="fineprint enter" style={{ margin: '20px 8px 0', textAlign: 'center', ['--i' as string]: 5 }}>
        NoVape is a habit-tracking companion, not a medical device. It does not diagnose or treat nicotine addiction. For support with
        quitting, talk to a healthcare professional.
      </p>
    </>
  );
}
