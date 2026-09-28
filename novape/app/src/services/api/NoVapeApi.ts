import type {
  AppSnapshot,
  Cartridge,
  CravingEvent,
  Device,
  Goal,
  ID,
  NotificationPreferences,
  OnboardingInput,
  UsageEvent,
  User,
} from '../../models';

export type UserPatch = Partial<Pick<User, 'firstName' | 'weeklySpendBefore' | 'intention' | 'baselinePerDay'>>;
export type CartridgePatch = Partial<Pick<Cartridge, 'nextFlavorId' | 'remainingPct' | 'flavorId'>>;

/**
 * Everything the app reads or writes goes through this interface.
 *
 * `MockNoVapeApi` implements it locally (demo data + localStorage).
 * `HttpNoVapeApi` shows the REST mapping for a real backend; switching is a
 * one-line change in `services/api/index.ts`.
 */
export interface NoVapeApi {
  loadSnapshot(): Promise<AppSnapshot>;
  completeOnboarding(input: OnboardingInput): Promise<AppSnapshot>;
  /** Existing account ("I already have an account"). */
  signIn(): Promise<AppSnapshot>;
  updateUser(patch: UserPatch): Promise<User>;

  updateGoal(goalId: ID, dailyLimit: number | null): Promise<Goal[]>;
  addGoalWeek(): Promise<Goal[]>;

  recordUsage(event: Omit<UsageEvent, 'id'>): Promise<UsageEvent>;
  recordCraving(event: Omit<CravingEvent, 'id'>): Promise<CravingEvent>;

  /** Persist the paired device (or `null` to forget it). */
  saveDevice(device: Device | null): Promise<Device | null>;
  updateCartridge(patch: CartridgePatch): Promise<Cartridge | null>;
  updateNotificationPreferences(prefs: NotificationPreferences): Promise<NotificationPreferences>;

  /** All of the user's data as a JSON document (data portability). */
  exportData(): Promise<string>;
  /** Delete everything and start over. */
  resetAll(): Promise<void>;
}
