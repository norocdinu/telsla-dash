// Runs in a module worker: makes one exported video and sends it back.
import type { ExportJob, ExportReply } from './protocol';
import { ExportError, runExport } from './render';

const post = (m: ExportReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

self.onmessage = async (e: MessageEvent<ExportJob>) => {
  try {
    let last = 0;
    const { mp4, durationS } = await runExport(e.data, (done, total, stage) => {
      const now = Date.now();
      // Stage changes and the first and last frame always go out; the rest at most every 100 ms.
      if (done === 0 || done === total || now - last > 100) {
        last = now;
        post({ type: 'progress', done, total, stage });
      }
    });
    const buf = mp4.buffer as ArrayBuffer;
    post({ type: 'done', mp4: buf, durationS }, [buf]);
  } catch (err) {
    const kind = err instanceof ExportError ? err.kind : 'failed';
    post({ type: 'error', kind, message: err instanceof Error ? err.message : String(err) });
  }
};
