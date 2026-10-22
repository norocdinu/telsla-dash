// A throwaway copy of Samples to test deleting on: bun run scripts/make-delete-copy.ts
// Writes .fake-drive/delete/TeslaCam/... as hard links (no extra disk space). Deleting a link leaves Samples/ untouched.
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const source = 'Samples';
const target = join('.fake-drive', 'delete', 'TeslaCam');
if (!existsSync(source)) {
  console.error(`missing ${source}`);
  process.exit(1);
}
rmSync(join('.fake-drive', 'delete'), { recursive: true, force: true });

let linked = 0;
function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const e of readdirSync(from, { withFileTypes: true })) {
    const a = join(from, e.name);
    const b = join(to, e.name);
    if (e.isDirectory()) copyTree(a, b);
    else {
      try {
        linkSync(a, b);
      } catch {
        copyFileSync(a, b);
      }
      linked++;
    }
  }
}
copyTree(source, target);
console.log(`linked ${linked} files into ${target}`);
