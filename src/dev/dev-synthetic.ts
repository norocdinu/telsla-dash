// Dev only (?dev-synthetic): a small fake Saved event made in the browser, for trying the player and Export
// without real clips. Real H.264 from VideoEncoder, with the car's SEI driving data put in front of every frame,
// written by our own MP4 writer. Nothing here is real data, and it never leaves the page.
import type { CameraId, SourceFile } from '../library/types';
import { writeMp4, type Mp4Sample } from '../mp4/write-mp4';
import { seiNal } from './sei-encode';

const W = 640;
const H = 416;
const FPS = 30;
const SEGMENT_S = 20;
const SEGMENTS = 2;
const CAMERAS: CameraId[] = ['front', 'back', 'left_repeater', 'right_repeater'];
const FOLDER = 'SavedClips/2026-11-12_10-00-40';
const START = Date.UTC(2026, 10, 12, 10, 0, 0);
const TIMESCALE = 90_000;

const pad = (n: number) => String(n).padStart(2, '0');
function stamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}`;
}

/** Made-up driving: speeds up, a hard stop at 0:28, self-driving until 0:18, left blinker 0:08–0:12. */
function driving(t: number, seq: number): Record<string, unknown> {
  const braking = t >= 28 && t < 29.5;
  const speed = t < 28 ? Math.min(20, t * 1.2) : Math.max(0, 20 - (t - 28) * 4);
  return {
    version: 1,
    gearState: speed > 0 || t < 30 ? 1 : 0,
    frameSeqNo: seq,
    vehicleSpeedMps: speed,
    acceleratorPedalPosition: t < 16 ? 35 + 20 * Math.sin(t) : t < 28 ? 15 : 0,
    steeringWheelAngle: 40 * Math.sin(t / 2),
    blinkerOnLeft: t >= 8 && t < 12 && Math.floor(t * 2.5) % 2 === 0,
    blinkerOnRight: false,
    brakeApplied: t >= 28,
    autopilotState: t < 18 ? 1 : 0,
    latitudeDeg: 47.0 + t * 0.00012,
    longitudeDeg: 28.85 + Math.sin(t / 8) * 0.0008 + t * 0.00006,
    headingDeg: 30,
    linearAccelerationMps2X: 1.2 * Math.cos(t / 2),
    linearAccelerationMps2Y: braking ? 3.9 : t < 16 ? -1.2 : 0.1,
    linearAccelerationMps2Z: 0.05,
  };
}

function lengthPrefixed(nal: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + nal.length);
  new DataView(out.buffer).setUint32(0, nal.length);
  out.set(nal, 4);
  return out;
}

/**
 * ?dev-synthetic=long-gop: one keyframe per file, as the car may write them (the worst case for seeking).
 * ?dev-synthetic=no-stss: the same, and the file claims every frame is a keyframe (no stss), so only the
 * frames' own bytes tell the real one.
 */
const mode = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('dev-synthetic') : null;
const keyEvery = mode === 'long-gop' || mode === 'no-stss' ? SEGMENT_S * FPS : FPS;
const claimAllKeys = mode === 'no-stss';

async function encodeClip(camera: CameraId, segment: number): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d')!;
  const samples: Mp4Sample[] = [];
  let avcC: Uint8Array | null = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => {
      const d = meta?.decoderConfig?.description;
      if (d && !avcC) avcC = ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength).slice() : new Uint8Array(d as ArrayBuffer).slice();
      const pic = new Uint8Array(chunk.byteLength);
      chunk.copyTo(pic);
      const i = samples.length;
      const t = segment * SEGMENT_S + i / FPS;
      const sei = lengthPrefixed(seiNal(driving(t, segment * SEGMENT_S * FPS + i)));
      const data = new Uint8Array(sei.length + pic.length);
      data.set(sei);
      data.set(pic, sei.length);
      samples.push({ data, pts: Math.round((chunk.timestamp * TIMESCALE) / 1e6), duration: TIMESCALE / FPS, key: claimAllKeys || chunk.type === 'key' });
    },
    error: (e) => console.error('dev-synthetic encoder', e),
  });
  enc.configure({ codec: 'avc1.42001f', width: W, height: H, bitrate: 1_000_000, framerate: FPS, avc: { format: 'avc' } });
  const hue = { front: 210, back: 20, left_repeater: 130, right_repeater: 280, left_pillar: 50, right_pillar: 330 }[camera];
  for (let i = 0; i < SEGMENT_S * FPS; i++) {
    const t = segment * SEGMENT_S + i / FPS;
    ctx.fillStyle = `hsl(${hue} 35% 22%)`;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `hsl(${hue} 60% 55%)`;
    ctx.fillRect(((t * 80) % (W + 80)) - 80, H - 90, 80, 50);
    ctx.fillStyle = '#fff';
    ctx.font = '600 34px system-ui, sans-serif';
    ctx.fillText(`${camera} · synthetic`, 24, 60);
    ctx.font = '500 26px ui-monospace, monospace';
    ctx.fillText(`t = ${t.toFixed(3)} s   frame ${i}`, 24, 110);
    const vf = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(vf, { keyFrame: i % keyEvery === 0 });
    vf.close();
    // Wait on the encoder (timers crawl in a hidden tab), with a timer too: a dequeue that fired before the
    // listener was added would otherwise leave this waiting for one that never comes.
    while (enc.encodeQueueSize > 8) {
      await Promise.race([new Promise((r) => enc.addEventListener('dequeue', r, { once: true })), new Promise((r) => setTimeout(r, 20))]);
    }
  }
  await enc.flush();
  enc.close();
  return writeMp4({ width: W, height: H, timescale: TIMESCALE, avcC: avcC!, samples });
}

function source(path: string, bytes: Uint8Array | string): SourceFile {
  const name = path.split('/').pop()!;
  const file = new File([bytes as BlobPart], name);
  return { path, name, size: file.size, getFile: async () => file };
}

export async function devSyntheticSources(): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  for (let s = 0; s < SEGMENTS; s++) {
    const at = stamp(START + s * SEGMENT_S * 1000);
    for (const c of CAMERAS) out.push(source(`${FOLDER}/${at}-${c}.mp4`, await encodeClip(c, s)));
  }
  const event = {
    timestamp: '2026-11-12T10:00:28',
    city: 'Synthetic Town',
    street: 'Test Street',
    est_lat: '47.0035',
    est_lon: '28.852',
    reason: 'user_interaction_honk',
    camera: '0',
  };
  out.push(source(`${FOLDER}/event.json`, JSON.stringify(event)));
  return out;
}
