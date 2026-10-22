import { useEffect, useRef } from 'react';
import { engine } from '../../app/playback';
import { CAMERA_LABEL, type CameraId } from '../../library/types';
import type { SlotStatus } from '../../player/engine';
import { slotMessage } from './slot-message';

export function CameraSlot({
  camera,
  status,
  isMain,
  inGrid,
  onPick,
}: {
  camera: CameraId;
  status: SlotStatus | undefined;
  isMain: boolean;
  inGrid: boolean;
  onPick: () => void;
}) {
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);

  useEffect(() => engine.attachSlot(camera, a.current!, b.current!), [camera]);

  const message = slotMessage(camera, status);
  const label = CAMERA_LABEL[camera];
  return (
    <div className={`slot${isMain ? ' is-main' : ''}`} data-camera={camera}>
      <video ref={a} aria-label={`${label} camera`} />
      <video ref={b} aria-hidden="true" />
      {message && (
        <div className="slot-message" role="status">
          <span>{message.title}</span>
          {message.lines.map((l) => (
            <small key={l}>{l}</small>
          ))}
        </div>
      )}
      {inGrid && (
        <button type="button" className="slot-pick" onClick={onPick} aria-label={`Show ${label} camera`}>
          <span className="slot-label">{label}</span>
        </button>
      )}
    </div>
  );
}
