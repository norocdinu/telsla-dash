import { describe, expect, test } from 'bun:test';
import { buildLibrary } from '../../src/library/build-library';
import type { SourceFile } from '../../src/library/types';
import { TelemetryLoadError } from '../../src/sei/errors';
import { scanLoader, scanOrder, scanTimeline, segmentSource } from '../../src/sei/scan';
import { TelemetryCache } from '../../src/sei/telemetry-cache';
import { cameraFiles, fakeSource } from '../helpers/sources';
import { makeTrack } from '../helpers/track-builder';

const FOLDER = 'TeslaCam/SavedClips/2026-10-16_20-10-53';
const stamps = ['20-05-14', '20-06-10', '20-07-11', '20-08-13', '20-09-14'].map((s) => `2026-10-16_${s}`);
const timeline = () => buildLibrary(stamps.flatMap((s) => cameraFiles(FOLDER, s, ['front', 'back']))).timelines[0];

describe('scanOrder', () => {
  test('forward from the start, then backwards', () => {
    expect(scanOrder(5, 2)).toEqual([2, 3, 4, 1, 0]);
    expect(scanOrder(3, 0)).toEqual([0, 1, 2]);
  });
});

describe('segmentSource', () => {
  test('prefers the front camera, else the first present', () => {
    const tl = buildLibrary([...cameraFiles(FOLDER, stamps[0], ['back', 'left_repeater'])]).timelines[0];
    expect(segmentSource(tl.segments[0])?.name).toContain('-back.mp4');
    expect(segmentSource(timeline().segments[0])?.name).toContain('-front.mp4');
  });
});

describe('scanLoader', () => {
  test('scanning a long drive leaves the clip being watched in the cache', async () => {
    const cache = new TelemetryCache(async () => makeTrack(3, 36), 2);
    const watched = fakeSource('watched.mp4');
    await cache.get(watched);
    const raw: string[] = [];
    const load = scanLoader(cache, async (f: SourceFile) => {
      raw.push(f.name);
      return makeTrack(3, 36);
    });
    await load(watched);
    for (let i = 0; i < 5; i++) await load(fakeSource(`other-${i}.mp4`));
    expect(cache.peek(watched)).toBeDefined();
    expect(raw).toEqual(['other-0.mp4', 'other-1.mp4', 'other-2.mp4', 'other-3.mp4', 'other-4.mp4']);
  });
});

describe('scanTimeline', () => {
  test('reports segments in scan order', async () => {
    const seen: number[] = [];
    await scanTimeline(timeline(), async () => makeTrack(3, 36), (i) => seen.push(i), new AbortController().signal, 2);
    expect(seen).toEqual([2, 3, 4, 1, 0]);
  });

  test('stops when aborted', async () => {
    const ac = new AbortController();
    const loaded: string[] = [];
    await scanTimeline(
      timeline(),
      async (f: SourceFile) => {
        loaded.push(f.name);
        return makeTrack(3, 36);
      },
      () => ac.abort(),
      ac.signal,
    );
    expect(loaded).toHaveLength(1);
  });

  test('reports a failing segment and carries on', async () => {
    const results: [number, string | undefined][] = [];
    await scanTimeline(
      timeline(),
      async (f: SourceFile) => {
        if (f.name.startsWith(stamps[1])) throw new TelemetryLoadError('damaged');
        return makeTrack(3, 36);
      },
      (i, track, error) => results.push([i, track ? undefined : error]),
      new AbortController().signal,
    );
    expect(results).toEqual([
      [0, undefined],
      [1, 'damaged'],
      [2, undefined],
      [3, undefined],
      [4, undefined],
    ]);
  });
});
