import { useCallback, useEffect, useMemo, useState } from 'react';
import { plansFor } from '../../app/delete';
import { DELETE } from '../../app/messages';
import { appStore } from '../../app/state';
import { useStore } from '../../app/store';
import { bulkMatches, dayStartMs, formatGB, selectedIds, selectionTotal } from '../../delete/bulk';
import { measurePlan } from '../../delete/plan';
import { CHIP_LABEL } from '../../library/event-json';
import { formatWall } from '../../library/time';
import type { ReasonCategory, Timeline } from '../../library/types';
import { deleteFlow } from '../deleting';
import { placeOf } from '../format';
import { CloseIcon } from '../icons';
import { availableChips, type ListTab } from './list-model';
import { VirtualList } from './VirtualList';

const TABS: { id: ListTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'recent', label: 'Recent' },
  { id: 'saved', label: 'Saved' },
  { id: 'sentry', label: 'Sentry' },
];
const ROW = 56;
const MEASURE_PARALLEL = 4;
const close = () => appStore.set({ manageOpen: false });

/**
 * Sizes of the given timelines, measured in the background (a few at a time) and kept across renders, with the
 * ids whose files couldn't be read (those can't be selected).
 */
function useSizes(tls: Timeline[]): { sizes: Map<string, number>; unreadable: Set<string> } {
  const [state, setState] = useState(() => ({ sizes: new Map<string, number>(), unreadable: new Set<string>() }));
  useEffect(() => {
    let live = true;
    const queue = tls.filter((t) => !state.sizes.has(t.id) && !state.unreadable.has(t.id));
    const found = new Map<string, number>();
    const failed = new Set<string>();
    const flush = () =>
      live &&
      (found.size || failed.size) &&
      setState((s) => ({ sizes: new Map([...s.sizes, ...found]), unreadable: new Set([...s.unreadable, ...failed]) }));
    const timer = setInterval(flush, 250);
    const worker = async () => {
      for (let tl = queue.shift(); tl && live; tl = queue.shift()) {
        const [plan] = plansFor([tl.id]);
        if (!plan) continue;
        try {
          found.set(tl.id, (await measurePlan(plan)).bytes);
        } catch {
          failed.add(tl.id);
        }
      }
    };
    void Promise.all(Array.from({ length: MEASURE_PARALLEL }, worker)).then(() => {
      clearInterval(timer);
      flush();
    });
    return () => {
      live = false;
      clearInterval(timer);
    };
    // Measure each timeline once; `state` only grows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tls]);
  return state;
}

/** For the occasional clear-out: pick events by type, reason and age, untick any to keep, delete the rest. */
export function ManageEvents() {
  const library = useStore(appStore, (s) => s.library);
  const busy = useStore(deleteFlow.store, (s) => s.step !== 'idle');
  const timelines = useMemo(() => library?.timelines ?? [], [library]);
  const [tab, setTab] = useState<ListTab>('all');
  const [chip, setChip] = useState<ReasonCategory | null>(null);
  const [olderThan, setOlderThan] = useState('');
  // Unticked ids: anything newly matching arrives ticked.
  const [unticked, setUnticked] = useState(() => new Set<string>());

  const chips = useMemo(() => availableChips(timelines, tab), [timelines, tab]);
  const matches = useMemo(() => bulkMatches(timelines, tab, chip, dayStartMs(olderThan)), [timelines, tab, chip, olderThan]);
  const deletable = useMemo(() => new Set(plansFor(matches.map((t) => t.id)).map((p) => p.timeline.id)), [matches]);
  const { sizes, unreadable } = useSizes(matches);
  const selected = selectedIds(matches, deletable, unticked, unreadable);
  const total = selectionTotal(sizes, selected);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = useCallback(
    (id: string) =>
      setUnticked((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    [],
  );

  const render = useCallback(
    (t: Timeline) => {
      const failed = unreadable.has(t.id);
      const can = deletable.has(t.id) && !failed;
      const size = sizes.get(t.id);
      const why = failed ? DELETE.unreadable : DELETE.notDeletable;
      return (
        <label className={`manage-row${can ? '' : ' is-disabled'}`} title={can ? undefined : why}>
          <input type="checkbox" checked={can && !unticked.has(t.id)} disabled={!can} onChange={() => toggle(t.id)} />
          <span className="manage-when tabular">{formatWall(t.startMs, 'full')}</span>
          <span className="manage-where">{placeOf(t)}</span>
          <span className="manage-reason">{t.event?.label ?? ''}</span>
          <span className="manage-size tabular">{failed ? '—' : size === undefined ? '…' : formatGB(size)}</span>
        </label>
      );
    },
    [deletable, sizes, unreadable, unticked, toggle],
  );

  const counting = total.pending > 0;
  const summary = `${total.events} ${total.events === 1 ? 'event' : 'events'}, ${formatGB(total.bytes)}${counting ? ' (counting…)' : ''}`;
  const noneDeletable = matches.length > 0 && deletable.size === 0;

  return (
    <div className="manage" role="dialog" aria-label="Manage events">
      <header className="manage-head">
        <button type="button" className="sheet-icon-btn" onClick={close} aria-label="Close Manage events">
          <CloseIcon />
        </button>
        <h2 className="manage-title">Manage events</h2>
      </header>
      <div className="manage-filters">
        <nav className="tabs" role="tablist" aria-label="Type">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="tab" onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <label className="manage-date">
          Older than
          <input type="date" value={olderThan} onChange={(e) => setOlderThan(e.target.value)} />
        </label>
      </div>
      {chips.length > 0 && (
        <div className="chips" role="group" aria-label="Reason">
          {chips.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={chip === c} onClick={() => setChip(chip === c ? null : c)}>
              {CHIP_LABEL[c]}
            </button>
          ))}
        </div>
      )}
      {noneDeletable && <p className="sheet-empty">{DELETE.notDeletable}</p>}
      {matches.length ? (
        <VirtualList items={matches} heightOf={() => ROW} keyOf={(t) => t.id} render={render} label="Events to delete" />
      ) : (
        <p className="sheet-empty">No events match.</p>
      )}
      <footer className="manage-foot">
        <div className="manage-select">
          <button type="button" className="btn btn-quiet" onClick={() => setUnticked(new Set())}>
            Select all
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setUnticked(new Set(matches.map((t) => t.id)))}>
            Select none
          </button>
        </div>
        <span className="manage-total tabular" role="status">
          {summary}
        </span>
        <button
          type="button"
          className="btn btn-danger"
          disabled={!selected.length || counting || busy}
          onClick={() => deleteFlow.open(selected, 'manage')}
        >
          {`Delete ${total.events} ${total.events === 1 ? 'event' : 'events'} (${formatGB(total.bytes)})…`}
        </button>
      </footer>
    </div>
  );
}
