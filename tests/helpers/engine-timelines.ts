import type { CameraId, Segment, SourceFile, Timeline } from '../../src/library/types';
import { media } from './fake-video';
import { avcc, buildMp4, randomBytes } from './mp4-builder';

export const T = Date.UTC(2026, 9, 17, 18, 0, 0);
export type Kind = 'ok' | 'damaged' | 'encrypted';

const damagedBytes = buildMp4({ samples: [1, 2, 3].map(() => avcc(new Uint8Array(600).fill(0x41))), durations: [1, 1, 1] }).slice(0, -50);
const encryptedBytes = randomBytes(70_000);

let fileNo = 0;

/** A clip file whose fake <video> plays for 60 s ('ok') or fails to load. */
export function source(kind: Kind): SourceFile {
  const name = `${kind}-${++fileNo}.mp4`;
  media.set(name, kind === 'ok' ? { duration: 60 } : { error: 4 });
  const bytes = kind === 'damaged' ? damagedBytes : kind === 'encrypted' ? encryptedBytes : new Uint8Array(16);
  return { path: name, name, size: bytes.length, getFile: async () => new File([bytes.slice()], name) };
}

/** Segments one minute apart; each lists its cameras' kinds (absent = missing file). */
export function timeline(id: string, segs: Partial<Record<CameraId, Kind>>[]): Timeline {
  const segments: Segment[] = segs.map((s, i) => ({
    key: `${id}/${i}`,
    wallMs: T + i * 60_000,
    files: Object.fromEntries(Object.entries(s).map(([c, k]) => [c, source(k as Kind)])),
  }));
  const cameras = [...new Set(segs.flatMap((s) => Object.keys(s)))] as CameraId[];
  return { id, kind: 'saved', folder: id, segments, startMs: T, cameras, event: null, eventJson: null, thumb: null };
}

export const flush = async (n = 30) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};
