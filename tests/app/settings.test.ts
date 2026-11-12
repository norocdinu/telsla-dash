import { describe, expect, test } from 'bun:test';
import { loadSettings, saveSettings, SETTINGS_KEY } from '../../src/app/settings';
import { DEFAULT_OVERLAYS } from '../../src/export/overlay';

const exportOverlays = DEFAULT_OVERLAYS;

const storage = (value: string | null) => ({ getItem: (k: string) => (k === SETTINGS_KEY ? value : null) });

describe('loadSettings', () => {
  test('US English defaults to mph', () => {
    expect(loadSettings('en-US', null)).toEqual({ units: 'mph', showPanel: true, showMap: true, showStats: false, lastView: 'front', exportOverlays });
  });

  test('other locales default to km/h', () => {
    expect(loadSettings('ro-RO', null).units).toBe('kmh');
  });

  test('a failing storage gives the defaults', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSettings('en-US', broken)).toEqual(loadSettings('en-US', null));
  });

  test('stored values override only what they set', () => {
    expect(loadSettings('en-US', storage('{"units":"kmh"}'))).toEqual({ units: 'kmh', showPanel: true, showMap: true, showStats: false, lastView: 'front', exportOverlays });
  });

  test('stats for nerds is off by default', () => {
    expect(loadSettings('en-US', null).showStats).toBe(false);
  });

  test('a stored showStats is kept', () => {
    expect(loadSettings('en-US', storage('{"showStats":true}')).showStats).toBe(true);
    expect(loadSettings('en-US', storage('{"showStats":"yes"}')).showStats).toBe(false);
  });

  test('bad stored values are ignored', () => {
    expect(loadSettings('en-US', storage('{"units":"furlongs","lastView":"roof"}'))).toEqual(loadSettings('en-US', null));
    expect(loadSettings('en-US', storage('not json'))).toEqual(loadSettings('en-US', null));
  });
});

describe('saveSettings', () => {
  test('never throws', () => {
    const broken = {
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => saveSettings({ units: 'kmh', showPanel: true, showMap: true, showStats: false, lastView: 'grid', exportOverlays }, broken)).not.toThrow();
  });

  test('writes JSON under the settings key', () => {
    const written: Record<string, string> = {};
    saveSettings({ units: 'kmh', showPanel: false, showMap: true, showStats: true, lastView: 'back', exportOverlays }, { setItem: (k, v) => (written[k] = v) });
    expect(JSON.parse(written[SETTINGS_KEY])).toEqual({ units: 'kmh', showPanel: false, showMap: true, showStats: true, lastView: 'back', exportOverlays });
  });
});

describe('export overlays', () => {
  test('default to the driving panel and the date, time and place', () => {
    expect(loadSettings('en-US', null).exportOverlays).toEqual({ panel: true, clock: true, route: false, gforce: false });
  });

  test('stored choices are kept one by one, and bad ones ignored', () => {
    const s = loadSettings('en-US', storage('{"exportOverlays":{"route":true,"panel":false,"gforce":"yes"}}'));
    expect(s.exportOverlays).toEqual({ panel: false, clock: true, route: true, gforce: false });
  });

  test('loading never changes the shared defaults', () => {
    loadSettings('en-US', storage('{"exportOverlays":{"route":true}}'));
    expect(DEFAULT_OVERLAYS.route).toBe(false);
  });
});
