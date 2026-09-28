import type { CravingEvent, CravingOutcome, CravingTrigger, DailyStats } from '../models';
import { formatHour, weekdayIndex } from './dates';
import { completeDays, hourlyProfile, peakHour, peakWindow } from './stats';

export const TRIGGER_LABELS: Record<CravingTrigger, string> = {
  stress: 'Stress',
  boredom: 'Boredom',
  social: 'Social situation',
  after_eating: 'After eating',
  work: 'Work / studying',
  habit: 'Habit',
  other: 'Other',
};

export const TRIGGER_ORDER: CravingTrigger[] = ['stress', 'boredom', 'social', 'after_eating', 'work', 'habit', 'other'];

export const OUTCOME_LABELS: Record<CravingOutcome, string> = {
  gone: 'Craving gone',
  lower: 'Lower',
  same: 'Same',
};

/** Plain-language part of day for an hour, used inside insight sentences. */
export function partOfDay(hour: number): string {
  if (hour >= 5 && hour < 11) return 'in the morning';
  if (hour === 11 || hour === 12) return 'around lunch';
  if (hour === 13 || hour === 14) return 'after lunch';
  if (hour >= 15 && hour < 18) return 'in the late afternoon';
  if (hour >= 18 && hour < 22) return 'in the evening';
  return 'late at night';
}

export interface HabitWindows {
  /** Busiest two-hour window, e.g. 16 → 16:00–18:00 */
  windowStart: number;
  /** Single busiest hour, e.g. 13 → 13:00–14:00 */
  peakHour: number;
  profile: number[];
}

export function habitWindows(days: DailyStats[]): HabitWindows | null {
  if (completeDays(days).length < 3) return null;
  const profile = hourlyProfile(days);
  return { windowStart: peakWindow(profile, 2), peakHour: peakHour(profile), profile };
}

export const windowLabel = (start: number, width: number) => `${formatHour(start)}–${formatHour(start + width)}`;

/** Weekend vs weekday difference in average daily uses (0.12 = 12 % more on weekends). */
export function weekendDifference(days: DailyStats[]): number | null {
  const done = completeDays(days).slice(-21);
  const weekend = done.filter((d) => weekdayIndex(d.date) >= 5);
  const weekday = done.filter((d) => weekdayIndex(d.date) < 5);
  if (weekend.length < 2 || weekday.length < 3) return null;
  const avg = (xs: DailyStats[]) => xs.reduce((a, d) => a + d.uses, 0) / xs.length;
  return avg(weekend) / avg(weekday) - 1;
}

export interface TriggerShare {
  trigger: CravingTrigger;
  label: string;
  count: number;
  share: number;
}

export function triggerBreakdown(cravings: CravingEvent[]): TriggerShare[] {
  const total = cravings.length;
  if (total === 0) return [];
  const counts = new Map<CravingTrigger, number>();
  for (const c of cravings) counts.set(c.trigger, (counts.get(c.trigger) ?? 0) + 1);
  return [...counts.entries()]
    .map(([trigger, count]) => ({ trigger, label: TRIGGER_LABELS[trigger], count, share: count / total }))
    .sort((a, b) => b.count - a.count);
}

export interface CravingOutcomes {
  answered: number;
  gone: number;
  lower: number;
  same: number;
  /** Share of answered check-ins where the craving went away or got weaker. */
  easedShare: number;
}

export function cravingOutcomes(cravings: CravingEvent[]): CravingOutcomes {
  const answered = cravings.filter((c) => c.outcome != null);
  const count = (o: CravingOutcome) => answered.filter((c) => c.outcome === o).length;
  const gone = count('gone');
  const lower = count('lower');
  const same = count('same');
  return {
    answered: answered.length,
    gone,
    lower,
    same,
    easedShare: answered.length ? (gone + lower) / answered.length : 0,
  };
}

/** Craving check-ins per hour of day, to spot risky times. */
export function cravingHourProfile(cravings: CravingEvent[]): number[] {
  const out = new Array(24).fill(0);
  for (const c of cravings) out[new Date(c.timestamp).getHours()] += 1;
  return out;
}
