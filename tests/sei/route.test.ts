import { describe, expect, test } from 'bun:test';
import { joinRoute, routeBounds, routePoints } from '../../src/sei/route';
import { makeTrack } from '../helpers/track-builder';

describe('routeBounds', () => {
  test('nothing for an empty route', () => {
    expect(routeBounds([])).toBeNull();
  });

  test('south-west and north-east corners', () => {
    expect(
      routeBounds([
        [10, 20],
        [10.2, 19.9],
      ]),
    ).toEqual([
      [10, 19.9],
      [10.2, 20],
    ]);
  });
});

describe('routePoints', () => {
  test('one point per second', () => {
    const tr = makeTrack(108, 36, (i) => ({ lat: 10 + i / 1000, lon: 20 }));
    expect(routePoints(tr)).toEqual([
      [10, 20],
      [10 + 36 / 1000, 20],
      [10 + 72 / 1000, 20],
    ]);
  });

  test('skips frames without data or without a position', () => {
    const tr = makeTrack(108, 36, (i) => (i < 36 ? { has: 0, lat: 1, lon: 1 } : i < 72 ? { lat: 0, lon: 0 } : { lat: 10, lon: 20 }));
    expect(routePoints(tr)).toEqual([[10, 20]]);
  });
});

describe('joinRoute', () => {
  test('joins parts in order, skipping missing ones', () => {
    expect(
      joinRoute([
        [[1, 1]],
        undefined,
        [
          [2, 2],
          [3, 3],
        ],
      ]),
    ).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });
});
