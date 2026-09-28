import { PushedHeader } from '../components/navigation/TabBar';
import { LogoMark } from '../components/brand/Logo';
import { Callout, ListRow, SectionHeader, Toggle } from '../components/ui/primitives';
import { useActions, useData } from '../state/AppStore';
import { useDerived } from '../state/useDerived';
import { formatRelative } from '../domain/dates';
import type { NotificationPreferences } from '../models';

type BoolKey = Exclude<keyof NotificationPreferences, 'quietHours'>;

const PREFS: { key: BoolKey; title: string; sub: string }[] = [
  { key: 'progressUpdates', title: 'Progress updates', sub: 'How today compares to usual' },
  { key: 'patternReminders', title: 'Pattern reminders', sub: 'Before your usual craving times' },
  { key: 'milestones', title: 'Milestones', sub: 'Quiet notes when you reach one' },
  { key: 'dailySummary', title: 'Daily summary', sub: 'Each evening at 21:00' },
];

export function NotificationsScreen() {
  const { notificationPreferences: prefs } = useData();
  const { notifications, now } = useDerived();
  const actions = useActions();
  const set = (key: BoolKey, on: boolean) => actions.updateNotificationPreferences({ ...prefs, [key]: on });

  return (
    <>
      <PushedHeader back="Profile" title="Notifications" subtitle="Informative, never pushy." />

      <section className="enter" style={{ ['--i' as string]: 1 }}>
        <SectionHeader label="Recent" />
        {notifications.length === 0 ? (
          <p className="small muted">Nothing yet. Notes about your progress will appear here.</p>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {notifications.slice(0, 5).map((n) => (
              <div key={n.id} className="notice">
                <span className="notice__icon">
                  <LogoMark size={22} />
                </span>
                <div className="stack grow" style={{ gap: 3 }}>
                  <div className="row between">
                    <span style={{ fontSize: 13, fontWeight: 600 }}>NoVape</span>
                    <span className="fineprint">{formatRelative(n.timestamp, now)}</span>
                  </div>
                  <span style={{ fontSize: 15, lineHeight: '21px' }}>{n.text}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section enter" style={{ ['--i' as string]: 2 }}>
        <SectionHeader label="What you receive" />
        <div className="list">
          {PREFS.map((p) => (
            <ListRow key={p.key} title={p.title} sub={p.sub} trailing={<Toggle on={prefs[p.key]} onChange={(on) => set(p.key, on)} label={p.title} />} />
          ))}
          <ListRow title="Quiet hours" value={`${prefs.quietHours.from} – ${prefs.quietHours.to}`} />
        </div>
      </section>

      <div className="enter" style={{ marginTop: 16, ['--i' as string]: 3 }}>
        <Callout icon="shield">
          <strong>Our promise:</strong> no streak pressure, no countdowns, and never a nudge to use your device more.
        </Callout>
      </div>
    </>
  );
}
