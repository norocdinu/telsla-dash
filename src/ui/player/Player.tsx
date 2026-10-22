import { useCallback } from 'react';
import { appStore, currentTimeline, playStore, telemetryCache } from '../../app/state';
import { useStore } from '../../app/store';
import type { Timeline } from '../../library/types';
import { segmentSource } from '../../sei/scan';
import { frameIndexAt } from '../../sei/telemetry';
import { DeleteButton } from '../DeleteButton';
import { ClipList } from '../list/ClipList';
import { CameraStrip } from './CameraStrip';
import { Controls } from './Controls';
import { DrivingPanel } from './DrivingPanel';
import { MapCard, MapToggle, useRoute } from './MapCard';
import { StatsPanel, StatsToggle } from './StatsPanel';
import { TopCards } from './TopCards';
import { useShortcuts } from './useShortcuts';
import { VideoStage } from './VideoStage';

export function Player() {
  const tl = useStore(appStore, (s) => currentTimeline(s));
  const listOpen = useStore(appStore, (s) => s.listOpen);
  const mapOpen = useStore(appStore, (s) => s.mapOpen);
  const showStats = useStore(appStore, (s) => s.settings.showStats);

  const frameLength = useCallback(() => {
    const { index, offsetS } = playStore.get();
    const seg = currentTimeline()?.segments[index];
    const f = seg && segmentSource(seg);
    const track = f && telemetryCache.peek(f);
    if (!track) return undefined;
    const i = Math.max(0, frameIndexAt(track, offsetS));
    const next = track.t[i + 1] ?? track.t[i] + (track.t[i] - (track.t[i - 1] ?? 0));
    return next - track.t[i];
  }, []);
  useShortcuts(frameLength);

  if (!tl) return null;
  return (
    <main className="player">
      <div className={`stage${showStats ? ' has-stats' : ''}`}>
        <VideoStage tl={tl} />
        <TopCards tl={tl} center={<DrivingPanel />} />
        <Controls
          tl={tl}
          right={
            <>
              <MapToggle tl={tl} />
              <StatsToggle />
              <DeleteButton id={tl.id} origin="player" className="icon-btn" label="Delete this clip" />
            </>
          }
        />
        {showStats && <StatsPanel tl={tl} />}
        {mapOpen && <MapSlot tl={tl} />}
      </div>
      <CameraStrip tl={tl} />
      {listOpen && <ClipList />}
    </main>
  );
}

/** The map card, once the timeline has a GPS point. */
function MapSlot({ tl }: { tl: Timeline }) {
  const route = useRoute(tl);
  return route.length ? <MapCard tl={tl} /> : null;
}
