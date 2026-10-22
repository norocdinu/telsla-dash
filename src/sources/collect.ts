import type { DirRef, RootRef } from '../delete/types';
import type { SourceFile } from '../library/types';

/** A file or folder from any source (drag and drop, folder picker), read lazily. */
export interface EntryNode {
  name: string;
  kind: 'file' | 'dir';
  list?(): Promise<EntryNode[]>;
  open?(): Promise<File>;
  /** Folders backed by an edit-capable handle (File System Access): remove a child, never recursively. */
  removeEntry?(name: string): Promise<void>;
  /** Roots backed by a handle: ask the browser for edit access; true when granted. */
  requestWrite?(): Promise<boolean>;
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

/** What a walk knows about where it is: the folder above, and the root the user opened (if it can edit). */
interface Place {
  parent: EntryNode | null;
  root: RootRef | null;
}

const asDir = (node: EntryNode | null): DirRef | null => (node?.removeEntry ? (node as DirRef) : null);

function toSource(node: EntryNode, path: string, dir: EntryNode | null, place: Place): SourceFile {
  const source: SourceFile = { path, name: node.name, size: null, getFile: () => node.open!() };
  const d = asDir(dir);
  if (d && place.root) source.loc = { dir: d, parent: asDir(place.parent), root: place.root };
  return source;
}

async function walk(dirNode: EntryNode, prefix: string, depth: number, out: SourceFile[], limit: Limit, place: Place): Promise<void> {
  if (depth >= MAX_DEPTH || !dirNode.list) return;
  const children = await limit(() => dirNode.list!());
  const teslaCam = children.find((c) => c.kind === 'dir' && c.name.toLowerCase() === 'teslacam');
  if (teslaCam) {
    // A whole drive (or a folder holding TeslaCam): ignore everything next to it.
    await walk(teslaCam, `${teslaCam.name}/`, 0, out, limit, { ...place, parent: dirNode });
    return;
  }
  const subfolders: Promise<void>[] = [];
  for (const c of children) {
    if (c.kind === 'dir') subfolders.push(walk(c, `${prefix}${c.name}/`, depth + 1, out, limit, { ...place, parent: dirNode }));
    else if (KEEP.test(c.name) && c.open) out.push(toSource(c, `${prefix}${c.name}`, dirNode, place));
  }
  await Promise.all(subfolders);
}

export async function collectSources(roots: EntryNode[]): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  const limit = limiter(MAX_PARALLEL_LISTS);
  for (const [i, root] of roots.entries()) {
    if (root.kind === 'file') {
      // Loose files have no folder the app can reach, so they can't be deleted.
      if (KEEP.test(root.name) && root.open) out.push(toSource(root, root.name, null, { parent: null, root: null }));
      continue;
    }
    const rootRef: RootRef | null = root.requestWrite ? { id: `${i}:${root.name}`, requestWrite: () => root.requestWrite!() } : null;
    const children = root.list ? await root.list() : [];
    const teslaCam = children.find((c) => c.kind === 'dir' && c.name.toLowerCase() === 'teslacam');
    const start: EntryNode = teslaCam ?? { ...root, list: async () => children };
    // The root's own parent isn't reachable; TeslaCam's parent is the root.
    await walk(start, `${start.name}/`, 0, out, limit, { parent: teslaCam ? root : null, root: rootRef });
  }
  return out;
}
