import { useEffect } from 'react';
import { engine, setView } from '../../app/playback';
import { appStore } from '../../app/state';
import { useStore } from '../../app/store';
import type { CameraId, Timeline } from '../../library/types';
import { CameraSlot } from './CameraSlot';

/** The camera actually shown as main: the chosen one if this timeline has it, else the first it has. */
export function effectiveMain(tl: Timeline, main: CameraId): CameraId {
  return tl.cameras.includes(main) ? main : tl.cameras[0];
}

export function VideoStage({ tl }: { tl: Timeline }) {
  const view = useStore(appStore, (s) => s.view);
  const slots = useStore(appStore, (s) => s.slots);
  const main = effectiveMain(tl, view.main);
  const hasPillars = tl.cameras.includes('left_pillar') || tl.cameras.includes('right_pillar');
  const visibleKey = view.grid ? tl.cameras.join(',') : main;

  useEffect(() => {
    engine.setVisible(visibleKey.split(',') as CameraId[], main);
  }, [visibleKey, main, tl]);

  const layout = view.grid ? (hasPillars ? 'grid6' : 'grid4') : 'single';
  return (
    <div className={`videos ${layout}`}>
      {tl.cameras.map((c) => (
        <CameraSlot
          key={c}
          camera={c}
          status={slots[c]}
          isMain={c === main}
          inGrid={view.grid}
          onPick={() => setView({ main: c, grid: false })}
        />
      ))}
    </div>
  );
}
