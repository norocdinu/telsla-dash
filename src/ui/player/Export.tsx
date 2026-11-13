import { useState } from 'react';
import {
  backToMarking,
  defaultCameras,
  EXPORT_TEXT,
  exportStore,
  exportSupported,
  openDialog,
  runExport,
  saveVideo,
  stopExport,
  stopMarking,
  toggleMarking,
} from '../../app/export';
import { appStore, updateSettings } from '../../app/state';
import { useStore } from '../../app/store';
import { OVERLAY_LABEL, type OverlayChoice } from '../../export/overlay';
import type { ExportStage } from '../../export/protocol';
import { rangeIssue } from '../../export/range';
import { formatWall } from '../../library/time';
import { CAMERA_LABEL, CAMERA_ORDER, type CameraId, type Timeline } from '../../library/types';
import { ConfirmDialog } from '../ConfirmDialog';
import { formatDuration } from '../format';
import { ScissorsIcon } from '../icons';

/** The scissors in the controls: starts (or ends) marking a part to export. */
export function ExportButton() {
  const marking = useStore(exportStore, (s) => s.step.kind === 'marking');
  const ok = exportSupported();
  const label = marking ? 'Stop marking' : 'Export a video of part of this clip';
  return (
    <button
      type="button"
      className={`icon-btn${marking ? ' is-on' : ''}${ok ? '' : ' is-disabled'}`}
      aria-pressed={marking}
      aria-disabled={!ok}
      aria-label={ok ? label : `${label} (not available)`}
      title={ok ? `${label} (X)` : EXPORT_TEXT.unsupported}
      onClick={() => ok && toggleMarking()}
    >
      <ScissorsIcon />
    </button>
  );
}

const seconds = (ms: number) => formatDuration(Math.round(ms / 1000));

/** Floats above the controls while marking: the range, Cancel and Export…. */
export function ExportBar({ tl }: { tl: Timeline }) {
  const s = useStore(exportStore, (st) => st);
  if (s.step.kind !== 'marking' || s.timelineId !== tl.id || !s.range) return null;
  const issue = rangeIssue(s.range);
  return (
    <div className="card export-bar" role="group" aria-label="Export">
      <span className="export-bar-text tabular">
        In {formatWall(s.range.inMs, 'clock')} · Out {formatWall(s.range.outMs, 'clock')} · {seconds(s.range.outMs - s.range.inMs)}
      </span>
      {issue && <span className="export-bar-issue">{EXPORT_TEXT[issue]}</span>}
      <button type="button" className="btn btn-secondary export-bar-btn" onClick={stopMarking}>
        Cancel
      </button>
      <button type="button" className="btn btn-primary export-bar-btn" onClick={openDialog} disabled={!!issue}>
        Export…
      </button>
    </div>
  );
}

/** What the progress bar says before frames are being made. */
const STAGE_TEXT: Partial<Record<ExportStage, string>> = {
  data: 'Reading the driving data…',
  opening: 'Opening the camera files…',
};

function sizeText(bytes: number): string {
  return bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

/** Choose cameras and what's burned in, make the video, then save it. */
export function ExportDialog({ tl }: { tl: Timeline }) {
  const s = useStore(exportStore, (st) => st);
  const overlays = useStore(appStore, (st) => st.settings.exportOverlays);
  const [cameras, setCameras] = useState<CameraId[]>(() => defaultCameras(tl));
  const step = s.step;
  if (s.timelineId !== tl.id || !s.range || step.kind === 'off' || step.kind === 'marking') return null;
  const range = s.range;
  const available = CAMERA_ORDER.filter((c) => tl.cameras.includes(c));
  const when = `${formatWall(range.inMs, 'date')} · ${formatWall(range.inMs, 'clock')} – ${formatWall(range.outMs, 'clock')} (${seconds(range.outMs - range.inMs)})`;

  if (step.kind === 'done') {
    return (
      <ConfirmDialog
        title="Your video is ready"
        confirmLabel="Save video"
        cancelLabel="Close"
        tone="primary"
        onConfirm={() => void saveVideo(step.blob, step.name)}
        onCancel={backToMarking}
      >
        <p className="modal-what tabular">
          {formatDuration(Math.round(step.durationS))} · {sizeText(step.blob.size)}
        </p>
        <p className="modal-note">{step.name}</p>
      </ConfirmDialog>
    );
  }

  const running = step.kind === 'running';
  const pct = running && step.total ? Math.round((100 * step.done) / step.total) : 0;
  const toggleCamera = (c: CameraId, on: boolean) =>
    setCameras((cur) => CAMERA_ORDER.filter((x) => (x === c ? on : cur.includes(x))));
  const setOverlay = (k: keyof OverlayChoice, on: boolean) => updateSettings({ exportOverlays: { ...overlays, [k]: on } });

  return (
    <ConfirmDialog
      title="Export video"
      confirmLabel="Export"
      tone="primary"
      onConfirm={() => void runExport(cameras, overlays)}
      onCancel={backToMarking}
      confirmDisabled={!cameras.length}
      busy={running}
      extra={
        <button type="button" className="btn btn-quiet" onClick={stopExport}>
          Stop
        </button>
      }
    >
      <p className="modal-what tabular">{when}</p>
      <fieldset className="export-group" disabled={running}>
        <legend>Cameras</legend>
        {available.map((c) => (
          <label key={c} className="export-check">
            <input type="checkbox" checked={cameras.includes(c)} onChange={(e) => toggleCamera(c, e.target.checked)} />
            {CAMERA_LABEL[c]}
          </label>
        ))}
        <p className="modal-note">{cameras.length > 1 ? `A grid of ${cameras.length} cameras.` : cameras.length ? 'One camera, full size.' : 'Tick at least one camera.'}</p>
      </fieldset>
      <fieldset className="export-group" disabled={running}>
        <legend>Burned in</legend>
        {(Object.keys(OVERLAY_LABEL) as (keyof OverlayChoice)[]).map((k) => (
          <label key={k} className="export-check">
            <input type="checkbox" checked={overlays[k]} onChange={(e) => setOverlay(k, e.target.checked)} />
            {OVERLAY_LABEL[k]}
          </label>
        ))}
      </fieldset>
      {running && (
        <div className="export-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Exporting">
          <div className="export-progress-bar" style={{ width: `${pct}%` }} />
          <span className="tabular">{STAGE_TEXT[step.stage] ?? `Exporting… ${pct}%`}</span>
        </div>
      )}
      {step.kind === 'dialog' && step.error && (
        <p className="export-error" role="alert">
          {step.error}
        </p>
      )}
    </ConfirmDialog>
  );
}
