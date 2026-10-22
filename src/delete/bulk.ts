import { parseWallStamp } from '../library/time';
import type { ReasonCategory, Timeline } from '../library/types';
import { listSelection, type ListTab } from '../ui/list/list-model';

/** '2026-09-01' → wall ms at midnight starting that day (the car's clock); null for anything else. */
export function dayStartMs(isoDate: string): number | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? parseWallStamp(`${isoDate}_00-00-00`) : null;
}

/** Events for a clear-out: the list's tab and reason filters, plus "started before" a wall-clock time. */
export function bulkMatches(tls: Timeline[], tab: ListTab, chip: ReasonCategory | null, olderThanMs: number | null): Timeline[] {
  const shown = listSelection(tls, tab, chip);
  return olderThanMs === null ? shown : shown.filter((t) => t.startMs < olderThanMs);
}

const GB = 1024 ** 3;

/** Sizes the way Windows Explorer shows them (1 GB = 1024³ bytes); anything not empty shows at least 0.1 GB. */
export function formatGB(bytes: number): string {
  const gb = bytes / GB;
  return `${(bytes > 0 && gb < 0.1 ? 0.1 : gb).toFixed(1)} GB`;
}

/** The events ticked for deleting: deletable, not unticked, and counted (one that couldn't be counted can't be selected). */
export function selectedIds(matches: Timeline[], deletable: Set<string>, unticked: Set<string>, unreadable: Set<string>): string[] {
  return matches.filter((t) => deletable.has(t.id) && !unticked.has(t.id) && !unreadable.has(t.id)).map((t) => t.id);
}

export function selectionTotal(sizes: Map<string, number>, ids: string[]): { events: number; bytes: number; pending: number } {
  let bytes = 0;
  let pending = 0;
  for (const id of ids) {
    const s = sizes.get(id);
    if (s === undefined) pending++;
    else bytes += s;
  }
  return { events: ids.length, bytes, pending };
}
