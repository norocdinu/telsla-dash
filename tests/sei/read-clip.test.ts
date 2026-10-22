import { describe, expect, test } from 'bun:test';
import { READ_SLICE_BYTES, readClipTelemetry, readInSlices } from '../../src/sei/read-clip';
import { extractTelemetry } from '../../src/sei/telemetry';
import { avcc, buildMp4 } from '../helpers/mp4-builder';
import { picture, seiNal } from '../helpers/sei-builder';

/** A Blob stand-in that records every read it is asked for. */
function recordingBlob(bytes: Uint8Array) {
  const reads: number[] = [];
  let active = 0;
  let most = 0;
  const blob = {
    size: bytes.length,
    slice(start: number, end: number) {
      return {
        async arrayBuffer() {
          active++;
          most = Math.max(most, active);
          reads.push(end - start);
          await new Promise((r) => setTimeout(r, 0));
          active--;
          return bytes.slice(start, Math.min(end, bytes.length)).buffer;
        },
      };
    },
  };
  return { blob, reads, most: () => most };
}

describe('readInSlices', () => {
  test('returns every byte, reading small slices one at a time', async () => {
    const bytes = new Uint8Array(READ_SLICE_BYTES * 3 + 1234).map((_, i) => i % 251);
    const r = recordingBlob(bytes);
    const out = await readInSlices(r.blob);
    expect(out).toEqual(bytes);
    expect(Math.max(...r.reads)).toBeLessThanOrEqual(READ_SLICE_BYTES);
    expect(r.reads).toHaveLength(4);
    expect(r.most()).toBe(1);
  });
});

describe('readClipTelemetry', () => {
  test('reads a clip in slices and decodes the same driving data', async () => {
    const f = { vehicleSpeedMps: 12, gearState: 1 };
    const filler = new Uint8Array(200_000).fill(0x41);
    const bytes = buildMp4({
      samples: [avcc(seiNal(f), picture(5), filler), avcc(seiNal(f), picture(1), filler), avcc(seiNal(f), picture(1), filler)],
      durations: [277, 277, 277],
    });
    const r = recordingBlob(bytes);
    const track = await readClipTelemetry(r.blob);
    expect(Math.max(...r.reads)).toBeLessThanOrEqual(READ_SLICE_BYTES);
    expect([...track.has]).toEqual([...extractTelemetry(bytes).has]);
    expect(track.speed[2]).toBeCloseTo(12);
  });
});
