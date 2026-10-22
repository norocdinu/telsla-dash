// Connects the playback engine, the background scan and the stores.
import type { CameraId, Segment, Timeline } from '../library/types';
import { detectMoments, eventMoment, mergeMoments, type Moment } from '../moments/detect';
import { JUMP_LEAD_S } from '../moments/thresholds';
import { PlaybackEngine } from '../player/engine';
import { locate, buildSpans } from '../player/timeline-math';
import { routePoints } from '../sei/route';
import { scanLoader, scanTimeline, segmentSource } from '../sei/scan';
import { telemetryAt } from '../sei/telemetry';
import { loadTelemetryInWorker } from '../sei/telemetry-client';
import { nextInList } from '../ui/list/list-model';
import { measureDurations, readSegmentDuration } from './durations';
import { appStore, currentTimeline, playStore, telemetryCache, updateSettings, type AppState, type PlayState } from './state';

/** Starts loading a segment's driving data into the cache unless it's there, coming, or failed. */
function request(seg: Segment | undefined, then?: () => void): void {
  const f = seg ? segmentSource(seg) : null;
  if (!f || telemetryCache.pending(f) || telemetryCache.failed(f)) return;
  telemetryCache.get(f).then(then, then);
}

/** Driving data for the frame on screen: from the cache, else start loading that clip (then the next one). */
function frameFor(index: number, offsetS: number): Pick<PlayState, 'frame' | 'frameStatus'> {
  const segments = currentTimeline()?.segments;
  const seg = segments?.[index];
  const f = seg ? segmentSource(seg) : null;
  if (!f) return { frame: null, frameStatus: 'none' };
  const track = telemetryCache.peek(f);
  if (!track) {
    if (telemetryCache.failed(f)) return { frame: null, frameStatus: 'none' };
    request(seg, refreshFrame);
    return { frame: null, frameStatus: 'loading' };
  }
  request(segments?.[index + 1]); // read ahead
  const frame = telemetryAt(track, offsetS);
  return { frame, frameStatus: frame ? 'data' : 'none' };
}

function refreshFrame(): void {
  const { index, offsetS } = playStore.get();
  playStore.set(frameFor(index, offsetS));
}

export const engine = new PlaybackEngine({
  onFrame: (p) => playStore.set({ wallMs: p.wallMs, index: p.index, offsetS: p.offsetS, ...frameFor(p.index, p.offsetS) }),
  onState: (s) => playStore.set(s),
  onDuration: (key, seconds) => appStore.set((s) => ({ durations: { ...s.durations, [key]: seconds } })),
  onSlot: (camera, status) => appStore.set((s) => ({ slots: { ...s.slots, [camera]: status } })),
});

let loadedId: string | null = null;
let scanAbort: AbortController | null = null;
let measureAbort: AbortController | null = null;
let pendingStart: number | undefined;
let pendingPlay = false;
const scanLoad = scanLoader(telemetryCache, loadTelemetryInWorker);

function addMoments(s: AppState, id: string, found: Moment[]): Partial<AppState> {
  return { moments: { ...s.moments, [id]: mergeMoments([...(s.moments[id] ?? []), ...found]) } };
}

function startScan(tl: Timeline, startIndex: number): void {
  scanAbort?.abort();
  const ac = new AbortController();
  scanAbort = ac;
  void scanTimeline(
    tl,
    scanLoad,
    (i, track) => {
      if (!track) return;
      const seg = tl.segments[i];
      const found = detectMoments(track, seg.wallMs);
      const points = routePoints(track);
      appStore.set((s) => {
        const route = [...(s.route[tl.id] ?? [])];
        route[i] = points;
        return { ...addMoments(s, tl.id, found), route: { ...s.route, [tl.id]: route } };
      });
    },
    ac.signal,
    startIndex,
  );
}

function onAppChange(): void {
  const s = appStore.get();
  const tl = currentTimeline(s);
  const id = tl?.id ?? null;
  if (id === loadedId) return;
  loadedId = id;
  scanAbort?.abort();
  measureAbort?.abort();
  if (!tl) {
    engine.pause();
    return;
  }
  const start = pendingStart;
  const play = pendingPlay;
  pendingStart = undefined;
  pendingPlay = false;
  const ev = eventMoment(tl.event);
  // Clear the previous timeline's camera states first: load() reports the new ones.
  appStore.set((st) => ({ slots: {}, ...addMoments(st, tl.id, ev ? [ev] : []) }));
  engine.load(tl, s.durations, start);
  if (play) engine.play();
  const index = start === undefined ? 0 : locate(buildSpans(tl.segments, s.durations), start).index;
  startMeasuring(tl, s.durations);
  startScan(tl, index);
}


/** Reads the real clip lengths up front, so the progress bar doesn't rescale when the short last minute loads. */
function startMeasuring(tl: Timeline, known: Record<string, number>): void {
  measureAbort?.abort();
  const ac = new AbortController();
  measureAbort = ac;
  void measureDurations(
    tl,
    known,
    readSegmentDuration,
    (key, seconds) => {
      appStore.set((st) => ({ durations: { ...st.durations, [key]: seconds } }));
      engine.setDurations({ [key]: seconds });
    },
    ac.signal,
  );
}

appStore.subscribe(onAppChange);

/** Opens a timeline, optionally at a time; `play` starts it (Up next, the clip list). */
export function openTimeline(id: string, startWallMs?: number, play = false): void {
  pendingStart = startWallMs;
  pendingPlay = play;
  appStore.set({ timelineId: id, listOpen: false });
}

/**
 * Stops everything reading the current timeline's files: playback, the scan and length reading. It stays
 * stopped through other app changes until another timeline opens, or reloadCurrent().
 */
export function stopCurrent(): void {
  scanAbort?.abort();
  measureAbort?.abort();
  engine.release();
}

/** Loads the current timeline again after stopCurrent(), e.g. what is left of it after a delete. */
export function reloadCurrent(): void {
  loadedId = null;
  onAppChange();
}

export function setView(view: { main: CameraId; grid: boolean }): void {
  appStore.set({ view });
  updateSettings({ lastView: view.grid ? 'grid' : view.main });
}

export function seekLead(wallMs: number): void {
  engine.seek(wallMs - JUMP_LEAD_S * 1000);
}

export function jumpToEvent(): void {
  const ev = currentTimeline()?.event;
  if (ev?.wallMs != null) seekLead(ev.wallMs);
}

/** Up next: the next older clip in the clip list as currently filtered (tab and reason). */
export function nextTimeline(s: AppState = appStore.get()): Timeline | null {
  return nextInList(s.library?.timelines ?? [], s.timelineId, s.listTab, s.listChip);
}
