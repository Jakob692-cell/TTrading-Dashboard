import type { DailyStats, Goal, ISODate, Timestamp, UsageEvent, User } from '../models';
import { diffDays, eachDay, toISODate, weekdayIndex } from './dates';
import { goalForDate } from './plan';

/** Aggregate raw usage events into one row per journey day, up to and including today. */
export function buildDailyStats(usage: UsageEvent[], user: User, goals: Goal[], now: Timestamp): DailyStats[] {
  const today = toISODate(now);
  const start = user.journeyStartDate;
  if (start > today) return [];

  const byDay = new Map<ISODate, number[]>();
  for (const e of usage) {
    const day = toISODate(e.timestamp);
    if (day < start || day > today) continue;
    let hours = byDay.get(day);
    if (!hours) byDay.set(day, (hours = new Array(24).fill(0)));
    hours[new Date(e.timestamp).getHours()] += 1;
  }

  return eachDay(start, today).map((date) => {
    const byHour = byDay.get(date) ?? new Array(24).fill(0);
    const uses = byHour.reduce((a, b) => a + b, 0);
    const goal = goalForDate(goals, date)?.dailyLimit ?? null;
    const complete = date < today;
    return {
      date,
      dayNumber: diffDays(start, date) + 1,
      uses,
      byHour,
      goal,
      baseline: user.baselinePerDay,
      complete,
      metGoal: complete && goal != null ? uses <= goal : null,
    };
  });
}

export const completeDays = (days: DailyStats[]) => days.filter((d) => d.complete);
export const todayStats = (days: DailyStats[]): DailyStats | undefined => days[days.length - 1];

/** A completed day counts as progress when it met its goal, or — in observe weeks — stayed below baseline. */
function isProgressDay(d: DailyStats): boolean {
  return d.goal != null ? d.uses <= d.goal : d.uses < d.baseline;
}

/** Consecutive completed days of progress, counting back from yesterday. */
export function currentStreak(days: DailyStats[]): number {
  let streak = 0;
  const done = completeDays(days);
  for (let i = done.length - 1; i >= 0; i--) {
    if (!isProgressDay(done[i])) break;
    streak++;
  }
  return streak;
}

export function goalsMetCount(days: DailyStats[]): number {
  return completeDays(days).filter((d) => d.metGoal === true).length;
}

/** Mean uses over the last `n` completed days (fewer if the journey is younger). */
export function recentAverage(days: DailyStats[], n = 7): number | null {
  const done = completeDays(days).slice(-n);
  if (done.length === 0) return null;
  return done.reduce((a, d) => a + d.uses, 0) / done.length;
}

/** 0.51 = 51 % less than baseline. Negative when usage went up. */
export function reductionVsBaseline(average: number | null, baseline: number): number {
  if (average == null || baseline <= 0) return 0;
  return 1 - average / baseline;
}

/** Uses below baseline, summed over completed days. */
export function usesAvoided(days: DailyStats[]): number {
  return completeDays(days).reduce((sum, d) => sum + Math.max(0, d.baseline - d.uses), 0);
}

export function costPerUse(user: User): number {
  if (user.baselinePerDay <= 0) return 0;
  return user.weeklySpendBefore / 7 / user.baselinePerDay;
}

export function estimatedSavings(days: DailyStats[], user: User): number {
  return usesAvoided(days) * costPerUse(user);
}

/** Savings over the last 7 completed days. */
export function savingsThisWeek(days: DailyStats[], user: User): number {
  return usesAvoided(completeDays(days).slice(-7)) * costPerUse(user);
}

/** Average uses per hour of day over completed days. */
export function hourlyProfile(days: DailyStats[]): number[] {
  const done = completeDays(days);
  const out = new Array(24).fill(0);
  if (done.length === 0) return out;
  for (const d of done) d.byHour.forEach((v, h) => (out[h] += v));
  return out.map((v) => v / done.length);
}

/** 7 × 24 grid (Mon…Sun × hour) of average uses, over the last `weeks` weeks of completed days. */
export function weekdayHourHeatmap(days: DailyStats[], weeks = 3): number[][] {
  const done = completeDays(days).slice(-weeks * 7);
  const sums = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const counts = new Array(7).fill(0);
  for (const d of done) {
    const w = weekdayIndex(d.date);
    counts[w] += 1;
    d.byHour.forEach((v, h) => (sums[w][h] += v));
  }
  return sums.map((row, w) => row.map((v) => (counts[w] ? v / counts[w] : 0)));
}

export function peakHour(profile: number[]): number {
  let best = 0;
  profile.forEach((v, h) => {
    if (v > profile[best]) best = h;
  });
  return best;
}

/** Start hour of the busiest `width`-hour window. */
export function peakWindow(profile: number[], width = 2): number {
  let best = 0;
  let bestSum = -1;
  for (let h = 0; h <= 24 - width; h++) {
    const sum = profile.slice(h, h + width).reduce((a, b) => a + b, 0);
    if (sum > bestSum) {
      bestSum = sum;
      best = h;
    }
  }
  return best;
}

/** How many uses the user typically has by this time of day (last 7 completed days). */
export function typicalByNow(days: DailyStats[], now: Timestamp): number {
  const done = completeDays(days).slice(-7);
  if (done.length === 0) return 0;
  const d = new Date(now);
  const h = d.getHours();
  const frac = d.getMinutes() / 60;
  const total = done.reduce((sum, day) => {
    const before = day.byHour.slice(0, h).reduce((a, b) => a + b, 0);
    return sum + before + day.byHour[h] * frac;
  }, 0);
  return total / done.length;
}

export function lowestCompletedDay(days: DailyStats[]): DailyStats | null {
  const done = completeDays(days);
  if (done.length === 0) return null;
  return done.reduce((min, d) => (d.uses < min.uses ? d : min));
}

/** Average uses per day for a week of the plan (completed days only). */
export function weekAverage(days: DailyStats[], goal: Goal): number | null {
  const inWeek = completeDays(days).filter((d) => d.date >= goal.startDate && d.date <= goal.endDate);
  if (inWeek.length === 0) return null;
  return inWeek.reduce((a, d) => a + d.uses, 0) / inWeek.length;
}
