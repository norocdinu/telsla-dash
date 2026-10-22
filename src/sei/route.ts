import type { TelemetryTrack } from './telemetry';

export type LatLon = [number, number];

/** About one GPS point per `everyS` seconds, from frames that have data and a real position. */
export function routePoints(track: TelemetryTrack, everyS = 1): LatLon[] {
  const out: LatLon[] = [];
  let next = -Infinity;
  for (let i = 0; i < track.t.length; i++) {
    if (!track.has[i] || (track.lat[i] === 0 && track.lon[i] === 0)) continue;
    if (track.t[i] + 1e-9 < next) continue;
    out.push([track.lat[i], track.lon[i]]);
    next = track.t[i] + everyS;
  }
  return out;
}

export function joinRoute(parts: (LatLon[] | undefined)[]): LatLon[] {
  return parts.flatMap((p) => p ?? []);
}

/** [[south, west], [north, east]], or null for an empty route. */
export function routeBounds(points: LatLon[]): [LatLon, LatLon] | null {
  if (!points.length) return null;
  let [s, w] = points[0];
  let [n, e] = points[0];
  for (const [lat, lon] of points) {
    s = Math.min(s, lat);
    n = Math.max(n, lat);
    w = Math.min(w, lon);
    e = Math.max(e, lon);
  }
  return [
    [s, w],
    [n, e],
  ];
}
