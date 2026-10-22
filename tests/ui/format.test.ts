import { describe, expect, test } from 'bun:test';
import { autopilotLabel, formatDuration, gearLetter, gearTone, speedValue, unitLabel } from '../../src/ui/format';

describe('speed', () => {
  test('converts metres per second to the chosen unit, rounded', () => {
    expect(speedValue(15.778, 'kmh')).toBe(57);
    expect(speedValue(15.778, 'mph')).toBe(35);
  });

  test('unit labels', () => {
    expect(unitLabel('kmh')).toBe('km/h');
    expect(unitLabel('mph')).toBe('MPH');
  });
});

describe('gear', () => {
  test('letters for P, D, R, N', () => {
    expect([0, 1, 2, 3].map(gearLetter)).toEqual(['P', 'D', 'R', 'N']);
  });

  test('D and R are blue, P and N grey', () => {
    expect([0, 1, 2, 3].map(gearTone)).toEqual(['grey', 'blue', 'blue', 'grey']);
  });
});

describe('autopilotLabel', () => {
  test('names each engaged state, nothing when off', () => {
    expect([0, 1, 2, 3].map(autopilotLabel)).toEqual([null, 'Self Driving', 'Autosteer', 'Traffic-Aware Cruise']);
  });
});

describe('formatDuration', () => {
  test('minutes and seconds under an hour', () => {
    expect(formatDuration(0.44)).toBe('0:00');
    expect(formatDuration(663)).toBe('11:03');
  });

  test('hours when needed', () => {
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});
