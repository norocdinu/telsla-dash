// The exported picture's size, and where each camera sits in it.
import type { CameraId } from '../library/types';

export const MAX_WIDTH = 1920;

export interface Cell {
  camera: CameraId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  width: number;
  height: number;
  cells: Cell[];
}

const even = (n: number) => Math.max(2, 2 * Math.round(n / 2));

/** As the player's grid: 1 alone, 2 side by side, 3–4 in a 2×2, 5–6 in a 3×2. */
export function gridShape(n: number): { cols: number; rows: number } {
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  return { cols, rows: Math.ceil(n / cols) };
}

/**
 * One camera keeps its own size (scaled down to 1920 px wide at most); a grid uses 960 px cells for 2 columns
 * and 640 px for 3, shaped like the source (`size`, usually the front camera's).
 */
export function layoutFor(cameras: CameraId[], size: { width: number; height: number }): Layout {
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 1448 / 938;
  const { cols, rows } = gridShape(cameras.length);
  const cellW = cols === 1 ? even(Math.min(MAX_WIDTH, size.width || MAX_WIDTH)) : MAX_WIDTH / cols;
  const cellH = even(cellW / aspect);
  const cells = cameras.map((camera, i) => ({ camera, x: (i % cols) * cellW, y: Math.floor(i / cols) * cellH, w: cellW, h: cellH }));
  return { width: cellW * cols, height: cellH * rows, cells };
}

/** About 8 Mbit/s for 1080p, scaled by pixel count. */
export function bitrateFor(width: number, height: number): number {
  return Math.round(Math.min(12e6, Math.max(2e6, (8e6 * width * height) / (1920 * 1080))));
}

/** H.264 High, then Main, then Baseline, each at level 5.1 (enough for 1920 × 1250 and 3 × 2 grids). */
export const CODECS = ['avc1.640033', 'avc1.4d0033', 'avc1.420033'];

export const KEYFRAME_EVERY_S = 2;
