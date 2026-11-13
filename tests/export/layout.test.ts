import { describe, expect, test } from 'bun:test';
import { avcCodecString, containRect, frameDurations, framesBetween, isIdr, nalLengthSize } from '../../src/export/frames';
import { bitrateFor, gridShape, layoutFor } from '../../src/export/layout';

describe('layout', () => {
  test('grid shapes match the player', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => gridShape(n))).toEqual([
      { cols: 1, rows: 1 },
      { cols: 2, rows: 1 },
      { cols: 2, rows: 2 },
      { cols: 2, rows: 2 },
      { cols: 3, rows: 2 },
      { cols: 3, rows: 2 },
    ]);
  });
  test('one HW4 front camera is scaled to 1920 wide, with even sides', () => {
    const l = layoutFor(['front'], { width: 2896, height: 1876 });
    expect([l.width, l.height]).toEqual([1920, 1244]);
  });
  test('a small camera keeps its own size', () => {
    const l = layoutFor(['back'], { width: 1448, height: 938 });
    expect([l.width, l.height]).toEqual([1448, 938]);
  });
  test('six cameras make a 3×2 grid of 640 px cells', () => {
    const l = layoutFor(['front', 'back', 'left_repeater', 'right_repeater', 'left_pillar', 'right_pillar'], { width: 1448, height: 938 });
    expect(l.width).toBe(1920);
    expect(l.height).toBe(2 * 414);
    expect(l.cells[4]).toEqual({ camera: 'left_pillar', x: 640, y: 414, w: 640, h: 414 });
  });
  test('bitrate scales with pixels, within limits', () => {
    expect(bitrateFor(1920, 1080)).toBe(8e6);
    expect(bitrateFor(320, 200)).toBe(2e6);
    expect(bitrateFor(4000, 3000)).toBe(12e6);
  });
});

describe('frames', () => {
  const pts = [0, 0.03, 0.06, 0.09, 0.12];
  test('framesBetween includes the frame already on screen at the start', () => {
    expect(framesBetween(pts, 0.04, 0.1)).toEqual([1, 2, 3]);
    expect(framesBetween(pts, 0, 0.06)).toEqual([0, 1]);
    expect(framesBetween(pts, 1, 2)).toEqual([4]);
    expect(framesBetween(pts, -5, -1)).toEqual([]);
  });
  test('framesBetween returns display order for reordered frames', () => {
    expect(framesBetween([0, 0.09, 0.03, 0.06], 0, 1)).toEqual([0, 2, 3, 1]);
  });
  test('frameDurations: gaps, the last repeating the one before', () => {
    expect(frameDurations([0, 0.025, 0.05]).map((d) => +d.toFixed(3))).toEqual([0.025, 0.025, 0.025]);
    expect(frameDurations([1])).toEqual([1 / 30]);
  });
  test('isIdr finds an IDR picture after other NAL units, in any NAL length size', () => {
    const sei = [0x06, 0x05, 0x01, 0x00];
    const idr = [0x65, 0x88, 0x84];
    const slice = [0x41, 0x9a, 0x02];
    const four = (...nals: number[][]) => new Uint8Array(nals.flatMap((n) => [0, 0, 0, n.length, ...n]));
    expect(isIdr(four(sei, idr))).toBe(true);
    expect(isIdr(four(sei, slice))).toBe(false);
    expect(isIdr(new Uint8Array([0, idr.length, ...idr]), 2)).toBe(true);
    expect(nalLengthSize(new Uint8Array([1, 0x64, 0, 0x33, 0xfd]))).toBe(2);
  });
  test('isIdr is false for cut-off or empty samples', () => {
    expect(isIdr(new Uint8Array([0, 0, 0, 9, 0x65]))).toBe(false);
    expect(isIdr(new Uint8Array())).toBe(false);
  });
  test('avcCodecString', () => {
    expect(avcCodecString(new Uint8Array([1, 0x64, 0x00, 0x2a]))).toBe('avc1.64002a');
  });
  test('containRect letterboxes', () => {
    expect(containRect({ width: 200, height: 100 }, { x: 0, y: 0, w: 100, h: 100 })).toEqual({ x: 0, y: 25, w: 100, h: 50 });
  });
});
