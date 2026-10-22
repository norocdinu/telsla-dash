import { describe, expect, test } from 'bun:test';
import { bulkMatches, dayStartMs, formatGB, selectedIds, selectionTotal } from '../../src/delete/bulk';
import { buildLibrary } from '../../src/library/build-library';
import { reasonInfo } from '../../src/library/event-json';
import { cameraFiles } from '../helpers/sources';

function library() {
  const events: [string, string, string][] = [
    ['SavedClips', '2026-09-02_10-00-00', 'user_interaction_honk'],
    ['SentryClips', '2026-09-01_00-00-30', 'sentry_aware_object_detection'],
    ['SavedClips', '2026-08-31_23-59-30', 'user_interaction_honk'],
  ];
  const tls = buildLibrary(
    events.flatMap(([kind, stamp]) => cameraFiles(`TeslaCam/${kind}/${stamp}`, stamp, ['front'])),
  ).timelines;
  for (const [, stamp, reason] of events) {
    const tl = tls.find((t) => t.id.endsWith(stamp))!;
    tl.event = { wallMs: null, city: null, street: null, lat: null, lon: null, reason, ...reasonInfo(reason) };
  }
  return tls;
}

describe('dayStartMs', () => {
  test('midnight at the start of the day, as wall-clock ms', () => {
    expect(dayStartMs('2026-09-01')).toBe(Date.UTC(2026, 8, 1));
  });

  test('null for anything that is not a date', () => {
    expect(dayStartMs('nope')).toBeNull();
    expect(dayStartMs('')).toBeNull();
  });
});

describe('bulkMatches', () => {
  test('"older than" keeps events that start before that day', () => {
    const ids = bulkMatches(library(), 'all', null, dayStartMs('2026-09-01')).map((t) => t.id.split('/').pop());
    expect(ids).toEqual(['2026-08-31_23-59-30']);
  });

  test('type and reason filter like the clip list', () => {
    expect(bulkMatches(library(), 'saved', 'honk', null)).toHaveLength(2);
    expect(bulkMatches(library(), 'sentry', null, null)).toHaveLength(1);
  });

  test('no date means no date limit', () => {
    expect(bulkMatches(library(), 'all', null, null)).toHaveLength(3);
  });
});

describe('formatGB', () => {
  test('GB of 1024³ bytes with one decimal', () => {
    expect(formatGB(19_542_690_611)).toBe('18.2 GB');
    expect(formatGB(1024 ** 3)).toBe('1.0 GB');
  });

  test('anything small still shows', () => {
    expect(formatGB(5_000)).toBe('0.1 GB');
    expect(formatGB(0)).toBe('0.0 GB');
  });
});

describe('selectionTotal', () => {
  test('adds up known sizes and counts the ones still being measured', () => {
    const sizes = new Map([
      ['a', 100],
      ['b', 50],
    ]);
    expect(selectionTotal(sizes, ['a', 'b', 'c'])).toEqual({ events: 3, bytes: 150, pending: 1 });
  });
});

describe('selectedIds', () => {
  test('ticked, deletable and counted; an event that could not be counted is never selected', () => {
    const tls = library();
    const [a, b, c] = tls.map((t) => t.id);
    expect(selectedIds(tls, new Set([a, b, c]), new Set([b]), new Set([c]))).toEqual([a]);
  });
});
