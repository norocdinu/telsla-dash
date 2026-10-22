import { describe, expect, test } from 'bun:test';
import { durationOrder, measureDurations, readSegmentDuration } from '../../src/app/durations';
import type { Segment, SourceFile, Timeline } from '../../src/library/types';
import { avcc, buildMp4 } from '../helpers/mp4-builder';

function timeline(n: number): Timeline {
  const segments: Segment[] = Array.from({ length: n }, (_, i) => ({ key: `ev/${i}`, wallMs: i * 61_000, files: {} }));
  return { id: 'saved:ev', kind: 'saved', folder: 'ev', segments, startMs: 0, cameras: ['front'], event: null, eventJson: null, thumb: null };
}

describe('durationOrder', () => {
  test('the last segment first, then the rest in order', () => {
    expect(durationOrder(4)).toEqual([3, 0, 1, 2]);
    expect(durationOrder(1)).toEqual([0]);
  });

  test('long drives measure only the last segment', () => {
    expect(durationOrder(1440)).toEqual([1439]);
  });
});

describe('measureDurations', () => {
  test('reports each measured length, skipping ones already known', async () => {
    const asked: number[] = [];
    const seen: [string, number][] = [];
    await measureDurations(
      timeline(4),
      { 'ev/1': 60.2 },
      async (seg) => {
        const i = Number(seg.key.split('/')[1]);
        asked.push(i);
        return i === 3 ? 1.6 : 60;
      },
      (key, s) => seen.push([key, s]),
      new AbortController().signal,
    );
    expect(asked).toEqual([3, 0, 2]);
    expect(seen).toEqual([
      ['ev/3', 1.6],
      ['ev/0', 60],
      ['ev/2', 60],
    ]);
  });

  test('stops when aborted', async () => {
    const ac = new AbortController();
    const asked: number[] = [];
    await measureDurations(
      timeline(4),
      {},
      async (seg) => {
        asked.push(Number(seg.key.split('/')[1]));
        ac.abort();
        return 60;
      },
      () => undefined,
      ac.signal,
    );
    expect(asked).toEqual([3]);
  });
});

describe('readSegmentDuration', () => {
  test('reads the length from the clip file', async () => {
    const bytes = buildMp4({ samples: [1, 2, 3].map(() => avcc(new Uint8Array(600).fill(0x41))), durations: [270, 263, 278] });
    const front: SourceFile = { path: 'ev/a-front.mp4', name: 'a-front.mp4', size: null, getFile: async () => new File([bytes.slice()], 'a-front.mp4') };
    expect(await readSegmentDuration({ key: 'ev/0', wallMs: 0, files: { front } })).toBeCloseTo(0.0811, 4);
  });

  test('null for a file that cannot be measured', async () => {
    const broken: SourceFile = { path: 'x.mp4', name: 'x.mp4', size: null, getFile: async () => new File([new Uint8Array(10)], 'x.mp4') };
    expect(await readSegmentDuration({ key: 'ev/0', wallMs: 0, files: { front: broken } })).toBeNull();
  });
});
