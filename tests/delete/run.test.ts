import { describe, expect, test } from 'bun:test';
import { planDelete } from '../../src/delete/plan';
import { askWrite, runDelete, type RunProgress } from '../../src/delete/run';
import type { DeletePlan, RootRef } from '../../src/delete/types';
import { buildLibrary } from '../../src/library/build-library';
import { fakeDir, fakeRoot, locSource, type FakeDir } from '../helpers/fake-dirs';

/** A saved event of `n` front files under `parent`, in `root`. */
function event(stamp: string, root: RootRef, parent: FakeDir, dir = fakeDir(stamp), n = 2): { plan: DeletePlan; dir: FakeDir } {
  const files = Array.from({ length: n }, (_, i) =>
    locSource(`TeslaCam/SavedClips/${stamp}/${stamp.slice(0, 17)}0${i}-front.mp4`, dir, parent, root),
  );
  return { plan: planDelete(buildLibrary(files).timelines[0])!, dir };
}

const never = new AbortController().signal;

describe('runDelete', () => {
  test('runs every step in order and reports progress', async () => {
    const root = fakeRoot('0:E');
    const saved = fakeDir('SavedClips');
    const a = event('2026-10-16_20-10-53', root, saved);
    const progress: RunProgress[] = [];
    const [r] = await runDelete([a.plan], (p) => progress.push(p), never);
    expect(a.dir.removed).toEqual(['2026-10-16_20-10-00-front.mp4', '2026-10-16_20-10-01-front.mp4']);
    expect(saved.removed).toEqual(['2026-10-16_20-10-53']);
    expect(r).toEqual({ timelineId: a.plan.timeline.id, deletedPaths: a.plan.files.map((f) => f.path), failed: [], refused: false });
    expect(progress.at(-1)).toEqual({ event: 1, events: 1, file: 2, files: 2 });
  });

  test('a refused root deletes nothing under it; other roots still go', async () => {
    const ok = fakeRoot('0:E');
    const no = fakeRoot('1:F', false);
    const a = event('2026-10-16_20-10-53', ok, fakeDir('SavedClips'));
    const b = event('2026-10-17_18-12-26', no, fakeDir('SavedClips'));
    const [ra, rb] = await runDelete([a.plan, b.plan], () => undefined, never);
    expect(ra.refused).toBe(false);
    expect(a.dir.removed).toHaveLength(2);
    expect(rb).toEqual({ timelineId: b.plan.timeline.id, deletedPaths: [], failed: [], refused: true });
    expect(b.dir.removed).toEqual([]);
  });

  test('permission is asked once per root, before anything is removed', async () => {
    const root = fakeRoot('0:E');
    const saved = fakeDir('SavedClips');
    const plans = ['2026-10-16_20-10-53', '2026-10-17_18-12-26', '2026-10-18_14-12-00'].map((s) => event(s, root, saved).plan);
    await runDelete(plans, () => undefined, never);
    expect(root.asked).toBe(1);
  });

  test('a file already gone counts as deleted', async () => {
    const root = fakeRoot('0:E');
    const dir = fakeDir('2026-10-16_20-10-53', { goneOn: ['2026-10-16_20-10-00-front.mp4'] });
    const a = event('2026-10-16_20-10-53', root, fakeDir('SavedClips'), dir);
    const [r] = await runDelete([a.plan], () => undefined, never);
    expect(r.deletedPaths).toHaveLength(2);
    expect(r.failed).toEqual([]);
  });

  test('a file that fails is reported and the rest of the event still goes', async () => {
    const root = fakeRoot('0:E');
    const dir = fakeDir('2026-10-16_20-10-53', { failOn: ['2026-10-16_20-10-00-front.mp4'] });
    const saved = fakeDir('SavedClips', { nonEmpty: ['2026-10-16_20-10-53'] });
    const a = event('2026-10-16_20-10-53', root, saved, dir);
    const [r] = await runDelete([a.plan], () => undefined, never);
    expect(r.failed.map((f) => f.path)).toEqual([a.plan.files[0].path]);
    expect(r.deletedPaths).toEqual([a.plan.files[1].path]);
    expect(dir.removed).toEqual(['2026-10-16_20-10-01-front.mp4']);
  });

  test('a file in use for a moment is tried once more', async () => {
    const root = fakeRoot('0:E');
    const dir = fakeDir('2026-10-16_20-10-53', { busyOnce: ['2026-10-16_20-10-00-front.mp4'] });
    const a = event('2026-10-16_20-10-53', root, fakeDir('SavedClips'), dir);
    const [r] = await runDelete([a.plan], () => undefined, never);
    expect(r.failed).toEqual([]);
    expect(dir.removed).toHaveLength(2);
  });

  test('roots already granted are not asked again', async () => {
    const root = fakeRoot('0:E');
    const a = event('2026-10-16_20-10-53', root, fakeDir('SavedClips'));
    const granted = await askWrite([a.plan]);
    await runDelete([a.plan], () => undefined, never, granted);
    expect(root.asked).toBe(1);
    expect(a.dir.removed).toHaveLength(2);
  });

  test('a folder that is not empty is left without counting as a failure', async () => {
    const root = fakeRoot('0:E');
    const saved = fakeDir('SavedClips', { nonEmpty: ['2026-10-16_20-10-53'] });
    const [r] = await runDelete([event('2026-10-16_20-10-53', root, saved).plan], () => undefined, never);
    expect(r.failed).toEqual([]);
    expect(saved.removed).toEqual([]);
  });

  test('stopping finishes the event in progress and starts no other', async () => {
    const root = fakeRoot('0:E');
    const saved = fakeDir('SavedClips');
    const a = event('2026-10-16_20-10-53', root, saved);
    const b = event('2026-10-17_18-12-26', root, saved);
    const ac = new AbortController();
    const results = await runDelete([a.plan, b.plan], (p) => p.file === 1 && ac.abort(), ac.signal);
    expect(a.dir.removed).toHaveLength(2);
    expect(b.dir.removed).toEqual([]);
    expect(results.map((r) => r.timelineId)).toEqual([a.plan.timeline.id]);
  });
});
