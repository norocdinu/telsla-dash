import { describe, expect, test } from 'bun:test';
import { dayHeading, formatWall, parseWallStamp } from '../../src/library/time';

describe('parseWallStamp', () => {
  test('reads file-name stamps with seconds', () => {
    expect(parseWallStamp('2026-10-16_20-07-11')).toBe(Date.UTC(2026, 9, 16, 20, 7, 11));
  });

  test('reads old file-name stamps without seconds', () => {
    expect(parseWallStamp('2019-06-08_12-34')).toBe(Date.UTC(2019, 5, 8, 12, 34, 0));
  });

  test('reads event.json timestamps', () => {
    expect(parseWallStamp('2026-10-16T20:10:45')).toBe(Date.UTC(2026, 9, 16, 20, 10, 45));
  });

  test('rejects impossible dates', () => {
    expect(parseWallStamp('2026-13-40_99-00-00')).toBeNull();
    expect(parseWallStamp('2026-02-30_10-00-00')).toBeNull();
    expect(parseWallStamp('nonsense')).toBeNull();
  });
});

describe('formatWall', () => {
  test('full style matches the car', () => {
    expect(formatWall(Date.UTC(2025, 10, 25, 11, 25, 0), 'full')).toBe('Tue Nov 25, 2025 11:25:00');
  });

  test('date style', () => {
    expect(formatWall(Date.UTC(2025, 10, 24, 9, 0, 0), 'date')).toBe('Mon Nov 24, 2025');
  });

  test('clock style pads to two digits', () => {
    expect(formatWall(Date.UTC(2025, 10, 25, 7, 5, 9), 'clock')).toBe('07:05:09');
  });
});

describe('dayHeading', () => {
  const today = Date.UTC(2026, 9, 21, 23, 0, 0);

  test('same day is Today', () => {
    expect(dayHeading(Date.UTC(2026, 9, 21, 0, 10, 0), today)).toBe('Today');
  });

  test('previous day is Yesterday', () => {
    expect(dayHeading(Date.UTC(2026, 9, 20, 23, 59, 0), today)).toBe('Yesterday');
  });

  test('older days show the date', () => {
    expect(dayHeading(Date.UTC(2026, 9, 19, 22, 8, 57), today)).toBe('Mon Oct 19, 2026');
  });
});
