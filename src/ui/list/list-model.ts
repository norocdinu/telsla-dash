import { CHIP_ORDER } from '../../library/event-json';
import { dayHeading } from '../../library/time';
import type { ReasonCategory, Timeline } from '../../library/types';
import type { Moment, MomentType } from '../../moments/detect';

export type ListTab = 'all' | 'recent' | 'saved' | 'sentry';
export type Row = { kind: 'day'; label: string } | { kind: 'clip'; timeline: Timeline };

export const ROW_HEIGHT = 88;
export const DAY_HEIGHT = 36;
export const OVERSCAN = 6;

export function filterTimelines(tls: Timeline[], tab: ListTab, chip: ReasonCategory | null): Timeline[] {
  return tls.filter((t) => (tab === 'all' || t.kind === tab) && (!chip || t.event?.category === chip));
}

export function availableChips(tls: Timeline[], tab: ListTab): ReasonCategory[] {
  const present = new Set(filterTimelines(tls, tab, null).flatMap((t) => (t.event ? [t.event.category] : [])));
  return CHIP_ORDER.filter((c) => present.has(c));
}

/** What the list shows for a tab and chip; a chip with no clips in that tab is ignored. */
export function listSelection(tls: Timeline[], tab: ListTab, chip: ReasonCategory | null): Timeline[] {
  const active = chip && availableChips(tls, tab).includes(chip) ? chip : null;
  return filterTimelines(tls, tab, active);
}

/** The clip after `currentId` in the list as filtered, else after it overall (when it isn't in the filter). */
export function nextInList(tls: Timeline[], currentId: string | null, tab: ListTab, chip: ReasonCategory | null): Timeline | null {
  const shown = listSelection(tls, tab, chip);
  const inShown = shown.findIndex((t) => t.id === currentId);
  if (inShown >= 0) return shown[inShown + 1] ?? null;
  const i = tls.findIndex((t) => t.id === currentId);
  return i >= 0 ? (tls[i + 1] ?? null) : null;
}

/** A day heading before each new start day (timelines are already newest first). */
export function buildRows(tls: Timeline[], todayMs: number): Row[] {
  const rows: Row[] = [];
  let last = '';
  for (const t of tls) {
    const label = dayHeading(t.startMs, todayMs);
    if (label !== last) {
      rows.push({ kind: 'day', label });
      last = label;
    }
    rows.push({ kind: 'clip', timeline: t });
  }
  return rows;
}

const BADGE: Record<Exclude<MomentType, 'event'>, [string, string]> = {
  brake: ['hard brake', 'hard brakes'],
  swerve: ['swerve', 'swerves'],
  ap_off: ['self-driving off', 'self-driving off'],
};

export function momentsBadge(moments: Moment[]): string | null {
  const counts = new Map<Exclude<MomentType, 'event'>, number>();
  for (const m of moments) if (m.type !== 'event') counts.set(m.type, (counts.get(m.type) ?? 0) + 1);
  const parts = (['brake', 'swerve', 'ap_off'] as const)
    .filter((t) => counts.has(t))
    .map((t) => {
      const n = counts.get(t)!;
      return `${n} ${BADGE[t][n === 1 ? 0 : 1]}`;
    });
  return parts.length ? parts.join(' · ') : null;
}
