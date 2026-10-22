import { describe, expect, test } from 'bun:test';
import { isEventFolderName, parseClipName } from '../../src/library/filename';
import { CAMERA_ORDER } from '../../src/library/types';

describe('parseClipName', () => {
  test('parses current file names', () => {
    expect(parseClipName('2026-10-16_20-07-11-front.mp4')).toEqual({
      stamp: '2026-10-16_20-07-11',
      wallMs: Date.UTC(2026, 9, 16, 20, 7, 11),
      camera: 'front',
    });
  });

  test('parses old names without seconds', () => {
    expect(parseClipName('2019-06-08_12-34-left_repeater.mp4')?.wallMs).toBe(Date.UTC(2019, 5, 8, 12, 34, 0));
  });

  test('accepts every camera, any case of extension', () => {
    for (const c of CAMERA_ORDER) expect(parseClipName(`2026-10-16_20-07-11-${c}.MP4`)?.camera).toBe(c);
  });

  test('rejects other files', () => {
    for (const n of ['thumb.png', 'event.json', 'notes.mp4', '2026-10-16_20-07-11-front.mov', '2026-10-16_20-07-11-cabin.mp4']) {
      expect(parseClipName(n)).toBeNull();
    }
  });
});

describe('isEventFolderName', () => {
  test('matches event folders only', () => {
    expect(isEventFolderName('2026-10-16_20-10-53')).toBe(true);
    expect(isEventFolderName('RecentClips')).toBe(false);
    expect(isEventFolderName('2026-10-16_20-10')).toBe(false);
  });
});
