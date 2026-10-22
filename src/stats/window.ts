// The stretch of time the Stats for nerds charts show: the whole clip while playing, 30 s around now when paused.

export const ZOOM_HALF_S = 15;

/** Wall-clock ms (car local time), like everything on the timeline. */
export interface TimeWindow {
  fromMs: number;
  toMs: number;
}

/** Whole clip while playing; when paused, 30 s around now, clamped to the clip, never wider than it. */
export function chartWindow(clip: { startMs: number; endMs: number }, nowMs: number, paused: boolean): TimeWindow {
  const span = 2 * ZOOM_HALF_S * 1000;
  if (!paused || clip.endMs - clip.startMs <= span) return { fromMs: clip.startMs, toMs: clip.endMs };
  const fromMs = Math.min(Math.max(nowMs - ZOOM_HALF_S * 1000, clip.startMs), clip.endMs - span);
  return { fromMs, toMs: fromMs + span };
}

/** Linear blend for the zoom ease (t in 0..1). */
export function blendWindow(a: TimeWindow, b: TimeWindow, t: number): TimeWindow {
  const k = Math.min(1, Math.max(0, t));
  return { fromMs: a.fromMs + (b.fromMs - a.fromMs) * k, toMs: a.toMs + (b.toMs - a.toMs) * k };
}
