import { describe, expect, test } from 'bun:test';
import type { Segment } from '../../src/library/types';
import { bounds, buildSpans, locate, skipFrom, wallAt } from '../../src/player/timeline-math';

const T = Date.UTC(2026, 9, 17, 18, 0, 0);
const seg = (key: string, offsetS: number): Segment => ({ key, wallMs: T + offsetS * 1000, files: {} });
const segments = [seg('a', 0), seg('b', 61), seg('c', 122)];
const spans = buildSpans(segments, { a: 60.38, b: 60.4, c: 0.44 });

describe('buildSpans and bounds', () => {
  test('the end is the last start plus its duration', () => {
    expect(bounds(spans)).toEqual({ startMs: T, endMs: T + 122_440 });
  });

  test('unknown durations use the gap to the next start, capped at 60 s', () => {
    const s = buildSpans([seg('a', 0), seg('b', 56), seg('c', 200)], {});
    expect(s.map((x) => x.durationS)).toEqual([56, 60, 60]);
  });
});

describe('locate', () => {
  test('inside a segment', () => {
    expect(locate(spans, T + 30_000)).toEqual({ index: 0, offsetS: 30 });
  });

  test('in a gap goes to the next segment start', () => {
    expect(locate(spans, T + 60_700)).toEqual({ index: 1, offsetS: 0 });
  });

  test('before the start clamps to the start', () => {
    expect(locate(spans, T - 5_000)).toEqual({ index: 0, offsetS: 0 });
  });

  test('past the end clamps to the end', () => {
    expect(locate(spans, T + 999_000)).toEqual({ index: 2, offsetS: 0.44 });
  });

  test('inside a tiny last segment', () => {
    const p = locate(spans, T + 122_200);
    expect(p.index).toBe(2);
    expect(p.offsetS).toBeCloseTo(0.2, 6);
  });
});

describe('wallAt and skipFrom', () => {
  test('wallAt is the inverse of locate', () => {
    expect(wallAt(spans, 1, 4)).toBe(T + 65_000);
  });

  test('skipping crosses segment boundaries', () => {
    expect(skipFrom(spans, T + 50_000, 15)).toEqual({ index: 1, offsetS: 4 });
  });
});
