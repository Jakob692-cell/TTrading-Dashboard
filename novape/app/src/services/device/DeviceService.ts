import type { ConnectionState, DeviceSettings, Timestamp } from '../../models';

/** Snapshot of a paired device as the hardware reports it. */
export interface DeviceInfo {
  id: string;
  name: string;
  firmwareVersion: string;
  batteryLevel: number;
  /** Remaining aroma in the inserted cartridge, 0–100. */
  cartridgeLevel: number;
}

export interface FirmwareStatus {
  current: string;
  latest: string;
  updateAvailable: boolean;
}

export type DeviceEvent =
  | { type: 'connection'; state: ConnectionState }
  | { type: 'info'; info: DeviceInfo }
  | { type: 'battery'; level: number }
  | { type: 'cartridge'; level: number }
  /** One draw on the device. `timestamp` is when it happened (may be in the past when syncing an offline buffer). */
  | { type: 'usage'; timestamp: Timestamp; durationMs: number }
  | { type: 'error'; message: string };

export type DeviceListener = (event: DeviceEvent) => void;

/**
 * Hardware abstraction for the NoVape One.
 *
 * The UI only talks to this interface. Implementations:
 * - `MockDeviceService` — simulated device for the demo and tests.
 * - `WebBluetoothDeviceService` — GATT over Web Bluetooth (Chrome/Android, desktop).
 * - A native app would add e.g. a `react-native-ble-plx` or Capacitor BLE implementation
 *   of the same interface; nothing else needs to change.
 */
export interface DeviceService {
  readonly kind: 'mock' | 'web-bluetooth';
  isSupported(): boolean;
  getState(): ConnectionState;

  /** Scan, pair and connect. Resolves with the device info once connected. */
  connect(knownDeviceId?: string): Promise<DeviceInfo>;
  disconnect(): Promise<void>;

  /** Pull usage events recorded while the phone was out of range. */
  syncOfflineUsage(since: Timestamp): Promise<Array<{ timestamp: Timestamp; durationMs: number }>>;

  applySettings(settings: DeviceSettings): Promise<void>;
  rename(name: string): Promise<void>;
  /** Make the device vibrate and glow so it can be found. */
  find(durationMs?: number): Promise<void>;
  checkFirmware(): Promise<FirmwareStatus>;

  subscribe(listener: DeviceListener): () => void;
}
