import { describe, expect, test } from 'bun:test';
import { tickPercent } from '../../src/ui/format';

describe('tickPercent', () => {
  test('position inside the bounds', () => {
    expect(tickPercent({ startMs: 0, endMs: 1000 }, 250)).toBe(25);
  });

  test('clamps outside the bounds', () => {
    expect(tickPercent({ startMs: 0, endMs: 1000 }, -5)).toBe(0);
    expect(tickPercent({ startMs: 0, endMs: 1000 }, 2000)).toBe(100);
  });

  test('zero-length bounds give 0', () => {
    expect(tickPercent({ startMs: 5, endMs: 5 }, 5)).toBe(0);
  });
});
