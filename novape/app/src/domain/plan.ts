import type { Goal, ISODate, Intention } from '../models';
import { addDays, diffDays } from './dates';

/**
 * Share of the baseline allowed per week. `null` = observe only.
 * The plan is a suggestion; users can change every week afterwards.
 */
const PLAN_SHAPES: Record<Intention, (number | null)[]> = {
  quit: [0.83, 0.67, 0.5, 0.375, 0.25, 0.125, 0],
  reduce: [0.85, 0.7, 0.6, 0.5, 0.4],
  understand: [null, 0.9, 0.8, 0.7, 0.6],
};

function roundTarget(value: number, baseline: number): number {
  if (value <= 0) return 0;
  const step = baseline >= 40 ? 5 : 1;
  return Math.max(step, Math.round(value / step) * step);
}

/** Suggested daily limits, one per week. */
export function suggestWeeklyLimits(baseline: number, intention: Intention): (number | null)[] {
  return PLAN_SHAPES[intention].map((share) => (share == null ? null : roundTarget(share * baseline, baseline)));
}

export function buildGoals(startDate: ISODate, limits: (number | null)[]): Goal[] {
  return limits.map((dailyLimit, weekIndex) => ({
    id: `week-${weekIndex + 1}`,
    weekIndex,
    startDate: addDays(startDate, weekIndex * 7),
    endDate: addDays(startDate, weekIndex * 7 + 6),
    dailyLimit,
  }));
}

/** Week of the plan a date falls in; dates after the plan map to the last week. */
export function goalForDate(goals: Goal[], date: ISODate): Goal | null {
  if (goals.length === 0) return null;
  if (date < goals[0].startDate) return null;
  return goals.find((g) => date >= g.startDate && date <= g.endDate) ?? goals[goals.length - 1];
}

export function weekIndexForDate(startDate: ISODate, date: ISODate): number {
  return Math.floor(diffDays(startDate, date) / 7);
}

export function stepSizeFor(baseline: number): number {
  return baseline >= 40 ? 5 : 1;
}
