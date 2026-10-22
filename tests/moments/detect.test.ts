import { describe, expect, test } from 'bun:test';
import { detectMoments, eventMoment, mergeMoments, type Moment } from '../../src/moments/detect';
import type { EventInfo } from '../../src/library/types';
import { makeTrack } from '../helpers/track-builder';

const T0 = Date.UTC(2026, 9, 17, 18, 0, 0);
const types = (m: Moment[]) => m.map((x) => x.type);

// Tracks run at 36 fps and, unless set, 10 m/s (36 km/h).
describe('hard braking', () => {
  test('0.3 g held 0.5 s is one hard brake at the run start', () => {
    const tr = makeTrack(144, 36, (i) => (i >= 36 && i <= 53 ? { ay: 3.0 } : {}));
    const m = detectMoments(tr, T0);
    expect(types(m)).toEqual(['brake']);
    expect(m[0].wallMs).toBe(T0 + 1000);
    expect(m[0].label).toBe('Hard braking');
  });

  test('a jolt shorter than 0.5 s is ignored', () => {
    expect(detectMoments(makeTrack(144, 36, (i) => (i >= 36 && i <= 48 ? { ay: 4.0 } : {})), T0)).toEqual([]);
  });

  test('just under 0.3 g is not hard braking', () => {
    expect(detectMoments(makeTrack(144, 36, (i) => (i >= 36 && i < 72 ? { ay: 2.9 } : {})), T0)).toEqual([]);
  });

  test('the last moment of a stop, below 15 km/h, is ignored', () => {
    expect(detectMoments(makeTrack(144, 36, (i) => (i >= 36 && i < 72 ? { ay: 4.0, speed: 4 } : { speed: 4 })), T0)).toEqual([]);
  });

  test('frames without data break a run', () => {
    const tr = makeTrack(144, 36, (i) => (i >= 36 && i <= 59 ? { ay: 3.0, has: i === 48 ? 0 : 1 } : {}));
    expect(detectMoments(tr, T0)).toEqual([]);
  });
});

describe('swerves', () => {
  test('sideways force of 0.4 g above 30 km/h', () => {
    expect(types(detectMoments(makeTrack(144, 36, (i) => (i >= 36 && i < 51 ? { ax: -4.0 } : {})), T0))).toEqual(['swerve']);
  });

  test('just under 0.4 g sideways is not a swerve', () => {
    expect(detectMoments(makeTrack(144, 36, (i) => (i >= 36 && i < 72 ? { ax: 3.8 } : {})), T0)).toEqual([]);
  });

  test('not below 30 km/h', () => {
    expect(detectMoments(makeTrack(144, 36, (i) => (i >= 36 && i < 51 ? { ax: -4.0, speed: 8 } : { speed: 8 })), T0)).toEqual([]);
  });

  test('a fast steer that moves the car sideways', () => {
    const tr = makeTrack(144, 36, (i) => ({
      steering: i < 36 ? 0 : i < 40 ? (i - 35) * 7.5 : 30,
      ax: i >= 40 && i < 60 ? 2.5 : 0,
    }));
    expect(types(detectMoments(tr, T0))).toEqual(['swerve']);
  });

  test('a fast steering flick without sideways force is not a swerve', () => {
    const tr = makeTrack(144, 36, (i) => ({ steering: i < 36 ? 0 : i < 40 ? (i - 35) * 7.5 : 30 }));
    expect(detectMoments(tr, T0)).toEqual([]);
  });
});

describe('self-driving off', () => {
  test('SELF_DRIVING to NONE while moving', () => {
    const m = detectMoments(makeTrack(72, 36, (i) => ({ autopilot: i < 36 ? 1 : 0 })), T0);
    expect(types(m)).toEqual(['ap_off']);
    expect(m[0].label).toBe('Self-driving off');
  });

  test('not when nearly stopped', () => {
    expect(detectMoments(makeTrack(72, 36, (i) => ({ autopilot: i < 36 ? 2 : 0, speed: 0.5 })), T0)).toEqual([]);
  });

  test('not for traffic-aware cruise', () => {
    expect(detectMoments(makeTrack(72, 36, (i) => ({ autopilot: i < 36 ? 3 : 0 })), T0)).toEqual([]);
  });
});

describe('mergeMoments', () => {
  test('same type within 3 s merges, keeping the first', () => {
    const b = (s: number): Moment => ({ type: 'brake', wallMs: T0 + s * 1000, label: 'Hard braking' });
    expect(mergeMoments([b(2), b(0)]).map((m) => m.wallMs)).toEqual([T0]);
    expect(mergeMoments([b(0), b(4)])).toHaveLength(2);
  });
});

describe('eventMoment', () => {
  const ev = (wallMs: number | null): EventInfo => ({
    wallMs,
    city: null,
    street: null,
    lat: null,
    lon: null,
    reason: 'user_interaction_honk',
    category: 'honk',
    label: 'Honk',
  });

  test('marks the trigger', () => {
    expect(eventMoment(ev(5000))).toEqual({ type: 'event', wallMs: 5000, label: 'Honk' });
  });

  test('nothing without a timestamp', () => {
    expect(eventMoment(ev(null))).toBeNull();
    expect(eventMoment(null)).toBeNull();
  });
});
