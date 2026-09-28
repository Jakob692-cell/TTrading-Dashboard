/**
 * NoVape domain model.
 *
 * These types are the contract between the UI, the local mock API and a
 * future backend. Keep them serialisable (no Dates, no class instances) so
 * they can travel over HTTP or be persisted as-is.
 */

export type ID = string;
/** Calendar day in the user's local time zone, `YYYY-MM-DD`. */
export type ISODate = string;
/** Milliseconds since the Unix epoch. */
export type Timestamp = number;

export type Intention = 'quit' | 'reduce' | 'understand';

export interface User {
  id: ID;
  firstName: string;
  email?: string;
  createdAt: Timestamp;
  intention: Intention;
  /** Self-reported uses per day before starting. */
  baselinePerDay: number;
  /** First day of the reduction plan. */
  journeyStartDate: ISODate;
  currency: 'EUR';
  /** What the user spent on vaping per week before starting; drives the savings estimate. */
  weeklySpendBefore: number;
  onboardingCompleted: boolean;
}

export type ConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'connected';
export type HapticStrength = 'off' | 'light' | 'medium' | 'strong';
export type DeviceFinish = 'champagne' | 'black' | 'graphite' | 'sage';

export interface DeviceSettings {
  hapticStrength: HapticStrength;
  /** Soft LED glow when the daily goal is close. */
  lightFeedback: boolean;
}

export interface Device {
  id: ID;
  model: 'NoVape One';
  name: string;
  finish: DeviceFinish;
  firmwareVersion: string;
  batteryLevel: number;
  connection: ConnectionState;
  lastSyncedAt?: Timestamp;
  settings: DeviceSettings;
}

export interface UsageEvent {
  id: ID;
  timestamp: Timestamp;
  /** How long the draw lasted, when the device reports it. */
  durationMs?: number;
  source: 'device' | 'manual';
  deviceId?: ID;
}

export interface DailyStats {
  date: ISODate;
  /** 1-based day number of the journey. */
  dayNumber: number;
  uses: number;
  /** Uses per hour of day, 24 entries. */
  byHour: number[];
  /** Daily limit that applied, or null during an observe-only week. */
  goal: number | null;
  baseline: number;
  /** Whether the day is over. Today is never complete. */
  complete: boolean;
  /** null when there was no goal or the day is not over yet. */
  metGoal: boolean | null;
}

export interface Goal {
  id: ID;
  /** 0-based week of the plan. */
  weekIndex: number;
  startDate: ISODate;
  endDate: ISODate;
  /** Max uses per day for this week; null = observe only. */
  dailyLimit: number | null;
}

export type CravingTrigger =
  | 'stress'
  | 'boredom'
  | 'social'
  | 'after_eating'
  | 'work'
  | 'habit'
  | 'other';

export type CravingOutcome = 'gone' | 'lower' | 'same';

export interface CravingEvent {
  id: ID;
  timestamp: Timestamp;
  trigger: CravingTrigger;
  /** Seconds the user waited before checking in. */
  waitedSeconds: number;
  outcome: CravingOutcome | null;
}

export type FlavorId = 'mint' | 'lemon' | 'berry';

export interface Flavor {
  id: FlavorId;
  name: string;
  notes: string;
  /** Subtle accent used for the tiny colour cue. */
  accent: string;
  /** Very light tint for backgrounds. */
  tint: string;
}

export interface Cartridge {
  id: ID;
  flavorId: FlavorId;
  insertedAt: Timestamp;
  /** Estimated remaining aroma, 0–100. */
  remainingPct: number;
  /** Uses a full cartridge lasts on average. */
  usesPerCartridge: number;
  /** Flavor the user picked for the next cartridge, if any. */
  nextFlavorId: FlavorId | null;
}

export interface Achievement {
  id: 'first_step' | 'one_week' | 'halfway' | 'control' | 'three_weeks' | 'independence';
  title: string;
  description: string;
  /** 0–1 */
  progress: number;
  achievedAt?: Timestamp;
  progressLabel: string;
}

export interface NotificationPreferences {
  progressUpdates: boolean;
  patternReminders: boolean;
  milestones: boolean;
  dailySummary: boolean;
  quietHours: { from: string; to: string };
}

export interface AppNotification {
  id: ID;
  timestamp: Timestamp;
  kind: 'progress' | 'pattern' | 'milestone' | 'summary';
  text: string;
}

/** Everything the app needs to render, loaded in one call on start. */
export interface AppSnapshot {
  user: User | null;
  device: Device | null;
  goals: Goal[];
  usage: UsageEvent[];
  cravings: CravingEvent[];
  cartridge: Cartridge | null;
  flavors: Flavor[];
  notificationPreferences: NotificationPreferences;
}

export interface OnboardingInput {
  intention: Intention;
  baselinePerDay: number;
  /** Weekly targets the user confirmed on the last onboarding step. */
  weeklyLimits: (number | null)[];
  deviceConnected: boolean;
}
