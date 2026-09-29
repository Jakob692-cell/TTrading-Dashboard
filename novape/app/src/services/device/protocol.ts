import type { DeviceSettings, HapticStrength } from '../../models';

/**
 * NoVape One GATT profile (draft).
 *
 * UUIDs are placeholders until the firmware team publishes the final profile.
 * All multi-byte values are little-endian.
 */
export const NOVAPE_SERVICE = '6e6f7661-7065-4f6e-6500-000000000001';

export const CHARACTERISTICS = {
  /** notify — one record per draw: u32 epoch seconds, u16 duration ms */
  usage: '6e6f7661-7065-4f6e-6500-000000000010',
  /** read/write — u32 epoch seconds; writing requests all buffered records since then */
  usageSync: '6e6f7661-7065-4f6e-6500-000000000011',
  /** read/notify — u8 remaining cartridge percent; write u16 = a fresh cartridge rated for N standard draws */
  cartridge: '6e6f7661-7065-4f6e-6500-000000000020',
  /** write — u8 haptic level (0–3), u8 light feedback flag */
  settings: '6e6f7661-7065-4f6e-6500-000000000030',
  /** write — UTF-8 name, max 20 bytes */
  name: '6e6f7661-7065-4f6e-6500-000000000031',
  /** write — u16 find duration ms */
  find: '6e6f7661-7065-4f6e-6500-000000000032',
  /** write — u32 current epoch seconds; the device has no clock until the app sets it */
  clock: '6e6f7661-7065-4f6e-6500-000000000033',
} as const;

/** Standard Bluetooth SIG services. */
export const BATTERY_SERVICE = 'battery_service';
export const BATTERY_LEVEL = 'battery_level';
export const DEVICE_INFO_SERVICE = 'device_information';
export const FIRMWARE_REVISION = 'firmware_revision_string';

export const USAGE_RECORD_BYTES = 6;
/** Records per usageSync read; a full page means there may be more. */
export const SYNC_PAGE_RECORDS = 40;

const HAPTIC_LEVELS: HapticStrength[] = ['off', 'light', 'medium', 'strong'];

export function decodeUsageRecord(view: DataView, offset = 0): { timestamp: number; durationMs: number } {
  const seconds = view.getUint32(offset, true);
  const durationMs = view.getUint16(offset + 4, true);
  return { timestamp: seconds * 1000, durationMs };
}

export function decodeUsageRecords(view: DataView): Array<{ timestamp: number; durationMs: number }> {
  const out = [];
  for (let o = 0; o + USAGE_RECORD_BYTES <= view.byteLength; o += USAGE_RECORD_BYTES) {
    out.push(decodeUsageRecord(view, o));
  }
  return out;
}

export function encodeSettings(settings: DeviceSettings): Uint8Array {
  return new Uint8Array([HAPTIC_LEVELS.indexOf(settings.hapticStrength), settings.lightFeedback ? 1 : 0]);
}

export function encodeEpochSeconds(ms: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setUint32(0, Math.floor(ms / 1000), true);
  return new Uint8Array(buf);
}

export function encodeUint16(value: number): Uint8Array {
  const buf = new ArrayBuffer(2);
  new DataView(buf).setUint16(0, Math.max(0, Math.min(0xffff, Math.round(value))), true);
  return new Uint8Array(buf);
}

export function encodeName(name: string): Uint8Array {
  const bytes = new TextEncoder().encode(name.trim());
  return bytes.slice(0, 20);
}
