import type { SourceFile } from '../../src/library/types';

/** A SourceFile whose contents are `text` (empty by default). */
export function fakeSource(path: string, text = ''): SourceFile {
  const name = path.split('/').pop()!;
  return {
    path,
    name,
    size: text.length,
    getFile: async () => new File([text], name),
  };
}

/** Six camera files for one stamp in a folder. */
export function cameraFiles(folder: string, stamp: string, cameras = ['front', 'back', 'left_repeater', 'right_repeater', 'left_pillar', 'right_pillar']) {
  const prefix = folder ? `${folder}/` : '';
  return cameras.map((c) => fakeSource(`${prefix}${stamp}-${c}.mp4`));
}
