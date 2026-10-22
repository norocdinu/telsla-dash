import type { SourceFile } from '../library/types';

/** Reference-counted object URLs for clip files, revoked when nothing uses them. */
export class ObjectUrls {
  private readonly entries = new Map<string, { url: Promise<string>; refs: number }>();

  retain(file: SourceFile): Promise<string> {
    let e = this.entries.get(file.path);
    if (!e) {
      e = { url: file.getFile().then((f) => URL.createObjectURL(f)), refs: 0 };
      this.entries.set(file.path, e);
    }
    e.refs++;
    return e.url;
  }

  release(path: string): void {
    const e = this.entries.get(path);
    if (!e) return;
    e.refs--;
    if (e.refs > 0) return;
    this.entries.delete(path);
    void e.url.then((u) => URL.revokeObjectURL(u), () => undefined);
  }

  releaseAll(): void {
    for (const [path] of this.entries) {
      const e = this.entries.get(path)!;
      e.refs = 0;
      this.release(path);
    }
  }
}
