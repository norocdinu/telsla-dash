// Browser adapters for getting files in: drag and drop, the folder picker and file inputs.
// Everything is read-only.
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

/** Must be called synchronously inside the drop event. */
export function fromDataTransfer(items: DataTransferItemList): EntryNode[] {
  const nodes: EntryNode[] = [];
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) {
      nodes.push(fromEntry(entry));
    } else {
      const f = item.getAsFile();
      if (f) nodes.push({ name: f.name, kind: 'file', open: async () => f });
    }
  }
  return nodes;
}

export function fromDirectoryHandle(h: FileSystemDirectoryHandle): EntryNode {
  return {
    name: h.name,
    kind: 'dir',
    list: async () => {
      const out: EntryNode[] = [];
      for await (const child of h.values()) {
        if (child.kind === 'directory') out.push(fromDirectoryHandle(child as FileSystemDirectoryHandle));
        else {
          const fh = child as FileSystemFileHandle;
          out.push({ name: fh.name, kind: 'file', open: () => fh.getFile() });
        }
      }
      return out;
    },
  };
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
      const handle = await window.showDirectoryPicker({ mode: 'read', id: 'teslacam' });
      return { kind: 'nodes', nodes: [fromDirectoryHandle(handle)] };
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
