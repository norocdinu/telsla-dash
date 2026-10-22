import { describe, expect, test } from 'bun:test';
import { classifyHead, frameTimes, HEAD_BYTES, inspectFile, Mp4Error, parseMp4 } from '../../src/mp4/read-mp4';
import { avcc, buildMp4, randomBytes } from '../helpers/mp4-builder';

const samples = [avcc(new Uint8Array([0x65, 1, 2])), avcc(new Uint8Array([0x41, 3])), avcc(new Uint8Array([0x41, 4, 5, 6]))];

describe('parseMp4', () => {
  test('reads codec, timescale, durations, sizes and offsets', () => {
    const info = parseMp4(buildMp4({ samples, durations: [270, 263, 278] }));
    expect(info.codec).toBe('avc1');
    expect(info.timescale).toBe(10000);
    expect([...info.durations]).toEqual([270, 263, 278]);
    expect([...info.sizes]).toEqual(samples.map((s) => s.length));
    expect(info.offsets[1] - info.offsets[0]).toBe(samples[0].length);
    expect(info.durationS).toBeCloseTo(0.0811, 4);
    expect(info.reordered).toBe(false);
  });

  test('sample offsets point at the sample bytes', () => {
    const buf = buildMp4({ samples, durations: [1, 1, 1] });
    const info = parseMp4(buf);
    samples.forEach((s, i) => expect([...buf.subarray(info.offsets[i], info.offsets[i] + s.length)]).toEqual([...s]));
  });

  test('handles several chunks', () => {
    const five = [1, 2, 3, 4, 5].map((n) => avcc(new Uint8Array(n).fill(0x41)));
    const buf = buildMp4({ samples: five, durations: [1, 1, 1, 1, 1], samplesPerChunk: 2 });
    const info = parseMp4(buf);
    for (let i = 1; i < 5; i++) expect(info.offsets[i] - info.offsets[i - 1]).toBe(five[i - 1].length);
  });

  test('reports other codecs', () => {
    expect(parseMp4(buildMp4({ samples, durations: [1, 1, 1], codec: 'hvc1' })).codec).toBe('hvc1');
  });

  test('handles a 64-bit mdat size', () => {
    const info = parseMp4(buildMp4({ samples, durations: [270, 263, 278], largeMdat: true }));
    expect([...info.sizes]).toEqual(samples.map((s) => s.length));
  });

  test('a missing moov is an error', () => {
    const cut = buildMp4({ samples, durations: [1, 1, 1] }).slice(0, -50);
    expect(() => parseMp4(cut)).toThrow(Mp4Error);
    try {
      parseMp4(cut);
    } catch (e) {
      expect((e as Mp4Error).kind).toBe('no-moov');
    }
  });

  test('bytes that are not an MP4 are an error', () => {
    try {
      parseMp4(randomBytes(4096));
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Mp4Error).kind).toBe('not-mp4');
    }
  });
});

describe('frameTimes', () => {
  test('are cumulative durations in seconds', () => {
    const info = parseMp4(buildMp4({ samples, durations: [270, 263, 278] }));
    expect([...frameTimes(info)].map((t) => +t.toFixed(4))).toEqual([0, 0.027, 0.0533]);
  });

  test('subtract the edit-list media time', () => {
    const info = parseMp4(buildMp4({ samples, durations: [270, 263, 278], mediaTime: 270 }));
    expect(frameTimes(info)[0]).toBeCloseTo(-0.027, 4);
  });
});

describe('inspectFile', () => {
  const reader = (buf: Uint8Array) => async (offset: number, length: number) => buf.slice(offset, offset + length);
  // Over 1 KB, so the head isn't judged too small to be a clip.
  const big = [1, 2, 3].map(() => avcc(new Uint8Array(600).fill(0x41)));

  test('a whole MP4 is complete, with its codec', async () => {
    const buf = buildMp4({ samples: big, durations: [270, 263, 278], codec: 'hvc1' });
    expect(await inspectFile(reader(buf), buf.length)).toEqual({ health: 'mp4', complete: true, codec: 'hvc1', durationS: 0.0811 });
  });

  test('a cut-off MP4 is incomplete', async () => {
    const buf = buildMp4({ samples: big, durations: [1, 1, 1] }).slice(0, -50);
    expect(await inspectFile(reader(buf), buf.length)).toEqual({ health: 'mp4', complete: false, codec: null, durationS: null });
  });

  test('non-MP4 bytes keep their head classification', async () => {
    const buf = randomBytes(HEAD_BYTES);
    expect(await inspectFile(reader(buf), 2_000_000)).toEqual({ health: 'encrypted', complete: false, codec: null, durationS: null });
  });
});

describe('classifyHead', () => {
  test('an MP4 header is mp4', () => {
    const head = buildMp4({ samples, durations: [1, 1, 1] }).slice(0, HEAD_BYTES);
    expect(classifyHead(head, 2_000_000)).toBe('mp4');
  });

  test('empty or tiny files are damaged', () => {
    expect(classifyHead(new Uint8Array(0), 0)).toBe('damaged');
    expect(classifyHead(randomBytes(500), 500)).toBe('damaged');
  });

  test('a zero-filled file is damaged, not encrypted', () => {
    expect(classifyHead(new Uint8Array(HEAD_BYTES), 2_000_000)).toBe('damaged');
  });

  test('a large file without an MP4 header is encrypted', () => {
    expect(classifyHead(randomBytes(HEAD_BYTES), 2_000_000)).toBe('encrypted');
  });
});
