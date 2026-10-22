import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { devDeleteAllowed } from '../../vite.dev-delete-guard';

const P = resolve('/p');

describe('devDeleteAllowed (dev server only)', () => {
  test('a file inside a .fake-drive copy may be deleted', () => {
    expect(devDeleteAllowed(P, '.fake-drive/delete', 'TeslaCam/SavedClips/x/a.mp4')).toBe(resolve(P, '.fake-drive/delete/TeslaCam/SavedClips/x/a.mp4'));
  });

  test('never anything under Samples', () => {
    expect(devDeleteAllowed(P, 'Samples', 'SavedClips/x/a.mp4')).toBeNull();
    expect(devDeleteAllowed(P, '.fake-drive/../Samples', 'a.mp4')).toBeNull();
    expect(devDeleteAllowed(P, '.fake-drive/delete', '../../Samples/a.mp4')).toBeNull();
  });

  test('never the .fake-drive folder itself or a path outside the project', () => {
    expect(devDeleteAllowed(P, '.fake-drive', '')).toBeNull();
    expect(devDeleteAllowed(P, '.fake-drive', '.')).toBeNull();
    expect(devDeleteAllowed(P, '.fake-drive/delete', '../../../etc/passwd')).toBeNull();
  });
});
