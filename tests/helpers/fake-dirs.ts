import type { DirRef, FileLocation, RootRef } from '../../src/delete/types';
import type { SourceFile } from '../../src/library/types';

export interface FakeDir extends DirRef {
  removed: string[];
}

/**
 * A directory that records removals. `failOn` names throw NoModificationAllowedError, `goneOn` names
 * throw NotFoundError, `nonEmpty` names (folders) throw InvalidModificationError, `busyOnce` names fail the
 * first time only (a file still in use for a moment). A shared `log` records `dir/name` in the order removals happen.
 */
export function fakeDir(
  name: string,
  opts: { failOn?: string[]; goneOn?: string[]; nonEmpty?: string[]; busyOnce?: string[]; log?: string[] } = {},
): FakeDir {
  const removed: string[] = [];
  const busy = new Set(opts.busyOnce);
  return {
    name,
    removed,
    async removeEntry(entry: string) {
      if (opts.failOn?.includes(entry)) throw new DOMException(`${entry} is in use`, 'NoModificationAllowedError');
      if (busy.delete(entry)) throw new DOMException(`${entry} is in use`, 'NoModificationAllowedError');
      if (opts.goneOn?.includes(entry)) throw new DOMException(`${entry} not found`, 'NotFoundError');
      if (opts.nonEmpty?.includes(entry)) throw new DOMException(`${entry} is not empty`, 'InvalidModificationError');
      removed.push(entry);
      opts.log?.push(`${name}/${entry}`);
    },
  };
}

export function fakeRoot(id: string, grant = true): RootRef & { asked: number } {
  const root = {
    id,
    asked: 0,
    async requestWrite() {
      root.asked++;
      return grant;
    },
  };
  return root;
}

/** A source file that knows where it lives, `bytes` long. */
export function locSource(path: string, dir: DirRef, parent: DirRef | null, root: RootRef, bytes = 10): SourceFile {
  const name = path.split('/').pop()!;
  const loc: FileLocation = { dir, parent, root };
  return { path, name, size: bytes, loc, getFile: async () => new File([new Uint8Array(bytes)], name) };
}
