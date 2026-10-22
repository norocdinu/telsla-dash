// Edge-case copies of one sample event: bun run scripts/make-damaged.ts
//   .fake-drive/damaged   — the first and third front files and the last back file cut to their first 1 MB
//   .fake-drive/encrypted — every clip replaced by 2 MB of random bytes (a stand-in; real encrypted clips are unknown)
//   .fake-drive/partial   — the first segment's left_pillar file left out, next to a second complete event
// Unchanged files are hard links (no extra disk space), copies where linking fails.
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const EVENT = '2026-10-16_20-10-53';
const source = join('Samples', 'SavedClips', EVENT);
if (!existsSync(source)) {
  console.error(`missing ${source}`);
  process.exit(1);
}
const files = readdirSync(source).filter((f) => f.endsWith('.mp4') || f === 'event.json' || f === 'thumb.png');

function target(kind: string): string {
  const dir = join('.fake-drive', kind, 'TeslaCam', 'SavedClips', EVENT);
  rmSync(join('.fake-drive', kind), { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

function link(from: string, to: string): void {
  try {
    linkSync(from, to);
  } catch {
    copyFileSync(from, to);
  }
}

// Cut files at the start, in the middle (reached through preload) and in the last segment.
const damaged = target('damaged');
const fronts = files.filter((f) => f.endsWith('-front.mp4')).sort();
const backs = files.filter((f) => f.endsWith('-back.mp4')).sort();
const cut = fronts[0];
const cuts = new Set([fronts[0], fronts[2], backs[backs.length - 1]]);
for (const f of files) {
  if (cuts.has(f)) writeFileSync(join(damaged, f), await Bun.file(join(source, f)).slice(0, 1024 * 1024).bytes());
  else link(join(source, f), join(damaged, f));
}

const encrypted = target('encrypted');
for (const f of files) {
  if (f.endsWith('.mp4')) writeFileSync(join(encrypted, f), crypto.getRandomValues(new Uint8Array(2 * 1024 * 1024)).map((b, i) => (i < 8 ? 0x41 : b)));
  else link(join(source, f), join(encrypted, f));
}

const partial = target('partial');
const firstStamp = cut.replace('-front.mp4', '');
const missing = `${firstStamp}-left_pillar.mp4`;
for (const f of files) if (f !== missing) link(join(source, f), join(partial, f));

// A second, complete event next to it, so switching between timelines can be checked.
const OTHER = '2026-10-17_18-12-26';
const otherSource = join('Samples', 'SavedClips', OTHER);
const otherDir = join('.fake-drive', 'partial', 'TeslaCam', 'SavedClips', OTHER);
mkdirSync(otherDir, { recursive: true });
for (const f of readdirSync(otherSource)) link(join(otherSource, f), join(otherDir, f));

console.log(
  `damaged: ${[...cuts].join(', ')} cut to 1 MB; encrypted: ${files.filter((f) => f.endsWith('.mp4')).length} random files; partial: ${missing} removed, plus ${OTHER}`,
);
