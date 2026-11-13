// Messages between the page and the export worker.
import type { CameraId } from '../library/types';
import type { TelemetryTrack } from '../sei/telemetry';
import type { Units } from '../ui/format';
import type { OverlayChoice } from './overlay';
import type { ExportRange } from './range';

export interface ExportMinute {
  wallMs: number;
  files: Partial<Record<CameraId, File>>;
  /** The minute's driving data (a copy of the player's), or null without any. */
  track: TelemetryTrack | null;
}

export interface ExportJob {
  range: ExportRange;
  /** In strip order. One camera is shown alone; more make a grid. */
  cameras: CameraId[];
  labels: Partial<Record<CameraId, string>>;
  minutes: ExportMinute[];
  overlays: OverlayChoice;
  place: string;
  units: Units;
}

export type ExportFailure = 'unsupported' | 'novideo' | 'failed';

/** What a running export is doing: reading driving data (page), opening the camera files, making frames. */
export type ExportStage = 'data' | 'opening' | 'frames';

export type ExportReply =
  | { type: 'progress'; done: number; total: number; stage: ExportStage }
  | { type: 'done'; mp4: ArrayBuffer; durationS: number }
  | { type: 'error'; kind: ExportFailure; message: string };
