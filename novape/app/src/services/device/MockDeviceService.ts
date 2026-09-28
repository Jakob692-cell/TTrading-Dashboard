import type { ConnectionState, DeviceSettings, Timestamp } from '../../models';
import type { DeviceEvent, DeviceInfo, DeviceListener, DeviceService, FirmwareStatus } from './DeviceService';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Simulated NoVape One. Behaves like the real thing from the app's point of
 * view: it scans, connects, reports battery and cartridge, and emits usage
 * events (via {@link simulateUse}).
 */
export class MockDeviceService implements DeviceService {
  readonly kind = 'mock' as const;
  private state: ConnectionState = 'disconnected';
  private listeners = new Set<DeviceListener>();
  private info: DeviceInfo = {
    id: 'nv-one-7f3a',
    name: 'NoVape One',
    firmwareVersion: '1.4.2',
    batteryLevel: 82,
    cartridgeLevel: 63,
  };

  isSupported() {
    return true;
  }

  getState() {
    return this.state;
  }

  private emit(event: DeviceEvent) {
    this.listeners.forEach((l) => l(event));
  }

  private setState(state: ConnectionState) {
    this.state = state;
    this.emit({ type: 'connection', state });
  }

  async connect(knownDeviceId?: string): Promise<DeviceInfo> {
    if (this.state === 'connected') return this.info;
    this.setState(knownDeviceId ? 'connecting' : 'scanning');
    await wait(knownDeviceId ? 600 : 1600);
    this.setState('connecting');
    await wait(700);
    this.setState('connected');
    this.emit({ type: 'info', info: this.info });
    return this.info;
  }

  async disconnect() {
    this.setState('disconnected');
  }

  async syncOfflineUsage(_since: Timestamp) {
    return [];
  }

  async applySettings(_settings: DeviceSettings) {
    await wait(120);
  }

  async rename(name: string) {
    this.info = { ...this.info, name };
    this.emit({ type: 'info', info: this.info });
  }

  async find(durationMs = 6000) {
    await wait(durationMs);
  }

  async checkFirmware(): Promise<FirmwareStatus> {
    await wait(900);
    return { current: this.info.firmwareVersion, latest: '1.4.2', updateAvailable: false };
  }

  subscribe(listener: DeviceListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Demo helper: pretend the user just took a draw. */
  simulateUse() {
    if (this.state !== 'connected') return;
    this.emit({ type: 'usage', timestamp: Date.now(), durationMs: 1800 });
  }

  /** Demo helper: set the cartridge level (e.g. after reading the store). */
  setCartridgeLevel(level: number) {
    this.info = { ...this.info, cartridgeLevel: level };
  }
}
