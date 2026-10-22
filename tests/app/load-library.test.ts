import { describe, expect, test } from 'bun:test';
import { loadFromNodes, loadFromSources } from '../../src/app/load-library';
import { appStore, currentTimeline, telemetryCache } from '../../src/app/state';
import type { SourceFile } from '../../src/library/types';
import type { EntryNode } from '../../src/sources/collect';
import { avcc, buildMp4 } from '../helpers/mp4-builder';
import { fakeSource } from '../helpers/sources';

const clipBytes = buildMp4({ samples: [1, 2, 3].map(() => avcc(new Uint8Array(600).fill(0x41))), durations: [1, 1, 1] });

function clip(path: string): SourceFile {
  const name = path.split('/').pop()!;
  return { path, name, size: clipBytes.length, getFile: async () => new File([clipBytes.slice()], name) };
}

describe('loading a folder', () => {
  test('a lone Sentry event folder opens, even when its event.json is slow to read', async () => {
    const folder = '2026-10-18_14-12-00';
    const json: SourceFile = {
      path: `${folder}/event.json`,
      name: 'event.json',
      size: null,
      getFile: () =>
        new Promise((resolve) => setTimeout(() => resolve(new File(['{"reason":"sentry_aware_object_detection"}'], 'event.json')), 30)),
    };
    await loadFromSources([clip(`${folder}/2026-10-18_14-01-11-front.mp4`), json]);
    const tl = currentTimeline();
    expect(tl).not.toBeNull();
    expect(tl!.id).toBe(`sentry:${folder}`);
  });

  test('a folder that cannot be read ends loading with a message', async () => {
    const broken: EntryNode = { name: 'E', kind: 'dir', list: () => Promise.reject(new Error('NotReadableError')) };
    await loadFromNodes([broken]);
    const s = appStore.get();
    expect(s.loading).toBe(false);
    expect(s.notice).toBe("We couldn't read that folder. Try the TeslaCam folder on the USB drive.");
  });

  test('a new drop forgets driving data that failed to load before', async () => {
    const f = fakeSource('RecentClips/2026-10-19_22-08-57-front.mp4'); // too small to be a clip
    await telemetryCache.get(f).catch(() => undefined);
    expect(telemetryCache.failed(f)).toBe(true);
    await loadFromSources([clip('RecentClips/2026-10-19_22-08-57-front.mp4')]);
    expect(telemetryCache.failed(f)).toBe(false);
  });
});
