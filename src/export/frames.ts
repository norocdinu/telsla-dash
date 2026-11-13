// Which frames an export is made of: the clock camera's frames inside the range, minute by minute.

/** Indices of the frames shown from `fromS` up to (not including) `toS`, given each frame's presentation time. */
export function framesBetween(pts: ArrayLike<number>, fromS: number, toS: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    // The frame on screen at fromS counts, even if it started a little earlier.
    const next = i + 1 < pts.length ? pts[i + 1] : Infinity;
    if (pts[i] < toS && next > fromS) out.push(i);
  }
  return out.sort((a, b) => pts[a] - pts[b]);
}

/** How long each output frame is shown, in seconds: the gap to the next one; the last repeats the one before. */
export function frameDurations(times: number[], fallbackS = 1 / 30): number[] {
  return times.map((t, i) => {
    if (i + 1 < times.length) return Math.max(1e-4, times[i + 1] - t);
    return i > 0 ? Math.max(1e-4, t - times[i - 1]) : fallbackS;
  });
}

/** How many bytes prefix each NAL unit in a sample, from the avcC record (usually 4). */
export function nalLengthSize(avcC: Uint8Array): number {
  return avcC.length > 4 ? (avcC[4] & 3) + 1 : 4;
}

/**
 * Whether a sample holds an IDR picture (NAL type 5): the only frame a decoder can start from.
 * Read from the bytes, because a file's keyframe list (stss) can name frames that aren't IDRs.
 */
export function isIdr(sample: Uint8Array, lengthSize = 4): boolean {
  let p = 0;
  while (p + lengthSize < sample.length) {
    let len = 0;
    for (let k = 0; k < lengthSize; k++) len = len * 256 + sample[p + k];
    const start = p + lengthSize;
    if (len <= 0 || start + len > sample.length) return false;
    if ((sample[start] & 0x1f) === 5) return true;
    p = start + len;
  }
  return false;
}

/** The codec string WebCodecs wants for an avcC record, e.g. avc1.64002a. */
export function avcCodecString(avcC: Uint8Array): string {
  const hex = (b: number) => b.toString(16).padStart(2, '0');
  return `avc1.${hex(avcC[1])}${hex(avcC[2])}${hex(avcC[3])}`;
}

/** Where a picture of `src` size sits inside a cell, keeping its shape (letterboxed). */
export function containRect(src: { width: number; height: number }, cell: { x: number; y: number; w: number; h: number }) {
  const k = Math.min(cell.w / src.width, cell.h / src.height);
  const w = src.width * k;
  const h = src.height * k;
  return { x: cell.x + (cell.w - w) / 2, y: cell.y + (cell.h - h) / 2, w, h };
}
