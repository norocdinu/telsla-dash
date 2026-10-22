import { parseEventJson } from './event-json';
import { isEventFolderName, parseClipName } from './filename';
import { CAMERA_ORDER, type CameraId, type Library, type Segment, type SourceFile, type Timeline, type TimelineKind } from './types';

/** Consecutive Recent starts this far apart begin a new drive: a 60 s segment plus a 2-minute gap. */
export const DRIVE_SPLIT_MS = 180_000;

const EVENT_PARENTS = new Map<string, TimelineKind>([
  ['savedclips', 'saved'],
  ['sentryclips', 'sentry'],
]);
const READ_CONCURRENCY = 8;

interface Group {
  kind: TimelineKind;
  folder: string;
  segments: Map<string, Segment>;
}

function splitPath(path: string): { folder: string; parent: string; grand: string } {
  const parts = path.split('/');
  parts.pop();
  return { folder: parts.join('/'), parent: parts[parts.length - 1] ?? '', grand: parts[parts.length - 2] ?? '' };
}

function classify(parent: string, grand: string): TimelineKind | 'event-unknown' {
  if (parent.toLowerCase() === 'recentclips') return 'recent';
  if (isEventFolderName(parent)) return EVENT_PARENTS.get(grand.toLowerCase()) ?? 'event-unknown';
  return 'recent';
}

function camerasOf(segments: Segment[]): CameraId[] {
  const present = new Set<CameraId>();
  for (const s of segments) for (const c of Object.keys(s.files) as CameraId[]) present.add(c);
  return CAMERA_ORDER.filter((c) => present.has(c));
}

function makeTimeline(kind: TimelineKind, id: string, folder: string | null, segments: Segment[]): Timeline {
  return {
    id,
    kind,
    folder,
    segments,
    startMs: segments[0].wallMs,
    cameras: camerasOf(segments),
    event: null,
    eventJson: null,
    thumb: null,
  };
}

export function buildLibrary(files: SourceFile[]): Library {
  const groups = new Map<string, Group>();
  const extras = new Map<string, { eventJson?: SourceFile; thumb?: SourceFile }>();
  let ignored = 0;

  for (const f of files) {
    const { folder, parent, grand } = splitPath(f.path);
    const lower = f.name.toLowerCase();
    if (lower === 'event.json' || lower === 'thumb.png') {
      const e = extras.get(folder) ?? {};
      if (lower === 'event.json') e.eventJson = f;
      else e.thumb = f;
      extras.set(folder, e);
      continue;
    }
    const clip = parseClipName(f.name);
    if (!clip) {
      ignored++;
      continue;
    }
    const cls = classify(parent, grand);
    const kind: TimelineKind = cls === 'event-unknown' ? 'saved' : cls;
    const groupKey = `${kind === 'recent' ? 'recent' : 'event'}|${folder}`;
    let g = groups.get(groupKey);
    if (!g) {
      g = { kind, folder, segments: new Map() };
      groups.set(groupKey, g);
    }
    const key = folder ? `${folder}/${clip.stamp}` : clip.stamp;
    let seg = g.segments.get(key);
    if (!seg) {
      seg = { key, wallMs: clip.wallMs, files: {} };
      g.segments.set(key, seg);
    }
    seg.files[clip.camera] = f;
  }

  const timelines: Timeline[] = [];
  for (const g of groups.values()) {
    const segments = [...g.segments.values()].sort((a, b) => a.wallMs - b.wallMs);
    if (g.kind !== 'recent') {
      const tl = makeTimeline(g.kind, `${g.kind}:${g.folder}`, g.folder, segments);
      const e = extras.get(g.folder);
      tl.eventJson = e?.eventJson ?? null;
      tl.thumb = e?.thumb ?? null;
      timelines.push(tl);
      continue;
    }
    let run: Segment[] = [];
    const flush = () => {
      if (run.length) timelines.push(makeTimeline('recent', `recent:${run[0].key}`, g.folder || null, run));
      run = [];
    };
    for (const s of segments) {
      if (run.length && s.wallMs - run[run.length - 1].wallMs >= DRIVE_SPLIT_MS) flush();
      run.push(s);
    }
    flush();
  }

  timelines.sort((a, b) => b.startMs - a.startMs);
  return { timelines, ignored };
}

/** An event folder that wasn't inside SavedClips or SentryClips (dropped on its own). */
function isLoneEvent(tl: Timeline): boolean {
  if (!tl.folder) return false;
  const parts = tl.folder.split('/');
  return !EVENT_PARENTS.has((parts[parts.length - 2] ?? '').toLowerCase());
}

/** Reads each event.json and fills `event`. Lone folders whose reason is Sentry become sentry events. */
export async function attachEvents(lib: Library, read: (f: SourceFile) => Promise<string>): Promise<void> {
  const queue = lib.timelines.filter((t) => t.eventJson);
  const worker = async () => {
    for (let tl = queue.shift(); tl; tl = queue.shift()) {
      let text: string;
      try {
        text = await read(tl.eventJson!);
      } catch {
        continue;
      }
      tl.event = parseEventJson(text);
      if (tl.kind === 'saved' && isLoneEvent(tl) && tl.event?.reason?.startsWith('sentry')) {
        tl.kind = 'sentry';
        tl.id = `sentry:${tl.folder}`;
      }
    }
  };
  await Promise.all(Array.from({ length: READ_CONCURRENCY }, worker));
}
