import { MockDeviceService } from './MockDeviceService';
import { WebBluetoothDeviceService } from './WebBluetoothDeviceService';
import type { DeviceService } from './DeviceService';

export type { DeviceEvent, DeviceInfo, DeviceService, FirmwareStatus } from './DeviceService';
export { MockDeviceService } from './MockDeviceService';

/**
 * The demo always uses the simulated device. Set `VITE_DEVICE=bluetooth` to
 * talk to real hardware over Web Bluetooth where the browser supports it.
 */
function createDeviceService(): DeviceService {
  if (import.meta.env.VITE_DEVICE === 'bluetooth') {
    const ble = new WebBluetoothDeviceService();
    if (ble.isSupported()) return ble;
  }
  return new MockDeviceService();
}

export const deviceService = createDeviceService();
