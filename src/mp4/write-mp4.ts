// Writes a one-track H.264 MP4: ftyp, moov (first, so it starts playing at once), mdat with every sample in one chunk.

export interface Mp4Sample {
  data: Uint8Array;
  /** Presentation time, in timescale units. */
  pts: number;
  /** How long it's shown, in timescale units. */
  duration: number;
  key: boolean;
}

export interface WriteMp4Options {
  width: number;
  height: number;
  timescale: number;
  /** The AVCDecoderConfigurationRecord (WebCodecs' decoderConfig.description). */
  avcC: Uint8Array;
  /** In decode order (the order the encoder produced them). */
  samples: Mp4Sample[];
}

const enc = new TextEncoder();
const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];

class Bytes {
  private parts: Uint8Array[] = [];
  length = 0;
  u8(...ns: number[]): this {
    return this.raw(Uint8Array.from(ns));
  }
  u16(...ns: number[]): this {
    const b = new Uint8Array(ns.length * 2);
    const v = new DataView(b.buffer);
    ns.forEach((n, i) => v.setUint16(i * 2, n & 0xffff));
    return this.raw(b);
  }
  u32(...ns: number[]): this {
    const b = new Uint8Array(ns.length * 4);
    const v = new DataView(b.buffer);
    ns.forEach((n, i) => v.setUint32(i * 4, n >>> 0));
    return this.raw(b);
  }
  i32(...ns: number[]): this {
    const b = new Uint8Array(ns.length * 4);
    const v = new DataView(b.buffer);
    ns.forEach((n, i) => v.setInt32(i * 4, n | 0));
    return this.raw(b);
  }
  str(s: string): this {
    return this.raw(enc.encode(s));
  }
  zeros(n: number): this {
    return this.raw(new Uint8Array(n));
  }
  raw(b: Uint8Array): this {
    this.parts.push(b);
    this.length += b.length;
    return this;
  }
  bytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}

function box(type: string, ...children: (Bytes | Uint8Array)[]): Uint8Array {
  const b = new Bytes();
  const body = children.map((c) => (c instanceof Bytes ? c.bytes() : c));
  b.u32(8 + body.reduce((n, c) => n + c.length, 0)).str(type);
  body.forEach((c) => b.raw(c));
  return b.bytes();
}

function fullBox(type: string, version: number, flags: number, body: Bytes, ...children: Uint8Array[]): Uint8Array {
  const head = new Bytes().u32(((version & 0xff) << 24) | (flags & 0xffffff));
  return box(type, head, body, ...children);
}

/** Run-length pairs of [count, value]. */
function runs(values: ArrayLike<number>): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < values.length; i++) {
    const last = out[out.length - 1];
    if (last && last[1] === values[i]) last[0]++;
    else out.push([1, values[i]]);
  }
  return out;
}

/**
 * Decode times: the presentation times sorted (so each frame decodes no later than it's shown), and the
 * composition offsets that map them back. Without reordering every offset is 0.
 */
export function decodeTimes(samples: Pick<Mp4Sample, 'pts'>[]): { dts: number[]; cts: number[] } {
  const dts = samples.map((s) => s.pts).sort((a, b) => a - b);
  return { dts, cts: samples.map((s, i) => s.pts - dts[i]) };
}

export function writeMp4(o: WriteMp4Options): Uint8Array {
  const n = o.samples.length;
  const { dts, cts } = decodeTimes(o.samples);
  const last = o.samples[n - 1];
  const deltas = dts.map((d, i) => (i + 1 < n ? dts[i + 1] - d : Math.max(1, last?.duration ?? 1)));
  const duration = n ? Math.max(...o.samples.map((s) => s.pts + s.duration)) - (dts[0] ?? 0) : 0;
  const reordered = cts.some((c) => c !== 0);
  const keys = o.samples.flatMap((s, i) => (s.key ? [i + 1] : []));
  const dataSize = o.samples.reduce((a, s) => a + s.data.length, 0);

  const moovWith = (chunkOffset: number): Uint8Array => {
    const visual = new Bytes()
      .zeros(6)
      .u16(1) // data reference index
      .zeros(16)
      .u16(o.width, o.height)
      .u32(0x00480000, 0x00480000, 0)
      .u16(1) // frame count
      .zeros(32) // compressor name
      .u16(0x0018, 0xffff);
    const avc1 = box('avc1', visual, box('avcC', o.avcC));
    const sttsRuns = runs(deltas);
    const stblParts = [
      fullBox('stsd', 0, 0, new Bytes().u32(1), avc1),
      fullBox('stts', 0, 0, new Bytes().u32(sttsRuns.length, ...sttsRuns.flat())),
    ];
    if (keys.length < n) stblParts.push(fullBox('stss', 0, 0, new Bytes().u32(keys.length, ...keys)));
    if (reordered) {
      const cttsRuns = runs(cts);
      const b = new Bytes().u32(cttsRuns.length);
      cttsRuns.forEach(([c, v]) => b.u32(c).i32(v));
      stblParts.push(fullBox('ctts', 1, 0, b));
    }
    stblParts.push(
      fullBox('stsc', 0, 0, new Bytes().u32(1, 1, n, 1)),
      fullBox('stsz', 0, 0, new Bytes().u32(0, n, ...o.samples.map((s) => s.data.length))),
      fullBox('stco', 0, 0, new Bytes().u32(1, chunkOffset)),
    );
    const dinf = box('dinf', fullBox('dref', 0, 0, new Bytes().u32(1), fullBox('url ', 0, 1, new Bytes())));
    const minf = box('minf', fullBox('vmhd', 0, 1, new Bytes().zeros(8)), dinf, box('stbl', ...stblParts));
    const mdia = box(
      'mdia',
      fullBox('mdhd', 0, 0, new Bytes().u32(0, 0, o.timescale, duration).u16(0x55c4, 0)),
      fullBox('hdlr', 0, 0, new Bytes().u32(0).str('vide').zeros(12).str('Video\0')),
      minf,
    );
    const tkhd = fullBox(
      'tkhd',
      0,
      3, // enabled, in movie
      new Bytes().u32(0, 0, 1, 0, duration).zeros(8).u16(0, 0, 0, 0).u32(...MATRIX).u32(o.width << 16, o.height << 16),
    );
    const mvhd = fullBox(
      'mvhd',
      0,
      0,
      new Bytes().u32(0, 0, o.timescale, duration, 0x00010000).u16(0x0100).zeros(10).u32(...MATRIX).zeros(24).u32(2),
    );
    return box('moov', mvhd, box('trak', tkhd, mdia));
  };

  const ftyp = box('ftyp', new Bytes().str('isom').u32(0x200).str('isomiso2avc1mp41'));
  // The moov's size doesn't depend on the offset it records, so measure it once with a placeholder.
  const moovLength = moovWith(0).length;
  const moov = moovWith(ftyp.length + moovLength + 8);
  const out = new Uint8Array(ftyp.length + moov.length + 8 + dataSize);
  out.set(ftyp, 0);
  out.set(moov, ftyp.length);
  let p = ftyp.length + moov.length;
  new DataView(out.buffer).setUint32(p, 8 + dataSize);
  out.set(enc.encode('mdat'), p + 4);
  p += 8;
  for (const s of o.samples) {
    out.set(s.data, p);
    p += s.data.length;
  }
  return out;
}
