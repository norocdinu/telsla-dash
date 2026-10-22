// Builds small but structurally real MP4 files for tests, laid out like Tesla's:
// ftyp, free, mdat (samples), moov.

const enc = new TextEncoder();

function cat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function u32(...ns: number[]): Uint8Array {
  const b = new Uint8Array(ns.length * 4);
  const v = new DataView(b.buffer);
  ns.forEach((n, i) => v.setUint32(i * 4, n >>> 0));
  return b;
}

function i32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, n);
  return b;
}

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const body = cat(...payload);
  return cat(u32(8 + body.length), enc.encode(type), body);
}

function fullBox(type: string, ...payload: Uint8Array[]): Uint8Array {
  return box(type, u32(0), ...payload);
}

/** Joins NAL units with 4-byte big-endian length prefixes, as in an MP4 sample. */
export function avcc(...nals: Uint8Array[]): Uint8Array {
  return cat(...nals.flatMap((n) => [u32(n.length), n]));
}

export interface BuildMp4Options {
  samples: Uint8Array[];
  durations: number[];
  timescale?: number;
  codec?: 'avc1' | 'hvc1';
  mediaTime?: number;
  samplesPerChunk?: number;
  largeMdat?: boolean;
}

export function buildMp4(o: BuildMp4Options): Uint8Array {
  const timescale = o.timescale ?? 10000;
  const spc = o.samplesPerChunk ?? o.samples.length;
  const total = o.durations.reduce((a, b) => a + b, 0);

  const ftyp = box('ftyp', enc.encode('mp42'), u32(0), enc.encode('mp42mp41isomiso2'));
  const free = box('free');
  const data = cat(...o.samples);
  const mdat = o.largeMdat
    ? cat(u32(1), enc.encode('mdat'), u32(0, 16 + data.length), data)
    : box('mdat', data);
  const dataStart = ftyp.length + free.length + (o.largeMdat ? 16 : 8);

  // Chunks of `spc` samples, contiguous in mdat.
  const chunkOffsets: number[] = [];
  let off = dataStart;
  for (let i = 0; i < o.samples.length; i++) {
    if (i % spc === 0) chunkOffsets.push(off);
    off += o.samples[i].length;
  }
  const remainder = o.samples.length % spc;
  const stscEntries = [u32(1, spc, 1)];
  if (remainder && chunkOffsets.length > 1) stscEntries.push(u32(chunkOffsets.length, remainder, 1));

  // Run-length stts.
  const runs: [number, number][] = [];
  for (const d of o.durations) {
    const last = runs[runs.length - 1];
    if (last && last[1] === d) last[0]++;
    else runs.push([1, d]);
  }

  const sampleEntry = box(o.codec ?? 'avc1', new Uint8Array(78));
  const stbl = box(
    'stbl',
    fullBox('stsd', u32(1), sampleEntry),
    fullBox('stts', u32(runs.length), ...runs.map(([c, d]) => u32(c, d))),
    fullBox('stsc', u32(stscEntries.length), ...stscEntries),
    fullBox('stsz', u32(0, o.samples.length), u32(...o.samples.map((s) => s.length))),
    fullBox('stco', u32(chunkOffsets.length), u32(...chunkOffsets)),
  );
  const mdia = box(
    'mdia',
    fullBox('mdhd', u32(0, 0, timescale, total), new Uint8Array(4)),
    fullBox('hdlr', u32(0), enc.encode('vide'), new Uint8Array(12), new Uint8Array(1)),
    box('minf', fullBox('vmhd', new Uint8Array(8)), stbl),
  );
  const elst = fullBox('elst', u32(1, total), i32(o.mediaTime ?? 0), u32(0x10000));
  const trak = box('trak', fullBox('tkhd', new Uint8Array(80)), box('edts', elst), mdia);
  const moov = box('moov', fullBox('mvhd', u32(0, 0, timescale, total), new Uint8Array(80)), trak);

  return cat(ftyp, free, mdat, moov);
}

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) crypto.getRandomValues(b.subarray(i, Math.min(n, i + 65536)));
  // Never let random bytes look like an MP4 header by chance.
  if (n >= 8) b.set([0, 0, 0, 0, 0x78, 0x78, 0x78, 0x78], 0);
  return b;
}
