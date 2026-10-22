// Dev-only: wraps files served by vite.dev-samples.ts as SourceFiles. Loaded only when import.meta.env.DEV.
// Copies under .fake-drive/ can also be deleted, through the dev server; Samples/ never can.
import type { DirRef, RootRef } from '../delete/types';
import type { SourceFile } from '../library/types';
import { KEEP } from '../sources/collect';

const MAX_CACHED = 12;
const cache = new Map<string, Promise<File>>();

function fetchFile(root: string, path: string, name: string): Promise<File> {
  const key = `${root}|${path}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = fetch(`/__dev-samples/file?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`)
    .then((r) => {
      if (!r.ok) throw new Error(`dev sample ${path}: ${r.status}`);
      return r.blob();
    })
    .then((b) => new File([b], name));
  cache.set(key, p);
  while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  p.catch(() => cache.delete(key));
  return p;
}

/** A folder of a .fake-drive copy whose entries the dev server removes (one file or one empty folder). */
function devDir(root: string, folder: string): DirRef {
  return {
    name: folder.split('/').pop() || root.split('/').pop()!,
    async removeEntry(name: string) {
      const path = folder ? `${folder}/${name}` : name;
      const r = await fetch(`/__dev-samples/delete?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`, { method: 'POST' });
      if (r.ok) return;
      if (r.status === 404) throw new DOMException(`${name} not found`, 'NotFoundError');
      if (r.status === 409) throw new DOMException(`${name} is not empty`, 'InvalidModificationError');
      throw new DOMException(`${name}: ${r.status}`, 'NoModificationAllowedError');
    },
  };
}

export async function devSampleSources(root: string): Promise<SourceFile[]> {
  const res = await fetch(`/__dev-samples/list?root=${encodeURIComponent(root)}`);
  if (!res.ok) throw new Error(`dev samples: ${res.status}`);
  const listed = (await res.json()) as { path: string; size: number }[];
  const deletable = root.split('/')[0] === '.fake-drive';
  const rootRef: RootRef = { id: 'dev', requestWrite: async () => true };
  const dirs = new Map<string, DirRef>();
  const dirOf = (folder: string) => {
    let d = dirs.get(folder);
    if (!d) dirs.set(folder, (d = devDir(root, folder)));
    return d;
  };
  return listed
    .map(({ path, size }) => ({ path, size, name: path.split('/').pop()! }))
    .filter((f) => KEEP.test(f.name))
    .map(({ path, name, size }) => {
      // The size comes with the list, so counting a delete doesn't download every file.
      const source: SourceFile = { path, name, size, getFile: () => fetchFile(root, path, name) };
      if (deletable) {
        const parts = path.split('/');
        parts.pop();
        const folder = parts.join('/');
        const parent = parts.length ? parts.slice(0, -1).join('/') : null;
        source.loc = { dir: dirOf(folder), parent: parent === null ? null : dirOf(parent), root: rootRef };
      }
      return source;
    });
}
