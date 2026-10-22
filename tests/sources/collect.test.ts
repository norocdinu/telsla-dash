import { describe, expect, mock, test } from 'bun:test';
import { collectSources, type EntryNode } from '../../src/sources/collect';

function file(name: string): EntryNode {
  return { name, kind: 'file', open: async () => new File([''], name) };
}

function dir(name: string, ...children: EntryNode[]): EntryNode & { list: ReturnType<typeof mock> } {
  const list = mock(async () => children);
  return { name, kind: 'dir', list };
}

describe('collectSources', () => {
  test('from a whole drive, only TeslaCam is walked', async () => {
    const music = dir('Music', file('a.mp3'));
    const lightShow = dir('LightShow', file('x.fseq'));
    const drive = dir(
      'E',
      dir('TeslaCam', dir('SavedClips', dir('2026-10-16_20-10-53', file('2026-10-16_20-05-14-front.mp4'), file('event.json'), file('thumb.png')))),
      music,
      lightShow,
    );
    const files = await collectSources([drive]);
    expect(files.map((f) => f.path).sort()).toEqual([
      'TeslaCam/SavedClips/2026-10-16_20-10-53/2026-10-16_20-05-14-front.mp4',
      'TeslaCam/SavedClips/2026-10-16_20-10-53/event.json',
      'TeslaCam/SavedClips/2026-10-16_20-10-53/thumb.png',
    ]);
    expect(music.list).not.toHaveBeenCalled();
    expect(lightShow.list).not.toHaveBeenCalled();
  });

  test('a dropped SavedClips folder keeps its own name in paths', async () => {
    const files = await collectSources([dir('SavedClips', dir('2026-10-16_20-10-53', file('2026-10-16_20-05-14-front.mp4')))]);
    expect(files.map((f) => f.path)).toEqual(['SavedClips/2026-10-16_20-10-53/2026-10-16_20-05-14-front.mp4']);
  });

  test('other files and very deep folders are skipped', async () => {
    const deep = dir('a', dir('b', dir('c', dir('d', dir('e', dir('f', file('2026-10-16_20-05-14-front.mp4')))))));
    const files = await collectSources([dir('TeslaCam', file('notes.txt'), deep)]);
    expect(files).toEqual([]);
  });

  test('loose files keep their names as paths', async () => {
    const files = await collectSources([file('2026-10-16_20-05-14-front.mp4'), file('2026-10-16_20-05-14-back.mp4')]);
    expect(files.map((f) => f.path)).toEqual(['2026-10-16_20-05-14-front.mp4', '2026-10-16_20-05-14-back.mp4']);
  });

  test('sibling folders are read in parallel', async () => {
    const slowDir = (name: string, ...children: EntryNode[]): EntryNode => ({
      name,
      kind: 'dir',
      list: () => new Promise((r) => setTimeout(() => r(children), 40)),
    });
    const events = Array.from({ length: 6 }, (_, i) => slowDir(`2026-10-1${i}_10-00-00`, file(`2026-10-1${i}_09-59-00-front.mp4`)));
    const t0 = performance.now();
    const files = await collectSources([dir('TeslaCam', dir('SavedClips', ...events))]);
    const ms = performance.now() - t0;
    expect(files).toHaveLength(6);
    expect(ms).toBeLessThan(150); // one after another would take 6 × 40 ms
  });

  test('the files open lazily', async () => {
    const [f] = await collectSources([file('2026-10-16_20-05-14-front.mp4')]);
    expect((await f.getFile()).name).toBe('2026-10-16_20-05-14-front.mp4');
  });
});
