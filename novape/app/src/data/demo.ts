import type {
  Cartridge,
  CravingEvent,
  CravingOutcome,
  CravingTrigger,
  Device,
  NotificationPreferences,
  Timestamp,
  UsageEvent,
  User,
} from '../models';
import { addDays, eachDay, startOfDay, toISODate, weekdayIndex } from '../domain/dates';

/**
 * Deterministic demo data. Everything is anchored to "today", so the demo
 * always shows a user on day 21 of their journey, with a realistic,
 * gradually declining usage curve and plausible daily rhythms.
 */

export const DEMO_DAY_NUMBER = 21;

/** Completed-day totals for a 120/day baseline; scaled for other baselines. */
const CURVE_120 = [118, 121, 112, 109, 104, 101, 96, 92, 88, 84, 86, 82, 76, 72, 59, 58, 57, 55, 56, 54, 55];

/** Relative weight of each hour of the day. */
const WEEKDAY = [0.2, 0.05, 0, 0, 0, 0.05, 0.3, 1.2, 2.2, 2.4, 2.0, 2.3, 3.0, 5.2, 3.4, 2.8, 4.2, 4.6, 3.0, 2.4, 2.6, 3.0, 2.0, 0.9];
const WEEKEND = [0.8, 0.4, 0.1, 0, 0, 0, 0, 0.2, 0.6, 1.4, 2.2, 2.6, 3.0, 3.8, 3.0, 2.6, 3.2, 3.6, 3.4, 3.6, 4.4, 4.8, 3.6, 2.0];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Split `total` across hours proportionally, exactly (largest remainder). */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / sum) * total);
  const counts = raw.map(Math.floor);
  let rest = total - counts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) counts[order[k][1]] += 1;
  return counts;
}

export function demoJourneyStart(now: Timestamp) {
  return addDays(toISODate(now), -(DEMO_DAY_NUMBER - 1));
}

export function demoUser(now: Timestamp): User {
  return {
    id: 'user-demo',
    firstName: 'Alex',
    createdAt: startOfDay(demoJourneyStart(now)),
    intention: 'quit',
    baselinePerDay: 120,
    journeyStartDate: demoJourneyStart(now),
    currency: 'EUR',
    weeklySpendBefore: 75,
    onboardingCompleted: false,
  };
}

export function demoUsage(user: User, now: Timestamp): UsageEvent[] {
  const today = toISODate(now);
  const scale = user.baselinePerDay / 120;
  const events: UsageEvent[] = [];
  eachDay(user.journeyStartDate, today).forEach((date, i) => {
    const base = CURVE_120[i] ?? CURVE_120[CURVE_120.length - 1] * Math.pow(0.985, i - CURVE_120.length + 1);
    const total = Math.round(base * scale);
    const profile = weekdayIndex(date) >= 5 ? WEEKEND : WEEKDAY;
    const counts = allocate(total, profile);
    const rand = mulberry32(hash(date));
    const midnight = startOfDay(date);
    counts.forEach((n, hour) => {
      for (let k = 0; k < n; k++) {
        const t = midnight + hour * 3_600_000 + Math.floor(rand() * 3_600_000);
        if (t > now) continue;
        events.push({ id: `u-${date}-${hour}-${k}`, timestamp: t, durationMs: 1200 + Math.floor(rand() * 2400), source: 'device' });
      }
    });
  });
  return events.sort((a, b) => a.timestamp - b.timestamp);
}

type CravingSeed = [dayIndex: number, hour: number, minute: number, trigger: CravingTrigger, outcome: CravingOutcome];

const CRAVING_SEEDS: CravingSeed[] = [
  [1, 13, 20, 'after_eating', 'same'],
  [2, 16, 45, 'stress', 'lower'],
  [3, 10, 15, 'work', 'lower'],
  [4, 21, 30, 'boredom', 'same'],
  [5, 16, 10, 'stress', 'gone'],
  [6, 20, 50, 'social', 'lower'],
  [7, 13, 35, 'after_eating', 'gone'],
  [8, 17, 5, 'stress', 'same'],
  [9, 14, 40, 'work', 'gone'],
  [10, 16, 30, 'stress', 'lower'],
  [11, 19, 20, 'after_eating', 'gone'],
  [12, 22, 5, 'boredom', 'lower'],
  [13, 16, 55, 'stress', 'gone'],
  [14, 11, 10, 'work', 'gone'],
  [14, 21, 40, 'social', 'lower'],
  [15, 13, 25, 'after_eating', 'gone'],
  [16, 17, 15, 'stress', 'same'],
  [17, 9, 50, 'habit', 'gone'],
  [17, 15, 45, 'work', 'lower'],
  [18, 16, 20, 'stress', 'gone'],
  [18, 20, 35, 'boredom', 'lower'],
  [19, 13, 10, 'after_eating', 'gone'],
  [19, 16, 40, 'stress', 'gone'],
];

export function demoCravings(user: User, now: Timestamp): CravingEvent[] {
  return CRAVING_SEEDS.map(([day, hour, minute, trigger, outcome], i) => ({
    id: `c-demo-${i}`,
    timestamp: startOfDay(addDays(user.journeyStartDate, day)) + (hour * 60 + minute) * 60_000,
    trigger,
    waitedSeconds: outcome === 'same' ? 75 : 120,
    outcome,
  })).filter((c) => c.timestamp <= now);
}

export function demoDevice(user: User, now: Timestamp): Device {
  return {
    id: 'nv-one-7f3a',
    model: 'NoVape One',
    name: `${user.firstName}’s NoVape`,
    finish: 'champagne',
    firmwareVersion: '1.4.2',
    batteryLevel: 82,
    connection: 'connected',
    lastSyncedAt: now,
    settings: { hapticStrength: 'light', lightFeedback: true },
  };
}

export function demoCartridge(now: Timestamp): Cartridge {
  return {
    id: 'cart-demo-1',
    flavorId: 'mint',
    insertedAt: now - 6 * 24 * 3_600_000,
    remainingPct: 63,
    usesPerCartridge: 900,
    nextFlavorId: null,
  };
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  progressUpdates: true,
  patternReminders: true,
  milestones: true,
  dailySummary: false,
  quietHours: { from: '22:00', to: '08:00' },
};
