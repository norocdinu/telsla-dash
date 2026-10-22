// Vertical scales for the Stats for nerds charts: fitted to what's in view, rounded to tidy values, never
// smaller than a minimum span (so normal driving doesn't look like noise).

export interface Range {
  min: number;
  max: number;
}

export type ChartKind = 'speed' | 'pedals' | 'steering' | 'g';

export const G = 9.81;
const MPS_PER = { kmh: 1 / 3.6, mph: 0.44704 };
/** The smallest top of the speed chart, in the shown unit (30 km/h; 20 mph is the tidy value nearest it). */
const MIN_SPEED = { kmh: 30, mph: 20 };
const MIN_STEERING_DEG = 30;
const MIN_G = 0.3;

/** Rounds up to 1, 2 or 5 × 10ⁿ. */
export function tidyUp(x: number): number {
  if (!(x > 0)) return 0;
  const p = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 2, 5, 10]) if (m * p >= x * (1 - 1e-9)) return m * p;
  return 10 * p;
}

/** Fits values (NaN ignored) to tidy bounds with the chart's minimum span; pedals are always 0..100. */
export function chartRange(kind: ChartKind, values: Iterable<number>, units: 'kmh' | 'mph'): Range {
  if (kind === 'pedals') return { min: 0, max: 100 };
  let max = 0;
  let maxAbs = 0;
  for (const v of values) {
    if (Number.isNaN(v)) continue;
    if (v > max) max = v;
    if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
  }
  if (kind === 'speed') {
    const per = MPS_PER[units];
    return { min: 0, max: Math.max(tidyUp(max / per), MIN_SPEED[units]) * per };
  }
  if (kind === 'steering') {
    const m = Math.max(tidyUp(maxAbs), MIN_STEERING_DEG);
    return { min: -m, max: m };
  }
  const m = Math.max(tidyUp(maxAbs / G), MIN_G);
  return { min: -m * G, max: m * G };
}
