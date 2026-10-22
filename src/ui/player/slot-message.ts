import { codecMessage, DAMAGED_FILE, ENCRYPTED, NO_VIDEO } from '../../app/messages';
import { CAMERA_LABEL, type CameraId } from '../../library/types';
import type { SlotStatus } from '../../player/engine';

/** What a camera tile says instead of video, or null when it plays. */
export function slotMessage(camera: CameraId, status: SlotStatus | undefined): { title: string; lines: string[] } | null {
  switch (status) {
    case 'missing':
      return { title: NO_VIDEO, lines: [] };
    case 'codec':
      return { title: codecMessage(CAMERA_LABEL[camera]), lines: [] };
    case 'damaged':
      return { title: DAMAGED_FILE, lines: [] };
    case 'encrypted':
      return { title: ENCRYPTED.clip, lines: [ENCRYPTED.why, ...ENCRYPTED.fixes] };
    default:
      return null;
  }
}
