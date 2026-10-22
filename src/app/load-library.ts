import { attachEvents, buildLibrary } from '../library/build-library';
import type { SourceFile, Timeline } from '../library/types';
import { segmentSource } from '../sei/scan';
import { readHealth } from '../sei/telemetry-client';
import { collectSources, type EntryNode } from '../sources/collect';
import { pickInitial, type Health } from './open-rule';
import { LIST_FAILED } from './messages';
import { appStore, telemetryCache } from './state';

let generation = 0;

/** Checks a timeline's first file (64 KB) and remembers the answer. */
export async function checkTimeline(tl: Timeline): Promise<Health> {
  const known = appStore.get().health[tl.id];
  if (known) return known;
  const f = segmentSource(tl.segments[0]);
  let h: Health = 'damaged';
  if (f) {
    try {
      const r = await readHealth(f);
      h = r === 'mp4' ? 'ok' : r;
    } catch {
      h = 'damaged';
    }
  }
  appStore.set((s) => ({ health: { ...s.health, [tl.id]: h } }));
  return h;
}

function begin(): number {
  appStore.set({ loading: true, blocked: null, notice: null });
  // Paths are relative to the drop, so a re-copied folder must not inherit old results.
  telemetryCache.clear();
  return ++generation;
}

function fail(gen: number, err: unknown): void {
  console.warn('Could not read the dropped folder', err);
  if (gen !== generation) return;
  appStore.set({ loading: false, library: null, timelineId: null, listOpen: false, notice: LIST_FAILED });
}

async function finish(gen: number, files: SourceFile[], startedAt: number): Promise<void> {
  const library = buildLibrary(files);
  console.info(`Listed ${files.length} files in ${Math.round(performance.now() - startedAt)} ms`);
  if (gen !== generation) return;
  appStore.set({
    library,
    loading: false,
    timelineId: null,
    listTab: 'all',
    listChip: null,
    listOpen: false,
    health: {},
    moments: {},
    route: {},
    charts: {},
    durations: {},
    slots: {},
  });

  const read = async (f: SourceFile) => (await f.getFile()).text();
  // Events first: reading them can turn a lone event folder into a Sentry event and change its id.
  await attachEvents(library, read);
  if (gen !== generation) return;
  const pick = await pickInitial(library, checkTimeline);
  if (gen !== generation) return;
  appStore.set({
    library: { ...library, timelines: [...library.timelines] },
    timelineId: pick.timelineId,
    listOpen: pick.openList,
    blocked: pick.blocked,
  });
}

export async function loadFromNodes(nodes: EntryNode[]): Promise<void> {
  const startedAt = performance.now();
  const gen = begin();
  try {
    const files = await collectSources(nodes);
    await finish(gen, files, startedAt);
  } catch (err) {
    fail(gen, err);
  }
}

export async function loadFromSources(files: SourceFile[]): Promise<void> {
  const startedAt = performance.now();
  const gen = begin();
  try {
    await finish(gen, files, startedAt);
  } catch (err) {
    fail(gen, err);
  }
}

export function showNotice(notice: string): void {
  appStore.set({ notice });
}
