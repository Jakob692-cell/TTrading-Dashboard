import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type {
  AppSnapshot,
  ConnectionState,
  CravingEvent,
  Device,
  DeviceSettings,
  FlavorId,
  ID,
  NotificationPreferences,
  OnboardingInput,
  UsageEvent,
  User,
} from '../models';
import { api } from '../services/api';
import type { UserPatch } from '../services/api/NoVapeApi';
import { deviceService, MockDeviceService, type FirmwareStatus } from '../services/device';
import { demoDevice } from '../data/demo';

interface State {
  status: 'loading' | 'ready' | 'error';
  data: AppSnapshot | null;
  connection: ConnectionState;
}

type Action =
  | { type: 'loaded'; data: AppSnapshot }
  | { type: 'failed' }
  | { type: 'patch'; patch: Partial<AppSnapshot> }
  | { type: 'usage'; event: UsageEvent }
  | { type: 'craving'; event: CravingEvent }
  | { type: 'connection'; state: ConnectionState }
  | { type: 'device'; patch: Partial<Device> }
  | { type: 'cartridgeLevel'; level: number };

function reducer(state: State, action: Action): State {
  const data = state.data;
  switch (action.type) {
    case 'loaded':
      return { ...state, status: 'ready', data: action.data };
    case 'failed':
      return { ...state, status: 'error' };
    case 'connection':
      return { ...state, connection: action.state };
    default:
      if (!data) return state;
  }
  switch (action.type) {
    case 'patch':
      return { ...state, data: { ...data, ...action.patch } };
    case 'usage':
      return { ...state, data: { ...data, usage: [...data.usage, action.event] } };
    case 'craving':
      return { ...state, data: { ...data, cravings: [...data.cravings, action.event] } };
    case 'device':
      return data.device ? { ...state, data: { ...data, device: { ...data.device, ...action.patch } } } : state;
    case 'cartridgeLevel':
      return data.cartridge
        ? { ...state, data: { ...data, cartridge: { ...data.cartridge, remainingPct: action.level } } }
        : state;
    default:
      return state;
  }
}

export interface AppActions {
  completeOnboarding(input: OnboardingInput): Promise<void>;
  signIn(): Promise<void>;
  updateUser(patch: UserPatch): Promise<User>;
  updateGoal(goalId: ID, dailyLimit: number | null): Promise<void>;
  addGoalWeek(): Promise<void>;
  recordCraving(event: Omit<CravingEvent, 'id'>): Promise<void>;
  connectDevice(): Promise<boolean>;
  disconnectDevice(): Promise<void>;
  forgetDevice(): Promise<void>;
  updateDeviceSettings(settings: DeviceSettings): Promise<void>;
  renameDevice(name: string): Promise<void>;
  findDevice(): Promise<void>;
  checkFirmware(): Promise<FirmwareStatus>;
  setNextFlavor(flavorId: FlavorId | null): Promise<void>;
  /** The user put a fresh cartridge in (the one marked "up next", if any). */
  insertCartridge(): Promise<void>;
  updateNotificationPreferences(prefs: NotificationPreferences): Promise<void>;
  exportData(): Promise<string>;
  resetAll(): Promise<void>;
  /** Demo only: pretend the device registered a use. */
  simulateUse(): void;
}

interface Ctx {
  state: State;
  actions: AppActions;
}

const StoreContext = createContext<Ctx | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { status: 'loading', data: null, connection: 'disconnected' });
  const dataRef = useRef(state.data);
  dataRef.current = state.data;

  // Initial load
  useEffect(() => {
    let alive = true;
    api
      .loadSnapshot()
      .then((data) => alive && dispatch({ type: 'loaded', data }))
      .catch(() => alive && dispatch({ type: 'failed' }));
    return () => {
      alive = false;
    };
  }, []);

  // Device events → store (+ persistence through the API)
  useEffect(() => {
    return deviceService.subscribe((event) => {
      switch (event.type) {
        case 'connection':
          dispatch({ type: 'connection', state: event.state });
          if (event.state === 'connected') dispatch({ type: 'device', patch: { lastSyncedAt: Date.now() } });
          break;
        case 'battery':
          dispatch({ type: 'device', patch: { batteryLevel: event.level } });
          break;
        case 'cartridge':
          dispatch({ type: 'cartridgeLevel', level: event.level });
          break;
        case 'info':
          dispatch({ type: 'device', patch: { batteryLevel: event.info.batteryLevel, firmwareVersion: event.info.firmwareVersion } });
          break;
        case 'usage':
          api
            .recordUsage({ timestamp: event.timestamp, durationMs: event.durationMs, source: 'device', deviceId: dataRef.current?.device?.id })
            .then((saved) => {
              dispatch({ type: 'usage', event: saved });
              const cart = dataRef.current?.cartridge;
              if (cart) dispatch({ type: 'cartridgeLevel', level: Math.max(0, cart.remainingPct - 100 / cart.usesPerCartridge) });
            });
          break;
        default:
          break;
      }
    });
  }, []);

  // Reconnect to a known device once the app has loaded.
  const deviceId = state.data?.device?.id;
  const onboarded = state.data?.user?.onboardingCompleted;
  useEffect(() => {
    if (deviceId && onboarded && deviceService.getState() === 'disconnected') {
      deviceService.connect(deviceId).catch(() => undefined);
    }
  }, [deviceId, onboarded]);

  const actions = useMemo<AppActions>(() => {
    const patch = (p: Partial<AppSnapshot>) => dispatch({ type: 'patch', patch: p });
    const current = () => dataRef.current;

    return {
      async completeOnboarding(input) {
        const data = await api.completeOnboarding(input);
        dispatch({ type: 'loaded', data });
      },
      async signIn() {
        const data = await api.signIn();
        dispatch({ type: 'loaded', data });
      },
      async updateUser(p) {
        const user = await api.updateUser(p);
        patch({ user });
        return user;
      },
      async updateGoal(goalId, dailyLimit) {
        patch({ goals: await api.updateGoal(goalId, dailyLimit) });
      },
      async addGoalWeek() {
        patch({ goals: await api.addGoalWeek() });
      },
      async recordCraving(event) {
        const saved = await api.recordCraving(event);
        dispatch({ type: 'craving', event: saved });
      },
      async connectDevice() {
        try {
          const info = await deviceService.connect();
          const data = current();
          const base = data?.device ?? (data?.user ? demoDevice(data.user, Date.now()) : null);
          if (!base) return false;
          const device: Device = {
            ...base,
            id: info.id,
            firmwareVersion: info.firmwareVersion,
            batteryLevel: info.batteryLevel,
            connection: 'connected',
            lastSyncedAt: Date.now(),
          };
          patch({ device: await api.saveDevice(device) });
          return true;
        } catch {
          return false;
        }
      },
      async disconnectDevice() {
        await deviceService.disconnect();
      },
      async forgetDevice() {
        await deviceService.disconnect();
        patch({ device: await api.saveDevice(null) });
      },
      async updateDeviceSettings(settings) {
        const device = current()?.device;
        if (!device) return;
        const next = { ...device, settings };
        patch({ device: next });
        await Promise.all([deviceService.applySettings(settings).catch(() => undefined), api.saveDevice(next)]);
      },
      async renameDevice(name) {
        const device = current()?.device;
        if (!device || !name.trim()) return;
        const next = { ...device, name: name.trim() };
        patch({ device: next });
        await Promise.all([deviceService.rename(next.name).catch(() => undefined), api.saveDevice(next)]);
      },
      async findDevice() {
        await deviceService.find(6000);
      },
      checkFirmware() {
        return deviceService.checkFirmware();
      },
      async setNextFlavor(flavorId) {
        patch({ cartridge: await api.updateCartridge({ nextFlavorId: flavorId }) });
      },
      async insertCartridge() {
        const cart = current()?.cartridge;
        if (!cart) return;
        const flavorId = cart.nextFlavorId ?? cart.flavorId;
        patch({ cartridge: await api.updateCartridge({ flavorId, nextFlavorId: null, remainingPct: 100, insertedAt: Date.now() }) });
        await deviceService.startCartridge(cart.usesPerCartridge).catch(() => undefined);
      },
      async updateNotificationPreferences(prefs) {
        patch({ notificationPreferences: await api.updateNotificationPreferences(prefs) });
      },
      exportData() {
        return api.exportData();
      },
      async resetAll() {
        await deviceService.disconnect();
        await api.resetAll();
        dispatch({ type: 'loaded', data: await api.loadSnapshot() });
      },
      simulateUse() {
        if (deviceService instanceof MockDeviceService) deviceService.simulateUse();
      },
    };
  }, []);

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <AppStoreProvider>');
  return ctx;
}

/** Loaded data; only call below the loading gate. */
export function useData(): AppSnapshot & { user: User } {
  const { state } = useStore();
  if (!state.data?.user) throw new Error('App data is not loaded');
  return state.data as AppSnapshot & { user: User };
}

export function useActions(): AppActions {
  return useStore().actions;
}

export function useConnection(): ConnectionState {
  return useStore().state.connection;
}

export const useStableCallback = <T extends (...args: never[]) => unknown>(fn: T) => {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback(((...args: Parameters<T>) => ref.current(...args)) as T, []);
};
