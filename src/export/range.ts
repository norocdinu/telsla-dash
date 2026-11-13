// The part of a timeline to export: In and Out on the scrubber, kept between 1 s and 3 minutes long.
import type { Span } from '../player/timeline-math';

export const MIN_EXPORT_S = 1;
/** The whole video is built in memory: 3 minutes at ~8 Mbit/s is about 180 MB. */
export const MAX_EXPORT_S = 180;
/** Where the handles start, either side of the playhead, when marking begins. */
export const START_PAD_S = 10;

export interface ExportRange {
  inMs: number;
  outMs: number;
}

type Bounds = { startMs: number; endMs: number };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const MIN_MS = MIN_EXPORT_S * 1000;
const MAX_MS = MAX_EXPORT_S * 1000;

/** The handles' starting place: 10 s either side of the playhead, inside the clip. */
export function initialRange(b: Bounds, playheadMs: number): ExportRange {
  const total = b.endMs - b.startMs;
  const len = Math.min(2 * START_PAD_S * 1000, total, MAX_MS);
  const inMs = clamp(playheadMs - START_PAD_S * 1000, b.startMs, b.endMs - len);
  return { inMs, outMs: inMs + len };
}

/** Dragging the In handle: it stops where the range would get too short or too long. */
export function dragIn(r: ExportRange, ms: number, b: Bounds): ExportRange {
  return { ...r, inMs: clamp(ms, Math.max(b.startMs, r.outMs - MAX_MS), Math.max(b.startMs, r.outMs - MIN_MS)) };
}

export function dragOut(r: ExportRange, ms: number, b: Bounds): ExportRange {
  return { ...r, outMs: clamp(ms, Math.min(b.endMs, r.inMs + MIN_MS), Math.min(b.endMs, r.inMs + MAX_MS)) };
}

/** The I key: In goes to the playhead, and Out moves along if it has to. */
export function markIn(r: ExportRange, ms: number, b: Bounds): ExportRange {
  const inMs = clamp(ms, b.startMs, Math.max(b.startMs, b.endMs - MIN_MS));
  return { inMs, outMs: clamp(r.outMs, Math.min(b.endMs, inMs + MIN_MS), Math.min(b.endMs, inMs + MAX_MS)) };
}

/** The O key: Out goes to the playhead, and In moves along if it has to. */
export function markOut(r: ExportRange, ms: number, b: Bounds): ExportRange {
  const outMs = clamp(ms, Math.min(b.endMs, b.startMs + MIN_MS), b.endMs);
  return { outMs, inMs: clamp(r.inMs, Math.max(b.startMs, outMs - MAX_MS), Math.max(b.startMs, outMs - MIN_MS)) };
}

export function rangeIssue(r: ExportRange): 'short' | 'long' | null {
  const len = r.outMs - r.inMs;
  if (len < MIN_MS) return 'short';
  if (len > MAX_MS) return 'long';
  return null;
}

/** Indices of the minutes the range touches. */
export function spansInRange(spans: Span[], r: ExportRange): number[] {
  return spans.filter((s) => s.startMs < r.outMs && s.startMs + s.durationS * 1000 > r.inMs).map((s) => s.index);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** dashcam-2025-11-25_11-25-03.mp4, from the In time (wall ms). */
export function exportFileName(inMs: number): string {
  const d = new Date(inMs);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return `dashcam-${date}_${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}.mp4`;
}
