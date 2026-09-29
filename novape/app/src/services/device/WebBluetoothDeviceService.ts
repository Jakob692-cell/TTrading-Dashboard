import type { ConnectionState, DeviceSettings, Timestamp } from '../../models';
import type { DeviceEvent, DeviceInfo, DeviceListener, DeviceService, FirmwareStatus } from './DeviceService';
import {
  BATTERY_LEVEL,
  BATTERY_SERVICE,
  CHARACTERISTICS,
  DEVICE_INFO_SERVICE,
  FIRMWARE_REVISION,
  NOVAPE_SERVICE,
  SYNC_PAGE_RECORDS,
  decodeUsageRecord,
  decodeUsageRecords,
  encodeEpochSeconds,
  encodeName,
  encodeSettings,
  encodeUint16,
} from './protocol';

/* Minimal Web Bluetooth typings (not part of lib.dom yet). */
interface BTCharacteristic extends EventTarget {
  value?: DataView;
  readValue(): Promise<DataView>;
  writeValue(data: ArrayBufferView | ArrayBuffer): Promise<void>;
  startNotifications(): Promise<BTCharacteristic>;
}
interface BTService {
  getCharacteristic(uuid: string): Promise<BTCharacteristic>;
}
interface BTServer {
  connected: boolean;
  connect(): Promise<BTServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BTService>;
}
interface BTDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BTServer;
}
interface BTNavigator {
  bluetooth?: {
    requestDevice(options: { filters: Array<{ services?: string[]; namePrefix?: string }>; optionalServices?: string[] }): Promise<BTDevice>;
  };
}

const LATEST_FIRMWARE = '1.4.2';

/** Real hardware over Web Bluetooth (GATT). Requires a secure context and a user gesture for `connect`. */
export class WebBluetoothDeviceService implements DeviceService {
  readonly kind = 'web-bluetooth' as const;
  private state: ConnectionState = 'disconnected';
  private listeners = new Set<DeviceListener>();
  private device: BTDevice | null = null;
  private service: BTService | null = null;
  private info: DeviceInfo | null = null;

  isSupported() {
    return typeof navigator !== 'undefined' && !!(navigator as unknown as BTNavigator).bluetooth;
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

  private async characteristic(uuid: string) {
    if (!this.service) throw new Error('NoVape is not connected');
    return this.service.getCharacteristic(uuid);
  }

  async connect(): Promise<DeviceInfo> {
    const bt = (navigator as unknown as BTNavigator).bluetooth;
    if (!bt) throw new Error('Bluetooth is not available in this browser');
    try {
      this.setState('scanning');
      this.device = await bt.requestDevice({
        filters: [{ services: [NOVAPE_SERVICE] }, { namePrefix: 'NoVape' }],
        optionalServices: [NOVAPE_SERVICE, BATTERY_SERVICE, DEVICE_INFO_SERVICE],
      });
      this.device.addEventListener('gattserverdisconnected', () => this.setState('disconnected'));

      this.setState('connecting');
      const server = await this.device.gatt!.connect();
      this.service = await server.getPrimaryService(NOVAPE_SERVICE);
      // The device has no real-time clock: give it the time before anything is recorded.
      await this.characteristic(CHARACTERISTICS.clock)
        .then((clock) => clock.writeValue(encodeEpochSeconds(Date.now())))
        .catch(() => undefined); // firmware without a clock characteristic

      const battery = await (await server.getPrimaryService(BATTERY_SERVICE)).getCharacteristic(BATTERY_LEVEL);
      const batteryLevel = (await battery.readValue()).getUint8(0);
      await battery.startNotifications();
      battery.addEventListener('characteristicvaluechanged', () => {
        if (battery.value) this.emit({ type: 'battery', level: battery.value.getUint8(0) });
      });

      const firmware = await (await server.getPrimaryService(DEVICE_INFO_SERVICE)).getCharacteristic(FIRMWARE_REVISION);
      const firmwareVersion = new TextDecoder().decode(await firmware.readValue());

      const cartridge = await this.characteristic(CHARACTERISTICS.cartridge);
      const cartridgeLevel = (await cartridge.readValue()).getUint8(0);
      await cartridge.startNotifications();
      cartridge.addEventListener('characteristicvaluechanged', () => {
        if (cartridge.value) this.emit({ type: 'cartridge', level: cartridge.value.getUint8(0) });
      });

      const usage = await this.characteristic(CHARACTERISTICS.usage);
      await usage.startNotifications();
      usage.addEventListener('characteristicvaluechanged', () => {
        if (usage.value) this.emit({ type: 'usage', ...decodeUsageRecord(usage.value) });
      });

      this.info = {
        id: this.device.id,
        name: this.device.name ?? 'NoVape One',
        firmwareVersion,
        batteryLevel,
        cartridgeLevel,
      };
      this.setState('connected');
      this.emit({ type: 'info', info: this.info });
      return this.info;
    } catch (err) {
      this.setState('disconnected');
      const message = err instanceof Error ? err.message : 'Could not connect';
      this.emit({ type: 'error', message });
      throw err;
    }
  }

  async disconnect() {
    this.device?.gatt?.disconnect();
    this.service = null;
    this.setState('disconnected');
  }

  async syncOfflineUsage(since: Timestamp) {
    const sync = await this.characteristic(CHARACTERISTICS.usageSync);
    const out: Array<{ timestamp: Timestamp; durationMs: number }> = [];
    let from = since;
    // The device answers in pages of up to 40 records, oldest first.
    for (let page = 0; page < 50; page++) {
      await sync.writeValue(encodeEpochSeconds(from));
      await new Promise((r) => setTimeout(r, 60));
      const records = decodeUsageRecords(await sync.readValue());
      out.push(...records);
      if (records.length < SYNC_PAGE_RECORDS) break;
      from = records[records.length - 1].timestamp + 1000;
    }
    return out;
  }

  async applySettings(settings: DeviceSettings) {
    await (await this.characteristic(CHARACTERISTICS.settings)).writeValue(encodeSettings(settings));
  }

  async rename(name: string) {
    await (await this.characteristic(CHARACTERISTICS.name)).writeValue(encodeName(name));
    if (this.info) {
      this.info = { ...this.info, name };
      this.emit({ type: 'info', info: this.info });
    }
  }

  async find(durationMs = 6000) {
    await (await this.characteristic(CHARACTERISTICS.find)).writeValue(encodeUint16(durationMs));
  }

  async startCartridge(usesPerCartridge: number) {
    await (await this.characteristic(CHARACTERISTICS.cartridge)).writeValue(encodeUint16(usesPerCartridge));
    this.emit({ type: 'cartridge', level: 100 });
  }

  async checkFirmware(): Promise<FirmwareStatus> {
    const current = this.info?.firmwareVersion ?? 'unknown';
    // The latest version would come from the backend's firmware endpoint.
    return { current, latest: LATEST_FIRMWARE, updateAvailable: current !== LATEST_FIRMWARE };
  }

  subscribe(listener: DeviceListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
