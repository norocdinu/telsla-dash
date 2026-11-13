import { describe, expect, test } from 'bun:test';
import { dragIn, dragOut, exportFileName, initialRange, markIn, markOut, rangeIssue, spansInRange } from '../../src/export/range';

const b = { startMs: 0, endMs: 600_000 };

describe('initialRange', () => {
  test('10 s either side of the playhead', () => {
    expect(initialRange(b, 100_000)).toEqual({ inMs: 90_000, outMs: 110_000 });
  });
  test('kept inside the clip at either end', () => {
    expect(initialRange(b, 3_000)).toEqual({ inMs: 0, outMs: 20_000 });
    expect(initialRange(b, 599_000)).toEqual({ inMs: 580_000, outMs: 600_000 });
  });
  test('a clip shorter than 20 s is taken whole', () => {
    expect(initialRange({ startMs: 0, endMs: 8_000 }, 4_000)).toEqual({ inMs: 0, outMs: 8_000 });
  });
});

describe('dragging handles', () => {
  const r = { inMs: 100_000, outMs: 120_000 };
  test('In stops 1 s before Out, and 3 minutes before it', () => {
    expect(dragIn(r, 130_000, b).inMs).toBe(119_000);
    expect(dragIn({ inMs: 200_000, outMs: 300_000 }, 0, b).inMs).toBe(120_000);
  });
  test('Out stops 1 s after In, 3 minutes after it, and at the end', () => {
    expect(dragOut(r, 50_000, b).outMs).toBe(101_000);
    expect(dragOut(r, 500_000, b).outMs).toBe(280_000);
    expect(dragOut({ inMs: 590_000, outMs: 595_000 }, 700_000, b).outMs).toBe(600_000);
  });
  test('In never goes before the start', () => {
    expect(dragIn(r, -5_000, b).inMs).toBe(0);
  });
});

describe('I and O', () => {
  test('In past Out pushes Out along', () => {
    expect(markIn({ inMs: 0, outMs: 10_000 }, 50_000, b)).toEqual({ inMs: 50_000, outMs: 51_000 });
  });
  test('In far before Out pulls Out to 3 minutes', () => {
    expect(markIn({ inMs: 400_000, outMs: 500_000 }, 0, b)).toEqual({ inMs: 0, outMs: 180_000 });
  });
  test('Out before In pushes In back', () => {
    expect(markOut({ inMs: 50_000, outMs: 60_000 }, 20_000, b)).toEqual({ inMs: 19_000, outMs: 20_000 });
  });
  test('Out far after In pulls In up', () => {
    expect(markOut({ inMs: 0, outMs: 10_000 }, 400_000, b)).toEqual({ inMs: 220_000, outMs: 400_000 });
  });
});

test('rangeIssue', () => {
  expect(rangeIssue({ inMs: 0, outMs: 500 })).toBe('short');
  expect(rangeIssue({ inMs: 0, outMs: 181_000 })).toBe('long');
  expect(rangeIssue({ inMs: 0, outMs: 20_000 })).toBeNull();
});

test('spansInRange: the minutes a range touches', () => {
  const spans = [0, 1, 2, 3].map((i) => ({ index: i, startMs: i * 60_000, durationS: 60 }));
  expect(spansInRange(spans, { inMs: 50_000, outMs: 70_000 })).toEqual([0, 1]);
  expect(spansInRange(spans, { inMs: 60_000, outMs: 120_000 })).toEqual([1]);
});

test('exportFileName uses the In time as recorded', () => {
  expect(exportFileName(Date.UTC(2025, 10, 25, 11, 25, 3))).toBe('dashcam-2025-11-25_11-25-03.mp4');
});
