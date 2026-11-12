// Export a moment: marking In and Out on the scrubber, the export dialog's steps, and running the worker.
import { initialRange, markIn, markOut, rangeIssue, spansInRange, exportFileName, type ExportRange } from '../export/range';
import type { OverlayChoice } from '../export/overlay';
import type { ExportFailure, ExportJob, ExportMinute, ExportReply } from '../export/protocol';
import { CAMERA_LABEL, CAMERA_ORDER, type CameraId, type Timeline } from '../library/types';
import { bounds, buildSpans } from '../player/timeline-math';
import { segmentSource } from '../sei/scan';
import { placeOf } from '../ui/format';
import { engine } from './playback';
import { appStore, currentTimeline, playStore, telemetryCache } from './state';
import { createStore } from './store';

export type ExportStep =
  | { kind: 'off' }
  | { kind: 'marking' }
  | { kind: 'dialog'; error?: string }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done'; blob: Blob; name: string; durationS: number };

export interface ExportState {
  /** The timeline being marked; leaving it ends marking. */
  timelineId: string | null;
  range: ExportRange | null;
  step: ExportStep;
}

export const exportStore = createStore<ExportState>({ timelineId: null, range: null, step: { kind: 'off' } });

export const EXPORT_TEXT = {
  unsupported: 'Exporting needs a recent Chrome or Edge.',
  novideo: 'These cameras have no video here. Tick another camera or pick another part of the clip.',
  failed: (why: string) => `The export stopped: ${why}. Try a shorter part or fewer cameras.`,
  short: 'Pick at least 1 second.',
  long: 'Pick 3 minutes or less.',
};

/** Whether this browser can make the video (WebCodecs and a worker canvas). */
export function exportSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

function timelineBounds(tl: Timeline) {
  return bounds(buildSpans(tl.segments, appStore.get().durations));
}

/** Starts marking with handles around the playhead (the Export button, X, or I / O). */
export function startMarking(): void {
  const tl = currentTimeline();
  if (!tl || !exportSupported()) return;
  const s = exportStore.get();
  if (s.step.kind === 'marking' && s.timelineId === tl.id) return;
  if (s.step.kind !== 'off') return;
  engine.pause();
  exportStore.set({ timelineId: tl.id, range: initialRange(timelineBounds(tl), playStore.get().wallMs), step: { kind: 'marking' } });
}

export function stopMarking(): void {
  exportStore.set({ timelineId: null, range: null, step: { kind: 'off' } });
}

export function toggleMarking(): void {
  if (exportStore.get().step.kind === 'marking') stopMarking();
  else startMarking();
}

export function setRange(range: ExportRange): void {
  exportStore.set({ range });
}

/** I and O: set In or Out at the playhead, starting marking first if needed. */
export function markAtPlayhead(which: 'in' | 'out'): void {
  startMarking();
  const s = exportStore.get();
  const tl = currentTimeline();
  if (s.step.kind !== 'marking' || !s.range || !tl) return;
  const b = timelineBounds(tl);
  const at = playStore.get().wallMs;
  setRange(which === 'in' ? markIn(s.range, at, b) : markOut(s.range, at, b));
}

// Opening another clip (or loading another folder) ends marking and closes the dialog, unless it's running.
appStore.subscribe(() => {
  const s = exportStore.get();
  if (s.step.kind === 'off' || s.step.kind === 'running') return;
  if (appStore.get().timelineId !== s.timelineId) stopMarking();
});

export function openDialog(): void {
  const s = exportStore.get();
  if (s.step.kind !== 'marking' || !s.range || rangeIssue(s.range)) return;
  engine.pause();
  exportStore.set({ step: { kind: 'dialog' } });
}

/** Back to marking (Cancel in the dialog, or Close after saving keeps the range for another try). */
export function backToMarking(): void {
  exportStore.set({ step: { kind: 'marking' } });
}

/** The dialog's starting cameras: what's on screen (every grid camera in Grid view). */
export function defaultCameras(tl: Timeline): CameraId[] {
  const { view } = appStore.get();
  if (!view.grid) return tl.cameras.includes(view.main) ? [view.main] : tl.cameras.slice(0, 1);
  return CAMERA_ORDER.filter((c) => tl.cameras.includes(c));
}

let worker: Worker | null = null;

function failText(kind: ExportFailure, message: string): string {
  if (kind === 'unsupported') return EXPORT_TEXT.unsupported;
  if (kind === 'novideo') return EXPORT_TEXT.novideo;
  return EXPORT_TEXT.failed(message);
}

async function buildJob(tl: Timeline, range: ExportRange, cameras: CameraId[], overlays: OverlayChoice): Promise<ExportJob> {
  const spans = buildSpans(tl.segments, appStore.get().durations);
  const minutes: ExportMinute[] = [];
  for (const i of spansInRange(spans, range)) {
    const seg = tl.segments[i];
    const files: ExportMinute['files'] = {};
    for (const c of cameras) {
      const f = seg.files[c];
      if (f) files[c] = await f.getFile().catch(() => undefined);
    }
    const src = segmentSource(seg);
    const track = src ? await telemetryCache.get(src).catch(() => null) : null;
    minutes.push({ wallMs: seg.wallMs, files, track });
  }
  const labels = Object.fromEntries(cameras.map((c) => [c, CAMERA_LABEL[c]]));
  const { units } = appStore.get().settings;
  return { range, cameras, labels, minutes, overlays, place: placeOf(tl), units };
}

/** Makes the video in the worker; the dialog shows progress, then Save video. */
export async function runExport(cameras: CameraId[], overlays: OverlayChoice): Promise<void> {
  const s = exportStore.get();
  const tl = currentTimeline();
  if (!tl || !s.range || !cameras.length) return;
  const range = s.range;
  engine.pause();
  exportStore.set({ step: { kind: 'running', done: 0, total: 0 } });
  let job: ExportJob;
  try {
    job = await buildJob(tl, range, cameras, overlays);
  } catch (e) {
    exportStore.set({ step: { kind: 'dialog', error: EXPORT_TEXT.failed(e instanceof Error ? e.message : String(e)) } });
    return;
  }
  if (exportStore.get().step.kind !== 'running') return; // stopped while gathering
  const w = new Worker(new URL('../export/export.worker.ts', import.meta.url), { type: 'module' });
  worker = w;
  w.onmessage = (e: MessageEvent<ExportReply>) => {
    if (worker !== w) return;
    const m = e.data;
    if (m.type === 'progress') {
      exportStore.set({ step: { kind: 'running', done: m.done, total: m.total } });
      return;
    }
    finishWorker();
    if (m.type === 'done') {
      const blob = new Blob([m.mp4], { type: 'video/mp4' });
      exportStore.set({ step: { kind: 'done', blob, name: exportFileName(range.inMs), durationS: m.durationS } });
    } else {
      exportStore.set({ step: { kind: 'dialog', error: failText(m.kind, m.message) } });
    }
  };
  w.onerror = (e) => {
    if (worker !== w) return;
    finishWorker();
    exportStore.set({ step: { kind: 'dialog', error: EXPORT_TEXT.failed(e.message || 'the export worker failed') } });
  };
  w.postMessage(job);
}

function finishWorker(): void {
  worker?.terminate();
  worker = null;
}

/** Stop: ends the worker and frees what it had; back to the dialog. */
export function stopExport(): void {
  finishWorker();
  exportStore.set({ step: { kind: 'dialog' } });
}

type SavePicker = (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{
  createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }>;
}>;

/** Saves the made video: a save dialog where the browser has one, else a download. Needs a click. */
export async function saveVideo(blob: Blob, name: string): Promise<void> {
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: name, types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }] });
      const out = await handle.createWritable();
      await out.write(blob);
      await out.close();
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // the user closed the save dialog
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
