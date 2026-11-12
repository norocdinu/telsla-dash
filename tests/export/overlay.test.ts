import { describe, expect, test } from 'bun:test';
import { gforceText, projectRoute } from '../../src/export/overlay';

describe('gforceText', () => {
  test('positive Y is braking', () => {
    expect(gforceText({ ay: 3.139, ax: -0.49 })).toBe('Braking 0.32 g · Sideways 0.05 g');
  });
  test('negative Y is accelerating', () => {
    expect(gforceText({ ay: -1.962, ax: 0 })).toBe('Accelerating 0.20 g · Sideways 0.00 g');
  });
  test('near zero is steady', () => {
    expect(gforceText({ ay: 0.01, ax: 0 })).toBe('Steady 0.00 g · Sideways 0.00 g');
  });
});

describe('projectRoute', () => {
  const box = { x: 0, y: 0, w: 100, h: 100 };
  test('north is up and the route fits the box', () => {
    const pts = projectRoute(
      [
        [45, 26],
        [45.01, 26],
      ],
      box,
    );
    expect(pts[1][1]).toBeLessThan(pts[0][1]);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(100);
    }
  });
  test('keeps true distances: equal metres east and north look equal', () => {
    const k = Math.cos((60 * Math.PI) / 180);
    const pts = projectRoute(
      [
        [60, 10],
        [60, 10 + 0.01 / k],
        [60.01, 10 + 0.01 / k],
      ],
      box,
    );
    expect(Math.abs(pts[1][0] - pts[0][0])).toBeCloseTo(Math.abs(pts[2][1] - pts[1][1]), 0);
  });
  test('a single point sits in the middle', () => {
    expect(projectRoute([[1, 1]], box)).toEqual([[50, 50]]);
  });
});
