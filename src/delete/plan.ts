import { CAMERA_ORDER, type Library, type Segment, type SourceFile, type Timeline } from '../library/types';
import type { DeletePlan, DeleteResult, DeleteStep, RootRef } from './types';

const MEASURE_PARALLEL = 8;

function timelineFiles(tl: Timeline): SourceFile[] {
  const files: SourceFile[] = [];
  for (const seg of tl.segments) {
    for (const cam of CAMERA_ORDER) {
      const f = seg.files[cam];
      if (f) files.push(f);
    }
  }
  if (tl.eventJson) files.push(tl.eventJson);
  if (tl.thumb) files.push(tl.thumb);
  return files;
}

/**
 * The removals for deleting a timeline: every file it knows, then (for an event folder whose parent the app
 * can reach) the folder itself, which only goes if it is then empty. Null when any file can't be deleted, or
 * when its files come from more than one opened folder (a drive and a backup of it, opened together).
 */
export function planDelete(tl: Timeline): DeletePlan | null {
  const files = timelineFiles(tl);
  if (!files.length || files.some((f) => !f.loc)) return null;
  const steps: DeleteStep[] = files.map((f) => ({ kind: 'file', dir: f.loc!.dir, name: f.name, path: f.path }));
  const roots: RootRef[] = [];
  for (const f of files) if (!roots.some((r) => r.id === f.loc!.root.id)) roots.push(f.loc!.root);
  if (roots.length > 1) return null;
  const first = files[0].loc!;
  const oneFolder = files.every((f) => f.loc!.dir === first.dir && f.loc!.parent === first.parent);
  if (tl.kind !== 'recent' && oneFolder && first.parent) {
    steps.push({ kind: 'folder', dir: first.parent, name: first.dir.name });
  }
  return { timeline: tl, steps, files, roots };
}

/** The files a plan will remove and their size. A file already gone (deleted in Explorer) isn't counted: deleting skips it too. */
export async function measurePlan(plan: DeletePlan): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const queue = [...plan.files];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      // A size known from listing saves opening the file. (Not `bytes += await …`: that reads `bytes` before waiting.)
      let size: number;
      try {
        size = f.size ?? (await f.getFile()).size;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'NotFoundError') continue;
        throw e;
      }
      bytes += size;
      files++;
    }
  };
  await Promise.all(Array.from({ length: MEASURE_PARALLEL }, worker));
  return { files, bytes };
}

/** The timeline without the deleted files; null when no camera file is left. */
export function pruneTimeline(tl: Timeline, deletedPaths: Set<string>): Timeline | null {
  const segments: Segment[] = [];
  for (const seg of tl.segments) {
    const files: Segment['files'] = {};
    for (const cam of CAMERA_ORDER) {
      const f = seg.files[cam];
      if (f && !deletedPaths.has(f.path)) files[cam] = f;
    }
    if (Object.keys(files).length) segments.push({ ...seg, files });
  }
  if (!segments.length) return null;
  const present = new Set(segments.flatMap((s) => Object.keys(s.files)));
  return {
    ...tl,
    segments,
    startMs: segments[0].wallMs,
    cameras: CAMERA_ORDER.filter((c) => present.has(c)),
    eventJson: tl.eventJson && !deletedPaths.has(tl.eventJson.path) ? tl.eventJson : null,
    thumb: tl.thumb && !deletedPaths.has(tl.thumb.path) ? tl.thumb : null,
  };
}

export function removeTimelines(lib: Library, results: DeleteResult[]): Library {
  const byId = new Map(results.map((r) => [r.timelineId, r]));
  const timelines: Timeline[] = [];
  for (const tl of lib.timelines) {
    const r = byId.get(tl.id);
    if (!r) {
      timelines.push(tl);
      continue;
    }
    const pruned = pruneTimeline(tl, new Set(r.deletedPaths));
    if (pruned) timelines.push(pruned);
  }
  return { ...lib, timelines };
}
