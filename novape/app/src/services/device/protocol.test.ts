import { describe, expect, it } from 'vitest';
import { CHARACTERISTICS, NOVAPE_SERVICE, SYNC_PAGE_RECORDS, USAGE_RECORD_BYTES, decodeUsageRecords, encodeEpochSeconds, encodeUint16 } from './protocol';

/** Builds the bytes the firmware sends: packed { u32 ts; u16 durMs } little-endian. */
function records(list: Array<[number, number]>): DataView {
  const buf = new ArrayBuffer(list.length * USAGE_RECORD_BYTES);
  const view = new DataView(buf);
  list.forEach(([ts, dur], i) => {
    view.setUint32(i * USAGE_RECORD_BYTES, ts, true);
    view.setUint16(i * USAGE_RECORD_BYTES + 4, dur, true);
  });
  return view;
}

describe('NoVape One GATT protocol', () => {
  it('uses the UUIDs the firmware builds from its byte arrays', () => {
    // firmware: NOVAPE_UUID(last) = { last, 00…, 65, 6e, 4f, 65, 70, 61, 76, 6f, 6e } (little-endian)
    expect(NOVAPE_SERVICE).toBe('6e6f7661-7065-4f6e-6500-000000000001');
    expect(CHARACTERISTICS.clock.endsWith('000000000033')).toBe(true);
    expect(new Set(Object.values(CHARACTERISTICS)).size).toBe(Object.values(CHARACTERISTICS).length);
  });

  it('decodes a full sync page of 240 bytes', () => {
    const page = Array.from({ length: SYNC_PAGE_RECORDS }, (_, i) => [1_790_000_000 + i * 60, 1500 + i] as [number, number]);
    const out = decodeUsageRecords(records(page));
    expect(out).toHaveLength(40);
    expect(out[0]).toEqual({ timestamp: 1_790_000_000_000, durationMs: 1500 });
    expect(out[39].durationMs).toBe(1539);
  });

  it('ignores a trailing partial record', () => {
    const view = records([[1_790_000_000, 2000]]);
    const padded = new DataView(new Uint8Array([...new Uint8Array(view.buffer), 1, 2]).buffer);
    expect(decodeUsageRecords(padded)).toHaveLength(1);
  });

  it('encodes the clock and cartridge writes little-endian', () => {
    expect(Array.from(encodeEpochSeconds(1_790_000_000_999))).toEqual([0x80, 0x3b, 0xb1, 0x6a]);
    expect(Array.from(encodeUint16(600))).toEqual([0x58, 0x02]);
    expect(Array.from(encodeUint16(70_000))).toEqual([0xff, 0xff]);
  });
});
