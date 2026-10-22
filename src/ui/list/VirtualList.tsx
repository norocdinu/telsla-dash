import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { OVERSCAN } from './list-model';

/** Renders only the rows in view (plus a few), so thousands of rows stay smooth. */
export function VirtualList<T>({
  items,
  heightOf,
  keyOf,
  render,
  label,
  initialIndex = -1,
}: {
  items: T[];
  heightOf: (item: T) => number;
  keyOf: (item: T) => string;
  render: (item: T) => ReactNode;
  label: string;
  /** Item to bring into view when the list first appears (-1: start at the top). */
  initialIndex?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);

  const offsets = useMemo(() => {
    const o = new Array<number>(items.length + 1);
    o[0] = 0;
    for (let i = 0; i < items.length; i++) o[i + 1] = o[i] + heightOf(items[i]);
    return o;
  }, [items, heightOf]);

  useLayoutEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    setViewH(el.clientHeight);
    if (initialIndex > 0) {
      // A third of the way down, so the clips just before and after it show too.
      el.scrollTop = Math.max(0, offsets[initialIndex] - el.clientHeight / 3);
      setScrollTop(el.scrollTop);
    }
    return () => ro.disconnect();
    // Only on first appearance: later changes must not move the user's scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const find = (y: number) => {
    let lo = 0;
    let hi = items.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const first = Math.max(0, find(scrollTop) - OVERSCAN);
  const last = Math.min(items.length - 1, find(scrollTop + viewH) + OVERSCAN);

  const visible = [];
  for (let i = first; i <= last && items.length; i++) {
    visible.push(
      <div key={keyOf(items[i])} role="listitem" className="vrow" style={{ top: offsets[i], height: heightOf(items[i]) }}>
        {render(items[i])}
      </div>,
    );
  }

  return (
    <div className="vlist" ref={box} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} role="list" aria-label={label}>
      <div className="vlist-inner" style={{ height: offsets[items.length] }}>
        {visible}
      </div>
    </div>
  );
}
