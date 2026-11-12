import { describe, expect, test } from 'bun:test';
import { frameTimes, keyframeBefore, parseMp4, presentationTimes, readIndex } from '../../src/mp4/read-mp4';
import { decodeTimes, writeMp4, type Mp4Sample } from '../../src/mp4/write-mp4';

const avcC = new Uint8Array([1, 0x64, 0x00, 0x33, 0xff, 0xe1, 0, 4, 0x67, 1, 2, 3, 1, 0, 2, 0x68, 4]);

function samples(n: number, every = 3, frame = 3000): Mp4Sample[] {
  return Array.from({ length: n }, (_, i) => ({
    data: new Uint8Array(10 + i).fill(i),
    pts: i * frame,
    duration: frame,
    key: i % every === 0,
  }));
}

describe('writeMp4', () => {
  const s = samples(7);
  const buf = writeMp4({ width: 1920, height: 1244, timescale: 90000, avcC, samples: s });
  const info = parseMp4(buf);

  test('reads back with our own reader: codec, size, timing and sample bytes', () => {
    expect(info.codec).toBe('avc1');
    expect([info.width, info.height]).toEqual([1920, 1244]);
    expect(info.timescale).toBe(90000);
    expect([...info.durations]).toEqual(s.map((x) => x.duration));
    expect(info.durationS).toBeCloseTo((7 * 3000) / 90000, 6);
    s.forEach((x, i) => expect([...buf.subarray(info.offsets[i], info.offsets[i] + info.sizes[i])]).toEqual([...x.data]));
  });

  test('keeps the decoder configuration and the keyframe list', () => {
    expect([...info.avcC!]).toEqual([...avcC]);
    expect([...info.sync!]).toEqual([0, 3, 6]);
    expect(keyframeBefore(info, 5)).toBe(3);
    expect(keyframeBefore(info, 2)).toBe(0);
  });

  test('puts the index before the frames, so it plays while still downloading', () => {
    const types: string[] = [];
    for (let o = 0; o < buf.length; ) {
      const size = new DataView(buf.buffer).getUint32(o);
      types.push(String.fromCharCode(...buf.subarray(o + 4, o + 8)));
      o += size;
    }
    expect(types).toEqual(['ftyp', 'moov', 'mdat']);
  });

  test('has no ctts or stss when nothing needs them', () => {
    const out = parseMp4(writeMp4({ width: 2, height: 2, timescale: 90000, avcC, samples: samples(3, 1) }));
    expect(out.sync).toBeNull();
    expect(out.cts).toBeNull();
    expect(out.reordered).toBe(false);
  });

  test('writes composition offsets for reordered frames, and they read back to the same display times', () => {
    // Decoded I P B B, shown I B B P.
    const pts = [0, 9000, 3000, 6000];
    const re = pts.map((p, i) => ({ data: new Uint8Array([i]), pts: p, duration: 3000, key: i === 0 }));
    const out = parseMp4(writeMp4({ width: 2, height: 2, timescale: 90000, avcC, samples: re }));
    expect(out.reordered).toBe(true);
    expect([...presentationTimes(out)].map((t) => Math.round(t * 90000))).toEqual(pts);
    expect([...frameTimes(out)].map((t) => Math.round(t * 90000) + 0)).toEqual([0, 3000, 6000, 9000]);
  });

  test('readIndex finds the moov with small reads', async () => {
    const idx = await readIndex(async (o, n) => buf.slice(o, o + n), buf.length);
    expect(idx?.sizes.length).toBe(7);
    expect([...idx!.avcC!]).toEqual([...avcC]);
  });

  test('readIndex gives null for a cut-off file', async () => {
    const cut = buf.slice(0, 40);
    expect(await readIndex(async (o, n) => cut.slice(o, o + n), cut.length)).toBeNull();
  });
});

describe('decodeTimes', () => {
  test('decode times are the display times in order; offsets map back', () => {
    const { dts, cts } = decodeTimes([{ pts: 0 }, { pts: 30 }, { pts: 10 }, { pts: 20 }]);
    expect(dts).toEqual([0, 10, 20, 30]);
    expect(cts).toEqual([0, 20, -10, -10]);
  });
});
