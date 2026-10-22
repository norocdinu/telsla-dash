import { extractTelemetry, type TelemetryTrack } from './telemetry';

/**
 * Background reads go in slices this small. Measured on a TeslaCam drive at 43 MB/s: reading a whole
 * clip at once made a video-speed reader wait 295 ms per read (worst 1.2 s, half its needed data);
 * 256 KB slices kept it at 8 ms (worst 25 ms) with the same background throughput.
 */
export const READ_SLICE_BYTES = 256 * 1024;

type SliceableBlob = Pick<Blob, 'size'> & { slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> } };

/** Reads a whole file one small slice at a time, so a playing video's reads never wait long behind ours. */
export async function readInSlices(file: SliceableBlob, sliceBytes = READ_SLICE_BYTES): Promise<Uint8Array> {
  const out = new Uint8Array(file.size);
  for (let off = 0; off < file.size; off += sliceBytes) {
    out.set(new Uint8Array(await file.slice(off, off + sliceBytes).arrayBuffer()), off);
  }
  return out;
}

export async function readClipTelemetry(file: SliceableBlob): Promise<TelemetryTrack> {
  return extractTelemetry(await readInSlices(file));
}
