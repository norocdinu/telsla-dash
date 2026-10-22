import { describe, expect, test } from 'bun:test';
import { loadSettings, saveSettings, SETTINGS_KEY } from '../../src/app/settings';

const storage = (value: string | null) => ({ getItem: (k: string) => (k === SETTINGS_KEY ? value : null) });

describe('loadSettings', () => {
  test('US English defaults to mph', () => {
    expect(loadSettings('en-US', null)).toEqual({ units: 'mph', showPanel: true, showMap: true, lastView: 'front' });
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
    expect(loadSettings('en-US', storage('{"units":"kmh"}'))).toEqual({ units: 'kmh', showPanel: true, showMap: true, lastView: 'front' });
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
    expect(() => saveSettings({ units: 'kmh', showPanel: true, showMap: true, lastView: 'grid' }, broken)).not.toThrow();
  });

  test('writes JSON under the settings key', () => {
    const written: Record<string, string> = {};
    saveSettings({ units: 'kmh', showPanel: false, showMap: true, lastView: 'back' }, { setItem: (k, v) => (written[k] = v) });
    expect(JSON.parse(written[SETTINGS_KEY])).toEqual({ units: 'kmh', showPanel: false, showMap: true, lastView: 'back' });
  });
});
