import { RECENT_PLACE } from '../app/messages';
import type { Timeline } from '../library/types';

/** Where a clip was recorded: the event's city, else "Recent drive". */
export function placeOf(tl: Timeline): string {
  return tl.event?.city ?? RECENT_PLACE;
}

export type Units = 'kmh' | 'mph';

const MPS_TO = { kmh: 3.6, mph: 2.2369363 };

export function speedValue(mps: number, units: Units): number {
  return Math.round(mps * MPS_TO[units]);
}

export function unitLabel(units: Units): 'km/h' | 'MPH' {
  return units === 'kmh' ? 'km/h' : 'MPH';
}

export function gearLetter(g: number): 'P' | 'D' | 'R' | 'N' {
  return (['P', 'D', 'R', 'N'] as const)[g] ?? 'P';
}

export function gearTone(g: number): 'blue' | 'grey' {
  return g === 1 || g === 2 ? 'blue' : 'grey';
}

export function autopilotLabel(a: number): string | null {
  return ({ 1: 'Self Driving', 2: 'Autosteer', 3: 'Traffic-Aware Cruise' } as Record<number, string>)[a] ?? null;
}

/** Whether the car is steering itself (Self Driving or Autosteer): the wheel icon turns blue, as in the car. */
export function steeringEngaged(a: number): boolean {
  return a === 1 || a === 2;
}

/** `m:ss` under an hour, else `h:mm:ss`. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Where a wall time sits on the scrubber, 0–100. */
export function tickPercent(b: { startMs: number; endMs: number }, wallMs: number): number {
  const span = b.endMs - b.startMs;
  if (span <= 0) return 0;
  return Math.min(100, Math.max(0, ((wallMs - b.startMs) / span) * 100));
}
