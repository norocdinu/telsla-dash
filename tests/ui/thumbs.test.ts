import { describe, expect, test } from 'bun:test';
import type { SourceFile } from '../../src/library/types';
import { captureFrame, forgetThumbs } from '../../src/ui/thumbs';

/** A file whose reading waits for `open()`; `started` says whether a capture began reading it. */
function heldFile(path: string) {
  let open!: () => void;
  const ready = new Promise<void>((r) => (open = r));
  const f: SourceFile & { started: boolean; open: () => void } = {
    path,
    name: path,
    size: 1,
    started: false,
    open: () => open(),
    getFile: async () => {
      f.started = true;
      await ready;
      return new File([], path);
    },
  };
  return f;
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('forgetThumbs', () => {
  test('a capture still waiting its turn never starts', async () => {
    const [a, b, c] = ['a.mp4', 'b.mp4', 'c.mp4'].map(heldFile);
    const pa = captureFrame(a).catch(() => undefined);
    const pb = captureFrame(b).catch(() => undefined);
    const pc = captureFrame(c);
    await tick();
    expect(c.started).toBe(false); // two at a time
    void forgetThumbs([c.path]);
    await expect(pc).rejects.toThrow();
    a.open();
    b.open();
    await Promise.all([pa, pb]);
    await tick();
    expect(c.started).toBe(false);
  });

  test('a capture already reading the file is waited for', async () => {
    const d = heldFile('d.mp4');
    captureFrame(d).catch(() => undefined);
    await tick();
    expect(d.started).toBe(true);
    let done = false;
    const p = forgetThumbs([d.path]).then(() => (done = true));
    await tick();
    expect(done).toBe(false);
    d.open();
    await p;
    expect(done).toBe(true);
  });
});
