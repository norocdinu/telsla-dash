import { BLINK_LEFT, BLINK_RIGHT, BRAKE, emptyTrack, type TelemetryTrack } from '../../src/sei/telemetry';

export interface Raw {
  has: number;
  speed: number;
  pedal: number;
  steering: number;
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

/** A synthetic track of `n` frames at `fps`. Defaults: has 1, speed 10 m/s, everything else 0. */
export function makeTrack(n: number, fps: number, at: (i: number) => Partial<Raw> = () => ({})): TelemetryTrack {
  const t = Float64Array.from({ length: n }, (_, i) => i / fps);
  const tr = emptyTrack(t, n / fps, 'avc1');
  for (let i = 0; i < n; i++) {
    const r: Raw = {
      has: 1,
      speed: 10,
      pedal: 0,
      steering: 0,
      gear: 1,
      autopilot: 0,
      blinkLeft: false,
      blinkRight: false,
      brake: false,
      lat: 0,
      lon: 0,
      heading: 0,
      ax: 0,
      ay: 0,
      az: 0,
      seq: 0,
      version: 0,
      ...at(i),
    };
    tr.has[i] = r.has;
    tr.speed[i] = r.speed;
    tr.pedal[i] = r.pedal;
    tr.steering[i] = r.steering;
    tr.gear[i] = r.gear;
    tr.autopilot[i] = r.autopilot;
    tr.flags[i] = (r.blinkLeft ? BLINK_LEFT : 0) | (r.blinkRight ? BLINK_RIGHT : 0) | (r.brake ? BRAKE : 0);
    tr.lat[i] = r.lat;
    tr.lon[i] = r.lon;
    tr.heading[i] = r.heading;
    tr.ax[i] = r.ax;
    tr.ay[i] = r.ay;
    tr.az[i] = r.az;
    tr.seq[i] = r.seq;
    tr.version[i] = r.version;
  }
  return tr;
}
