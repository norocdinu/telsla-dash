import { describe, expect, test } from 'bun:test';
import { measurePlan, planDelete, pruneTimeline, removeTimelines } from '../../src/delete/plan';
import { buildLibrary } from '../../src/library/build-library';
import type { SourceFile } from '../../src/library/types';
import { fakeDir, fakeRoot, locSource } from '../helpers/fake-dirs';
import { fakeSource } from '../helpers/sources';

const EV = '2026-10-16_20-10-53';

function savedEvent(parent = fakeDir('SavedClips')) {
  const root = fakeRoot('0:E');
  const dir = fakeDir(EV);
  const folder = `TeslaCam/SavedClips/${EV}`;
  const files: SourceFile[] = [];
  for (const stamp of ['2026-10-16_20-05-14', '2026-10-16_20-06-10']) {
    for (const cam of ['front', 'back']) files.push(locSource(`${folder}/${stamp}-${cam}.mp4`, dir, parent, root, 100));
  }
  files.push(locSource(`${folder}/event.json`, dir, parent, root, 7), locSource(`${folder}/thumb.png`, dir, parent, root, 3));
  return { tl: buildLibrary(files).timelines[0], dir, parent, root };
}

describe('planDelete', () => {
  test('a saved event: every file, then the emptied folder', () => {
    const { tl, dir, parent } = savedEvent();
    const plan = planDelete(tl)!;
    expect(plan.steps.slice(0, 6).every((s) => s.kind === 'file' && s.dir === dir)).toBe(true);
    expect(plan.steps.slice(0, 6).map((s) => s.name)).toEqual([
      '2026-10-16_20-05-14-front.mp4',
      '2026-10-16_20-05-14-back.mp4',
      '2026-10-16_20-06-10-front.mp4',
      '2026-10-16_20-06-10-back.mp4',
      'event.json',
      'thumb.png',
    ]);
    expect(plan.steps[6]).toEqual({ kind: 'folder', dir: parent, name: EV });
    expect(plan.steps).toHaveLength(7);
    expect(plan.files).toHaveLength(6);
    expect(plan.roots).toHaveLength(1);
  });

  test('a lone event folder: files only, the folder stays', () => {
    const root = fakeRoot('0:ev');
    const dir = fakeDir(EV);
    const tl = buildLibrary([locSource(`${EV}/2026-10-16_20-05-14-front.mp4`, dir, null, root)]).timelines[0];
    const plan = planDelete(tl)!;
    expect(plan.steps.map((s) => s.kind)).toEqual(['file']);
  });

  test('a recent drive: its files only', () => {
    const root = fakeRoot('0:E');
    const recent = fakeDir('RecentClips');
    const tl = buildLibrary(
      ['10-00-00', '10-01-00'].map((s) => locSource(`TeslaCam/RecentClips/2026-10-19_${s}-front.mp4`, recent, fakeDir('TeslaCam'), root)),
    ).timelines[0];
    const plan = planDelete(tl)!;
    expect(plan.steps.map((s) => `${s.kind}:${s.name}`)).toEqual(['file:2026-10-19_10-00-00-front.mp4', 'file:2026-10-19_10-01-00-front.mp4']);
  });

  test('nothing can be planned when a file has no location', () => {
    const root = fakeRoot('0:E');
    const dir = fakeDir(EV);
    const tl = buildLibrary([
      locSource(`SavedClips/${EV}/2026-10-16_20-05-14-front.mp4`, dir, null, root),
      fakeSource(`SavedClips/${EV}/2026-10-16_20-05-14-back.mp4`),
    ]).timelines[0];
    expect(planDelete(tl)).toBeNull();
  });

  test('nothing can be planned when the files come from two opened folders', () => {
    // E.g. the drive and a backup of it, opened together: deleting must never reach into the backup.
    const dir = fakeDir(EV);
    const parent = fakeDir('SavedClips');
    const tl = buildLibrary([
      locSource(`TeslaCam/SavedClips/${EV}/2026-10-16_20-05-14-front.mp4`, dir, parent, fakeRoot('0:E')),
      locSource(`TeslaCam/SavedClips/${EV}/2026-10-16_20-05-14-back.mp4`, dir, parent, fakeRoot('1:Backup')),
    ]).timelines[0];
    expect(planDelete(tl)).toBeNull();
  });
});

describe('measurePlan', () => {
  test('counts files and adds up their sizes', async () => {
    expect(await measurePlan(planDelete(savedEvent().tl)!)).toEqual({ files: 6, bytes: 410 });
  });

  test('uses sizes already known instead of opening the files', async () => {
    const plan = planDelete(savedEvent().tl)!;
    for (const f of plan.files) {
      f.size = 1000;
      f.getFile = () => Promise.reject(new Error('should not open'));
    }
    expect(await measurePlan(plan)).toEqual({ files: 6, bytes: 6000 });
  });

  test('a file already gone (deleted in Explorer) is left out of the count', async () => {
    const plan = planDelete(savedEvent().tl)!;
    plan.files[0].size = null;
    plan.files[0].getFile = () => Promise.reject(new DOMException('gone', 'NotFoundError'));
    expect(await measurePlan(plan)).toEqual({ files: 5, bytes: 310 });
  });
});

describe('pruning after a delete', () => {
  test('a timeline with every camera file deleted is gone', () => {
    const { tl } = savedEvent();
    const all = new Set(tl.segments.flatMap((s) => Object.values(s.files).map((f) => f!.path)));
    expect(pruneTimeline(tl, all)).toBeNull();
  });

  test('a partly deleted timeline keeps what is still there', () => {
    const { tl } = savedEvent();
    const first = new Set(Object.values(tl.segments[0].files).map((f) => f!.path));
    const pruned = pruneTimeline(tl, first)!;
    expect(pruned.segments).toHaveLength(1);
    expect(pruned.startMs).toBe(tl.segments[1].wallMs);
    expect(pruned.cameras).toEqual(['front', 'back']);
  });

  test('removeTimelines drops emptied timelines and keeps the rest in order', () => {
    const a = savedEvent();
    const b = buildLibrary([fakeSource('TeslaCam/RecentClips/2026-10-19_10-00-00-front.mp4')]).timelines[0];
    const lib = { timelines: [b, a.tl], ignored: 0 };
    const deleted = a.tl.segments.flatMap((s) => Object.values(s.files).map((f) => f!.path));
    const next = removeTimelines(lib, [{ timelineId: a.tl.id, deletedPaths: deleted, failed: [], refused: false }]);
    expect(next.timelines.map((t) => t.id)).toEqual([b.id]);
  });
});
