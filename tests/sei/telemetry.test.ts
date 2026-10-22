import { describe, expect, test } from 'bun:test';
import { extractTelemetry, frameIndexAt, telemetryAt } from '../../src/sei/telemetry';
import { avcc, buildMp4 } from '../helpers/mp4-builder';
import { picture, seiNal } from '../helpers/sei-builder';

const f = { vehicleSpeedMps: 15.5, gearState: 1, autopilotState: 2, blinkerOnRight: true, brakeApplied: true, latitudeDeg: 10.5 };

function track(codec: 'avc1' | 'hvc1' = 'avc1') {
  return extractTelemetry(
    buildMp4({
      samples: [
        avcc(seiNal(f), picture(5)),
        avcc(seiNal(f), picture(1)),
        avcc(picture(1)),
        avcc(seiNal(f), picture(1)),
      ],
      durations: [277, 277, 277, 277],
      codec,
    }),
  );
}

describe('extractTelemetry', () => {
  test('marks which frames carry driving data', () => {
    const tr = track();
    expect([...tr.has]).toEqual([1, 1, 0, 1]);
    expect(tr.codec).toBe('avc1');
    expect(tr.durationS).toBeCloseTo(0.1108, 4);
  });

  test('frame times come from the sample durations', () => {
    expect(track().t[3]).toBeCloseTo(0.0831, 4);
  });

  test('decodes values and packs flags', () => {
    const tr = track();
    expect(tr.speed[0]).toBeCloseTo(15.5);
    expect(tr.lat[0]).toBeCloseTo(10.5);
    expect(tr.flags[0]).toBe(0b110);
  });

  test('tracks of other codecs have no driving data', () => {
    expect([...track('hvc1').has]).toEqual([0, 0, 0, 0]);
  });
});

describe('frameIndexAt', () => {
  test('finds the frame on screen at a time', () => {
    const tr = track();
    expect(frameIndexAt(tr, -1)).toBe(-1);
    expect(frameIndexAt(tr, 0)).toBe(0);
    expect(frameIndexAt(tr, 0.03)).toBe(1);
    expect(frameIndexAt(tr, 10)).toBe(3);
  });
});

describe('telemetryAt', () => {
  test('is null on a frame without data', () => {
    expect(telemetryAt(track(), 0.06)).toBeNull();
  });

  test('returns the frame values', () => {
    expect(telemetryAt(track(), 0)).toMatchObject({ gear: 1, autopilot: 2, blinkRight: true, blinkLeft: false, brake: true });
  });
});
