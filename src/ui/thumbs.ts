import type { SourceFile } from '../library/types';

const WIDTH = 320;
const HEIGHT = 180;
const MAX_PARALLEL = 2;

const cache = new Map<string, Promise<string>>();
const queue: (() => void)[] = [];
let running = 0;

function next(): void {
  if (running >= MAX_PARALLEL) return;
  const job = queue.shift();
  if (!job) return;
  running++;
  job();
}

async function grab(file: SourceFile, atS: number): Promise<string> {
  const src = URL.createObjectURL(await file.getFile());
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadeddata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('thumbnail: video error')), { once: true });
      video.src = src;
    });
    await new Promise<void>((resolve) => {
      video.addEventListener('seeked', () => resolve(), { once: true });
      video.currentTime = Math.min(atS, Number.isFinite(video.duration) ? video.duration / 2 : atS);
    });
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d')!;
    // Cover-fit the frame into 16:9.
    const scale = Math.max(WIDTH / video.videoWidth, HEIGHT / video.videoHeight);
    const w = video.videoWidth * scale;
    const h = video.videoHeight * scale;
    ctx.drawImage(video, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
    if (!blob) throw new Error('thumbnail: no image');
    return URL.createObjectURL(blob);
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(src);
  }
}

/** A small JPEG of one frame, as an object URL. Cached by path; at most two decode at once. */
export function captureFrame(file: SourceFile, atS = 0.1): Promise<string> {
  const hit = cache.get(file.path);
  if (hit) return hit;
  const p = new Promise<string>((resolve, reject) => {
    queue.push(() => {
      grab(file, atS)
        .then(resolve, reject)
        .finally(() => {
          running--;
          next();
        });
    });
    next();
  });
  cache.set(file.path, p);
  p.catch(() => cache.delete(file.path));
  return p;
}

/** thumb.png and other images: an object URL, cached by path. */
export function imageUrl(file: SourceFile): Promise<string> {
  const hit = cache.get(file.path);
  if (hit) return hit;
  const p = file.getFile().then((f) => URL.createObjectURL(f));
  cache.set(file.path, p);
  p.catch(() => cache.delete(file.path));
  return p;
}
