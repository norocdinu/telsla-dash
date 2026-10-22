import { describe, expect, test } from 'bun:test';
import { chartRange } from '../../src/stats/scale';

const KMH = 1 / 3.6; // m/s per km/h
const MPH = 0.44704; // m/s per mph
const G = 9.81;

describe('chartRange', () => {
  test('speed never shows less than 0–30 km/h', () => {
    const r = chartRange('speed', [2, 3], 'kmh');
    expect(r.min).toBe(0);
    expect(r.max).toBeCloseTo(30 * KMH, 6);
  });

  test('speed rounds up to a tidy value in the shown unit', () => {
    expect(chartRange('speed', [87 * KMH], 'kmh').max).toBeCloseTo(100 * KMH, 6);
    expect(chartRange('speed', [43 * MPH], 'mph').max).toBeCloseTo(50 * MPH, 6);
  });

  test('steering is symmetric with at least ±30°', () => {
    expect(chartRange('steering', [-12, 20], 'kmh')).toEqual({ min: -30, max: 30 });
    expect(chartRange('steering', [-140, 3], 'kmh')).toEqual({ min: -200, max: 200 });
  });

  test('g-force is symmetric with at least ±0.3 g', () => {
    const small = chartRange('g', [0.5, -1], 'kmh');
    expect(small.max).toBeCloseTo(0.3 * G, 6);
    expect(small.min).toBeCloseTo(-0.3 * G, 6);
    expect(chartRange('g', [0.36 * G], 'kmh').max).toBeCloseTo(0.5 * G, 6);
  });

  test('pedals are always 0 to 100', () => {
    expect(chartRange('pedals', [3, 250], 'kmh')).toEqual({ min: 0, max: 100 });
  });

  test('ranges ignore gaps', () => {
    expect(chartRange('steering', [NaN, 45], 'kmh')).toEqual(chartRange('steering', [45], 'kmh'));
    expect(chartRange('steering', [NaN, NaN], 'kmh')).toEqual({ min: -30, max: 30 });
  });
});
