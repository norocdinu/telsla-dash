// A compact copy of one minute's driving data for the Stats for nerds charts: a few numbers per tenth of a
// second instead of every frame, so an hour-long drive stays small in memory.
import { BRAKE, type TelemetryTrack } from '../sei/telemetry';

/** One minute's chart data at a fixed step; NaN where the car recorded nothing. */
export interface ChartMinute {
  stepS: number;
  /** m/s */
  speed: Float32Array;
  /** Accelerator, % */
  pedal: Float32Array;
  /** 1 if the brake was on at any frame in the step */
  brake: Uint8Array;
  /** Steering wheel angle, degrees */
  steering: Float32Array;
  /** Sideways acceleration, m/s² (track.ax, as moment detection uses it) */
  side: Float32Array;
  /** Forward acceleration, m/s² (−track.ay: braking is negative, so it draws downward) */
  forward: Float32Array;
}

export const SERIES_STEP_S = 0.1;

/** Same tolerance as frameIndexAt: a frame starting a hair after a step's start still counts as on screen. */
const ON_SCREEN_S = 0.001;

export function compactSeries(track: TelemetryTrack, stepS = SERIES_STEP_S): ChartMinute {
  const n = Math.max(0, Math.ceil(track.durationS / stepS - 1e-9));
  const s: ChartMinute = {
    stepS,
    speed: new Float32Array(n),
    pedal: new Float32Array(n),
    brake: new Uint8Array(n),
    steering: new Float32Array(n),
    side: new Float32Array(n),
    forward: new Float32Array(n),
  };
  const t = track.t;
  let onScreen = -1;
  let next = 0;
  for (let k = 0; k < n; k++) {
    const from = k * stepS;
    const to = (k + 1) * stepS;
    while (onScreen + 1 < t.length && t[onScreen + 1] <= from + ON_SCREEN_S) onScreen++;
    if (onScreen >= 0 && track.has[onScreen]) {
      s.speed[k] = track.speed[onScreen];
      s.pedal[k] = track.pedal[onScreen];
      s.steering[k] = track.steering[onScreen];
      s.side[k] = track.ax[onScreen];
      s.forward[k] = -track.ay[onScreen];
    } else {
      s.speed[k] = s.pedal[k] = s.steering[k] = s.side[k] = s.forward[k] = NaN;
    }
    // Any braking frame inside the step marks it, however short.
    for (; next < t.length && t[next] < to - 1e-9; next++) {
      if (t[next] >= from - 1e-9 && track.has[next] && track.flags[next] & BRAKE) s.brake[k] = 1;
    }
  }
  return s;
}
