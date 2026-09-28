import type { AppNotification, CravingEvent, DailyStats, NotificationPreferences, Timestamp } from '../models';
import { startOfDay } from './dates';
import { cravingHourProfile } from './insights';
import { completeDays, lowestCompletedDay, todayStats, typicalByNow } from './stats';

/**
 * Supportive, informative notifications derived from the user's own data.
 * Nothing here ever encourages using the device; messages only describe
 * progress and patterns.
 */
export function buildNotifications(
  days: DailyStats[],
  cravings: CravingEvent[],
  prefs: NotificationPreferences,
  now: Timestamp,
): AppNotification[] {
  const out: AppNotification[] = [];
  const today = todayStats(days);
  const done = completeDays(days);

  if (prefs.progressUpdates && today) {
    const usual = typicalByNow(days, now);
    if (usual >= 3) {
      const diff = 1 - today.uses / usual;
      const pct = Math.round(Math.abs(diff) * 100);
      const text =
        diff >= 0.05
          ? `You’re currently ${pct}% below your usual usage today.`
          : diff <= -0.05
            ? `Today is running ${pct}% above your usual pace. That’s useful to know, not a problem.`
            : 'Today is tracking close to your usual pattern.';
      out.push({ id: 'progress-now', timestamp: now - 60 * 1000, kind: 'progress', text });
    }
  }

  if (prefs.patternReminders && cravings.length >= 5) {
    // Sent shortly before the hour with the most craving check-ins.
    const profile = cravingHourProfile(cravings);
    const peak = profile.indexOf(Math.max(...profile));
    let at = startOfDay(today?.date ?? done[done.length - 1]?.date ?? '1970-01-01') + (peak * 60 - 10) * 60 * 1000;
    if (at > now) at -= 24 * 60 * 60 * 1000;
    out.push({
      id: 'pattern-daily',
      timestamp: at,
      kind: 'pattern',
      text: 'You normally have more cravings around this time.',
    });
  }

  if (prefs.milestones) {
    const lowest = lowestCompletedDay(days);
    const yesterday = done[done.length - 1];
    if (lowest && yesterday && lowest.date === yesterday.date && done.length > 3) {
      out.push({
        id: 'milestone-lowest',
        timestamp: startOfDay(yesterday.date) + 33 * 60 * 60 * 1000,
        kind: 'milestone',
        text: 'Yesterday was your lowest-use day yet.',
      });
    }
    for (const n of [21, 14, 7]) {
      if (done.length >= n) {
        const day = done[n - 1];
        out.push({
          id: `milestone-${n}`,
          timestamp: startOfDay(day.date) + 21 * 60 * 60 * 1000,
          kind: 'milestone',
          text: `${n} days of progress.`,
        });
      }
    }
  }

  if (prefs.dailySummary && done.length) {
    const y = done[done.length - 1];
    out.push({
      id: 'summary-yesterday',
      timestamp: startOfDay(y.date) + 21 * 60 * 60 * 1000,
      kind: 'summary',
      text:
        y.goal != null && y.uses <= y.goal
          ? `Yesterday: ${y.uses} uses, within your goal of ${y.goal}.`
          : `Yesterday: ${y.uses} uses. Tomorrow is another data point.`,
    });
  }

  return out.filter((n) => n.timestamp <= now).sort((a, b) => b.timestamp - a.timestamp);
}
