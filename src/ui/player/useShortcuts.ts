import { useEffect } from 'react';
import { engine, jumpToEvent, toggleStats } from '../../app/playback';
import { appStore, currentTimeline } from '../../app/state';
import { pickTile, stripTiles } from './CameraStrip';

export const SHORTCUTS: { key: string; label: string }[] = [
  { key: 'Space', label: 'Play / pause' },
  { key: '← / →', label: 'Back / forward 15 s' },
  { key: ', / .', label: 'One frame back / forward (paused)' },
  { key: '1–7', label: 'Camera tiles' },
  { key: 'G', label: 'Grid' },
  { key: 'E', label: 'Jump to Event' },
  { key: 'L', label: 'Clip list' },
  { key: 'M', label: 'Map' },
  { key: 'S', label: 'Stats for nerds' },
];

/** Frame length near the playhead, from the clip's driving data when known. */
export type FrameLength = () => number | undefined;

export function useShortcuts(frameLength: FrameLength): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // A dialog is open (e.g. confirming a delete): the player behind it ignores keys.
      if (document.querySelector('[aria-modal="true"]')) return;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      const tl = currentTimeline();
      if (!tl) return;
      const key = e.key.toLowerCase();
      if (e.key === ' ') {
        if (t?.tagName === 'BUTTON') return; // let Space press the focused button
        engine.toggle();
      } else if (e.key === 'ArrowLeft') engine.skip(-15);
      else if (e.key === 'ArrowRight') engine.skip(15);
      else if (e.key === ',') engine.step(-1, frameLength());
      else if (e.key === '.') engine.step(1, frameLength());
      else if (/^[1-7]$/.test(e.key)) {
        const tile = stripTiles(tl)[Number(e.key) - 1];
        if (!tile) return;
        pickTile(tile);
      } else if (key === 'g') {
        const { view } = appStore.get();
        pickTile(view.grid ? view.main : 'grid');
      } else if (key === 'e') jumpToEvent();
      else if (key === 'l') appStore.set((s) => ({ listOpen: !s.listOpen }));
      else if (key === 'm') appStore.set((s) => ({ mapOpen: !s.mapOpen }));
      else if (key === 's') toggleStats();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [frameLength]);
}
