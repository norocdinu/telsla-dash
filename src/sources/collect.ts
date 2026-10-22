import type { SourceFile } from '../library/types';

/** A file or folder from any source (drag and drop, folder picker), read lazily. */
export interface EntryNode {
  name: string;
  kind: 'file' | 'dir';
  list?(): Promise<EntryNode[]>;
  open?(): Promise<File>;
}

/** The only files the app uses. */
export const KEEP = /\.mp4$|^event\.json$|^thumb\.png$/i;
/** How many folder levels below a dropped folder are walked. */
export const MAX_DEPTH = 4;

/** How many folders are read at once (event folders are many and small). */
export const MAX_PARALLEL_LISTS = 8;

type Limit = <T>(fn: () => Promise<T>) => Promise<T>;

function limiter(n: number): Limit {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async (fn) => {
    if (active >= n) await new Promise<void>((r) => waiting.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

function toSource(node: EntryNode, path: string): SourceFile {
  return { path, name: node.name, size: null, getFile: () => node.open!() };
}

async function walk(dirNode: EntryNode, prefix: string, depth: number, out: SourceFile[], limit: Limit): Promise<void> {
  if (depth >= MAX_DEPTH || !dirNode.list) return;
  const children = await limit(() => dirNode.list!());
  const teslaCam = children.find((c) => c.kind === 'dir' && c.name.toLowerCase() === 'teslacam');
  if (teslaCam) {
    // A whole drive (or a folder holding TeslaCam): ignore everything next to it.
    await walk(teslaCam, `${teslaCam.name}/`, 0, out, limit);
    return;
  }
  const subfolders: Promise<void>[] = [];
  for (const c of children) {
    if (c.kind === 'dir') subfolders.push(walk(c, `${prefix}${c.name}/`, depth + 1, out, limit));
    else if (KEEP.test(c.name) && c.open) out.push(toSource(c, `${prefix}${c.name}`));
  }
  await Promise.all(subfolders);
}

export async function collectSources(roots: EntryNode[]): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  const limit = limiter(MAX_PARALLEL_LISTS);
  for (const root of roots) {
    if (root.kind === 'file') {
      if (KEEP.test(root.name) && root.open) out.push(toSource(root, root.name));
      continue;
    }
    const children = root.list ? await root.list() : [];
    const teslaCam = children.find((c) => c.kind === 'dir' && c.name.toLowerCase() === 'teslacam');
    const start: EntryNode = teslaCam ?? { ...root, list: async () => children };
    await walk(start, `${start.name}/`, 0, out, limit);
  }
  return out;
}
