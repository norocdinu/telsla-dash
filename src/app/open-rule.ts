import type { Library, Timeline } from '../library/types';

export type Health = 'ok' | 'encrypted' | 'damaged';
export type Blocked = 'encrypted' | 'damaged' | 'empty';

/** How many timelines are checked (first 64 KB each) before opening the newest anyway. */
export const MAX_AUTO_OPEN_CHECKS = 20;

/**
 * Picks what to open after a drop: the newest playable timeline, with the list open when there's a choice.
 * Blocked only when everything was checked and nothing plays.
 */
export async function pickInitial(
  lib: Library,
  check: (tl: Timeline) => Promise<Health>,
): Promise<{ timelineId: string | null; openList: boolean; blocked: Blocked | null }> {
  const tls = lib.timelines;
  if (!tls.length) return { timelineId: null, openList: false, blocked: 'empty' };
  const openList = tls.length > 1;
  const seen: Health[] = [];
  for (const tl of tls.slice(0, MAX_AUTO_OPEN_CHECKS)) {
    const h = await check(tl);
    if (h === 'ok') return { timelineId: tl.id, openList, blocked: null };
    seen.push(h);
  }
  if (tls.length > MAX_AUTO_OPEN_CHECKS) return { timelineId: tls[0].id, openList: true, blocked: null };
  return { timelineId: null, openList: false, blocked: seen.every((h) => h === 'encrypted') ? 'encrypted' : 'damaged' };
}
