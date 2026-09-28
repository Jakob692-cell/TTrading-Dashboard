import type { Achievement, DailyStats } from '../models';
import { formatShortDate, startOfDay } from './dates';
import { completeDays } from './stats';

const endOf = (d: DailyStats) => startOfDay(d.date) + 20 * 60 * 60 * 1000;

/**
 * Milestones are deliberately quiet: they mark progress towards needing the
 * device less, never usage of the device itself.
 */
export function computeAchievements(days: DailyStats[]): Achievement[] {
  const done = completeDays(days);
  const baseline = days[0]?.baseline ?? 0;
  const best = done.reduce((min, d) => Math.min(min, d.uses), Infinity);
  const bestReduction = baseline > 0 && isFinite(best) ? 1 - best / baseline : 0;

  const nth = <T,>(xs: T[], n: number) => (xs.length >= n ? xs[n - 1] : undefined);
  const met = done.filter((d) => d.metGoal === true);
  const halfDay = done.find((d) => d.uses <= baseline * 0.5);
  const zeroDay = done.find((d) => d.uses === 0);

  const byDays = (id: Achievement['id'], title: string, description: string, n: number): Achievement => {
    const hit = nth(done, n);
    return {
      id,
      title,
      description,
      progress: Math.min(1, done.length / n),
      achievedAt: hit ? endOf(hit) : undefined,
      progressLabel: hit ? formatShortDate(hit.date) : `${done.length} of ${n} days`,
    };
  };

  const first = days[0];
  return [
    {
      id: 'first_step',
      title: 'First step',
      description: 'First day tracked',
      progress: first ? 1 : 0,
      achievedAt: first ? startOfDay(first.date) : undefined,
      progressLabel: first ? formatShortDate(first.date) : 'Today',
    },
    byDays('one_week', 'One week', '7 days of progress', 7),
    {
      id: 'halfway',
      title: 'Halfway',
      description: '50% below your starting baseline',
      progress: Math.min(1, Math.max(0, bestReduction / 0.5)),
      achievedAt: halfDay ? endOf(halfDay) : undefined,
      progressLabel: halfDay ? formatShortDate(halfDay.date) : `${Math.round(Math.max(0, bestReduction) * 100)}% so far`,
    },
    {
      id: 'control',
      title: 'Control',
      description: 'Reached your daily goal 7 times',
      progress: Math.min(1, met.length / 7),
      achievedAt: nth(met, 7) ? endOf(nth(met, 7)!) : undefined,
      progressLabel: nth(met, 7) ? formatShortDate(nth(met, 7)!.date) : `${met.length} of 7 times`,
    },
    byDays('three_weeks', 'Three weeks', '21 days of progress', 21),
    {
      id: 'independence',
      title: 'Independence',
      description: 'A full day without needing NoVape',
      progress: zeroDay ? 1 : Math.max(0, Math.min(0.99, bestReduction)),
      achievedAt: zeroDay ? endOf(zeroDay) : undefined,
      progressLabel: zeroDay ? formatShortDate(zeroDay.date) : 'Whenever you’re ready',
    },
  ];
}
