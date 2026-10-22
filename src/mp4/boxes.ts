export interface Box {
  type: string;
  /** Offset of the box header. */
  start: number;
  /** Offset of the payload (after size, type and any 64-bit size). */
  body: number;
  /** Offset just past the box. May exceed the buffer when the file is truncated. */
  end: number;
}

const view = (buf: Uint8Array) => new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

export function fourcc(buf: Uint8Array, at: number): string {
  return String.fromCharCode(buf[at], buf[at + 1], buf[at + 2], buf[at + 3]);
}

/** Iterates the boxes between `start` and `end`. Stops at a box that can't be read. */
export function* boxes(buf: Uint8Array, start = 0, end = buf.length): Generator<Box> {
  const v = view(buf);
  let o = start;
  while (o + 8 <= end) {
    let size = v.getUint32(o);
    const type = fourcc(buf, o + 4);
    let header = 8;
    if (size === 1) {
      if (o + 16 > buf.length) return;
      size = Number(v.getBigUint64(o + 8));
      header = 16;
    } else if (size === 0) {
      size = end - o;
    }
    if (size < header) return;
    yield { type, start: o, body: o + header, end: o + size };
    o += size;
  }
}

/** The first complete child box of `type` inside [start, end). */
export function child(buf: Uint8Array, parent: { body: number; end: number }, type: string): Box | null {
  const end = Math.min(parent.end, buf.length);
  for (const b of boxes(buf, parent.body, end)) {
    if (b.type === type && b.end <= end) return b;
  }
  return null;
}

/** Follows a path of child box types, e.g. ['mdia', 'minf', 'stbl']. */
export function path(buf: Uint8Array, from: { body: number; end: number }, types: string[]): Box | null {
  let cur: { body: number; end: number } | null = from;
  let found: Box | null = null;
  for (const t of types) {
    found = cur ? child(buf, cur, t) : null;
    if (!found) return null;
    cur = found;
  }
  return found;
}

export { view as dataView };
