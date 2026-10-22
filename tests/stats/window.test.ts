import { describe, expect, test } from 'bun:test';
import { blendWindow, chartWindow } from '../../src/stats/window';

const clip = { startMs: 1_000_000, endMs: 1_000_000 + 600_000 }; // 10 minutes

describe('chartWindow', () => {
  test('playing shows the whole clip', () => {
    expect(chartWindow(clip, clip.startMs + 200_000, false)).toEqual({ fromMs: clip.startMs, toMs: clip.endMs });
  });

  test('paused shows 15 s either side of now', () => {
    const now = clip.startMs + 200_000;
    expect(chartWindow(clip, now, true)).toEqual({ fromMs: now - 15_000, toMs: now + 15_000 });
  });

  test('near the start the window stays 30 s wide and stops at the edge', () => {
    expect(chartWindow(clip, clip.startMs + 5_000, true)).toEqual({ fromMs: clip.startMs, toMs: clip.startMs + 30_000 });
  });

  test('near the end likewise', () => {
    expect(chartWindow(clip, clip.endMs - 2_000, true)).toEqual({ fromMs: clip.endMs - 30_000, toMs: clip.endMs });
  });

  test('a clip shorter than 30 s does not zoom', () => {
    const short = { startMs: 0, endMs: 23_000 };
    expect(chartWindow(short, 10_000, true)).toEqual({ fromMs: 0, toMs: 23_000 });
  });
});

describe('blendWindow', () => {
  test('halfway between two windows', () => {
    expect(blendWindow({ fromMs: 0, toMs: 100 }, { fromMs: 40, toMs: 60 }, 0.5)).toEqual({ fromMs: 20, toMs: 80 });
  });

  test('t is clamped to 0..1', () => {
    expect(blendWindow({ fromMs: 0, toMs: 100 }, { fromMs: 40, toMs: 60 }, 2)).toEqual({ fromMs: 40, toMs: 60 });
  });
});
