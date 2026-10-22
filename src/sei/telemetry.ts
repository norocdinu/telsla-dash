import { frameTimes, parseMp4 } from '../mp4/read-mp4';
import { seiType } from './proto';
import { unwrapSei } from './sei';

/** Per-frame driving data for one clip file, as parallel typed arrays (cheap to transfer from a worker). */
export interface TelemetryTrack {
  t: Float64Array;
  has: Uint8Array;
  speed: Float32Array;
  pedal: Float32Array;
  steering: Float32Array;
  gear: Uint8Array;
  autopilot: Uint8Array;
  /** bit0 left blinker, bit1 right blinker, bit2 brake */
  flags: Uint8Array;
  lat: Float64Array;
  lon: Float64Array;
  heading: Float32Array;
  ax: Float32Array;
  ay: Float32Array;
  az: Float32Array;
  /** The car's own frame counter (`frame_seq_no`, a uint64; exact up to 2^53). */
  seq: Float64Array;
  /** The driving-data format version (`version`). */
  version: Uint32Array;
  durationS: number;
  codec: string;
}

export interface FrameTelemetry {
  speedMps: number;
  pedal: number;
  steeringDeg: number;
  gear: number;
  autopilot: number;
  blinkLeft: boolean;
  blinkRight: boolean;
  brake: boolean;
  lat: number;
  lon: number;
  heading: number;
  ax: number;
  ay: number;
  az: number;
  seq: number;
  version: number;
}

export const BLINK_LEFT = 1;
export const BLINK_RIGHT = 2;
export const BRAKE = 4;

export function emptyTrack(t: Float64Array, durationS: number, codec: string): TelemetryTrack {
  const n = t.length;
  return {
    t,
    has: new Uint8Array(n),
    speed: new Float32Array(n),
    pedal: new Float32Array(n),
    steering: new Float32Array(n),
    gear: new Uint8Array(n),
    autopilot: new Uint8Array(n),
    flags: new Uint8Array(n),
    lat: new Float64Array(n),
    lon: new Float64Array(n),
    heading: new Float32Array(n),
    ax: new Float32Array(n),
    ay: new Float32Array(n),
    az: new Float32Array(n),
    seq: new Float64Array(n),
    version: new Uint32Array(n),
    durationS,
    codec,
  };
}

function firstSei(buf: Uint8Array, start: number, size: number): Uint8Array | null {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const end = Math.min(start + size, buf.length);
  for (let p = start; p + 4 <= end; ) {
    const len = v.getUint32(p);
    const nal = buf.subarray(p + 4, Math.min(p + 4 + len, end));
    if (nal.length && (nal[0] & 0x1f) === 6) {
      const payload = unwrapSei(nal);
      if (payload) return payload;
    }
    p += 4 + len;
  }
  return null;
}

export function extractTelemetry(buf: Uint8Array): TelemetryTrack {
  const info = parseMp4(buf);
  const track = emptyTrack(frameTimes(info), info.durationS, info.codec);
  if (info.codec !== 'avc1' && info.codec !== 'avc3') return track;

  const T = seiType();
  for (let i = 0; i < info.sizes.length; i++) {
    const payload = firstSei(buf, info.offsets[i], info.sizes[i]);
    if (!payload) continue;
    let m: Record<string, unknown>;
    try {
      m = T.toObject(T.decode(payload), { enums: Number, longs: Number, defaults: true });
    } catch {
      continue;
    }
    track.has[i] = 1;
    track.speed[i] = m.vehicleSpeedMps as number;
    track.pedal[i] = m.acceleratorPedalPosition as number;
    track.steering[i] = m.steeringWheelAngle as number;
    track.gear[i] = m.gearState as number;
    track.autopilot[i] = m.autopilotState as number;
    track.flags[i] = (m.blinkerOnLeft ? BLINK_LEFT : 0) | (m.blinkerOnRight ? BLINK_RIGHT : 0) | (m.brakeApplied ? BRAKE : 0);
    track.lat[i] = m.latitudeDeg as number;
    track.lon[i] = m.longitudeDeg as number;
    track.heading[i] = m.headingDeg as number;
    track.ax[i] = m.linearAccelerationMps2X as number;
    track.ay[i] = m.linearAccelerationMps2Y as number;
    track.az[i] = m.linearAccelerationMps2Z as number;
    track.seq[i] = m.frameSeqNo as number;
    track.version[i] = m.version as number;
  }
  return track;
}

/** Index of the frame on screen at time `t` (seconds into the clip), or -1 before the first frame. */
export function frameIndexAt(track: TelemetryTrack, t: number): number {
  const ts = track.t;
  let lo = 0;
  let hi = ts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t + 0.001) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function telemetryAt(track: TelemetryTrack, t: number): FrameTelemetry | null {
  const i = frameIndexAt(track, t);
  if (i < 0 || !track.has[i]) return null;
  const flags = track.flags[i];
  return {
    speedMps: track.speed[i],
    pedal: track.pedal[i],
    steeringDeg: track.steering[i],
    gear: track.gear[i],
    autopilot: track.autopilot[i],
    blinkLeft: (flags & BLINK_LEFT) !== 0,
    blinkRight: (flags & BLINK_RIGHT) !== 0,
    brake: (flags & BRAKE) !== 0,
    lat: track.lat[i],
    lon: track.lon[i],
    heading: track.heading[i],
    ax: track.ax[i],
    ay: track.ay[i],
    az: track.az[i],
    seq: track.seq[i],
    version: track.version[i],
  };
}
