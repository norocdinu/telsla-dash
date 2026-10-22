import { useEffect, useState } from 'react';
import { setView } from '../../app/playback';
import { appStore } from '../../app/state';
import { useStore } from '../../app/store';
import { CAMERA_LABEL, type CameraId, type Timeline } from '../../library/types';
import { GridIcon } from '../icons';
import { captureFrame } from '../thumbs';
import { effectiveMain } from './VideoStage';

export type Tile = 'grid' | CameraId;

export function stripTiles(tl: Timeline): Tile[] {
  return ['grid', ...tl.cameras];
}

export function pickTile(tile: Tile): void {
  const { view } = appStore.get();
  if (tile === 'grid') setView({ main: view.main, grid: true });
  else setView({ main: tile, grid: false });
}

function CameraThumb({ tl, camera }: { tl: Timeline; camera: CameraId }) {
  const [url, setUrl] = useState<{ key: string; url: string } | null>(null);
  const file = tl.segments.find((s) => s.files[camera])?.files[camera] ?? null;
  useEffect(() => {
    if (!file) return;
    let live = true;
    captureFrame(file).then(
      (u) => live && setUrl({ key: file.path, url: u }),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [file]);
  return url && file && url.key === file.path ? <img src={url.url} alt="" /> : <span className="thumb-skeleton" />;
}

export function CameraStrip({ tl }: { tl: Timeline }) {
  const view = useStore(appStore, (s) => s.view);
  const main = effectiveMain(tl, view.main);
  return (
    <nav className="strip" aria-label="Cameras">
      {stripTiles(tl).map((tile, i) => {
        const selected = tile === 'grid' ? view.grid : !view.grid && tile === main;
        const label = tile === 'grid' ? 'Grid' : CAMERA_LABEL[tile];
        return (
          <button
            key={tile}
            type="button"
            className={`tile${selected ? ' is-selected' : ''}`}
            aria-pressed={selected}
            title={`${label} (${i + 1})`}
            onClick={() => pickTile(tile)}
          >
            {tile === 'grid' ? <GridIcon className="tile-grid-icon" /> : <CameraThumb tl={tl} camera={tile} />}
            <span className="tile-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
