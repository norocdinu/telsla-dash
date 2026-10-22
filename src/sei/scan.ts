import { CAMERA_ORDER, type Segment, type SourceFile, type Timeline } from '../library/types';
import { TelemetryLoadError, type LoadFailure } from './errors';
import type { TelemetryTrack } from './telemetry';
import type { TelemetryCache } from './telemetry-cache';

/** `start` to the end, then backwards from `start - 1`. */
export function scanOrder(count: number, start: number): number[] {
  const s = Math.max(0, Math.min(start, count - 1));
  const out: number[] = [];
  for (let i = s; i < count; i++) out.push(i);
  for (let i = s - 1; i >= 0; i--) out.push(i);
  return out;
}

/**
 * The loader for a background scan: reuses a track the cache already has or is loading, and otherwise
 * loads without caching, so scanning a long drive never pushes the clip being watched out of the cache.
 */
export function scanLoader(
  cache: Pick<TelemetryCache, 'pending'>,
  load: (f: SourceFile) => Promise<TelemetryTrack>,
): (f: SourceFile) => Promise<TelemetryTrack> {
  return (f) => cache.pending(f) ?? load(f);
}

/** The file whose driving data stands for the segment: front, else the first camera present. */
export function segmentSource(seg: Segment): SourceFile | null {
  for (const c of CAMERA_ORDER) {
    const f = seg.files[c];
    if (f) return f;
  }
  return null;
}

/** Loads each segment's driving data one at a time, nearest the playhead first. */
export async function scanTimeline(
  tl: Timeline,
  get: (f: SourceFile) => Promise<TelemetryTrack>,
  onSegment: (index: number, track: TelemetryTrack | null, error?: LoadFailure) => void,
  signal: AbortSignal,
  start = 0,
): Promise<void> {
  for (const i of scanOrder(tl.segments.length, start)) {
    if (signal.aborted) return;
    const f = segmentSource(tl.segments[i]);
    if (!f) continue;
    let track: TelemetryTrack;
    try {
      track = await get(f);
    } catch (e) {
      if (signal.aborted) return;
      onSegment(i, null, e instanceof TelemetryLoadError ? e.kind : 'unsupported');
      continue;
    }
    if (signal.aborted) return;
    onSegment(i, track);
  }
}
