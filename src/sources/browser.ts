// Browser adapters for getting files in: drag and drop, the folder picker and file inputs.
// Reading is all they do; deleting goes through the removeEntry/requestWrite they expose (src/delete).
import type { SourceFile } from '../library/types';
import { KEEP, type EntryNode } from './collect';

function fromEntry(entry: FileSystemEntry): EntryNode {
  if (entry.isDirectory) {
    const dir = entry as FileSystemDirectoryEntry;
    return {
      name: entry.name,
      kind: 'dir',
      list: async () => {
        const reader = dir.createReader();
        const all: EntryNode[] = [];
        // readEntries returns batches (about 100 at a time) until an empty batch.
        for (;;) {
          const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
          if (!batch.length) break;
          all.push(...batch.map(fromEntry));
        }
        return all;
      },
    };
  }
  const fileEntry = entry as FileSystemFileEntry;
  return {
    name: entry.name,
    kind: 'file',
    open: () => new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject)),
  };
}

function fromItemFallback(item: DataTransferItem, entry: FileSystemEntry | null): EntryNode | null {
  if (entry) return fromEntry(entry);
  const f = item.getAsFile();
  return f ? { name: f.name, kind: 'file', open: async () => f } : null;
}

/**
 * Must be called synchronously inside the drop event (the items are cleared afterwards). Chrome and Edge give
 * File System Access handles, which can delete; other browsers fall back to read-only entries.
 */
export function fromDataTransfer(items: DataTransferItemList): Promise<EntryNode[]> {
  const pending: Promise<EntryNode | null>[] = [];
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.() ?? null;
    if (typeof item.getAsFileSystemHandle === 'function') {
      pending.push(
        item.getAsFileSystemHandle().then(
          (h) => {
            if (h?.kind === 'directory') return fromDirectoryHandle(h as FileSystemDirectoryHandle, true);
            if (h?.kind === 'file') return fromFileHandle(h as FileSystemFileHandle);
            return fromItemFallback(item, entry);
          },
          () => fromItemFallback(item, entry),
        ),
      );
    } else {
      pending.push(Promise.resolve(fromItemFallback(item, entry)));
    }
  }
  return Promise.all(pending).then((nodes) => nodes.filter((n): n is EntryNode => n !== null));
}

function fromFileHandle(fh: FileSystemFileHandle): EntryNode {
  return { name: fh.name, kind: 'file', open: () => fh.getFile() };
}

/** A folder from a File System Access handle. Roots can ask for edit access, which deleting needs. */
export function fromDirectoryHandle(h: FileSystemDirectoryHandle, isRoot = false): EntryNode {
  const node: EntryNode = {
    name: h.name,
    kind: 'dir',
    list: async () => {
      const out: EntryNode[] = [];
      for await (const child of h.values()) {
        if (child.kind === 'directory') out.push(fromDirectoryHandle(child as FileSystemDirectoryHandle));
        else out.push(fromFileHandle(child as FileSystemFileHandle));
      }
      return out;
    },
    removeEntry: (name) => h.removeEntry(name),
  };
  if (isRoot) {
    node.requestWrite = async () => {
      const opts = { mode: 'readwrite' as const };
      if ((await h.queryPermission?.(opts)) === 'granted') return true;
      return (await h.requestPermission?.(opts)) === 'granted';
    };
  }
  return node;
}

export function fromFileList(list: FileList | File[]): SourceFile[] {
  const out: SourceFile[] = [];
  for (const f of Array.from(list)) {
    if (!KEEP.test(f.name)) continue;
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
    out.push({ path: rel || f.name, name: f.name, size: f.size, getFile: async () => f });
  }
  return out;
}

export type PickResult =
  | { kind: 'nodes'; nodes: EntryNode[] }
  | { kind: 'files'; files: SourceFile[] }
  | { kind: 'cancelled' }
  | { kind: 'refused' };

function pickWithInput(setup: (input: HTMLInputElement) => void): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    setup(input);
    const done = (files: FileList | null) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done(input.files && input.files.length ? input.files : null), { once: true });
    input.addEventListener('cancel', () => done(null), { once: true });
    document.body.append(input);
    input.click();
  });
}

export async function pickFolder(): Promise<PickResult> {
  if (typeof window.showDirectoryPicker === 'function') {
    try {
      // Read access now; edit access is asked only when the user confirms a delete.
      const handle = await window.showDirectoryPicker({ mode: 'read', id: 'teslacam' });
      return { kind: 'nodes', nodes: [fromDirectoryHandle(handle, true)] };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return { kind: 'cancelled' };
      return { kind: 'refused' };
    }
  }
  const files = await pickWithInput((input) => {
    input.webkitdirectory = true;
  });
  return files ? { kind: 'files', files: fromFileList(files) } : { kind: 'cancelled' };
}

export async function pickFiles(): Promise<SourceFile[] | null> {
  const files = await pickWithInput((input) => {
    input.multiple = true;
    input.accept = '.mp4,video/mp4';
  });
  return files ? fromFileList(files) : null;
}
