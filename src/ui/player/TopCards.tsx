import { useEffect, useState } from 'react';
import { nextTimeline, openTimeline } from '../../app/playback';
import { appStore, playStore } from '../../app/state';
import { useStore } from '../../app/store';
import { formatWall } from '../../library/time';
import type { Timeline } from '../../library/types';
import { segmentSource } from '../../sei/scan';
import { ListIcon, SkipNextIcon } from '../icons';
import { placeOf } from '../format';
import { captureFrame, imageUrl } from '../thumbs';

export function useThumb(tl: Timeline | null): string | null {
  const [url, setUrl] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!tl) return;
    let live = true;
    const front = segmentSource(tl.segments[0]);
    const p = tl.thumb ? imageUrl(tl.thumb) : front ? captureFrame(front) : null;
    p?.then(
      (u) => live && setUrl({ id: tl.id, url: u }),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [tl]);
  return url && tl && url.id === tl.id ? url.url : null;
}

function PlaceCard({ tl }: { tl: Timeline }) {
  const wallMs = useStore(playStore, (s) => s.wallMs);
  return (
    <button type="button" className="card place-card" onClick={() => appStore.set({ listOpen: true })} aria-label="Open clip list">
      <ListIcon className="card-icon" />
      <span className="card-text">
        <span className="card-title">{placeOf(tl)}</span>
        <span className="card-sub tabular">{formatWall(wallMs || tl.startMs, 'full')}</span>
      </span>
    </button>
  );
}

function UpNextCard() {
  const next = useStore(appStore, (s) => nextTimeline(s));
  const thumb = useThumb(next);
  if (!next) return null;
  return (
    <button type="button" className="card upnext-card" onClick={() => openTimeline(next.id, undefined, true)} aria-label={`Up next: ${placeOf(next)}`}>
      <SkipNextIcon className="card-icon" />
      <span className="upnext-thumb">{thumb && <img src={thumb} alt="" />}</span>
      <span className="card-text">
        <span className="card-title">{placeOf(next)}</span>
        <span className="card-sub">{formatWall(next.startMs, 'date')}</span>
      </span>
    </button>
  );
}

export function TopCards({ tl, center }: { tl: Timeline; center?: React.ReactNode }) {
  return (
    <div className="top-cards">
      <div className="top-left">
        <PlaceCard tl={tl} />
      </div>
      <div className="top-center">{center}</div>
      <div className="top-right">
        <UpNextCard />
      </div>
    </div>
  );
}
