import type { SourceFile } from '../library/types';
import { classifyHead, HEAD_BYTES } from '../mp4/read-mp4';
import { TelemetryLoadError, type LoadFailure } from './errors';
import { createSerial } from './serial';
import type { TelemetryTrack } from './telemetry';

export { TelemetryLoadError, type LoadFailure };

/** Judges a file from its first 64 KB only. */
export async function readHealth(file: SourceFile): Promise<'mp4' | 'encrypted' | 'damaged'> {
  const f = await file.getFile();
  const head = new Uint8Array(await f.slice(0, HEAD_BYTES).arrayBuffer());
  return classifyHead(head, f.size);
}

type Reply = { id: number; track: TelemetryTrack } | { id: number; error: LoadFailure };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (t: TelemetryTrack) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./sei.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<Reply>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if ('track' in e.data) p.resolve(e.data.track);
      else p.reject(new TelemetryLoadError(e.data.error));
    };
  }
  return worker;
}

/** One clip file is read at a time, so the worker never holds several 80 MB files at once. */
const oneAtATime = createSerial();

/** Reads a clip's driving data in the shared worker. Encrypted or damaged files fail fast. */
export async function loadTelemetryInWorker(file: SourceFile): Promise<TelemetryTrack> {
  const health = await readHealth(file);
  if (health !== 'mp4') throw new TelemetryLoadError(health);
  return oneAtATime(async () => {
    const f = await file.getFile();
    const id = nextId++;
    return new Promise<TelemetryTrack>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      getWorker().postMessage({ id, file: f });
    });
  });
}
