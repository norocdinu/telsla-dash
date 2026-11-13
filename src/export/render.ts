// Makes the exported video in the worker: reads only the frames needed from each camera's files, decodes them
// (VideoDecoder), draws them and the overlay on a canvas, encodes (VideoEncoder) and writes an MP4.
import { CAMERA_ORDER, type CameraId } from '../library/types';
import { presentationTimes, readIndex, type Mp4Info } from '../mp4/read-mp4';
import { writeMp4, type Mp4Sample } from '../mp4/write-mp4';
import type { LatLon } from '../sei/route';
import { telemetryAt, type TelemetryTrack } from '../sei/telemetry';
import { avcCodecString, containRect, frameDurations, framesBetween, isIdr, nalLengthSize } from './frames';
import { bitrateFor, CODECS, KEYFRAME_EVERY_S, layoutFor } from './layout';
import { drawCellLabel, drawNoVideo, drawOverlay } from './overlay';
import type { ExportFailure, ExportJob, ExportStage } from './protocol';

export class ExportError extends Error {
  readonly kind: ExportFailure;
  constructor(kind: ExportFailure, message: string) {
    super(message);
    this.kind = kind;
  }
}

const TIMESCALE = 90_000;
const IN_FLIGHT = 6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const us = (s: number) => Math.round(s * 1e6);

/**
 * Frames are read a few MB at a time: one read per frame meant thousands of small reads per camera,
 * each paying the drive's latency.
 */
export const READ_AHEAD_BYTES = 4 * 1024 * 1024;
/** A decoder that hasn't finished this long after it was told to has stalled; the camera draws as "no video". */
const FLUSH_TIMEOUT_MS = 10_000;

/** One camera file, by its index; frames come from a read-ahead window of the file. */
class Clip {
  readonly pts: Float64Array;
  private readonly keys: Set<number> | null;
  private buf: Uint8Array | null = null;
  private bufAt = 0;
  constructor(
    readonly file: File,
    readonly info: Mp4Info & { avcC: Uint8Array },
  ) {
    this.pts = presentationTimes(info);
    this.keys = info.sync ? new Set(info.sync) : null;
  }

  static async open(file: File | undefined): Promise<Clip | null> {
    if (!file) return null;
    try {
      const read = async (o: number, n: number) => new Uint8Array(await file.slice(o, o + n).arrayBuffer());
      const info = await readIndex(read, file.size);
      if (!info || !info.avcC || !info.sizes.length || !['avc1', 'avc3'].includes(info.codec)) return null;
      return new Clip(file, info as Mp4Info & { avcC: Uint8Array });
    } catch {
      return null;
    }
  }

  async sample(i: number): Promise<Uint8Array> {
    const o = this.info.offsets[i];
    const n = this.info.sizes[i];
    if (!this.buf || o < this.bufAt || o + n > this.bufAt + this.buf.length) {
      this.bufAt = o;
      this.buf = new Uint8Array(await this.file.slice(o, o + Math.max(n, READ_AHEAD_BYTES)).arrayBuffer());
    }
    return this.buf.slice(o - this.bufAt, o - this.bufAt + n);
  }

  /** Whether sample `i` is a real IDR keyframe, from its bytes. */
  async isIdr(i: number): Promise<boolean> {
    return isIdr(await this.sample(i), this.lengthSize);
  }

  get lengthSize(): number {
    return nalLengthSize(this.info.avcC);
  }

  /**
   * Where decoding must start to show sample `first`: the last real IDR at or before it. The file's keyframe
   * list is tried first (newest back), then the frames from the start of the file are checked one by one.
   * When none comes before `first`, the first IDR after it (the frames before then can't be shown); -1 if none.
   */
  async startFor(first: number): Promise<number> {
    const listed = this.keys ? [...this.keys].filter((k) => k <= first).sort((a, b) => b - a) : [];
    for (const k of listed.slice(0, 8)) if (await this.isIdr(k)) return k;
    let best = -1;
    for (let i = 0; i <= first; i++) if (await this.isIdr(i)) best = i;
    if (best >= 0) return best;
    for (let i = first + 1; i < this.pts.length; i++) if (await this.isIdr(i)) return i;
    return -1;
  }

  /** Lets go of the read-ahead window once the clip is done with. */
  release(): void {
    this.buf = null;
  }
}

/**
 * Decodes one clip from the keyframe before `fromS` on, and hands out the frame on screen at a time.
 * Frames are closed as soon as they're behind, since decoders have few to lend.
 */
class ClipDecoder {
  private decoder: VideoDecoder;
  private ready: VideoFrame[] = [];
  private current: VideoFrame | null = null;
  private next: number;
  private readonly last: number;
  private outputs = 0;
  private fed = 0;
  private flushed = false;
  private broken = false;
  private wake: (() => void) | null = null;
  /** Frames at or before this time (µs) are behind: only the latest of them is kept. */
  private limit = -Infinity;
  private readonly first: number;
  private started = false;

  constructor(
    private readonly clip: Clip,
    fromS: number,
    toS: number,
  ) {
    const order = framesBetween(clip.pts, fromS, toS);
    const first = order.length ? Math.min(...order) : 0;
    this.first = first;
    this.next = -1; // found on the first frameAt (startFor reads the file)
    // Feed a little past the last frame needed, so reordered frames come out too.
    this.last = Math.min(clip.pts.length - 1, (order.length ? Math.max(...order) : first) + 4);
    this.decoder = new VideoDecoder({
      output: (f) => {
        this.outputs++;
        this.ready.push(f);
        this.ready.sort((a, b) => a.timestamp - b.timestamp);
        // Close what's behind straight away: decoding from a keyframe long before In would otherwise
        // hold every frame since it, and a decoder with no frames left to lend stops (and flush never ends).
        this.dropBehind();
        this.wake?.();
      },
      error: () => {
        this.broken = true;
        this.wake?.();
      },
    });
    try {
      this.decoder.configure({ codec: avcCodecString(clip.info.avcC), description: clip.info.avcC });
    } catch {
      this.broken = true;
    }
  }

  private waitOutput(ms: number): Promise<void> {
    return Promise.race([new Promise<void>((r) => (this.wake = r)), sleep(ms)]).then(() => {
      this.wake = null;
    });
  }

  /** Makes the latest frame at or before the limit `current`, closing the ones before it. */
  private dropBehind(): void {
    while (this.ready.length && this.ready[0].timestamp <= this.limit) {
      this.current?.close();
      this.current = this.ready.shift()!;
    }
  }

  /** The latest frame shown at or before `t` (seconds into the clip), or null when there's none. */
  async frameAt(t: number): Promise<VideoFrame | null> {
    const limit = us(t) + 500;
    this.limit = limit;
    if (!this.started) {
      this.started = true;
      this.next = this.broken ? -1 : await this.clip.startFor(this.first).catch(() => -1);
      if (this.next < 0) this.broken = true;
    }
    this.dropBehind();
    while (!this.broken && !this.ready.some((f) => f.timestamp > limit)) {
      if (this.next <= this.last) {
        const i = this.next++;
        const data = await this.clip.sample(i);
        if (this.broken) break;
        // Keyframe or not from the bytes: Chrome checks, and rejects a "key" chunk that isn't an IDR.
        const type = isIdr(data, this.clip.lengthSize) ? 'key' : 'delta';
        try {
          this.decoder.decode(new EncodedVideoChunk({ type, timestamp: us(this.clip.pts[i]), data }));
        } catch {
          // This camera can't be decoded from here: it draws as "no video"; the others carry on.
          this.broken = true;
          break;
        }
        this.fed++;
        if (this.fed - this.outputs >= IN_FLIGHT) await this.waitOutput(40);
      } else if (!this.flushed) {
        this.flushed = true;
        const done = await Promise.race([
          this.decoder.flush().then(
            () => true,
            () => false,
          ),
          sleep(FLUSH_TIMEOUT_MS).then(() => false),
        ]);
        if (!done) this.broken = true;
      } else break;
    }
    this.dropBehind();
    return this.broken ? null : this.current;
  }

  close(): void {
    this.clip.release();
    this.current?.close();
    this.ready.forEach((f) => f.close());
    this.ready = [];
    this.current = null;
    if (this.decoder.state !== 'closed') this.decoder.close();
  }
}

async function pickEncoder(width: number, height: number): Promise<VideoEncoderConfig> {
  for (const codec of CODECS) {
    const config: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate: bitrateFor(width, height),
      framerate: 30,
      latencyMode: 'quality',
      avc: { format: 'avc' },
    };
    try {
      if ((await VideoEncoder.isConfigSupported(config)).supported) return config;
    } catch {
      // try the next
    }
  }
  throw new ExportError('unsupported', 'this browser can’t encode H.264 video');
}

/** About one GPS point a second, from the range's frames with a real position. */
function rangeRoute(job: ExportJob): LatLon[] {
  const out: LatLon[] = [];
  let next = -Infinity;
  for (const m of job.minutes) {
    const tr = m.track;
    if (!tr) continue;
    for (let i = 0; i < tr.t.length; i++) {
      const wall = m.wallMs + tr.t[i] * 1000;
      if (wall < job.range.inMs || wall >= job.range.outMs || !tr.has[i] || (tr.lat[i] === 0 && tr.lon[i] === 0)) continue;
      if (wall < next) continue;
      out.push([tr.lat[i], tr.lon[i]]);
      next = wall + 1000;
    }
  }
  return out;
}

interface Plan {
  minute: number;
  clocks: Partial<Record<CameraId, Clip>>;
  clock: Clip;
  fromS: number;
  toS: number;
  frames: number[];
}

export async function runExport(
  job: ExportJob,
  progress: (done: number, total: number, stage: ExportStage) => void,
): Promise<{ mp4: Uint8Array; durationS: number }> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    throw new ExportError('unsupported', 'this browser has no video encoder');
  }
  const cameras = CAMERA_ORDER.filter((c) => job.cameras.includes(c));

  progress(0, 0, 'opening');
  // Read every file's index first: it says which cameras have video, and how many frames there are.
  const plans: Plan[] = [];
  for (let m = 0; m < job.minutes.length; m++) {
    const minute = job.minutes[m];
    const clocks: Partial<Record<CameraId, Clip>> = {};
    for (const c of cameras) {
      const clip = await Clip.open(minute.files[c]);
      if (clip) clocks[c] = clip;
    }
    const clock = cameras.map((c) => clocks[c]).find((c): c is Clip => !!c);
    if (!clock) continue;
    const fromS = (job.range.inMs - minute.wallMs) / 1000;
    const toS = (job.range.outMs - minute.wallMs) / 1000;
    const frames = framesBetween(clock.pts, fromS, toS);
    if (frames.length) plans.push({ minute: m, clocks, clock, fromS, toS, frames });
  }
  const total = plans.reduce((n, p) => n + p.frames.length, 0);
  if (!total) throw new ExportError('novideo', 'none of these cameras has video here');
  progress(0, total, 'frames');

  const firstClock = plans[0].clock.info;
  const front = plans.map((p) => p.clocks.front?.info).find((i) => i && i.width) ?? firstClock;
  const layout = layoutFor(cameras, { width: front.width, height: front.height });
  const config = await pickEncoder(layout.width, layout.height);
  const canvas = new OffscreenCanvas(layout.width, layout.height);
  const ctx = canvas.getContext('2d')!;
  const route = job.overlays.route ? rangeRoute(job) : [];

  const samples: Mp4Sample[] = [];
  let avcC: Uint8Array | null = null;
  let encodeError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const desc = meta?.decoderConfig?.description;
      if (desc && !avcC) {
        avcC = ArrayBuffer.isView(desc)
          ? new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength).slice()
          : new Uint8Array(desc as ArrayBuffer).slice();
      }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({
        data,
        pts: Math.round((chunk.timestamp * TIMESCALE) / 1e6),
        duration: Math.max(1, Math.round(((chunk.duration ?? 0) * TIMESCALE) / 1e6)),
        key: chunk.type === 'key',
      });
    },
    error: (e) => (encodeError = e),
  });
  encoder.configure(config);

  let outS = 0;
  let lastKeyS = -Infinity;
  let done = 0;
  try {
    for (const plan of plans) {
      const minute = job.minutes[plan.minute];
      const decoders = new Map<CameraId, ClipDecoder>();
      for (const c of cameras) {
        const clip = plan.clocks[c];
        if (clip) decoders.set(c, new ClipDecoder(clip, plan.fromS, plan.toS));
      }
      const times = plan.frames.map((i) => plan.clock.pts[i]);
      const lengths = frameDurations(times);
      try {
        for (let k = 0; k < times.length; k++) {
          if (encodeError) throw encodeError;
          const t = Math.max(times[k], plan.fromS);
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, layout.width, layout.height);
          for (const cell of layout.cells) {
            const frame = await decoders.get(cell.camera)?.frameAt(t);
            const label = job.labels[cell.camera] ?? cell.camera;
            if (frame) {
              const r = containRect({ width: frame.displayWidth, height: frame.displayHeight }, cell);
              ctx.drawImage(frame, r.x, r.y, r.w, r.h);
            } else {
              drawNoVideo(ctx, cell.x, cell.y, cell.w, cell.h, label);
            }
            if (layout.cells.length > 1) drawCellLabel(ctx, cell.x, cell.y, cell.w, cell.h, label);
          }
          const track: TelemetryTrack | null = minute.track;
          const frame = track ? telemetryAt(track, t) : null;
          drawOverlay(ctx, layout.width, layout.height, job.overlays, {
            wallMs: minute.wallMs + Math.round(t * 1000),
            frame,
            place: job.place,
            units: job.units,
            route,
            at: frame && !(frame.lat === 0 && frame.lon === 0) ? [frame.lat, frame.lon] : null,
          });
          const vf = new VideoFrame(canvas, { timestamp: us(outS), duration: us(lengths[k]) });
          const key = outS - lastKeyS >= KEYFRAME_EVERY_S - 1e-6;
          if (key) lastKeyS = outS;
          encoder.encode(vf, { keyFrame: key });
          vf.close();
          outS += lengths[k];
          while (encoder.encodeQueueSize > 4) await sleep(4);
          progress(++done, total, 'frames');
        }
      } finally {
        decoders.forEach((d) => d.close());
      }
    }
    await encoder.flush();
    if (encodeError) throw encodeError;
  } catch (e) {
    if (e instanceof ExportError) throw e;
    throw new ExportError('failed', e instanceof Error ? e.message : String(e));
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  if (!avcC) throw new ExportError('failed', 'the encoder gave no stream description');
  return { mp4: writeMp4({ width: layout.width, height: layout.height, timescale: TIMESCALE, avcC, samples }), durationS: outS };
}
