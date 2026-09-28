import type {
  AppSnapshot,
  Cartridge,
  CravingEvent,
  Device,
  Goal,
  ID,
  NotificationPreferences,
  OnboardingInput,
  Timestamp,
  UsageEvent,
  User,
} from '../../models';
import {
  DEFAULT_NOTIFICATION_PREFS,
  demoCartridge,
  demoCravings,
  demoDevice,
  demoUsage,
  demoUser,
} from '../../data/demo';
import { FLAVORS } from '../../data/catalog';
import { buildGoals, suggestWeeklyLimits } from '../../domain/plan';
import { storage } from '../storage';
import type { CartridgePatch, NoVapeApi, UserPatch } from './NoVapeApi';

const STORAGE_KEY = 'novape.state.v1';

/** What the mock keeps between sessions: only the user's own changes, never the generated history. */
interface Persisted {
  user?: Partial<User>;
  limits?: (number | null)[];
  usage: UsageEvent[];
  cravings: CravingEvent[];
  /** undefined = never set up, null = set up later / forgotten */
  device?: Device | null;
  cartridge?: Partial<Cartridge>;
  prefs?: NotificationPreferences;
  /** Baseline the demo history was generated for; later baseline edits don't rewrite history. */
  historyBaseline?: number;
}

const clone = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Local implementation of the API. Demo history is regenerated relative to
 * "now" on every load, so the app always looks alive; the user's own edits
 * (plan, check-ins, settings, new uses) are layered on top and persisted.
 */
export class MockNoVapeApi implements NoVapeApi {
  private state: Persisted;

  constructor(private readonly clock: () => Timestamp = () => Date.now()) {
    this.state = storage.read<Persisted>(STORAGE_KEY) ?? { usage: [], cravings: [] };
  }

  private save() {
    storage.write(STORAGE_KEY, this.state);
  }

  private user(now: Timestamp): User {
    const base = demoUser(now);
    // The journey start stays anchored to the demo timeline.
    return { ...base, ...this.state.user, journeyStartDate: base.journeyStartDate, createdAt: base.createdAt };
  }

  private goals(user: User): Goal[] {
    const limits = this.state.limits ?? suggestWeeklyLimits(user.baselinePerDay, user.intention);
    return buildGoals(user.journeyStartDate, limits);
  }

  private cartridge(now: Timestamp): Cartridge {
    return { ...demoCartridge(now), ...this.state.cartridge };
  }

  private snapshot(): AppSnapshot {
    const now = this.clock();
    const user = this.user(now);
    const start = user.journeyStartDate;
    const own = (t: Timestamp) => t <= now;
    const historyUser = { ...user, baselinePerDay: this.state.historyBaseline ?? user.baselinePerDay };
    const usage = [...demoUsage(historyUser, now), ...this.state.usage.filter((e) => own(e.timestamp))].sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    const cravings = [...demoCravings(user, now), ...this.state.cravings.filter((c) => own(c.timestamp))].sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    const device = this.state.device === undefined ? null : this.state.device;
    return clone({
      user: { ...user, journeyStartDate: start },
      device,
      goals: this.goals(user),
      usage,
      cravings,
      cartridge: this.cartridge(now),
      flavors: FLAVORS,
      notificationPreferences: this.state.prefs ?? DEFAULT_NOTIFICATION_PREFS,
    });
  }

  async loadSnapshot(): Promise<AppSnapshot> {
    return this.snapshot();
  }

  async completeOnboarding(input: OnboardingInput): Promise<AppSnapshot> {
    const now = this.clock();
    this.state.user = {
      ...this.state.user,
      intention: input.intention,
      baselinePerDay: input.baselinePerDay,
      onboardingCompleted: true,
    };
    this.state.limits = input.weeklyLimits;
    this.state.historyBaseline = input.baselinePerDay;
    this.state.device = input.deviceConnected ? demoDevice(this.user(now), now) : null;
    this.save();
    return this.snapshot();
  }

  async signIn(): Promise<AppSnapshot> {
    const now = this.clock();
    this.state.user = { ...this.state.user, onboardingCompleted: true };
    if (this.state.device === undefined) this.state.device = demoDevice(this.user(now), now);
    this.save();
    return this.snapshot();
  }

  async updateUser(patch: UserPatch): Promise<User> {
    this.state.historyBaseline ??= this.user(this.clock()).baselinePerDay;
    this.state.user = { ...this.state.user, ...patch };
    this.save();
    return clone(this.user(this.clock()));
  }

  async updateGoal(goalId: ID, dailyLimit: number | null): Promise<Goal[]> {
    const user = this.user(this.clock());
    const goals = this.goals(user);
    const limits = goals.map((g) => (g.id === goalId ? dailyLimit : g.dailyLimit));
    this.state.limits = limits;
    this.save();
    return clone(buildGoals(user.journeyStartDate, limits));
  }

  async addGoalWeek(): Promise<Goal[]> {
    const user = this.user(this.clock());
    const limits = this.goals(user).map((g) => g.dailyLimit);
    limits.push(limits[limits.length - 1] ?? 0);
    this.state.limits = limits;
    this.save();
    return clone(buildGoals(user.journeyStartDate, limits));
  }

  async recordUsage(event: Omit<UsageEvent, 'id'>): Promise<UsageEvent> {
    const saved = { ...event, id: uid('u') };
    this.state.usage.push(saved);
    const cart = this.cartridge(this.clock());
    this.state.cartridge = {
      ...this.state.cartridge,
      remainingPct: Math.max(0, cart.remainingPct - 100 / cart.usesPerCartridge),
    };
    this.save();
    return clone(saved);
  }

  async recordCraving(event: Omit<CravingEvent, 'id'>): Promise<CravingEvent> {
    const saved = { ...event, id: uid('c') };
    this.state.cravings.push(saved);
    this.save();
    return clone(saved);
  }

  async saveDevice(device: Device | null): Promise<Device | null> {
    this.state.device = device;
    this.save();
    return clone(device);
  }

  async updateCartridge(patch: CartridgePatch): Promise<Cartridge | null> {
    this.state.cartridge = { ...this.state.cartridge, ...patch };
    this.save();
    return clone(this.cartridge(this.clock()));
  }

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<NotificationPreferences> {
    this.state.prefs = prefs;
    this.save();
    return clone(prefs);
  }

  async exportData(): Promise<string> {
    return JSON.stringify({ exportedAt: new Date(this.clock()).toISOString(), ...this.snapshot() }, null, 2);
  }

  async resetAll(): Promise<void> {
    this.state = { usage: [], cravings: [] };
    storage.remove(STORAGE_KEY);
  }
}
