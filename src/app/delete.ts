// Deleting events and drives: let go of their files, run the confirmed plan, update the library, move on.
import { planDelete, removeTimelines } from '../delete/plan';
import { askWrite, runDelete, type RunProgress } from '../delete/run';
import type { DeletePlan, DeleteResult } from '../delete/types';
import type { Timeline } from '../library/types';
import { telemetryIdle } from '../sei/telemetry-client';
import { nextInList } from '../ui/list/list-model';
import { forgetThumbs } from '../ui/thumbs';
import { openTimeline, reloadCurrent, stopCurrent } from './playback';
import { appStore, telemetryCache, type AppState } from './state';

export type DeleteOrigin = 'player' | 'list' | 'manage';

/** How long to wait for a driving-data read or thumbnail capture in progress to finish before deleting anyway. */
const READ_SETTLE_MS = 5000;

/** Plans for the ids that can be deleted (every file reachable for deleting). */
export function plansFor(ids: string[], s: AppState = appStore.get()): DeletePlan[] {
  const tls = s.library?.timelines ?? [];
  return ids
    .map((id) => tls.find((t) => t.id === id))
    .map((tl) => (tl ? planDelete(tl) : null))
    .filter((p): p is DeletePlan => p !== null);
}

/** The next clip in the list as filtered, skipping the ones being deleted. */
function nextAfter(s: AppState, deleting: Set<string>): Timeline | null {
  const tls = s.library?.timelines ?? [];
  let current = s.timelineId;
  for (;;) {
    const next = nextInList(tls, current, s.listTab, s.listChip);
    if (!next || !deleting.has(next.id)) return next;
    current = next.id;
  }
}

function without<T>(record: Record<string, T>, ids: Set<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => !ids.has(k)));
}

/**
 * Deletes these timelines (already confirmed by the user). Permission comes first, while the click on Delete
 * still counts. If the one being watched is among those allowed, playback lets go of its files, and afterwards
 * the next clip in the filter plays.
 */
export async function deleteTimelines(
  ids: string[],
  origin: DeleteOrigin,
  onProgress: (p: RunProgress) => void,
  signal: AbortSignal,
): Promise<DeleteResult[]> {
  const plans = plansFor(ids);
  if (!plans.length) return [];
  // Browsers show the permission prompt only shortly after a click: nothing may wait before it.
  const granted = await askWrite(plans);
  const allowed = plans.filter((p) => p.roots.every((r) => granted.get(r.id)));
  const before = appStore.get();
  const deleting = new Set(allowed.map((p) => p.timeline.id));
  const currentId = before.timelineId;
  const watching = currentId !== null && deleting.has(currentId);
  const next = watching ? nextAfter(before, deleting) : null;

  // Windows won't delete a file that is still open: stop playback, cancel or wait out thumbnail captures and,
  // for the clip being watched, any driving-data read.
  if (watching) stopCurrent();
  const paths = allowed.flatMap((p) => p.files.map((f) => f.path));
  const settled = Promise.all([forgetThumbs(paths), watching ? telemetryIdle() : null]);
  await Promise.race([settled, new Promise((r) => setTimeout(r, READ_SETTLE_MS))]);
  telemetryCache.forget(paths);

  let results: DeleteResult[];
  try {
    results = await runDelete(plans, onProgress, signal, granted);
  } catch (e) {
    if (watching) reloadCurrent();
    throw e;
  }

  const s = appStore.get();
  const library = removeTimelines(s.library ?? { timelines: [], ignored: 0 }, results);
  const kept = new Set(library.timelines.map((t) => t.id));
  const gone = new Set([...deleting].filter((id) => !kept.has(id)));
  const tidy = { moments: without(s.moments, gone), route: without(s.route, gone), health: without(s.health, gone) };

  if (!library.timelines.length) {
    appStore.set({ ...tidy, library: null, timelineId: null, listOpen: false });
  } else if (!watching) {
    appStore.set({ ...tidy, library });
  } else if (currentId !== null && kept.has(currentId)) {
    // Only partly deleted (or stopped before its turn): load what is left of it.
    appStore.set({ ...tidy, library });
    reloadCurrent();
  } else if (next && kept.has(next.id)) {
    appStore.set({ ...tidy, library });
    openTimeline(next.id, undefined, true);
    appStore.set({ listOpen: origin === 'list' });
  } else {
    appStore.set({ ...tidy, library, timelineId: null, listOpen: true });
  }
  return results;
}
