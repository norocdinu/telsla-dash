import { useCallback, useEffect, useMemo, useState } from 'react';
import { appStore } from '../../app/state';
import { useStore } from '../../app/store';
import { CHIP_LABEL } from '../../library/event-json';
import { nowWallMs } from '../../library/time';
import type { ReasonCategory } from '../../library/types';
import { CloseIcon } from '../icons';
import { ClipRow } from './ClipRow';
import { availableChips, buildRows, DAY_HEIGHT, listSelection, ROW_HEIGHT, type ListTab, type Row } from './list-model';
import { SettingsMenu } from './SettingsMenu';
import { VirtualList } from './VirtualList';

const TABS: { id: ListTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'recent', label: 'Recent' },
  { id: 'saved', label: 'Saved' },
  { id: 'sentry', label: 'Sentry' },
];

const close = () => appStore.set({ listOpen: false });

const setTab = (listTab: ListTab) => appStore.set({ listTab });
const setChip = (listChip: ReasonCategory | null) => appStore.set({ listChip });

export function ClipList() {
  const library = useStore(appStore, (s) => s.library);
  const currentId = useStore(appStore, (s) => s.timelineId);
  // In the app store, not this component: the list keeps its tab and filter when closed, and Up next follows them.
  const tab = useStore(appStore, (s) => s.listTab);
  const chip = useStore(appStore, (s) => s.listChip);

  const timelines = useMemo(() => library?.timelines ?? [], [library]);
  const chips = useMemo(() => availableChips(timelines, tab), [timelines, tab]);
  const activeChip = chip && chips.includes(chip) ? chip : null;
  const rows = useMemo(() => buildRows(listSelection(timelines, tab, chip), nowWallMs()), [timelines, tab, chip]);
  // Open scrolled to the clip being watched, so the ones around it are in view.
  const [startIndex] = useState(() => rows.findIndex((r) => r.kind === 'clip' && r.timeline.id === currentId));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const heightOf = useCallback((r: Row) => (r.kind === 'day' ? DAY_HEIGHT : ROW_HEIGHT), []);
  const keyOf = useCallback((r: Row) => (r.kind === 'day' ? `day:${r.label}` : r.timeline.id), []);
  const render = useCallback(
    (r: Row) =>
      r.kind === 'day' ? <div className="day-heading">{r.label}</div> : <ClipRow tl={r.timeline} current={r.timeline.id === currentId} />,
    [currentId],
  );

  return (
    <aside className="sheet" aria-label="Clips">
      <header className="sheet-head">
        <button type="button" className="sheet-icon-btn" onClick={close} aria-label="Close clip list">
          <CloseIcon />
        </button>
        <nav className="tabs" role="tablist" aria-label="Clip type">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="tab" onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <SettingsMenu />
      </header>
      {chips.length > 0 && (
        <div className="chips" role="group" aria-label="Reason">
          {chips.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={activeChip === c} onClick={() => setChip(activeChip === c ? null : c)}>
              {CHIP_LABEL[c]}
            </button>
          ))}
        </div>
      )}
      {rows.length ? (
        <VirtualList items={rows} heightOf={heightOf} keyOf={keyOf} render={render} label="Clips" initialIndex={startIndex} />
      ) : (
        <p className="sheet-empty">No clips here.</p>
      )}
    </aside>
  );
}
