// A full day of Recent clips as empty files, for the listing-speed check: bun run scripts/make-fake-drive.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CAMERAS = ['front', 'back', 'left_repeater', 'right_repeater', 'left_pillar', 'right_pillar'];
const dir = join('.fake-drive', 'day', 'TeslaCam', 'RecentClips');
mkdirSync(dir, { recursive: true });

const p = (n: number) => String(n).padStart(2, '0');
const start = Date.UTC(2026, 0, 1, 0, 0, 0);
let count = 0;
for (let i = 0; i < 1440; i++) {
  const d = new Date(start + i * 60_000);
  const stamp = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}_${p(d.getUTCHours())}-${p(d.getUTCMinutes())}-00`;
  for (const c of CAMERAS) {
    writeFileSync(join(dir, `${stamp}-${c}.mp4`), '');
    count++;
  }
}
console.log(`wrote ${count} empty clip files to ${dir}`);

// Many short drives (5 minutes apart), for checking that a long clip list scrolls smoothly.
const manyDir = join('.fake-drive', 'many', 'TeslaCam', 'RecentClips');
mkdirSync(manyDir, { recursive: true });
for (let i = 0; i < 2000; i++) {
  const d = new Date(start + i * 5 * 60_000);
  const stamp = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}_${p(d.getUTCHours())}-${p(d.getUTCMinutes())}-00`;
  writeFileSync(join(manyDir, `${stamp}-front.mp4`), '');
}
console.log(`wrote 2000 one-clip drives to ${manyDir}`);
