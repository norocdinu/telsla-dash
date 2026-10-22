import { describe, expect, test } from 'bun:test';
import { frameIndexAt } from '../../src/sei/telemetry';
import { compactSeries } from '../../src/stats/series';
import { makeTrack } from '../helpers/track-builder';

describe('compactSeries', () => {
  test('one sample per step, from the frame on screen at that time', () => {
    const tr = makeTrack(72, 36, (i) => ({ speed: i }));
    const s = compactSeries(tr);
    expect(s.stepS).toBe(0.1);
    expect(s.speed.length).toBe(20);
    expect(s.speed[10]).toBe(frameIndexAt(tr, 1.0));
  });

  test('frames without data become gaps', () => {
    const s = compactSeries(makeTrack(72, 36, (i) => (i < 36 ? { has: 0, brake: true } : {})));
    expect(Number.isNaN(s.speed[5])).toBe(true);
    expect(Number.isNaN(s.side[5])).toBe(true);
    expect(s.brake[5]).toBe(0);
    expect(s.speed[15]).toBe(10);
  });

  test('a brake shorter than a step still shows', () => {
    // Step 3 covers 0.3–0.4 s: frames 11–14 at 36 fps. Only frame 12 brakes.
    const s = compactSeries(makeTrack(72, 36, (i) => ({ brake: i === 12 })));
    expect(s.brake[3]).toBe(1);
    expect(s.brake[2]).toBe(0);
    expect(s.brake[4]).toBe(0);
  });

  test('forward is braking negative', () => {
    const s = compactSeries(makeTrack(36, 36, () => ({ ay: 3, ax: -1.5, pedal: 40, steering: -12 })));
    expect(s.forward[0]).toBe(-3);
    expect(s.side[0]).toBe(-1.5);
    expect(s.pedal[0]).toBe(40);
    expect(s.steering[0]).toBe(-12);
  });
});
