import { describe, expect, test } from 'bun:test';
import type { Span } from '../../src/player/timeline-math';
import { columns, valueAt, valuesIn } from '../../src/stats/points';
import type { ChartMinute } from '../../src/stats/series';

/** A one-minute series (600 samples at 0.1 s) whose speed is `at(k)`. */
function minute(at: (k: number) => number, n = 600): ChartMinute {
  const f = (g: (k: number) => number) => Float32Array.from({ length: n }, (_, k) => g(k));
  return {
    stepS: 0.1,
    speed: f(at),
    pedal: f(() => 0),
    brake: new Uint8Array(n),
    steering: f(() => 0),
    side: f(() => 0),
    forward: f(() => 0),
  };
}

const spans = (count: number): Span[] => Array.from({ length: count }, (_, i) => ({ index: i, startMs: i * 60_000, durationS: 60 }));

describe('columns', () => {
  test('a minute not read yet leaves its columns empty', () => {
    const cols = columns([minute(() => 5), undefined], spans(2), { fromMs: 0, toMs: 120_000 }, 'speed', 10);
    expect(cols.slice(0, 5).every((c) => c?.min === 5 && c.max === 5)).toBe(true);
    expect(cols.slice(5)).toEqual([null, null, null, null, null]);
  });

  test('a one-sample spike survives squeezing an hour into 300 columns', () => {
    const minutes = Array.from({ length: 60 }, (_, i) => minute((k) => (i === 37 && k === 123 ? 40 : 10)));
    const cols = columns(minutes, spans(60), { fromMs: 0, toMs: 3_600_000 }, 'speed', 300);
    expect(Math.max(...cols.map((c) => c?.max ?? 0))).toBe(40);
    expect(Math.min(...cols.map((c) => c?.min ?? 99))).toBe(10);
  });

  test('the window picks samples from the right minute', () => {
    // Minute 0 counts 0..599, minute 1 counts 1000..1599: 50–70 s is minute 0's last 100 samples and minute 1's first 100.
    const cols = columns([minute((k) => k), minute((k) => 1000 + k)], spans(2), { fromMs: 50_000, toMs: 70_000 }, 'speed', 2);
    expect(cols[0]).toEqual({ min: 500, max: 599 });
    expect(cols[1]).toEqual({ min: 1000, max: 1099 });
  });

  test('zoomed in past one sample per column, each column still has the value on screen', () => {
    const cols = columns([minute((k) => k)], spans(1), { fromMs: 1_000, toMs: 2_000 }, 'speed', 40);
    expect(cols.every((c) => c !== null)).toBe(true);
    expect(cols[0]).toEqual({ min: 10, max: 10 });
    expect(cols[39]).toEqual({ min: 19, max: 19 });
  });

  test('gaps in a minute stay gaps', () => {
    const cols = columns([minute((k) => (k < 300 ? NaN : 7))], spans(1), { fromMs: 0, toMs: 60_000 }, 'speed', 4);
    expect(cols).toEqual([null, null, { min: 7, max: 7 }, { min: 7, max: 7 }]);
  });
});

describe('valueAt', () => {
  test('finds the sample, or null in a gap or an unread minute', () => {
    const minutes = [minute((k) => (k === 50 ? NaN : k)), undefined];
    expect(valueAt(minutes, spans(2), 12_340, 'speed')).toBe(123);
    expect(valueAt(minutes, spans(2), 5_050, 'speed')).toBeNull();
    expect(valueAt(minutes, spans(2), 70_000, 'speed')).toBeNull();
    expect(valueAt(minutes, spans(2), 500_000, 'speed')).toBeNull();
  });
});

describe('valuesIn', () => {
  test('yields only samples inside the window', () => {
    expect([...valuesIn([minute((k) => k)], spans(1), { fromMs: 2_000, toMs: 2_500 }, 'speed')]).toEqual([20, 21, 22, 23, 24]);
  });
});
