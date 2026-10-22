import { describe, expect, test } from 'bun:test';
import { engine, nextTimeline, openTimeline } from '../../src/app/playback';
import { appStore, playStore } from '../../src/app/state';
import type { SourceFile } from '../../src/library/types';
import { flush, timeline } from '../helpers/engine-timelines';
import { avcc, buildMp4 } from '../helpers/mp4-builder';
import { FakeVideo, installFakeMedia } from '../helpers/fake-video';

installFakeMedia();

for (const c of ['front', 'back'] as const) {
  engine.attachSlot(c, new FakeVideo() as unknown as HTMLVideoElement, new FakeVideo() as unknown as HTMLVideoElement);
}
engine.setVisible(['front', 'back'], 'front');

const a = timeline('a', [{ front: 'ok', back: 'ok' }]);
const b = timeline('b', [{ front: 'ok' }, { front: 'ok', back: 'ok' }]);
appStore.set({ library: { timelines: [a, b], ignored: 0 } });

describe('playback wiring', () => {
  test('switching to a timeline with a missing camera shows it as missing', async () => {
    openTimeline(a.id);
    await flush();
    openTimeline(b.id);
    await flush();
    expect(appStore.get().slots.back).toBe('missing');
  });

  test('opening a timeline learns its last clip’s real length before playback gets there', async () => {
    const bytes = buildMp4({ samples: [1, 2, 3].map(() => avcc(new Uint8Array(600).fill(0x41))), durations: [5000, 5000, 6000] });
    const last: SourceFile = { path: 'c/last-front.mp4', name: 'last-front.mp4', size: bytes.length, getFile: async () => new File([bytes.slice()], 'last-front.mp4') };
    const c = timeline('c', [{ front: 'ok' }, { front: 'ok' }]);
    c.segments[1].files.front = last;
    appStore.set({ library: { timelines: [a, b, c], ignored: 0 } });
    openTimeline(c.id);
    await flush();
    expect(appStore.get().durations[c.segments[1].key]).toBeCloseTo(1.6, 6);
  });

  test('Up next follows the list’s tab and filter', async () => {
    const honk = { wallMs: null, city: null, street: null, lat: null, lon: null, reason: 'user_interaction_honk', category: 'honk' as const, label: 'Honk' };
    const sentry = { ...honk, reason: 'sentry_aware_object_detection', category: 'object' as const, label: 'Object detected' };
    const h1 = { ...timeline('h1', [{ front: 'ok' }]), event: honk };
    const s1 = { ...timeline('s1', [{ front: 'ok' }]), kind: 'sentry' as const, event: sentry };
    const h2 = { ...timeline('h2', [{ front: 'ok' }]), event: honk };
    appStore.set({ library: { timelines: [h1, s1, h2], ignored: 0 }, listTab: 'saved', listChip: 'honk' });
    openTimeline(h1.id);
    await flush();
    expect(nextTimeline()?.id).toBe(h2.id);
  });

  test('opening from Up next or the list starts playing', async () => {
    appStore.set({ library: { timelines: [a, b], ignored: 0 } });
    openTimeline(a.id, undefined, true);
    await flush();
    expect(playStore.get().playing).toBe(true);
  });
});
