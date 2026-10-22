// Dev-only: wraps files served by vite.dev-samples.ts as SourceFiles. Loaded only when import.meta.env.DEV.
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

export async function devSampleSources(root: string): Promise<SourceFile[]> {
  const res = await fetch(`/__dev-samples/list?root=${encodeURIComponent(root)}`);
  if (!res.ok) throw new Error(`dev samples: ${res.status}`);
  const paths = (await res.json()) as string[];
  return paths
    .map((path) => ({ path, name: path.split('/').pop()! }))
    .filter((f) => KEEP.test(f.name))
    .map(({ path, name }) => ({ path, name, size: null, getFile: () => fetchFile(root, path, name) }));
}
