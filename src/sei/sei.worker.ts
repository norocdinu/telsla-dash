// Runs in a module worker: reads one clip file and sends its driving data back.
import { Mp4Error } from '../mp4/read-mp4';
import type { LoadFailure } from './errors';
import { readClipTelemetry } from './read-clip';
import type { TelemetryTrack } from './telemetry';

function buffers(t: TelemetryTrack): ArrayBuffer[] {
  return [t.t, t.has, t.speed, t.pedal, t.steering, t.gear, t.autopilot, t.flags, t.lat, t.lon, t.heading, t.ax, t.ay, t.az].map(
    (a) => a.buffer as ArrayBuffer,
  );
}

self.onmessage = async (e: MessageEvent<{ id: number; file: File }>) => {
  const { id, file } = e.data;
  try {
    // In small slices: a whole-file read starves the video playing from the same drive.
    const track = await readClipTelemetry(file);
    (self as unknown as Worker).postMessage({ id, track }, buffers(track));
  } catch (err) {
    const error: LoadFailure = err instanceof Mp4Error ? 'damaged' : 'unsupported';
    (self as unknown as Worker).postMessage({ id, error });
  }
};
