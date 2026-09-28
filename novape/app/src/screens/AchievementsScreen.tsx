import { PushedHeader } from '../components/navigation/TabBar';
import { Icon } from '../components/ui/Icon';
import { ProgressRing } from '../components/ui/ProgressRing';
import { useDerived } from '../state/useDerived';

export function AchievementsScreen() {
  const { achievements } = useDerived();
  const reached = achievements.filter((a) => a.progress >= 1).length;

  return (
    <>
      <PushedHeader back="Profile" title="Achievements" subtitle={`Quiet markers of progress · ${reached} of ${achievements.length} reached`} />
      <div className="achievement-grid">
        {achievements.map((a, i) => {
          const done = a.progress >= 1;
          return (
            <article key={a.id} className={`achievement enter${done ? '' : ' is-locked'}`} style={{ ['--i' as string]: i + 1 }}>
              <ProgressRing size={44} stroke={3} value={a.progress} track="#ededef" label={`${Math.round(a.progress * 100)}% complete`}>
                {done && <Icon name="check" size={18} strokeWidth={2.2} style={{ color: '#4e8f6a' }} />}
              </ProgressRing>
              <div className="stack" style={{ gap: 4, flex: 1 }}>
                <h2 className="achievement__title">{a.title}</h2>
                <p className="achievement__desc">{a.description}</p>
              </div>
              <span className="fineprint">{a.progressLabel}</span>
            </article>
          );
        })}
      </div>
      <p className="fineprint" style={{ margin: '20px 4px 0', textAlign: 'center' }}>
        Milestones celebrate needing NoVape less — never using it more.
      </p>
    </>
  );
}
