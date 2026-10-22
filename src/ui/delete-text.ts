import { DELETE } from '../app/messages';
import { formatGB } from '../delete/bulk';
import type { DeleteResult } from '../delete/types';
import { formatWall } from '../library/time';
import type { Timeline } from '../library/types';
import { placeOf } from './format';

const NOUN = { saved: 'Saved event', sentry: 'Sentry event', recent: 'Recent drive' } as const;
const events = (n: number) => `${n} ${n === 1 ? 'event' : 'events'}`;
const count = (n: number) => n.toLocaleString('en-US');

export function singleDialogText(tl: Timeline, m: { files: number; bytes: number } | null, firstTime: boolean) {
  const when = `${formatWall(tl.startMs, 'full')} · ${placeOf(tl)}`;
  return {
    title: `Delete this ${NOUN[tl.kind]}?`,
    what: m ? `${when} · ${count(m.files)} files, ${formatGB(m.bytes)}` : when,
    warning: DELETE.warning,
    note: firstTime ? DELETE.firstTime : null,
    confirm: 'Delete' as const,
  };
}

export function bulkDialogText(n: number, m: { files: number; bytes: number }) {
  return {
    title: `Delete ${events(n)}?`,
    warning: `${count(m.files)} files, ${formatGB(m.bytes)} will be removed from the drive permanently. This can't be undone.`,
    confirm: `Delete ${events(n)}`,
  };
}

/** The message after a delete (or a failed attempt), and the ids of the events still there, to name them. */
export interface ResultMessage {
  text: string;
  left: string[];
}

/** What happened, for the message after a delete. `bytes` is the size of the events fully deleted. */
export function resultText(results: DeleteResult[], bytes: number): ResultMessage {
  const done = results.filter((r) => !r.refused && !r.failed.length).length;
  const failed = results.filter((r) => !r.refused && r.failed.length).length;
  const refused = results.filter((r) => r.refused).length;
  if (!done && !failed && refused) return { text: DELETE.refused, left: [] };
  const parts: string[] = [];
  if (done) parts.push(`Deleted ${events(done)}, ${formatGB(bytes)}.`);
  if (failed) parts.push(DELETE.failed(failed));
  if (refused) parts.push(DELETE.refusedSome(refused));
  return { text: parts.join(' '), left: results.filter((r) => r.refused || r.failed.length).map((r) => r.timelineId) };
}

const LEFT_SHOWN = 5;

/** When and where of the events left after a delete; past the first five, "…and N more". */
export function leftLines(tls: Timeline[]): string[] {
  const lines = tls.slice(0, LEFT_SHOWN).map((t) => `${formatWall(t.startMs, 'full')} · ${placeOf(t)}`);
  if (tls.length > LEFT_SHOWN) lines.push(`…and ${tls.length - LEFT_SHOWN} more`);
  return lines;
}
