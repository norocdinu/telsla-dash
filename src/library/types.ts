export type CameraId = 'front' | 'back' | 'left_repeater' | 'right_repeater' | 'left_pillar' | 'right_pillar';

export const CAMERA_ORDER: CameraId[] = ['front', 'back', 'left_repeater', 'right_repeater', 'left_pillar', 'right_pillar'];

export const CAMERA_LABEL: Record<CameraId, string> = {
  front: 'Front',
  back: 'Rear',
  left_repeater: 'Left',
  right_repeater: 'Right',
  left_pillar: 'Left Pillar',
  right_pillar: 'Right Pillar',
};

/** A file the user gave us, read lazily. `path` uses `/` and is relative to what they dropped. */
export interface SourceFile {
  path: string;
  name: string;
  size: number | null;
  getFile(): Promise<File>;
}

/** One recorded minute: the same timestamp across camera files in one folder. */
export interface Segment {
  key: string;
  wallMs: number;
  files: Partial<Record<CameraId, SourceFile>>;
}

export type TimelineKind = 'recent' | 'saved' | 'sentry';

/** An event folder or a drive: segments played back to back. */
export interface Timeline {
  id: string;
  kind: TimelineKind;
  folder: string | null;
  segments: Segment[];
  startMs: number;
  cameras: CameraId[];
  event: EventInfo | null;
  eventJson: SourceFile | null;
  thumb: SourceFile | null;
}

export interface Library {
  timelines: Timeline[];
  ignored: number;
}

export type ReasonCategory = 'object' | 'handle' | 'accel' | 'manual' | 'honk' | 'other';

export interface EventInfo {
  wallMs: number | null;
  city: string | null;
  street: string | null;
  lat: number | null;
  lon: number | null;
  reason: string | null;
  category: ReasonCategory;
  label: string;
}
