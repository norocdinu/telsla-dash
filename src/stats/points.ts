// From the per-minute chart series to what a chart draws: min and max per pixel column across a time window,
// and the value under the pointer.
import type { Span } from '../player/timeline-math';
import type { ChartMinute } from './series';
import type { TimeWindow } from './window';

export type SeriesKey = 'speed' | 'pedal' | 'brake' | 'steering' | 'side' | 'forward';

export interface Column {
  min: number;
  max: number;
}

/** Calls `fn` with every sample (gaps included, as NaN) that starts in [fromMs, toMs). */
function eachSample(
  minutes: (ChartMinute | undefined)[],
  spans: Span[],
  fromMs: number,
  toMs: number,
  key: SeriesKey,
  fn: (v: number) => void,
): void {
  for (const span of spans) {
    const m = minutes[span.index];
    if (!m) continue;
    const arr = m[key];
    const stepMs = m.stepS * 1000;
    if (span.startMs + arr.length * stepMs <= fromMs || span.startMs >= toMs) continue;
    const k0 = Math.max(0, Math.ceil((fromMs - span.startMs) / stepMs - 1e-9));
    const k1 = Math.min(arr.length, Math.ceil((toMs - span.startMs) / stepMs - 1e-9));
    for (let k = k0; k < k1; k++) fn(arr[k]);
  }
}

/** The sample on screen at a wall time, or null (not read yet, gap, or outside the clip). */
export function valueAt(minutes: (ChartMinute | undefined)[], spans: Span[], wallMs: number, key: SeriesKey): number | null {
  for (const span of spans) {
    if (wallMs < span.startMs || wallMs >= span.startMs + span.durationS * 1000) continue;
    const m = minutes[span.index];
    if (!m) return null;
    const k = Math.floor((wallMs - span.startMs) / (m.stepS * 1000) + 1e-9);
    const v = m[key][k];
    return v === undefined || Number.isNaN(v) ? null : v;
  }
  return null;
}

/**
 * Min and max per pixel column across the window, so a short spike survives squeezing an hour into a few
 * hundred columns. A column no sample starts in (zoomed in) takes the sample on screen at its start. Null
 * where there is no data: a gap, or a minute not read yet.
 */
export function columns(
  minutes: (ChartMinute | undefined)[],
  spans: Span[],
  w: TimeWindow,
  key: SeriesKey,
  width: number,
): (Column | null)[] {
  const out: (Column | null)[] = [];
  const dt = (w.toMs - w.fromMs) / width;
  for (let c = 0; c < width; c++) {
    const a = w.fromMs + c * dt;
    let min = Infinity;
    let max = -Infinity;
    let any = false;
    eachSample(minutes, spans, a, a + dt, key, (v) => {
      any = true;
      if (v < min) min = v;
      if (v > max) max = v;
    });
    if (!any) {
      const v = valueAt(minutes, spans, a, key);
      if (v !== null) min = max = v;
    }
    out.push(min <= max ? { min, max } : null);
  }
  return out;
}

/** Every value in the window (gaps left out), for chartRange. */
export function valuesIn(minutes: (ChartMinute | undefined)[], spans: Span[], w: TimeWindow, key: SeriesKey): number[] {
  const out: number[] = [];
  eachSample(minutes, spans, w.fromMs, w.toMs, key, (v) => {
    if (!Number.isNaN(v)) out.push(v);
  });
  return out;
}
