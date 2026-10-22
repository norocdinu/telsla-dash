import { CAMERA_ORDER, type CameraId } from '../library/types';

export interface Settings {
  units: 'kmh' | 'mph';
  showPanel: boolean;
  showMap: boolean;
  lastView: CameraId | 'grid';
}

export const SETTINGS_KEY = 'dashcam-viewer.settings';

function defaults(locale: string): Settings {
  return { units: locale === 'en-US' ? 'mph' : 'kmh', showPanel: true, showMap: true, lastView: 'front' };
}

/** Settings are a convenience: any storage problem just gives the defaults. */
export function loadSettings(locale: string, storage: Pick<Storage, 'getItem'> | null): Settings {
  const s = defaults(locale);
  let raw: unknown;
  try {
    const text = storage?.getItem(SETTINGS_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    return s;
  }
  if (!raw || typeof raw !== 'object') return s;
  const o = raw as Record<string, unknown>;
  if (o.units === 'kmh' || o.units === 'mph') s.units = o.units;
  if (typeof o.showPanel === 'boolean') s.showPanel = o.showPanel;
  if (typeof o.showMap === 'boolean') s.showMap = o.showMap;
  if (o.lastView === 'grid' || CAMERA_ORDER.includes(o.lastView as CameraId)) s.lastView = o.lastView as Settings['lastView'];
  return s;
}

export function saveSettings(s: Settings, storage: Pick<Storage, 'setItem'> | null): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Private windows and blocked storage: settings just won't persist.
  }
}

/** localStorage, or null where the browser won't give it to us. */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
