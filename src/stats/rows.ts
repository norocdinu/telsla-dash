// The numbers at the top of Stats for nerds: everything the car recorded for the frame on screen, plus the
// details of the file playing, as rows of label and value in four groups.
import type { FrameTelemetry } from '../sei/telemetry';
import { autopilotLabel, formatDuration, gearLetter, speedExact, unitLabel, type Units } from '../ui/format';
import { G } from './scale';

export interface FileDetails {
  name: string;
  frames: number | null;
  durationS: number | null;
  codec: string | null;
  width: number | null;
  height: number | null;
}

export interface RowContext {
  /** 1-based minute (segment) of the clip, and how many there are. */
  minute: number;
  minutes: number;
  /** Seconds since the clip's start. */
  clipS: number;
  file: FileDetails | null;
}

export interface RowGroup {
  title: 'Car' | 'Motion' | 'Position' | 'Frame';
  rows: [label: string, value: string][];
}

const DASH = '—';
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/**
 * One decimal that still rounds (Math.round) to the whole number the driving panel shows: plain toFixed(1)
 * would show 52.46 as 52.5, which reads as 53 next to the panel's 52.
 */
function agreeing(x: number): string {
  const whole = Math.round(x);
  const part = Math.min(0.4, Math.max(-0.5, Math.round((x - whole) * 10) / 10));
  return (whole + part).toFixed(1);
}

/** 2.06 → '0.21 g · 2.06 m/s²' */
export function gText(mps2: number): string {
  return `${(mps2 / G).toFixed(2)} g · ${mps2.toFixed(2)} m/s²`;
}

/** 212 → '212° SW' (8 points). */
export function compass(deg: number): string {
  const d = ((Math.round(deg) % 360) + 360) % 360;
  return `${d}° ${POINTS[Math.round(d / 45) % 8]}`;
}

const onOff = (b: boolean) => (b ? 'on' : 'off');

function steeringText(deg: number): string {
  const shown = agreeing(Math.abs(deg));
  return `${deg < 0 && shown !== '0.0' ? '-' : ''}${shown}°`;
}

export function statsRows(frame: FrameTelemetry | null, ctx: RowContext, units: Units): RowGroup[] {
  const f = frame;
  const v = (text: (fr: FrameTelemetry) => string) => (f ? text(f) : DASH);
  const file = ctx.file;
  const rate = file?.frames && file.durationS ? `${(file.frames / file.durationS).toFixed(1)} fps` : DASH;
  const size = file?.width && file.height ? `${file.width} × ${file.height}` : DASH;
  return [
    {
      title: 'Car',
      rows: [
        ['Speed', v((fr) => `${agreeing(speedExact(fr.speedMps, units))} ${unitLabel(units)}`)],
        ['Gear', v((fr) => gearLetter(fr.gear))],
        ['Accelerator', v((fr) => `${agreeing(fr.pedal)} %`)],
        ['Brake', v((fr) => onOff(fr.brake))],
        ['Steering', v((fr) => steeringText(fr.steeringDeg))],
        ['Left blinker', v((fr) => onOff(fr.blinkLeft))],
        ['Right blinker', v((fr) => onOff(fr.blinkRight))],
        ['Autopilot', v((fr) => autopilotLabel(fr.autopilot) ?? 'Off')],
      ],
    },
    {
      title: 'Motion',
      rows: [
        ['Accel X', v((fr) => gText(fr.ax))],
        ['Accel Y', v((fr) => gText(fr.ay))],
        ['Accel Z', v((fr) => gText(fr.az))],
        ['Heading', v((fr) => compass(fr.heading))],
      ],
    },
    {
      title: 'Position',
      rows: [
        ['Latitude', v((fr) => fr.lat.toFixed(5))],
        ['Longitude', v((fr) => fr.lon.toFixed(5))],
      ],
    },
    {
      title: 'Frame',
      rows: [
        ['Frame #', v((fr) => String(fr.seq))],
        ['Data version', v((fr) => String(fr.version))],
        ['File', file?.name ?? DASH],
        ['Minute', `${ctx.minute} of ${ctx.minutes}`],
        ['Time', `${formatDuration(ctx.clipS)}.${Math.floor((ctx.clipS % 1) * 10)}`],
        ['Frame rate', rate],
        ['Size', size],
        ['Codec', file?.codec ?? DASH],
      ],
    },
  ];
}
