// Real clip lengths, read when a timeline opens, so the progress bar has its final scale from the start.
// File names give each minute's start, but not its length: the last file of an event is usually short
// (on the user's drive 1.6–54 s), and estimating it as 60 s made the bar shrink when it loaded.
import type { Segment, Timeline } from '../library/types';
import { inspectFile } from '../mp4/read-mp4';
import { segmentSource } from '../sei/scan';

/** Timelines longer than this measure only their last segment; the others are within a second of 60 s. */
export const MAX_MEASURED_SEGMENTS = 30;

export function durationOrder(count: number, max = MAX_MEASURED_SEGMENTS): number[] {
  if (count <= 0) return [];
  const last = count - 1;
  if (count > max) return [last];
  return [last, ...Array.from({ length: last }, (_, i) => i)];
}

/** The segment's length from its moov box (a few KB at the file's end), or null. */
export async function readSegmentDuration(seg: Segment): Promise<number | null> {
  const source = segmentSource(seg);
  if (!source) return null;
  try {
    const f = await source.getFile();
    const read = async (offset: number, length: number) => new Uint8Array(await f.slice(offset, offset + length).arrayBuffer());
    return (await inspectFile(read, f.size)).durationS;
  } catch {
    return null;
  }
}

export async function measureDurations(
  tl: Timeline,
  known: Record<string, number>,
  read: (seg: Segment) => Promise<number | null>,
  onLength: (segmentKey: string, seconds: number) => void,
  signal: AbortSignal,
): Promise<void> {
  for (const i of durationOrder(tl.segments.length)) {
    if (signal.aborted) return;
    const seg = tl.segments[i];
    if (known[seg.key] !== undefined) continue;
    const s = await read(seg);
    if (signal.aborted) return;
    if (s !== null && s > 0) onLength(seg.key, s);
  }
}
