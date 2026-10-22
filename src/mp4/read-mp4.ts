import { boxes, child, dataView, fourcc, path, type Box } from './boxes';

export interface Mp4Info {
  /** Sample-entry fourcc of the video track, e.g. avc1 or hvc1. */
  codec: string;
  timescale: number;
  durations: Uint32Array;
  sizes: Uint32Array;
  /** Byte offset of each sample in the file. */
  offsets: Float64Array;
  /** Edit-list media time, in timescale units. */
  mediaTime: number;
  /** True when a ctts box exists (frames are reordered for display). */
  reordered: boolean;
  durationS: number;
}

export class Mp4Error extends Error {
  readonly kind: 'not-mp4' | 'no-moov' | 'bad-box';
  constructor(kind: 'not-mp4' | 'no-moov' | 'bad-box', message: string = kind) {
    super(message);
    this.kind = kind;
  }
}

export const HEAD_BYTES = 65536;

function videoTrak(buf: Uint8Array, moov: Box): Box | null {
  let first: Box | null = null;
  for (const b of boxes(buf, moov.body, Math.min(moov.end, buf.length))) {
    if (b.type !== 'trak') continue;
    first ??= b;
    const hdlr = path(buf, b, ['mdia', 'hdlr']);
    if (hdlr && fourcc(buf, hdlr.body + 8) === 'vide') return b;
  }
  return first;
}

function need(b: Box | null, what: string): Box {
  if (!b) throw new Mp4Error('bad-box', `missing ${what}`);
  return b;
}

export function parseMp4(buf: Uint8Array): Mp4Info {
  const top = [...boxes(buf)];
  if (top[0]?.type !== 'ftyp') throw new Mp4Error('not-mp4');
  const moov = top.find((b) => b.type === 'moov' && b.end <= buf.length);
  if (!moov) throw new Mp4Error('no-moov');

  const v = dataView(buf);
  const trak = need(videoTrak(buf, moov), 'trak');
  const mdhd = need(path(buf, trak, ['mdia', 'mdhd']), 'mdhd');
  const timescale = buf[mdhd.body] === 1 ? v.getUint32(mdhd.body + 20) : v.getUint32(mdhd.body + 12);
  const stbl = need(path(buf, trak, ['mdia', 'minf', 'stbl']), 'stbl');

  const stsd = need(child(buf, stbl, 'stsd'), 'stsd');
  const codec = fourcc(buf, stsd.body + 12);

  const stts = need(child(buf, stbl, 'stts'), 'stts');
  const sttsCount = v.getUint32(stts.body + 4);
  const durationList: number[] = [];
  for (let i = 0; i < sttsCount; i++) {
    const count = v.getUint32(stts.body + 8 + i * 8);
    const delta = v.getUint32(stts.body + 12 + i * 8);
    for (let k = 0; k < count; k++) durationList.push(delta);
  }

  const stsz = need(child(buf, stbl, 'stsz'), 'stsz');
  const fixed = v.getUint32(stsz.body + 4);
  const sampleCount = v.getUint32(stsz.body + 8);
  const sizes = new Uint32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) sizes[i] = fixed || v.getUint32(stsz.body + 12 + i * 4);

  const stco = child(buf, stbl, 'stco');
  const co64 = stco ? null : need(child(buf, stbl, 'co64'), 'stco');
  const chunkBox = (stco ?? co64)!;
  const chunkCount = v.getUint32(chunkBox.body + 4);
  const chunkOffset = (i: number) =>
    stco ? v.getUint32(chunkBox.body + 8 + i * 4) : Number(v.getBigUint64(chunkBox.body + 8 + i * 8));

  const stsc = need(child(buf, stbl, 'stsc'), 'stsc');
  const stscCount = v.getUint32(stsc.body + 4);
  const runs = Array.from({ length: stscCount }, (_, i) => ({
    firstChunk: v.getUint32(stsc.body + 8 + i * 12),
    perChunk: v.getUint32(stsc.body + 12 + i * 12),
  }));

  const offsets = new Float64Array(sampleCount);
  let sample = 0;
  for (let c = 0, r = 0; c < chunkCount && sample < sampleCount; c++) {
    while (r + 1 < runs.length && runs[r + 1].firstChunk <= c + 1) r++;
    let o = chunkOffset(c);
    for (let k = 0; k < (runs[r]?.perChunk ?? 0) && sample < sampleCount; k++, sample++) {
      offsets[sample] = o;
      o += sizes[sample];
    }
  }

  let mediaTime = 0;
  const elst = path(buf, trak, ['edts', 'elst']);
  if (elst) {
    const version = buf[elst.body];
    const entries = v.getUint32(elst.body + 4);
    for (let i = 0; i < entries; i++) {
      const at = elst.body + 8 + i * (version === 1 ? 20 : 12);
      const mt = version === 1 ? Number(v.getBigInt64(at + 8)) : v.getInt32(at + 4);
      if (mt >= 0) {
        mediaTime = mt;
        break;
      }
    }
  }

  const durations = Uint32Array.from(durationList.slice(0, sampleCount));
  return {
    codec,
    timescale,
    durations,
    sizes,
    offsets,
    mediaTime,
    reordered: child(buf, stbl, 'ctts') !== null,
    durationS: durations.reduce((a, b) => a + b, 0) / timescale,
  };
}

/** Presentation time of each frame, in seconds. */
export function frameTimes(info: Mp4Info): Float64Array {
  const t = new Float64Array(info.durations.length);
  let acc = -info.mediaTime;
  for (let i = 0; i < t.length; i++) {
    t[i] = acc / info.timescale;
    acc += info.durations[i];
  }
  return t;
}

/**
 * Checks a file without reading its video: the head, whether every top-level box is whole
 * (a cut-off file loses its moov at the end), the video codec and the clip's real length.
 */
export async function inspectFile(
  read: (offset: number, length: number) => Promise<Uint8Array>,
  size: number,
): Promise<{ health: 'mp4' | 'encrypted' | 'damaged'; complete: boolean; codec: string | null; durationS: number | null }> {
  const head = await read(0, Math.min(HEAD_BYTES, size));
  const health = classifyHead(head, size);
  const unknown = { health, complete: false, codec: null, durationS: null };
  if (health !== 'mp4') return unknown;
  let offset = 0;
  while (offset + 8 <= size) {
    const h = await read(offset, 16);
    const v = new DataView(h.buffer, h.byteOffset, h.byteLength);
    let boxSize = v.getUint32(0);
    if (boxSize === 1 && h.length >= 16) boxSize = Number(v.getBigUint64(8));
    else if (boxSize === 0) boxSize = size - offset;
    if (boxSize < 8 || offset + boxSize > size) break;
    if (fourcc(h, 4) === 'moov') {
      try {
        const info = parseMp4(concatFtypMoov(await read(0, 8), await read(offset, boxSize)));
        return { health, complete: true, codec: info.codec, durationS: info.durationS };
      } catch {
        return unknown;
      }
    }
    offset += boxSize;
  }
  return unknown;
}

/** A minimal buffer parseMp4 accepts: an 8-byte ftyp header stub followed by the moov box. */
function concatFtypMoov(ftypHead: Uint8Array, moov: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + moov.length);
  out.set([0, 0, 0, 8], 0);
  out.set(ftypHead.subarray(4, 8), 4);
  out.set(moov, 8);
  return out;
}

/**
 * Judges a file from its first bytes. Encrypted clips' real layout is unknown (no sample yet):
 * anything sizeable that doesn't start like an MP4 is treated as encrypted.
 */
export function classifyHead(head: Uint8Array, fileSize: number): 'mp4' | 'encrypted' | 'damaged' {
  if (fileSize === 0 || fileSize < 1024) return 'damaged';
  if (head.length >= 8 && fourcc(head, 4) === 'ftyp') return 'mp4';
  // Zero-filled clips are a common result of unplugging the drive while it's in use.
  if (head.subarray(0, 4096).every((b) => b === 0)) return 'damaged';
  return 'encrypted';
}
