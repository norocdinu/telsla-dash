import { describe, expect, test } from 'bun:test';
import type { DeleteResult } from '../../src/delete/types';
import { buildLibrary } from '../../src/library/build-library';
import { reasonInfo } from '../../src/library/event-json';
import { bulkDialogText, leftLines, resultText, singleDialogText } from '../../src/ui/delete-text';
import { cameraFiles } from '../helpers/sources';

const GB = 1024 ** 3;

function timeline(kind: 'SavedClips' | 'SentryClips' | 'RecentClips') {
  const folder = kind === 'RecentClips' ? 'TeslaCam/RecentClips' : `TeslaCam/${kind}/2026-10-18_14-12-00`;
  const tl = buildLibrary(cameraFiles(folder, '2026-10-18_14-01-11', ['front'])).timelines[0];
  if (kind !== 'RecentClips') {
    const reason = 'sentry_locked_handle_pulled';
    tl.event = { wallMs: null, city: 'Town', street: null, lat: null, lon: null, reason, ...reasonInfo(reason) };
  }
  return tl;
}

const result = (r: Partial<DeleteResult>): DeleteResult => ({ timelineId: 'x', deletedPaths: ['a'], failed: [], refused: false, ...r });

describe('singleDialogText', () => {
  test('the title names what is being deleted', () => {
    expect(singleDialogText(timeline('SentryClips'), null, false).title).toBe('Delete this Sentry event?');
    expect(singleDialogText(timeline('SavedClips'), null, false).title).toBe('Delete this Saved event?');
    expect(singleDialogText(timeline('RecentClips'), null, false).title).toBe('Delete this Recent drive?');
  });

  test('says when, where, how many files and how big', () => {
    const t = singleDialogText(timeline('SentryClips'), { files: 66, bytes: 3.1 * GB }, false);
    expect(t.what).toBe('Sun Oct 18, 2026 14:01:11 · Town · 66 files, 3.1 GB');
    expect(t.warning).toBe("It's removed from the drive permanently. This can't be undone.");
    expect(t.confirm).toBe('Delete');
  });

  test('before the files are counted, just when and where', () => {
    expect(singleDialogText(timeline('RecentClips'), null, false).what).toBe('Sun Oct 18, 2026 14:01:11 · Recent drive');
  });

  test('warns about the browser prompt only the first time', () => {
    expect(singleDialogText(timeline('SavedClips'), null, true).note).toBe('Your browser will ask to allow editing the folder.');
    expect(singleDialogText(timeline('SavedClips'), null, false).note).toBeNull();
  });
});

describe('bulkDialogText', () => {
  test('counts events, files and size', () => {
    expect(bulkDialogText(34, { files: 1904, bytes: 19_542_690_611 })).toEqual({
      title: 'Delete 34 events?',
      warning: "1,904 files, 18.2 GB will be removed from the drive permanently. This can't be undone.",
      confirm: 'Delete 34 events',
    });
  });

  test('one event reads naturally', () => {
    expect(bulkDialogText(1, { files: 6, bytes: GB }).title).toBe('Delete 1 event?');
  });
});

describe('resultText', () => {
  test('everything deleted', () => {
    expect(resultText([result({}), result({})], 18.2 * GB)).toEqual({ text: 'Deleted 2 events, 18.2 GB.', left: [] });
  });

  test('some could not be deleted, and they are named', () => {
    expect(resultText([result({ timelineId: 'a' }), result({ timelineId: 'b', failed: [{ path: 'a', reason: 'in use' }] })], GB)).toEqual({
      text: "Deleted 1 event, 1.0 GB. Couldn't delete 1 event. The drive may be read-only or a file may be in use.",
      left: ['b'],
    });
  });

  test('permission refused', () => {
    expect(resultText([result({ refused: true, deletedPaths: [] })], 0)).toEqual({
      text: 'Deleting needs permission to edit the folder. Nothing was deleted.',
      left: [],
    });
  });

  test('permission refused for one folder while the rest went', () => {
    expect(resultText([result({ timelineId: 'a' }), result({ timelineId: 'b', refused: true, deletedPaths: [] })], GB)).toEqual({
      text: 'Deleted 1 event, 1.0 GB. 1 event was left: no permission to edit its folder.',
      left: ['b'],
    });
  });
});

describe('leftLines', () => {
  test('when and where of each event left, at most five', () => {
    const tl = timeline('SentryClips');
    const lines = leftLines(Array.from({ length: 7 }, () => tl));
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe('Sun Oct 18, 2026 14:01:11 · Town');
    expect(lines[5]).toBe('…and 2 more');
  });
});
