import { parseWallStamp } from './time';
import type { EventInfo, ReasonCategory } from './types';

export const CHIP_ORDER: ReasonCategory[] = ['object', 'handle', 'accel', 'manual', 'honk', 'other'];

export const CHIP_LABEL: Record<ReasonCategory, string> = {
  object: 'Object detected',
  handle: 'Handle pulled',
  accel: 'Bump/accel',
  manual: 'Manual save',
  honk: 'Honk',
  other: 'Other',
};

/** `sentry_locked_handle_pulled` → `Sentry locked handle pulled`. */
export function humanize(s: string): string {
  const words = s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function reasonInfo(reason: string | null): { category: ReasonCategory; label: string } {
  const r = reason ?? '';
  let category: ReasonCategory = 'other';
  if (r === 'sentry_aware_object_detection') category = 'object';
  else if (/handle_pull/.test(r)) category = 'handle';
  else if (/^sentry_aware_accel/.test(r)) category = 'accel';
  else if (r === 'user_interaction_honk') category = 'honk';
  else if (/^user_interaction_dashcam/.test(r)) category = 'manual';
  if (category !== 'other') return { category, label: CHIP_LABEL[category] };
  return { category, label: r ? humanize(r) : CHIP_LABEL.other };
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

function coordinate(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function parseEventJson(raw: string): EventInfo | null {
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  const timestamp = text(o.timestamp);
  const reason = text(o.reason);
  return {
    wallMs: timestamp ? parseWallStamp(timestamp) : null,
    city: text(o.city),
    street: text(o.street),
    lat: coordinate(o.est_lat),
    lon: coordinate(o.est_lon),
    reason,
    ...reasonInfo(reason),
  };
}
