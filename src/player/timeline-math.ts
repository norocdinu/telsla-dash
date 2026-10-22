import type { Segment } from '../library/types';

/** Where one segment sits on the event's wall-clock timeline. */
export interface Span {
  index: number;
  startMs: number;
  durationS: number;
}

export const DEFAULT_SEGMENT_S = 60;

/** Durations: known (from the file), else the gap to the next start capped at 60 s, else 60 s. */
export function buildSpans(segments: Segment[], durations: Record<string, number>): Span[] {
  return segments.map((s, i) => {
    const known = durations[s.key];
    const next = segments[i + 1];
    const durationS =
      known !== undefined && known > 0
        ? known
        : next
          ? Math.min(DEFAULT_SEGMENT_S, (next.wallMs - s.wallMs) / 1000)
          : DEFAULT_SEGMENT_S;
    return { index: i, startMs: s.wallMs, durationS };
  });
}

export function bounds(spans: Span[]): { startMs: number; endMs: number } {
  if (!spans.length) return { startMs: 0, endMs: 0 };
  const last = spans[spans.length - 1];
  return { startMs: spans[0].startMs, endMs: last.startMs + Math.round(last.durationS * 1000) };
}

export function locate(spans: Span[], wallMs: number): { index: number; offsetS: number } {
  if (!spans.length) return { index: 0, offsetS: 0 };
  if (wallMs <= spans[0].startMs) return { index: 0, offsetS: 0 };
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    const end = s.startMs + s.durationS * 1000;
    if (wallMs < end) return { index: i, offsetS: (wallMs - s.startMs) / 1000 };
    const next = spans[i + 1];
    if (next && wallMs < next.startMs) return { index: i + 1, offsetS: 0 };
  }
  const last = spans[spans.length - 1];
  return { index: last.index, offsetS: last.durationS };
}

export function wallAt(spans: Span[], index: number, offsetS: number): number {
  const s = spans[index];
  return s ? s.startMs + Math.round(offsetS * 1000) : 0;
}

export function skipFrom(spans: Span[], wallMs: number, deltaS: number): { index: number; offsetS: number } {
  return locate(spans, wallMs + deltaS * 1000);
}
