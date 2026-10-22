import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { engine, seekLead } from '../../app/playback';
import { appStore, playStore } from '../../app/state';
import { useStore } from '../../app/store';
import { formatWall } from '../../library/time';
import type { Timeline } from '../../library/types';
import type { Moment } from '../../moments/detect';
import { bounds, buildSpans } from '../../player/timeline-math';
import { tickPercent } from '../format';

const NO_MOMENTS: Moment[] = [];

export function Scrubber({ tl }: { tl: Timeline }) {
  const durations = useStore(appStore, (s) => s.durations);
  const moments = useStore(appStore, (s) => s.moments[tl.id] ?? NO_MOMENTS);
  const wallMs = useStore(playStore, (s) => s.wallMs);
  const b = useMemo(() => bounds(buildSpans(tl.segments, durations)), [tl, durations]);
  const track = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ pct: number; label: string } | null>(null);
  const dragging = useRef(false);

  const wallFromX = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return { pct: pct * 100, wall: b.startMs + pct * (b.endMs - b.startMs) };
  };

  const nearMoment = (pct: number) => {
    const r = track.current!.getBoundingClientRect();
    const px = (p: number) => (p / 100) * r.width;
    return moments.find((m) => Math.abs(px(tickPercent(b, m.wallMs)) - px(pct)) <= 6) ?? null;
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const { pct, wall } = wallFromX(e.clientX);
    const m = nearMoment(pct);
    if (m) {
      seekLead(m.wallMs);
      return;
    }
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    engine.seek(wall);
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const { pct, wall } = wallFromX(e.clientX);
    if (dragging.current) engine.seek(wall);
    const m = nearMoment(pct);
    setHover({ pct, label: `${formatWall(m ? m.wallMs : wall, 'clock')}${m ? ` · ${m.label}` : ''}` });
  };

  const played = tickPercent(b, wallMs);
  return (
    <div
      className="scrubber"
      ref={track}
      role="slider"
      aria-label="Position"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(played)}
      aria-valuetext={formatWall(wallMs || b.startMs, 'clock')}
      tabIndex={0}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => (dragging.current = false)}
      onPointerLeave={() => setHover(null)}
    >
      <div className="scrubber-track">
        <div className="scrubber-played" style={{ width: `${played}%` }} />
      </div>
      {moments.map((m) => (
        <span key={`${m.type}-${m.wallMs}`} className={`tick tick-${m.type}`} style={{ left: `${tickPercent(b, m.wallMs)}%` }} />
      ))}
      <span className="scrubber-thumb" style={{ left: `${played}%` }} />
      {hover && (
        <span className="scrubber-tip tabular" style={{ left: `${hover.pct}%` }}>
          {hover.label}
        </span>
      )}
    </div>
  );
}
