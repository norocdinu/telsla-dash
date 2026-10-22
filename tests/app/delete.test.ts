import { beforeEach, describe, expect, test } from 'bun:test';
import { deleteTimelines } from '../../src/app/delete';
import { engine, openTimeline } from '../../src/app/playback';
import { appStore, currentTimeline, playStore } from '../../src/app/state';
import { buildLibrary } from '../../src/library/build-library';
import { reasonInfo } from '../../src/library/event-json';
import type { Timeline } from '../../src/library/types';
import { flush } from '../helpers/engine-timelines';
import type { RootRef } from '../../src/delete/types';
import { fakeDir, fakeRoot, locSource } from '../helpers/fake-dirs';
import { FakeVideo, installFakeMedia } from '../helpers/fake-video';

installFakeMedia();

const log: string[] = [];
const front: [FakeVideo, FakeVideo] = [new FakeVideo(), new FakeVideo()];
for (const v of front) {
  const remove = v.removeAttribute.bind(v);
  v.removeAttribute = (name: string) => {
    if (name === 'src' && v.src) log.push('video-unload');
    remove(name);
  };
}
engine.attachSlot('front', front[0] as unknown as HTMLVideoElement, front[1] as unknown as HTMLVideoElement);
engine.setVisible(['front'], 'front');

/** Logs 'ask' when edit permission is asked for. */
const root: RootRef = {
  id: '0:E',
  async requestWrite() {
    log.push('ask');
    return true;
  },
};

/** A deletable event: two front files in its own folder under SavedClips/SentryClips. */
function event(kind: 'SavedClips' | 'SentryClips', stamp: string, reason: string, failOn: string[] = [], at: RootRef = root): Timeline {
  const parent = fakeDir(kind, { log });
  const dir = fakeDir(stamp, { log, failOn });
  const files = ['00', '01'].map((m) => locSource(`TeslaCam/${kind}/${stamp}/${stamp.slice(0, 14)}${m}-00-front.mp4`, dir, parent, at));
  const tl = buildLibrary(files).timelines[0];
  tl.event = { wallMs: null, city: null, street: null, lat: null, lon: null, reason, ...reasonInfo(reason) };
  return tl;
}

let h1: Timeline, s1: Timeline, h2: Timeline;
const never = new AbortController().signal;

beforeEach(async () => {
  h1 = event('SavedClips', '2026-10-21_10-00-00', 'user_interaction_honk');
  s1 = event('SentryClips', '2026-10-20_10-00-00', 'sentry_aware_object_detection');
  h2 = event('SavedClips', '2026-10-19_10-00-00', 'user_interaction_honk');
  appStore.set({ library: { timelines: [h1, s1, h2], ignored: 0 }, listTab: 'saved', listChip: 'honk', listOpen: false });
  openTimeline(h1.id, undefined, true);
  await flush();
  log.length = 0; // only what the delete does
});

describe('deleteTimelines', () => {
  test('deleting the clip being watched plays the next one in the filter', async () => {
    await deleteTimelines([h1.id], 'player', () => undefined, never);
    await flush();
    const s = appStore.get();
    expect(s.library?.timelines.map((t) => t.id)).toEqual([s1.id, h2.id]);
    expect(currentTimeline()?.id).toBe(h2.id);
    expect(playStore.get().playing).toBe(true);
    expect(s.listOpen).toBe(false);
  });

  test('from the clip list, the list stays open', async () => {
    appStore.set({ listOpen: true });
    await deleteTimelines([h1.id], 'list', () => undefined, never);
    await flush();
    expect(currentTimeline()?.id).toBe(h2.id);
    expect(appStore.get().listOpen).toBe(true);
  });

  test('the playing video lets go of its file before anything is removed', async () => {
    await deleteTimelines([h1.id], 'player', () => undefined, never);
    const firstRemoval = log.findIndex((l) => l.startsWith('2026-10-21'));
    expect(log.indexOf('video-unload')).toBeGreaterThanOrEqual(0);
    expect(log.indexOf('video-unload')).toBeLessThan(firstRemoval);
  });

  test('permission is asked before playback lets go of the files', async () => {
    // The browser shows its prompt only shortly after the click on Delete: nothing may come before it.
    await deleteTimelines([h1.id], 'player', () => undefined, never);
    expect(log[0]).toBe('ask');
    expect(log.indexOf('video-unload')).toBeGreaterThan(0);
  });

  test('when permission is refused, the clip being watched keeps playing', async () => {
    const mine = event('SavedClips', '2026-10-22_10-00-00', 'user_interaction_honk', [], fakeRoot('1:F', false));
    appStore.set({ library: { timelines: [mine, h1, s1, h2], ignored: 0 } });
    openTimeline(mine.id, undefined, true);
    await flush();
    log.length = 0;
    const [r] = await deleteTimelines([mine.id], 'player', () => undefined, never);
    await flush();
    expect(r.refused).toBe(true);
    expect(log.includes('video-unload')).toBe(false);
    expect(currentTimeline()?.id).toBe(mine.id);
    expect(playStore.get().playing).toBe(true);
  });

  test('an app change while deleting never reopens the clip being deleted', async () => {
    const mine = event('SavedClips', '2026-10-22_10-00-00', 'user_interaction_honk');
    const dir = mine.segments[0].files.front!.loc!.dir;
    const remove = dir.removeEntry.bind(dir);
    const reopened: boolean[] = [];
    dir.removeEntry = async (name: string) => {
      appStore.set((s) => ({ health: { ...s.health, [s1.id]: 'ok' } })); // e.g. a clip-list check finishing
      await flush();
      reopened.push(Boolean(front[0].src || front[1].src));
      await remove(name);
    };
    appStore.set({ library: { timelines: [mine, h1, s1, h2], ignored: 0 } });
    openTimeline(mine.id, undefined, true);
    await flush();
    await deleteTimelines([mine.id], 'player', () => undefined, never);
    expect(reopened).toEqual([false, false]);
  });

  test('a clip being watched that could not be fully deleted loads again with what is left', async () => {
    const stuck = event('SavedClips', '2026-10-22_10-00-00', 'user_interaction_honk', ['2026-10-22_10-00-00-front.mp4']);
    appStore.set({ library: { timelines: [stuck, h1, s1, h2], ignored: 0 } });
    openTimeline(stuck.id, undefined, true);
    await flush();
    await deleteTimelines([stuck.id], 'player', () => undefined, never);
    await flush();
    expect(currentTimeline()?.segments).toHaveLength(1);
    expect(front[0].src || front[1].src).toContain('2026-10-22_10-00-00-front.mp4');
  });

  test('deleting everything shows the landing screen', async () => {
    await deleteTimelines([h1.id, s1.id, h2.id], 'manage', () => undefined, never);
    expect(appStore.get().library).toBeNull();
  });

  test('a clip that could not be fully deleted stays, with only what is left', async () => {
    const stuck = event('SavedClips', '2026-10-18_10-00-00', 'user_interaction_honk', ['2026-10-18_10-00-00-front.mp4']);
    appStore.set({ library: { timelines: [h1, s1, h2, stuck], ignored: 0 } });
    const [r] = await deleteTimelines([stuck.id], 'list', () => undefined, never);
    expect(r.failed).toHaveLength(1);
    const left = appStore.get().library!.timelines.find((t) => t.id === stuck.id)!;
    expect(left.segments).toHaveLength(1);
  });

  test('deleting a clip that is not being watched leaves playback alone', async () => {
    await deleteTimelines([s1.id], 'list', () => undefined, never);
    await flush();
    expect(currentTimeline()?.id).toBe(h1.id);
    expect(log.includes('video-unload')).toBe(false);
  });
});
