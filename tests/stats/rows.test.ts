import { describe, expect, test } from 'bun:test';
import type { FrameTelemetry } from '../../src/sei/telemetry';
import { compass, gText, statsRows, type RowContext } from '../../src/stats/rows';
import { speedValue } from '../../src/ui/format';

const frame = (patch: Partial<FrameTelemetry> = {}): FrameTelemetry => ({
  speedMps: 15,
  pedal: 23.46,
  steeringDeg: -4.53,
  gear: 1,
  autopilot: 0,
  blinkLeft: true,
  blinkRight: false,
  brake: false,
  lat: 12.345678,
  lon: -98.765432,
  heading: 212.4,
  ax: 0.5,
  ay: -2.06,
  az: 9.81,
  seq: 4242,
  version: 1,
  ...patch,
});

const ctx: RowContext = {
  minute: 4,
  minutes: 11,
  clipS: 185.4,
  file: { name: '2026-01-02_03-04-05-front.mp4', frames: 2160, durationS: 60, codec: 'avc1', width: 2896, height: 1876 },
};

/** The value of a row by label. */
function value(groups: ReturnType<typeof statsRows>, label: string): string {
  for (const g of groups) for (const [l, v] of g.rows) if (l === label) return v;
  throw new Error(`no row ${label}`);
}

describe('statsRows', () => {
  test('speed shows one decimal and rounds to what the driving panel shows', () => {
    for (const units of ['kmh', 'mph'] as const) {
      for (let mps = 0; mps < 60; mps += 0.07) {
        const shown = value(statsRows(frame({ speedMps: mps }), ctx, units), 'Speed');
        expect(shown).toMatch(/^\d+\.\d (km\/h|MPH)$/);
        expect(Math.round(parseFloat(shown))).toBe(speedValue(mps, units));
      }
    }
  });

  test('accelerator and steering show one decimal', () => {
    const rows = statsRows(frame(), ctx, 'kmh');
    expect(value(rows, 'Accelerator')).toBe('23.4 %');
    expect(value(rows, 'Steering')).toBe('-4.5°');
  });

  test('the four groups, in order', () => {
    expect(statsRows(frame(), ctx, 'kmh').map((g) => g.title)).toEqual(['Car', 'Motion', 'Position', 'Frame']);
  });

  test('autopilot names include Off', () => {
    expect(value(statsRows(frame({ autopilot: 0 }), ctx, 'kmh'), 'Autopilot')).toBe('Off');
    expect(value(statsRows(frame({ autopilot: 2 }), ctx, 'kmh'), 'Autopilot')).toBe('Autosteer');
  });

  test('car frame number, version and file details', () => {
    const rows = statsRows(frame(), ctx, 'kmh');
    expect(value(rows, 'Frame #')).toBe('4242');
    expect(value(rows, 'Data version')).toBe('1');
    expect(value(rows, 'Minute')).toBe('4 of 11');
    expect(value(rows, 'Size')).toBe('2896 × 1876');
    expect(value(rows, 'Codec')).toBe('avc1');
  });

  test('a frame without data shows dashes, file details stay', () => {
    const groups = statsRows(null, ctx, 'kmh');
    for (const g of groups.filter((x) => x.title !== 'Frame')) for (const [, v] of g.rows) expect(v).toBe('—');
    expect(value(groups, 'File')).toBe('2026-01-02_03-04-05-front.mp4');
    expect(value(groups, 'Minute')).toBe('4 of 11');
    expect(value(groups, 'Frame #')).toBe('—');
  });

  test('frame rate is frames over length', () => {
    expect(value(statsRows(frame(), ctx, 'kmh'), 'Frame rate')).toBe('36.0 fps');
    expect(value(statsRows(frame(), { ...ctx, file: null }, 'kmh'), 'Frame rate')).toBe('—');
  });
});

describe('formatting', () => {
  test('g-force shows g and m/s²', () => {
    expect(gText(2.06)).toBe('0.21 g · 2.06 m/s²');
    expect(gText(-9.81)).toBe('-1.00 g · -9.81 m/s²');
  });

  test('compass letters', () => {
    expect(compass(0)).toBe('0° N');
    expect(compass(44)).toBe('44° NE');
    expect(compass(212.4)).toBe('212° SW');
    expect(compass(359)).toBe('359° N');
  });
});
