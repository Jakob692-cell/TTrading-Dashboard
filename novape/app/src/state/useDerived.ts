import { useMemo } from 'react';
import { useData } from './AppStore';
import { useNow } from '../hooks/motion';
import { buildDailyStats, currentStreak, estimatedSavings, goalsMetCount, recentAverage, reductionVsBaseline, savingsThisWeek, todayStats, usesAvoided, weekdayHourHeatmap } from '../domain/stats';
import { cravingOutcomes, habitWindows, triggerBreakdown, weekendDifference } from '../domain/insights';
import { computeAchievements } from '../domain/achievements';
import { buildNotifications } from '../domain/notifications';
import { goalForDate } from '../domain/plan';
import { toISODate } from '../domain/dates';

/** Everything the screens derive from raw data, computed once per change. */
export function useDerived() {
  const data = useData();
  const now = useNow(30_000);

  return useMemo(() => {
    const { user, usage, goals, cravings, notificationPreferences } = data;
    const days = buildDailyStats(usage, user, goals, now);
    const today = todayStats(days);
    const todayDate = toISODate(now);
    const currentGoal = goalForDate(goals, todayDate);
    const avg7 = recentAverage(days, 7);
    return {
      now,
      days,
      today,
      dayNumber: today?.dayNumber ?? 1,
      currentGoal,
      streak: currentStreak(days),
      goalsMet: goalsMetCount(days),
      avg7,
      reduction: reductionVsBaseline(avg7, user.baselinePerDay),
      avoided: usesAvoided(days),
      savings: estimatedSavings(days, user),
      savingsWeek: savingsThisWeek(days, user),
      habit: habitWindows(days),
      heatmap: weekdayHourHeatmap(days, 3),
      weekend: weekendDifference(days),
      triggers: triggerBreakdown(cravings),
      outcomes: cravingOutcomes(cravings),
      achievements: computeAchievements(days),
      notifications: buildNotifications(days, cravings, notificationPreferences, now),
    };
  }, [data, now]);
}

export type Derived = ReturnType<typeof useDerived>;
