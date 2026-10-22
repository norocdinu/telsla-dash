import { parseWallStamp } from './time';
import type { CameraId } from './types';

const CLIP = /^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}(?:-\d{2})?)-(front|back|left_repeater|right_repeater|left_pillar|right_pillar)\.mp4$/i;
const EVENT_FOLDER = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;

export function parseClipName(name: string): { stamp: string; wallMs: number; camera: CameraId } | null {
  const m = CLIP.exec(name);
  if (!m) return null;
  const wallMs = parseWallStamp(m[1]);
  if (wallMs === null) return null;
  return { stamp: m[1], wallMs, camera: m[2].toLowerCase() as CameraId };
}

export function isEventFolderName(name: string): boolean {
  return EVENT_FOLDER.test(name) && parseWallStamp(name) !== null;
}
