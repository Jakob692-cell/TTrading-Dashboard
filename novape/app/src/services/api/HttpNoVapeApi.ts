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
import type { CartridgePatch, NoVapeApi, UserPatch } from './NoVapeApi';

/**
 * REST implementation of {@link NoVapeApi}. Not used by the demo; it documents
 * the expected endpoints so a backend can be dropped in by setting
 * `VITE_API_URL` (see `services/api/index.ts`).
 */
export class HttpNoVapeApi implements NoVapeApi {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => string | null = () => null,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = this.getToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${path} failed with ${res.status}`);
    if (res.status === 204) return undefined as T;
    const type = res.headers.get('Content-Type') ?? '';
    return (type.includes('application/json') ? res.json() : res.text()) as Promise<T>;
  }

  loadSnapshot() {
    return this.request<AppSnapshot>('GET', '/me/snapshot');
  }
  completeOnboarding(input: OnboardingInput) {
    return this.request<AppSnapshot>('POST', '/me/onboarding', input);
  }
  signIn() {
    return this.request<AppSnapshot>('POST', '/auth/session');
  }
  updateUser(patch: UserPatch) {
    return this.request<User>('PATCH', '/me', patch);
  }
  updateGoal(goalId: ID, dailyLimit: number | null) {
    return this.request<Goal[]>('PUT', `/me/goals/${encodeURIComponent(goalId)}`, { dailyLimit });
  }
  addGoalWeek() {
    return this.request<Goal[]>('POST', '/me/goals');
  }
  recordUsage(event: Omit<UsageEvent, 'id'>) {
    return this.request<UsageEvent>('POST', '/me/usage', event);
  }
  recordCraving(event: Omit<CravingEvent, 'id'>) {
    return this.request<CravingEvent>('POST', '/me/cravings', event);
  }
  saveDevice(device: Device | null) {
    return device
      ? this.request<Device>('PUT', '/me/device', device)
      : this.request<null>('DELETE', '/me/device').then(() => null);
  }
  updateCartridge(patch: CartridgePatch) {
    return this.request<Cartridge | null>('PATCH', '/me/cartridge', patch);
  }
  updateNotificationPreferences(prefs: NotificationPreferences) {
    return this.request<NotificationPreferences>('PUT', '/me/notification-preferences', prefs);
  }
  exportData() {
    return this.request<string>('GET', '/me/export');
  }
  resetAll() {
    return this.request<void>('DELETE', '/me');
  }
}
