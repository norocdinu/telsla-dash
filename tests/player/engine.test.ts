import { beforeEach, describe, expect, test } from 'bun:test';
import type { CameraId } from '../../src/library/types';
import { PlaybackEngine, type SlotStatus } from '../../src/player/engine';
import { FakeVideo, installFakeMedia, media } from '../helpers/fake-video';
import { flush, T, timeline } from '../helpers/engine-timelines';

installFakeMedia();

function setup(cameras: CameraId[]) {
  const slots: Partial<Record<CameraId, SlotStatus[]>> = {};
  let frame = { index: -1, offsetS: 0 };
  let playing = false;
  const engine = new PlaybackEngine({
    onFrame: (p) => (frame = p),
    onState: (s) => (playing = s.playing),
    onDuration: () => undefined,
    onSlot: (c, s) => (slots[c] ??= []).push(s),
  });
  const videos: Partial<Record<CameraId, [FakeVideo, FakeVideo]>> = {};
  for (const c of cameras) {
    const pair: [FakeVideo, FakeVideo] = [new FakeVideo(), new FakeVideo()];
    videos[c] = pair;
    engine.attachSlot(c, pair[0] as unknown as HTMLVideoElement, pair[1] as unknown as HTMLVideoElement);
  }
  const all = () => Object.values(videos).flat() as FakeVideo[];
  const active = (c: CameraId) => videos[c]!.find((v) => v.classList.contains('is-active'))!;
  /** Plays `seconds` of wall time in 0.5 s steps. */
  const run = async (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.5) {
      all().forEach((v) => v.advance(0.5));
      await flush(5);
    }
  };
  return { engine, slots, videos, active, run, frame: () => frame, playing: () => playing };
}

describe('PlaybackEngine', () => {
  beforeEach(() => media.clear());

  test('a damaged file reached through preload is reported and skipped', async () => {
    const h = setup(['front']);
    h.engine.load(timeline('a', [{ front: 'ok' }, { front: 'damaged' }, { front: 'ok' }]), {});
    h.engine.setVisible(['front'], 'front');
    await flush();
    h.engine.seek(T + 57_000);
    await flush();
    h.engine.play();
    await h.run(6);
    await flush();
    expect(h.slots.front).toContain('damaged');
    expect(h.frame().index).toBe(2);
    expect(h.playing()).toBe(true);
  });

  test('an encrypted file reached through preload is reported and skipped', async () => {
    const h = setup(['front']);
    h.engine.load(timeline('a', [{ front: 'ok' }, { front: 'encrypted' }, { front: 'ok' }]), {});
    h.engine.setVisible(['front'], 'front');
    await flush();
    h.engine.seek(T + 57_000);
    await flush();
    h.engine.play();
    await h.run(6);
    await flush();
    expect(h.slots.front).toContain('encrypted');
    expect(h.frame().index).toBe(2);
  });

  test('in a grid, the other cameras keep playing when the main camera fails at a boundary', async () => {
    const h = setup(['front', 'back']);
    h.engine.load(timeline('a', [{ front: 'ok', back: 'ok' }, { front: 'damaged', back: 'ok' }]), {});
    h.engine.setVisible(['front', 'back'], 'front');
    await flush();
    h.engine.seek(T + 57_000);
    await flush();
    h.engine.play();
    await h.run(6);
    await new Promise((r) => setTimeout(r, 1100)); // two sync ticks
    await h.run(1);
    expect(h.slots.front).toContain('damaged');
    expect(h.frame().index).toBe(1);
    expect(h.active('back').currentTime).toBeGreaterThan(2);
  });

  test('a camera recovers on the next segment after a failed one', async () => {
    const h = setup(['front', 'back']);
    h.engine.load(timeline('a', [{ front: 'ok', back: 'damaged' }, { front: 'ok', back: 'ok' }]), {});
    h.engine.setVisible(['front', 'back'], 'front');
    await flush();
    expect(h.slots.back).toContain('damaged');
    h.engine.seek(T + 57_000);
    await flush();
    h.engine.play();
    await h.run(6);
    expect(h.frame().index).toBe(1);
    expect(h.slots.back!.at(-1)).toBe('ok');
    expect(h.active('back').paused).toBe(false);
    expect(h.active('back').currentTime).toBeGreaterThan(0);
  });

  test('Play moves past a segment where the shown camera has no file', async () => {
    const h = setup(['front', 'back']);
    h.engine.load(timeline('a', [{ back: 'ok' }, { front: 'ok', back: 'ok' }]), {});
    h.engine.setVisible(['front'], 'front');
    await flush();
    expect(h.slots.front).toContain('missing');
    h.engine.play();
    await h.run(1);
    expect(h.frame().index).toBe(1);
    expect(h.active('front').paused).toBe(false);
  });

  test('the playback speed is kept across segments', async () => {
    const h = setup(['front']);
    h.engine.load(timeline('a', [{ front: 'ok' }, { front: 'ok' }]), {});
    h.engine.setVisible(['front'], 'front');
    await flush();
    h.engine.cycleRate(); // 1x → 2x
    h.engine.seek(T + 57_000);
    await flush();
    h.engine.play();
    await h.run(3);
    expect(h.frame().index).toBe(1);
    expect(h.active('front').playbackRate).toBe(2);
  });

  test('lengths measured after loading are used for seeking', async () => {
    const h = setup(['front']);
    const tl = timeline('a', [{ front: 'ok' }, { front: 'ok' }]);
    h.engine.load(tl, {});
    h.engine.setVisible(['front'], 'front');
    await flush();
    h.engine.setDurations({ [tl.segments[1].key]: 1.6 });
    h.engine.seek(T + 300_000); // far past the end
    expect(h.frame().index).toBe(1);
    expect(h.frame().offsetS).toBeCloseTo(1.6, 6);
  });

  test('release lets go of every file, and a later load plays again', async () => {
    const h = setup(['front', 'back']);
    h.engine.load(timeline('a', [{ front: 'ok', back: 'ok' }, { front: 'ok', back: 'ok' }]), {});
    h.engine.setVisible(['front', 'back'], 'front');
    await flush();
    h.engine.seek(T + 57_000);
    await flush();
    h.engine.play();
    await h.run(1);
    h.engine.release();
    const all = [...h.videos.front!, ...h.videos.back!];
    expect(all.every((v) => v.src === '' && v.paused)).toBe(true);
    h.engine.load(timeline('b', [{ front: 'ok' }]), {});
    await flush();
    h.engine.play();
    await h.run(1);
    expect(h.active('front').paused).toBe(false);
  });

  test('videoSize reports the active element of a camera, once known', async () => {
    const h = setup(['front']);
    h.engine.load(timeline('a', [{ front: 'ok' }]), {});
    h.engine.setVisible(['front'], 'front');
    await flush();
    expect(h.engine.videoSize('front')).toBeNull();
    Object.assign(h.active('front'), { videoWidth: 2896, videoHeight: 1876 });
    expect(h.engine.videoSize('front')).toEqual({ width: 2896, height: 1876 });
    expect(h.engine.videoSize('back')).toBeNull();
  });

  test('loading another timeline reports a missing camera again', async () => {
    const h = setup(['front', 'back']);
    h.engine.setVisible(['front', 'back'], 'front');
    h.engine.load(timeline('a', [{ front: 'ok' }]), {});
    await flush();
    expect(h.slots.back).toEqual(['missing']);
    h.engine.load(timeline('b', [{ front: 'ok' }]), {});
    await flush();
    expect(h.slots.back!.filter((s) => s === 'missing')).toHaveLength(2);
  });
});
