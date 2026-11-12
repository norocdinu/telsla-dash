import { useRef, type PointerEvent, type RefObject } from 'react';
import { exportStore, setRange } from '../../app/export';
import { engine } from '../../app/playback';
import { useStore } from '../../app/store';
import { dragIn, dragOut } from '../../export/range';
import { formatWall } from '../../library/time';
import { tickPercent } from '../format';

type Bounds = { startMs: number; endMs: number };

/** The export range on the scrubber while marking: a highlight and two handles that seek as they're dragged. */
export function ExportRangeMarks({ timelineId, b, track }: { timelineId: string; b: Bounds; track: RefObject<HTMLDivElement | null> }) {
  const s = useStore(exportStore, (st) => st);
  const dragging = useRef<'in' | 'out' | null>(null);
  if (s.step.kind !== 'marking' || s.timelineId !== timelineId || !s.range) return null;
  const range = s.range;

  const wallAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return b.startMs + pct * (b.endMs - b.startMs);
  };
  const move = (which: 'in' | 'out', ms: number) => {
    const cur = exportStore.get().range;
    if (!cur) return;
    const next = which === 'in' ? dragIn(cur, ms, b) : dragOut(cur, ms, b);
    setRange(next);
    engine.seek(which === 'in' ? next.inMs : next.outMs);
  };
  const handle = (which: 'in' | 'out') => {
    const ms = which === 'in' ? range.inMs : range.outMs;
    const label = `${which === 'in' ? 'In' : 'Out'} ${formatWall(ms, 'clock')}`;
    return (
      <span
        className={`export-handle export-handle-${which}`}
        style={{ left: `${tickPercent(b, ms)}%` }}
        role="slider"
        tabIndex={0}
        aria-label={which === 'in' ? 'Export start' : 'Export end'}
        aria-valuetext={label}
        title={`${label} (${which === 'in' ? 'I' : 'O'} sets it at the playhead)`}
        onPointerDown={(e: PointerEvent<HTMLSpanElement>) => {
          e.stopPropagation();
          dragging.current = which;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (dragging.current !== which) return;
          e.stopPropagation();
          move(which, wallAt(e.clientX));
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          dragging.current = null;
        }}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          e.stopPropagation();
          move(which, ms + (e.key === 'ArrowLeft' ? -1000 : 1000));
        }}
      />
    );
  };

  const left = tickPercent(b, range.inMs);
  return (
    <>
      <span className="export-range" style={{ left: `${left}%`, width: `${tickPercent(b, range.outMs) - left}%` }} />
      {handle('in')}
      {handle('out')}
    </>
  );
}
