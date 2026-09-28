import { Icon, type IconName } from '../ui/Icon';
import { useNav, type Tab } from '../../navigation/Navigator';

const TABS: { tab: Tab; label: string; icon: IconName }[] = [
  { tab: 'home', label: 'Home', icon: 'home' },
  { tab: 'stats', label: 'Statistics', icon: 'stats' },
  { tab: 'goals', label: 'Goals', icon: 'goals' },
  { tab: 'profile', label: 'Profile', icon: 'profile' },
];

export function TabBar() {
  const nav = useNav();
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(({ tab, label, icon }) => {
        const active = nav.tab === tab;
        return (
          <button
            key={tab}
            type="button"
            className={`tabbar__item${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => nav.switchTab(tab)}
          >
            <span className="tabbar__indicator" />
            <Icon name={icon} size={24} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

export function BackButton({ label }: { label: string }) {
  const nav = useNav();
  return (
    <button type="button" className="back-button" onClick={nav.pop}>
      <Icon name="chevronLeft" size={22} strokeWidth={2} />
      {label}
    </button>
  );
}

/** Title block for pushed screens. */
export function PushedHeader({ back, title, subtitle }: { back: string; title: string; subtitle?: string }) {
  return (
    <>
      <BackButton label={back} />
      <header className="screen-header enter" style={{ marginTop: 8 }}>
        <h1 className="title-xl">{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </header>
    </>
  );
}
