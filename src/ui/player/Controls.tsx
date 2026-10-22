import type { ReactNode } from 'react';
import { engine, jumpToEvent } from '../../app/playback';
import { playStore } from '../../app/state';
import { useStore } from '../../app/store';
import type { Timeline } from '../../library/types';
import { PauseIcon, PlayIcon, Skip15Icon } from '../icons';
import { Scrubber } from './Scrubber';

export function Controls({ tl, right }: { tl: Timeline; right?: ReactNode }) {
  const playing = useStore(playStore, (s) => s.playing);
  const rate = useStore(playStore, (s) => s.rate);
  const hasEvent = tl.event?.wallMs != null;
  return (
    <div className="controls">
      <div className="controls-row">
        <div className="controls-left">
          {hasEvent && (
            <button type="button" className="btn jump-btn" onClick={jumpToEvent}>
              Jump to Event
            </button>
          )}
        </div>
        <div className="controls-center">
          <button type="button" className="icon-btn" onClick={() => engine.skip(-15)} aria-label="Back 15 seconds" title="Back 15 s (←)">
            <Skip15Icon dir={-1} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-lg"
            onClick={() => engine.toggle()}
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button type="button" className="icon-btn" onClick={() => engine.skip(15)} aria-label="Forward 15 seconds" title="Forward 15 s (→)">
            <Skip15Icon dir={1} />
          </button>
          <button type="button" className="icon-btn rate-btn tabular" onClick={() => engine.cycleRate()} aria-label={`Playback speed ${rate}×`}>
            {rate}x
          </button>
        </div>
        <div className="controls-right">{right}</div>
      </div>
      <Scrubber tl={tl} />
    </div>
  );
}
