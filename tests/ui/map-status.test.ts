import { describe, expect, test } from 'bun:test';
import { mapOffline } from '../../src/ui/player/map-status';

describe('mapOffline', () => {
  test('offline when the browser is offline', () => {
    expect(mapOffline({ online: false, tilesLoaded: 12, tileErrors: 0 })).toBe(true);
  });

  test('offline when tiles fail and none loaded', () => {
    expect(mapOffline({ online: true, tilesLoaded: 0, tileErrors: 3 })).toBe(true);
  });

  test('online again once a tile loads', () => {
    expect(mapOffline({ online: true, tilesLoaded: 1, tileErrors: 3 })).toBe(false);
    expect(mapOffline({ online: true, tilesLoaded: 0, tileErrors: 0 })).toBe(false);
  });
});
