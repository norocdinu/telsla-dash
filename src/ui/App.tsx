import { LANDING } from '../app/messages';
import { appStore } from '../app/state';
import { useStore } from '../app/store';
import { FullMessage } from './FullMessage';
import { Landing } from './Landing';
import { Player } from './player/Player';
import { useGlobalDrop } from './useGlobalDrop';

export function App() {
  const dragging = useGlobalDrop();
  const hasLibrary = useStore(appStore, (s) => s.library !== null);
  const blocked = useStore(appStore, (s) => s.blocked);
  const timelineId = useStore(appStore, (s) => s.timelineId);

  let screen;
  if (blocked) screen = <FullMessage kind={blocked} />;
  else if (!hasLibrary) screen = <Landing />;
  else if (timelineId) screen = <Player />;
  else
    screen = (
      <main className="player-placeholder" role="status">
        {LANDING.reading}
      </main>
    );

  return (
    <>
      {screen}
      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <span>{LANDING.dropHere}</span>
        </div>
      )}
    </>
  );
}
