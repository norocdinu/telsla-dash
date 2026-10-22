import { describe, expect, test } from 'bun:test';
import { reasonInfo } from '../../src/library/event-json';
import { buildLibrary } from '../../src/library/build-library';
import type { Timeline } from '../../src/library/types';
import type { Moment } from '../../src/moments/detect';
import { availableChips, buildRows, filterTimelines, listSelection, momentsBadge, nextInList } from '../../src/ui/list/list-model';
import { cameraFiles } from '../helpers/sources';

function sampleLike(): Timeline[] {
  const files = [
    ...cameraFiles('TeslaCam/RecentClips', '2026-10-19_22-08-57', ['front']),
    ...cameraFiles('TeslaCam/SentryClips/2026-10-18_14-25-20', '2026-10-18_14-15-03', ['front']),
    ...cameraFiles('TeslaCam/SentryClips/2026-10-18_14-12-00', '2026-10-18_14-01-11', ['front']),
    ...cameraFiles('TeslaCam/SavedClips/2026-10-17_18-12-26', '2026-10-17_18-01-29', ['front']),
  ];
  const tls = buildLibrary(files).timelines;
  const reasons: Record<string, string> = {
    '2026-10-18_14-25-20': 'sentry_aware_object_detection',
    '2026-10-18_14-12-00': 'sentry_locked_handle_pulled',
    '2026-10-17_18-12-26': 'user_interaction_honk',
  };
  for (const tl of tls) {
    const key = Object.keys(reasons).find((k) => tl.id.includes(k));
    if (key) {
      tl.event = { wallMs: null, city: null, street: null, lat: null, lon: null, reason: reasons[key], ...reasonInfo(reasons[key]) };
    }
  }
  return tls;
}

/** Newest first: Saved/Honk, Sentry, Saved/Honk, Saved/Manual, Saved/Honk. */
function mixed(): Timeline[] {
  const events: [string, string, string][] = [
    ['SavedClips', '2026-10-21_10-00-00', 'user_interaction_honk'],
    ['SentryClips', '2026-10-20_10-00-00', 'sentry_aware_object_detection'],
    ['SavedClips', '2026-10-19_10-00-00', 'user_interaction_honk'],
    ['SavedClips', '2026-10-18_10-00-00', 'user_interaction_dashcam_icon_tapped'],
    ['SavedClips', '2026-10-17_10-00-00', 'user_interaction_honk'],
  ];
  const tls = buildLibrary(events.flatMap(([kind, stamp]) => cameraFiles(`TeslaCam/${kind}/${stamp}`, stamp.replace('10-00', '09-59'), ['front']))).timelines;
  for (const [, stamp, reason] of events) {
    const tl = tls.find((t) => t.id.endsWith(stamp))!;
    tl.event = { wallMs: null, city: null, street: null, lat: null, lon: null, reason, ...reasonInfo(reason) };
  }
  return tls;
}

describe('listSelection', () => {
  test('a chip that has no clips in the tab is ignored', () => {
    const tls = mixed();
    expect(listSelection(tls, 'sentry', 'honk').map((t) => t.kind)).toEqual(['sentry']);
    expect(listSelection(tls, 'saved', 'honk')).toHaveLength(3);
  });
});

describe('nextInList', () => {
  test('the next older clip in the same tab and filter', () => {
    const tls = mixed();
    const honks = tls.filter((t) => t.event?.category === 'honk');
    expect(nextInList(tls, honks[0].id, 'saved', 'honk')?.id).toBe(honks[1].id);
    expect(nextInList(tls, honks[1].id, 'saved', 'honk')?.id).toBe(honks[2].id);
  });

  test('nothing after the last one in the filter', () => {
    const tls = mixed();
    const honks = tls.filter((t) => t.event?.category === 'honk');
    expect(nextInList(tls, honks[2].id, 'saved', 'honk')).toBeNull();
  });

  test('a clip outside the filter falls back to the next one overall', () => {
    const tls = mixed();
    expect(nextInList(tls, tls[1].id, 'saved', 'honk')?.id).toBe(tls[2].id);
  });

  test('with no filter, the next older clip overall', () => {
    const tls = mixed();
    expect(nextInList(tls, tls[0].id, 'all', null)?.id).toBe(tls[1].id);
  });
});

describe('filterTimelines', () => {
  test('tabs filter by kind', () => {
    const tls = sampleLike();
    expect(filterTimelines(tls, 'all', null)).toHaveLength(4);
    expect(filterTimelines(tls, 'recent', null).map((t) => t.kind)).toEqual(['recent']);
    expect(filterTimelines(tls, 'saved', null).map((t) => t.kind)).toEqual(['saved']);
    expect(filterTimelines(tls, 'sentry', null).map((t) => t.kind)).toEqual(['sentry', 'sentry']);
  });

  test('a chip narrows by reason, and recent drives drop out', () => {
    const tls = sampleLike();
    expect(filterTimelines(tls, 'all', 'handle').map((t) => t.event?.reason)).toEqual(['sentry_locked_handle_pulled']);
  });
});

describe('availableChips', () => {
  test('only reasons present, in chip order', () => {
    expect(availableChips(sampleLike(), 'all')).toEqual(['object', 'handle', 'honk']);
    expect(availableChips(sampleLike(), 'saved')).toEqual(['honk']);
    expect(availableChips(sampleLike(), 'recent')).toEqual([]);
  });
});

describe('buildRows', () => {
  const today = Date.UTC(2026, 9, 21, 12, 0, 0);
  const files = [
    ...cameraFiles('RecentClips', '2026-10-21_08-00-00', ['front']),
    ...cameraFiles('RecentClips', '2026-10-20_23-59-30', ['front']),
    ...cameraFiles('RecentClips', '2026-10-21_00-00-30', ['front']),
    ...cameraFiles('RecentClips', '2026-10-19_22-08-57', ['front']),
  ];

  test('day headings before each new start day', () => {
    const rows = buildRows(buildLibrary(files).timelines, today);
    expect(rows.map((r) => (r.kind === 'day' ? r.label : 'clip'))).toEqual(['Today', 'clip', 'Yesterday', 'clip', 'Mon Oct 19, 2026', 'clip']);
  });

  test('a drive that starts before midnight sits under its start day', () => {
    const rows = buildRows(buildLibrary(files).timelines, today);
    const yesterday = rows.findIndex((r) => r.kind === 'day' && r.label === 'Yesterday');
    const next = rows[yesterday + 1];
    expect(next.kind === 'clip' && next.timeline.startMs).toBe(Date.UTC(2026, 9, 20, 23, 59, 30));
  });
});

describe('momentsBadge', () => {
  const m = (type: Moment['type']): Moment => ({ type, wallMs: 0, label: '' });

  test('nothing for no moments', () => {
    expect(momentsBadge([])).toBeNull();
    expect(momentsBadge([m('event')])).toBeNull();
  });

  test('counts by type, without the event itself', () => {
    expect(momentsBadge([m('brake'), m('brake'), m('swerve'), m('event')])).toBe('2 hard brakes · 1 swerve');
    expect(momentsBadge([m('ap_off')])).toBe('1 self-driving off');
  });
});
