import { describe, expect, test } from 'bun:test';
import { attachEvents, buildLibrary } from '../../src/library/build-library';
import { CAMERA_ORDER, type SourceFile } from '../../src/library/types';
import { cameraFiles, fakeSource } from '../helpers/sources';

const SAVED = 'TeslaCam/SavedClips/2026-10-16_20-10-53';

describe('buildLibrary', () => {
  test('groups a saved event folder', () => {
    const files = [
      ...cameraFiles(SAVED, '2026-10-16_20-06-10'),
      ...cameraFiles(SAVED, '2026-10-16_20-05-14'),
      fakeSource(`${SAVED}/event.json`),
      fakeSource(`${SAVED}/thumb.png`),
    ];
    const lib = buildLibrary(files);
    expect(lib.timelines).toHaveLength(1);
    const tl = lib.timelines[0];
    expect(tl.kind).toBe('saved');
    expect(tl.id).toBe(`saved:${SAVED}`);
    expect(tl.folder).toBe(SAVED);
    expect(tl.segments.map((s) => s.wallMs)).toEqual([Date.UTC(2026, 9, 16, 20, 5, 14), Date.UTC(2026, 9, 16, 20, 6, 10)]);
    expect(tl.startMs).toBe(Date.UTC(2026, 9, 16, 20, 5, 14));
    expect(tl.cameras).toEqual(CAMERA_ORDER);
    expect(tl.thumb?.name).toBe('thumb.png');
    expect(tl.eventJson?.name).toBe('event.json');
  });

  test('a SentryClips folder is a sentry event', () => {
    const folder = 'TeslaCam/SentryClips/2026-10-18_14-12-00';
    const lib = buildLibrary(cameraFiles(folder, '2026-10-18_14-01-11'));
    expect(lib.timelines[0].kind).toBe('sentry');
    expect(lib.timelines[0].id).toBe(`sentry:${folder}`);
  });

  test('recent clips split into drives at a gap of 2 minutes or more', () => {
    const stamps = ['10-00-00', '10-01-00', '10-02-00', '10-05-00', '10-06-00', '10-08-59'];
    const files = stamps.flatMap((s) => cameraFiles('TeslaCam/RecentClips', `2026-10-19_${s}`, ['front']));
    const lib = buildLibrary(files);
    expect(lib.timelines.map((t) => t.segments.length)).toEqual([3, 3]);
    expect(lib.timelines[0].startMs).toBe(Date.UTC(2026, 9, 19, 10, 5, 0));
    expect(lib.timelines[0].id).toBe('recent:TeslaCam/RecentClips/2026-10-19_10-05-00');
    expect(lib.timelines.every((t) => t.kind === 'recent')).toBe(true);
  });

  test('a drive across midnight stays one drive', () => {
    const files = [
      ...cameraFiles('RecentClips', '2026-10-19_23-59-30', ['front']),
      ...cameraFiles('RecentClips', '2026-10-20_00-00-30', ['front']),
    ];
    expect(buildLibrary(files).timelines).toHaveLength(1);
  });

  test('segments keep only the cameras they have; the timeline lists all', () => {
    const files = [
      ...cameraFiles(SAVED, '2026-10-16_20-05-14', ['front', 'back']),
      ...cameraFiles(SAVED, '2026-10-16_20-06-10'),
    ];
    const tl = buildLibrary(files).timelines[0];
    expect(Object.keys(tl.segments[0].files).sort()).toEqual(['back', 'front']);
    expect(tl.cameras).toEqual(CAMERA_ORDER);
  });

  test('unknown entries are counted as ignored', () => {
    const lib = buildLibrary([fakeSource('TeslaCam/SavedClips/.tcvconfig/x'), fakeSource('TeslaCam/notes.txt')]);
    expect(lib.timelines).toHaveLength(0);
    expect(lib.ignored).toBe(2);
  });

  test('an event folder without video is dropped', () => {
    const lib = buildLibrary([fakeSource(`${SAVED}/event.json`), fakeSource(`${SAVED}/thumb.png`)]);
    expect(lib.timelines).toHaveLength(0);
  });

  test('a lone event folder becomes sentry once its event.json says so', async () => {
    const folder = '2026-10-18_14-12-00';
    const json = fakeSource(`${folder}/event.json`, '{"reason":"sentry_aware_object_detection","timestamp":"2026-10-18T14:11:57"}');
    const lib = buildLibrary([...cameraFiles(folder, '2026-10-18_14-01-11', ['front']), json]);
    expect(lib.timelines[0].kind).toBe('saved');
    await attachEvents(lib, async (f: SourceFile) => (await f.getFile()).text());
    expect(lib.timelines[0].kind).toBe('sentry');
    expect(lib.timelines[0].event?.category).toBe('object');
    expect(lib.timelines[0].event?.wallMs).toBe(Date.UTC(2026, 9, 18, 14, 11, 57));
  });

  test('loose files become drives', () => {
    const lib = buildLibrary([fakeSource('2026-10-16_20-07-11-front.mp4')]);
    expect(lib.timelines[0].kind).toBe('recent');
  });

  test('timelines are newest first', () => {
    const files = [
      ...cameraFiles('TeslaCam/SavedClips/2026-10-16_20-10-53', '2026-10-16_20-05-14', ['front']),
      ...cameraFiles('TeslaCam/SentryClips/2026-10-18_14-12-00', '2026-10-18_14-01-11', ['front']),
      ...cameraFiles('TeslaCam/RecentClips', '2026-10-19_22-08-57', ['front']),
    ];
    expect(buildLibrary(files).timelines.map((t) => t.kind)).toEqual(['recent', 'sentry', 'saved']);
  });

  test('a full day of recent clips builds quickly', () => {
    const files: SourceFile[] = [];
    const start = Date.UTC(2026, 0, 1, 0, 0, 0);
    for (let i = 0; i < 1440; i++) {
      const d = new Date(start + i * 60_000);
      const p = (n: number) => String(n).padStart(2, '0');
      const stamp = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}_${p(d.getUTCHours())}-${p(d.getUTCMinutes())}-00`;
      files.push(...cameraFiles('TeslaCam/RecentClips', stamp));
    }
    const t0 = performance.now();
    const lib = buildLibrary(files);
    const ms = performance.now() - t0;
    expect(lib.timelines).toHaveLength(1);
    expect(lib.timelines[0].segments).toHaveLength(1440);
    expect(ms).toBeLessThan(200);
  });
});
