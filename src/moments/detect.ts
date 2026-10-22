import type { EventInfo } from '../library/types';
import type { TelemetryTrack } from '../sei/telemetry';
import {
  HARD_BRAKE_MIN_S,
  HARD_BRAKE_MIN_SPEED_MPS,
  HARD_BRAKE_MPS2,
  MERGE_GAP_S,
  MOVING_MPS,
  STEER_RATE_DEG_S,
  STEER_RATE_WINDOW_S,
  STEER_SWERVE_LATERAL_MPS2,
  STEER_SWERVE_LOOKAHEAD_S,
  SWERVE_LATERAL_MPS2,
  SWERVE_MIN_S,
  SWERVE_MIN_SPEED_MPS,
} from './thresholds';

export type MomentType = 'brake' | 'swerve' | 'ap_off' | 'event';

export interface Moment {
  type: MomentType;
  wallMs: number;
  label: string;
}

const LABEL: Record<Exclude<MomentType, 'event'>, string> = {
  brake: 'Hard braking',
  swerve: 'Swerve',
  ap_off: 'Self-driving off',
};

/** Start indices of runs of frames (with data) meeting `cond` for at least `minS` seconds. */
function runStarts(tr: TelemetryTrack, cond: (i: number) => boolean, minS: number): number[] {
  const starts: number[] = [];
  const frameS = tr.t.length > 1 ? tr.t[1] - tr.t[0] : 0;
  let first = -1;
  const close = (last: number) => {
    if (first >= 0 && tr.t[last] - tr.t[first] + frameS >= minS - 1e-9) starts.push(first);
    first = -1;
  };
  for (let i = 0; i < tr.t.length; i++) {
    if (tr.has[i] && cond(i)) {
      if (first < 0) first = i;
    } else if (first >= 0) {
      close(i - 1);
    }
  }
  if (first >= 0) close(tr.t.length - 1);
  return starts;
}

function steeringSwerves(tr: TelemetryTrack): number[] {
  const out: number[] = [];
  for (let k = 1; k < tr.t.length; k++) {
    if (!tr.has[k] || tr.speed[k] <= SWERVE_MIN_SPEED_MPS) continue;
    let j = k - 1;
    while (j > 0 && tr.t[k] - tr.t[j] < STEER_RATE_WINDOW_S) j--;
    let ok = true;
    for (let x = j; x <= k; x++) if (!tr.has[x]) ok = false;
    const dt = tr.t[k] - tr.t[j];
    if (!ok || dt < STEER_RATE_WINDOW_S - 1e-9) continue;
    if (Math.abs(tr.steering[k] - tr.steering[j]) / dt < STEER_RATE_DEG_S) continue;
    // Only a steer that actually moves the car sideways is a swerve.
    let sideways = 0;
    for (let x = j; x < tr.t.length && tr.t[x] - tr.t[j] <= STEER_SWERVE_LOOKAHEAD_S; x++) {
      if (tr.has[x]) sideways = Math.max(sideways, Math.abs(tr.ax[x]));
    }
    if (sideways >= STEER_SWERVE_LATERAL_MPS2) out.push(j);
  }
  return out;
}

export function detectMoments(tr: TelemetryTrack, segmentWallMs: number): Moment[] {
  const at = (i: number) => segmentWallMs + Math.round(tr.t[i] * 1000);
  const found: Moment[] = [];

  for (const i of runStarts(tr, (i) => tr.ay[i] >= HARD_BRAKE_MPS2, HARD_BRAKE_MIN_S)) {
    if (tr.speed[i] >= HARD_BRAKE_MIN_SPEED_MPS) found.push({ type: 'brake', wallMs: at(i), label: LABEL.brake });
  }

  const lateral = runStarts(tr, (i) => Math.abs(tr.ax[i]) >= SWERVE_LATERAL_MPS2 && tr.speed[i] > SWERVE_MIN_SPEED_MPS, SWERVE_MIN_S);
  for (const i of [...lateral, ...steeringSwerves(tr)]) {
    found.push({ type: 'swerve', wallMs: at(i), label: LABEL.swerve });
  }

  for (let i = 1; i < tr.t.length; i++) {
    if (!tr.has[i] || !tr.has[i - 1]) continue;
    const was = tr.autopilot[i - 1];
    if ((was === 1 || was === 2) && tr.autopilot[i] === 0 && tr.speed[i] > MOVING_MPS) {
      found.push({ type: 'ap_off', wallMs: at(i), label: LABEL.ap_off });
    }
  }

  return mergeMoments(found);
}

export function eventMoment(event: EventInfo | null): Moment | null {
  if (!event || event.wallMs === null) return null;
  return { type: 'event', wallMs: event.wallMs, label: event.label };
}

export function mergeMoments(moments: Moment[]): Moment[] {
  const sorted = [...moments].sort((a, b) => a.wallMs - b.wallMs);
  const lastKept = new Map<MomentType, number>();
  const out: Moment[] = [];
  for (const m of sorted) {
    const prev = lastKept.get(m.type);
    if (prev !== undefined && m.wallMs - prev < MERGE_GAP_S * 1000) continue;
    lastKept.set(m.type, m.wallMs);
    out.push(m);
  }
  return out;
}
