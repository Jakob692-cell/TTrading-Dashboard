import { describe, expect, it } from 'vitest';
import { buildGoals, goalForDate, suggestWeeklyLimits } from './plan';
import { buildDailyStats, currentStreak, estimatedSavings, peakHour, peakWindow, hourlyProfile, recentAverage, reductionVsBaseline, usesAvoided } from './stats';
import { cravingOutcomes, triggerBreakdown } from './insights';
import { computeAchievements } from './achievements';
import { addDays, diffDays, formatDateRange, toISODate } from './dates';
import { demoCravings, demoUsage, demoUser } from '../data/demo';

// A fixed Monday afternoon keeps the demo deterministic.
const NOW = new Date(2026, 8, 28, 15, 40).getTime();

function demo() {
  const user = { ...demoUser(NOW), onboardingCompleted: true };
  const goals = buildGoals(user.journeyStartDate, suggestWeeklyLimits(user.baselinePerDay, user.intention));
  const days = buildDailyStats(demoUsage(user, NOW), user, goals, NOW);
  return { user, goals, days };
}

describe('plan', () => {
  it('suggests the reference quit plan for a 120/day baseline', () => {
    expect(suggestWeeklyLimits(120, 'quit')).toEqual([100, 80, 60, 45, 30, 15, 0]);
  });

  it('starts with an observe-only week when the user wants to understand first', () => {
    expect(suggestWeeklyLimits(120, 'understand')[0]).toBeNull();
  });

  it('uses single steps for small baselines', () => {
    expect(suggestWeeklyLimits(12, 'quit')).toEqual([10, 8, 6, 5, 3, 2, 0]);
  });

  it('maps dates to weeks and keeps the last week after the plan ends', () => {
    const goals = buildGoals('2026-09-08', [100, 80]);
    expect(goalForDate(goals, '2026-09-14')?.dailyLimit).toBe(100);
    expect(goalForDate(goals, '2026-09-15')?.dailyLimit).toBe(80);
    expect(goalForDate(goals, '2026-12-01')?.dailyLimit).toBe(80);
    expect(goalForDate(goals, '2026-09-01')).toBeNull();
  });
});

describe('dates', () => {
  it('handles ranges across months', () => {
    expect(formatDateRange('2026-09-29', '2026-10-05')).toBe('Sep 29 – Oct 5');
    expect(formatDateRange('2026-09-08', '2026-09-14')).toBe('Sep 8 – 14');
  });

  it('counts days without DST drift', () => {
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2);
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });
});

describe('demo data + stats', () => {
  it('puts the user on day 21 with 20 completed days', () => {
    const { days } = demo();
    expect(days).toHaveLength(21);
    expect(days[20].date).toBe(toISODate(NOW));
    expect(days.filter((d) => d.complete)).toHaveLength(20);
  });

  it('reproduces the reference curve exactly', () => {
    const { days } = demo();
    expect(days.slice(0, 20).map((d) => d.uses)).toEqual([118, 121, 112, 109, 104, 101, 96, 92, 88, 84, 86, 82, 76, 72, 59, 58, 57, 55, 56, 54]);
  });

  it('only includes today’s uses up to now', () => {
    const { days } = demo();
    const today = days[20];
    expect(today.uses).toBeGreaterThan(20);
    expect(today.uses).toBeLessThan(40);
    expect(today.byHour.slice(16).every((v) => v === 0)).toBe(true);
  });

  it('computes streak, reduction, avoided uses and savings', () => {
    const { user, days } = demo();
    expect(currentStreak(days)).toBe(8);
    const avg = recentAverage(days, 7)!;
    expect(Math.round(avg)).toBe(59);
    expect(Math.round(reductionVsBaseline(avg, 120) * 100)).toBe(51);
    expect(usesAvoided(days)).toBe(721);
    expect(Math.round(estimatedSavings(days, user))).toBe(64);
  });

  it('finds the after-lunch peak and the late-afternoon window', () => {
    const { days } = demo();
    const profile = hourlyProfile(days);
    expect(peakHour(profile)).toBe(13);
    expect(peakWindow(profile, 2)).toBe(16);
  });

  it('marks early achievements and leaves independence open', () => {
    const { days } = demo();
    const a = Object.fromEntries(computeAchievements(days).map((x) => [x.id, x]));
    expect(a.first_step.progress).toBe(1);
    expect(a.one_week.progress).toBe(1);
    expect(a.halfway.progress).toBe(1);
    expect(a.control.progress).toBe(1);
    expect(a.three_weeks.progress).toBeLessThan(1);
    expect(a.independence.achievedAt).toBeUndefined();
  });
});

describe('cravings', () => {
  it('summarises triggers and outcomes', () => {
    const cravings = demoCravings(demoUser(NOW), NOW);
    const triggers = triggerBreakdown(cravings);
    expect(triggers[0].trigger).toBe('stress');
    expect(triggers.reduce((a, t) => a + t.share, 0)).toBeCloseTo(1);
    const outcomes = cravingOutcomes(cravings);
    expect(outcomes.answered).toBe(23);
    expect(Math.round(outcomes.easedShare * 100)).toBe(83);
  });
});
