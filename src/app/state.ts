import type { CameraId, Library, ReasonCategory, Timeline } from '../library/types';
import type { Moment } from '../moments/detect';
import type { SlotStatus } from '../player/engine';
import type { LatLon } from '../sei/route';
import { TelemetryCache } from '../sei/telemetry-cache';
import type { ChartMinute } from '../stats/series';
import { loadTelemetryInWorker } from '../sei/telemetry-client';
import type { FrameTelemetry } from '../sei/telemetry';
import type { ListTab } from '../ui/list/list-model';
import type { Blocked, Health } from './open-rule';
import { browserStorage, loadSettings, saveSettings, type Settings } from './settings';
import { createStore } from './store';

export interface AppState {
  library: Library | null;
  loading: boolean;
  blocked: Blocked | null;
  notice: string | null;
  timelineId: string | null;
  listOpen: boolean;
  /** The clip list's tab and reason filter; kept while the list is closed, and used by Up next. */
  listTab: ListTab;
  listChip: ReasonCategory | null;
  /** The Manage events screen (occasional clear-outs). */
  manageOpen: boolean;
  mapOpen: boolean;
  mapLarge: boolean;
  view: { main: CameraId; grid: boolean };
  /** Per timeline id. */
  health: Record<string, Health>;
  moments: Record<string, Moment[]>;
  /** Per timeline id, per segment index. */
  route: Record<string, (LatLon[] | undefined)[]>;
  /** Stats for nerds chart series, per timeline id, per segment index. */
  charts: Record<string, (ChartMinute | undefined)[]>;
  /** Per segment key, in seconds. */
  durations: Record<string, number>;
  slots: Partial<Record<CameraId, SlotStatus>>;
  settings: Settings;
}

export interface PlayState {
  wallMs: number;
  index: number;
  offsetS: number;
  playing: boolean;
  rate: number;
  waiting: boolean;
  frame: FrameTelemetry | null;
  frameStatus: 'data' | 'none' | 'loading';
}

const initialSettings = loadSettings(typeof navigator === 'undefined' ? 'en-US' : navigator.language, browserStorage());
const narrow = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches;

export const appStore = createStore<AppState>({
  library: null,
  loading: false,
  blocked: null,
  notice: null,
  timelineId: null,
  listOpen: false,
  listTab: 'all',
  listChip: null,
  manageOpen: false,
  mapOpen: initialSettings.showMap && !narrow,
  mapLarge: false,
  view: initialSettings.lastView === 'grid' ? { main: 'front', grid: true } : { main: initialSettings.lastView, grid: false },
  health: {},
  moments: {},
  route: {},
  charts: {},
  durations: {},
  slots: {},
  settings: initialSettings,
});

export const playStore = createStore<PlayState>({
  wallMs: 0,
  index: 0,
  offsetS: 0,
  playing: false,
  rate: 1,
  waiting: false,
  frame: null,
  frameStatus: 'loading',
});

export const telemetryCache = new TelemetryCache(loadTelemetryInWorker);

export function updateSettings(patch: Partial<Settings>): void {
  const settings = { ...appStore.get().settings, ...patch };
  appStore.set({ settings });
  saveSettings(settings, browserStorage());
}

export function currentTimeline(s: AppState = appStore.get()): Timeline | null {
  return s.library?.timelines.find((t) => t.id === s.timelineId) ?? null;
}
