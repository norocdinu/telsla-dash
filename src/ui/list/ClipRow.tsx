import { useEffect, useMemo } from 'react';
import { checkTimeline } from '../../app/load-library';
import { DAMAGED_FILE } from '../../app/messages';
import { openTimeline } from '../../app/playback';
import { appStore } from '../../app/state';
import { useStore } from '../../app/store';
import { formatWall } from '../../library/time';
import type { Timeline } from '../../library/types';
import type { Moment } from '../../moments/detect';
import { bounds, buildSpans } from '../../player/timeline-math';
import { formatDuration, placeOf } from '../format';
import { DeleteButton } from '../DeleteButton';
import { LockIcon } from '../icons';
import { useThumb } from '../player/TopCards';
import { momentsBadge } from './list-model';

const NO_MOMENTS: Moment[] = [];

export function ClipRow({ tl, current }: { tl: Timeline; current: boolean }) {
  const health = useStore(appStore, (s) => s.health[tl.id]);
  const moments = useStore(appStore, (s) => s.moments[tl.id] ?? NO_MOMENTS);
  const durations = useStore(appStore, (s) => s.durations);
  const playable = health !== 'encrypted' && health !== 'damaged';
  const thumb = useThumb(playable ? tl : null);

  useEffect(() => {
    if (!health) void checkTimeline(tl);
  }, [health, tl]);

  const duration = useMemo(() => {
    const b = bounds(buildSpans(tl.segments, durations));
    return formatDuration((b.endMs - b.startMs) / 1000);
  }, [tl, durations]);
  const badge = momentsBadge(moments);

  return (
    <div className="clip-row-wrap">
    <button type="button" className={`clip-row${current ? ' is-current' : ''}`} onClick={() => openTimeline(tl.id, undefined, true)} aria-current={current}>
      <span className="clip-thumb">
        {!playable ? (
          <span className="clip-thumb-state">{health === 'encrypted' ? <LockIcon /> : null}</span>
        ) : thumb ? (
          <img src={thumb} alt="" />
        ) : (
          <span className="thumb-skeleton" />
        )}
      </span>
      <span className="clip-text">
        <span className="clip-when tabular">{formatWall(tl.startMs, 'full')}</span>
        <span className="clip-where">{placeOf(tl)}</span>
        <span className="clip-meta">
          {health === 'encrypted' ? (
            <span className="clip-state">Encrypted</span>
          ) : health === 'damaged' ? (
            <span className="clip-state">{DAMAGED_FILE}</span>
          ) : (
            <>
              {tl.event && <span>{tl.event.label}</span>}
              <span className="tabular">{duration}</span>
            </>
          )}
          {badge && playable && <span className="clip-badge">{badge}</span>}
        </span>
      </span>
    </button>
    {/* A sibling, not inside the row button: buttons can't nest. */}
    <DeleteButton id={tl.id} origin="list" className="row-trash" label={`Delete ${formatWall(tl.startMs, 'full')}`} />
    </div>
  );
}
