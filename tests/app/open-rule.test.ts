import { describe, expect, mock, test } from 'bun:test';
import { MAX_AUTO_OPEN_CHECKS, pickInitial, type Health } from '../../src/app/open-rule';
import { buildLibrary } from '../../src/library/build-library';
import type { Library, Timeline } from '../../src/library/types';
import { cameraFiles } from '../helpers/sources';

/** n events, newest first in the library. */
function library(n: number): Library {
  const files = Array.from({ length: n }, (_, i) => {
    const stamp = `2026-10-${String(1 + (i % 28)).padStart(2, '0')}_${String(Math.floor(i / 28)).padStart(2, '0')}-00-00`;
    return cameraFiles(`TeslaCam/SavedClips/${stamp}`, stamp, ['front']);
  }).flat();
  return buildLibrary(files);
}

let current: Library;
const byPosition = (health: Health[]) => async (tl: Timeline) => health[current.timelines.indexOf(tl)];

describe('pickInitial', () => {
  test('an empty library is blocked as empty', async () => {
    expect(await pickInitial({ timelines: [], ignored: 0 }, async () => 'ok')).toEqual({ timelineId: null, openList: false, blocked: 'empty' });
  });

  test('skips an encrypted newest event and opens the list', async () => {
    current = library(2);
    const r = await pickInitial(current, byPosition(['encrypted', 'ok']));
    expect(r).toEqual({ timelineId: current.timelines[1].id, openList: true, blocked: null });
  });

  test('a single playable event opens without the list', async () => {
    current = library(1);
    expect(await pickInitial(current, async () => 'ok')).toEqual({ timelineId: current.timelines[0].id, openList: false, blocked: null });
  });

  test('all encrypted is blocked as encrypted', async () => {
    current = library(3);
    expect(await pickInitial(current, async () => 'encrypted')).toEqual({ timelineId: null, openList: false, blocked: 'encrypted' });
  });

  test('all damaged is blocked as damaged', async () => {
    current = library(2);
    expect(await pickInitial(current, async () => 'damaged')).toEqual({ timelineId: null, openList: false, blocked: 'damaged' });
  });

  test(`stops checking after ${MAX_AUTO_OPEN_CHECKS} and opens the newest with the list`, async () => {
    current = library(25);
    const check = mock(async () => 'encrypted' as Health);
    const r = await pickInitial(current, check);
    expect(check).toHaveBeenCalledTimes(MAX_AUTO_OPEN_CHECKS);
    expect(r).toEqual({ timelineId: current.timelines[0].id, openList: true, blocked: null });
  });
});
