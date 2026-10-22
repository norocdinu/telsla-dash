import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { engine } from '../../app/playback';
import { formatWall } from '../../library/time';
import type { Moment } from '../../moments/detect';
import type { Span } from '../../player/timeline-math';
import { columns, valueAt, valuesIn, type Column, type SeriesKey } from '../../stats/points';
import { chartRange, type ChartKind, type Range } from '../../stats/scale';
import type { ChartMinute } from '../../stats/series';
import { blendWindow, type TimeWindow } from '../../stats/window';

export interface ChartLine {
  key: SeriesKey;
  className: string;
  label: string;
}

interface Props {
  title: string;
  /** The current value, shown at the top right. */
  value: string;
  kind: ChartKind;
  lines: ChartLine[];
  /** A 0/1 series drawn as a red band (the brake). */
  band?: ChartLine;
  minutes: (ChartMinute | undefined)[];
  spans: Span[];
  /** The zoom eases from `from` to `to`; t in 0..1. */
  from: TimeWindow;
  to: TimeWindow;
  t: number;
  units: 'kmh' | 'mph';
  nowMs: number;
  moments: Moment[];
  format: (key: SeriesKey, v: number) => string;
}

const PAD = 2;
const sameWindow = (a: TimeWindow, b: TimeWindow) => a.fromMs === b.fromMs && a.toMs === b.toMs;

function rangeOf(kind: ChartKind, lines: ChartLine[], minutes: (ChartMinute | undefined)[], spans: Span[], w: TimeWindow, units: 'kmh' | 'mph'): Range {
  return chartRange(kind, lines.flatMap((l) => valuesIn(minutes, spans, w, l.key)), units);
}

/** Value → y pixel, with a little padding top and bottom. */
function scaleY(range: Range, h: number): (v: number) => number {
  return (v) => PAD + (1 - (v - range.min) / (range.max - range.min || 1)) * (h - 2 * PAD);
}

/** A line through min and max per column; gaps (null) break it. */
function linePath(cols: (Column | null)[], y: (v: number) => number): string {
  let d = '';
  let open = false;
  cols.forEach((c, x) => {
    if (!c) {
      open = false;
      return;
    }
    const X = x + 0.5;
    d += `${open ? 'L' : 'M'}${X} ${y(c.max).toFixed(1)}`;
    if (c.min !== c.max) d += `L${X} ${y(c.min).toFixed(1)}`;
    open = true;
  });
  return d;
}

/** Runs of columns where a 0/1 series is on, as [start, end) column pairs. */
function runs(cols: (Column | null)[]): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  cols.forEach((c, x) => {
    const on = !!c && c.max >= 1;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      out.push([start, x]);
      start = -1;
    }
  });
  if (start >= 0) out.push([start, cols.length]);
  return out;
}

/** One small chart of Stats for nerds: the lines for the window, the moment on screen, moments, hover and click. */
export function StatsChart(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<{ x: number; wall: number } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { minutes, spans, from, to, t, lines, band, kind, units } = p;
  const easing = t < 1 && !sameWindow(from, to);
  // Not easing, `to` and the ranges are the same objects render to render, so the lines aren't recomputed when only
  // the moment on screen moves.
  const win = easing ? blendWindow(from, to, t) : to;
  const rangeFrom = useMemo(() => rangeOf(kind, lines, minutes, spans, from, units), [kind, lines, minutes, spans, from, units]);
  const rangeTo = useMemo(() => rangeOf(kind, lines, minutes, spans, to, units), [kind, lines, minutes, spans, to, units]);
  // The scale eases along with the zoom instead of jumping.
  const range = useMemo(
    () => (easing ? { min: rangeFrom.min + (rangeTo.min - rangeFrom.min) * t, max: rangeFrom.max + (rangeTo.max - rangeFrom.max) * t } : rangeTo),
    [easing, rangeFrom, rangeTo, t],
  );

  const { w, h } = size;
  const xOf = (wall: number) => ((wall - win.fromMs) / (win.toMs - win.fromMs)) * w;
  const paths = useMemo(() => {
    if (w <= 0) return [];
    const y = scaleY(range, h);
    return lines.map((l) => ({ l, d: linePath(columns(minutes, spans, win, l.key, w), y) }));
  }, [lines, minutes, spans, win, range, w, h]);
  const bandRuns = useMemo(() => (band && w > 0 ? runs(columns(minutes, spans, win, band.key, w)) : []), [band, minutes, spans, win, w]);

  const wallFromX = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - r.left, 0), r.width);
    return { x, wall: win.fromMs + (x / (r.width || 1)) * (win.toMs - win.fromMs) };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => setHover(wallFromX(e.clientX));
  const onClick = (e: PointerEvent<HTMLDivElement>) => engine.seek(wallFromX(e.clientX).wall);

  const nowX = xOf(p.nowMs);
  const zero = range.min < 0 && range.max > 0 ? scaleY(range, h)(0) : null;
  const tip = hover && [
    formatWall(hover.wall, 'clock'),
    ...[...lines, ...(band ? [band] : [])].map((l) => {
      const v = valueAt(minutes, spans, hover.wall, l.key);
      return `${l.label} ${v === null ? '—' : p.format(l.key, v)}`;
    }),
  ];

  return (
    <div className="stats-chart">
      <div className="stats-chart-head">
        <span>{p.title}</span>
        <span className="stats-chart-value tabular">{p.value}</span>
      </div>
      <div
        className="stats-chart-plot"
        ref={box}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onPointerUp={onClick}
        role="img"
        aria-label={`${p.title} chart. Click to jump there.`}
      >
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
          {bandRuns.map(([a, b]) => (
            <rect key={a} className="stats-band" x={a} y={0} width={b - a} height={h} />
          ))}
          {zero !== null && <line className="stats-zero" x1={0} x2={w} y1={zero} y2={zero} />}
          {paths.map(({ l, d }) => (
            <path key={l.key} className={`stats-line ${l.className}`} d={d} />
          ))}
          {p.moments
            .filter((m) => m.wallMs >= win.fromMs && m.wallMs <= win.toMs)
            .map((m) => (
              <rect key={`${m.type}-${m.wallMs}`} className={`stats-tick stats-tick-${m.type}`} x={xOf(m.wallMs) - 1} y={h - 5} width={2} height={5} />
            ))}
          {nowX >= 0 && nowX <= w && <line className="stats-now" x1={nowX} x2={nowX} y1={0} y2={h} />}
          {hover && <line className="stats-hover" x1={hover.x} x2={hover.x} y1={0} y2={h} />}
        </svg>
        {tip && (
          <span className={`stats-tip tabular${hover.x > w / 2 ? ' is-left' : ''}`} style={{ left: hover.x }}>
            {tip.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
