// What's burned into an exported frame: the driving panel, the date, time and place, a route trace and g-force,
// drawn on a canvas in the player's colours. Sizes are for a 1280 px wide picture and scale with it.
import { NO_DATA } from '../app/messages';
import { formatWall } from '../library/time';
import type { LatLon } from '../sei/route';
import type { FrameTelemetry } from '../sei/telemetry';
import { G } from '../stats/scale';
import { autopilotLabel, gearLetter, gearTone, speedValue, steeringEngaged, unitLabel, type Units } from '../ui/format';

export interface OverlayChoice {
  panel: boolean;
  clock: boolean;
  route: boolean;
  gforce: boolean;
}

export const DEFAULT_OVERLAYS: OverlayChoice = { panel: true, clock: true, route: false, gforce: false };

export const OVERLAY_LABEL: Record<keyof OverlayChoice, string> = {
  panel: 'Driving panel',
  clock: 'Date, time and place',
  route: 'Route trace',
  gforce: 'G-force',
};

export interface OverlayFrame {
  wallMs: number;
  frame: FrameTelemetry | null;
  place: string;
  units: Units;
  /** The exported range's GPS points, and where the car is now. */
  route: LatLon[];
  at: LatLon | null;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const C = {
  // More solid than the player's cards: there's no blur behind them to keep the text readable.
  card: 'rgba(24,24,27,0.88)',
  border: 'rgba(255,255,255,0.10)',
  text: '#fff',
  text2: '#a1a1aa',
  dim: '#52525b',
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#e5484d',
};
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// The player's icons (24-unit boxes), as path data.
const STEERING_HUB = 'M4.3 11.3Q12 8.6 19.7 11.3V12.7C16.6 12.9 14.7 14.4 14.2 19.9H9.8C9.3 14.4 7.4 12.9 4.3 12.7Z';
const ARROW_LEFT = 'M10.5 5 4 12l6.5 7v-4.2H20V9.2h-9.5z';
const ARROW_RIGHT = 'M13.5 5 20 12l-6.5 7v-4.2H4V9.2h9.5z';

/** "Braking 0.32 g · Sideways 0.05 g": forward-back from Y (positive is braking), sideways from X. */
export function gforceText(f: Pick<FrameTelemetry, 'ax' | 'ay'>): string {
  const fwd = f.ay / G;
  const side = Math.abs(f.ax / G);
  const word = Math.abs(fwd) < 0.005 ? 'Steady' : fwd > 0 ? 'Braking' : 'Accelerating';
  return `${word} ${Math.abs(fwd).toFixed(2)} g · Sideways ${side.toFixed(2)} g`;
}

/**
 * Fits GPS points into a box, north up, keeping distances true (longitude shrinks by cos(latitude)).
 * Returns pixel points inside [x, x + w] × [y, y + h].
 */
export function projectRoute(points: LatLon[], box: { x: number; y: number; w: number; h: number }, padding = 0): [number, number][] {
  if (!points.length) return [];
  const midLat = points.reduce((a, p) => a + p[0], 0) / points.length;
  const k = Math.cos((midLat * Math.PI) / 180);
  const xs = points.map((p) => p[1] * k);
  const ys = points.map((p) => p[0]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const w = box.w - 2 * padding;
  const h = box.h - 2 * padding;
  const span = Math.max(x1 - x0, y1 - y0, 1e-9);
  const scale = Math.min(w, h) / span;
  const ox = box.x + padding + (w - (x1 - x0) * scale) / 2;
  const oy = box.y + padding + (h - (y1 - y0) * scale) / 2;
  return xs.map((x, i) => [ox + (x - x0) * scale, oy + (y1 - ys[i]) * scale]);
}

function card(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r / 12);
  ctx.strokeStyle = C.border;
  ctx.stroke();
}

/** Draws 24-unit path data centred at (cx, cy), `size` px across. */
function icon(ctx: Ctx, d: string, cx: number, cy: number, size: number, fill: string, rotateDeg = 0): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotateDeg * Math.PI) / 180);
  ctx.scale(size / 24, size / 24);
  ctx.translate(-12, -12);
  ctx.fillStyle = fill;
  ctx.fill(new Path2D(d));
  ctx.restore();
}

function text(ctx: Ctx, s: string, x: number, y: number, px: number, color: string, weight = 400, align: CanvasTextAlign = 'left'): void {
  ctx.font = `${weight} ${px}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

function drawPanel(ctx: Ctx, width: number, s: number, o: OverlayFrame): void {
  const f = o.frame;
  const y = 16 * s;
  if (!f) {
    ctx.font = `500 ${13 * s}px ${FONT}`;
    const w = ctx.measureText(NO_DATA).width + 28 * s;
    card(ctx, (width - w) / 2, y, w, 32 * s, 16 * s);
    text(ctx, NO_DATA, width / 2, y + 21 * s, 13 * s, C.text2, 500, 'center');
    return;
  }
  const mode = autopilotLabel(f.autopilot);
  const w = 300 * s;
  const h = (mode ? 118 : 96) * s;
  const x = (width - w) / 2;
  card(ctx, x, y, w, h, 12 * s);

  // Gear in a small circle, accelerator under it.
  const lx = x + 36 * s;
  const gear = gearLetter(f.gear);
  const blue = gearTone(f.gear) === 'blue';
  ctx.beginPath();
  ctx.arc(lx, y + 30 * s, 14 * s, 0, Math.PI * 2);
  ctx.fillStyle = blue ? 'rgba(59,130,246,0.22)' : 'rgba(255,255,255,0.08)';
  ctx.fill();
  text(ctx, gear, lx, y + 36 * s, 16 * s, blue ? C.blue : C.text2, 700, 'center');
  const pedal = Math.min(100, Math.max(0, f.pedal));
  const pw = 9 * s;
  const ph = 18 * s;
  const py = y + 58 * s;
  ctx.beginPath();
  ctx.roundRect(lx - pw / 2, py, pw, ph, 2.5 * s);
  ctx.lineWidth = 1.6 * s;
  ctx.strokeStyle = pedal > 0 ? C.blue : C.text2;
  ctx.stroke();
  if (pedal > 0) {
    const fh = ((ph - 3 * s) * pedal) / 100;
    ctx.beginPath();
    ctx.roundRect(lx - pw / 2 + 1.5 * s, py + ph - 1.5 * s - fh, pw - 3 * s, fh, 1.5 * s);
    ctx.fillStyle = C.blue;
    ctx.fill();
  }

  // Blinkers either side of the speed.
  icon(ctx, ARROW_LEFT, x + 88 * s, y + 42 * s, 24 * s, f.blinkLeft ? C.green : C.dim);
  icon(ctx, ARROW_RIGHT, x + 212 * s, y + 42 * s, 24 * s, f.blinkRight ? C.green : C.dim);
  text(ctx, String(speedValue(f.speedMps, o.units)), x + w / 2, y + 56 * s, 44 * s, C.text, 600, 'center');
  text(ctx, unitLabel(o.units), x + w / 2, y + 76 * s, 12 * s, C.text2, 500, 'center');

  // Steering wheel (blue while the car steers itself), brake under it.
  const rx = x + w - 36 * s;
  const engaged = steeringEngaged(f.autopilot);
  if (engaged) {
    ctx.beginPath();
    ctx.arc(rx, y + 30 * s, 15 * s, 0, Math.PI * 2);
    ctx.fillStyle = C.blue;
    ctx.fill();
  }
  ctx.save();
  ctx.translate(rx, y + 30 * s);
  ctx.rotate((f.steeringDeg * Math.PI) / 180);
  ctx.beginPath();
  ctx.arc(0, 0, 8.2 * s, 0, Math.PI * 2);
  ctx.lineWidth = 2.4 * s;
  ctx.strokeStyle = C.text;
  ctx.stroke();
  ctx.restore();
  icon(ctx, STEERING_HUB, rx, y + 30 * s, 24 * s, C.text, f.steeringDeg);
  const bw = 15 * s;
  const bh = 10 * s;
  ctx.beginPath();
  ctx.roundRect(rx - bw / 2, y + 62 * s, bw, bh, 3 * s);
  ctx.lineWidth = 1.6 * s;
  ctx.strokeStyle = f.brake ? C.red : C.text2;
  ctx.stroke();
  if (f.brake) {
    ctx.beginPath();
    ctx.roundRect(rx - bw / 2 + 1.5 * s, y + 63.5 * s, bw - 3 * s, bh - 3 * s, 1.8 * s);
    ctx.fillStyle = C.red;
    ctx.fill();
  }

  if (mode) text(ctx, mode, x + w / 2, y + 108 * s, 13 * s, C.blue, 600, 'center');
}

function drawClock(ctx: Ctx, s: number, o: OverlayFrame): void {
  const when = formatWall(o.wallMs, 'full');
  ctx.font = `600 ${15 * s}px ${FONT}`;
  const w1 = ctx.measureText(o.place).width;
  ctx.font = `400 ${13 * s}px ${FONT}`;
  const w2 = ctx.measureText(when).width;
  const x = 16 * s;
  const y = 16 * s;
  card(ctx, x, y, Math.max(w1, w2) + 28 * s, 56 * s, 12 * s);
  text(ctx, o.place, x + 14 * s, y + 24 * s, 15 * s, C.text, 600);
  text(ctx, when, x + 14 * s, y + 44 * s, 13 * s, C.text2, 400);
}

function drawGforce(ctx: Ctx, height: number, s: number, o: OverlayFrame): void {
  if (!o.frame) return;
  const t = gforceText(o.frame);
  ctx.font = `500 ${13 * s}px ${FONT}`;
  const w = ctx.measureText(t).width + 28 * s;
  const y = height - 48 * s;
  card(ctx, 16 * s, y, w, 32 * s, 10 * s);
  text(ctx, t, 30 * s, y + 21 * s, 13 * s, C.text, 500);
}

function drawRoute(ctx: Ctx, width: number, height: number, s: number, o: OverlayFrame): void {
  if (o.route.length < 2) return;
  const size = 150 * s;
  const box = { x: width - size - 16 * s, y: height - size - 16 * s, w: size, h: size };
  card(ctx, box.x, box.y, box.w, box.h, 12 * s);
  const pts = projectRoute(o.at ? [...o.route, o.at] : o.route, box, 16 * s);
  const line = o.at ? pts.slice(0, -1) : pts;
  ctx.beginPath();
  line.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.lineWidth = 3 * s;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.blue;
  ctx.stroke();
  if (o.at) {
    const [cx, cy] = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(cx, cy, 5 * s, 0, Math.PI * 2);
    ctx.fillStyle = C.text;
    ctx.fill();
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = C.blue;
    ctx.stroke();
  }
}

export function drawOverlay(ctx: Ctx, width: number, height: number, choice: OverlayChoice, o: OverlayFrame): void {
  const s = width / 1280;
  if (choice.clock) drawClock(ctx, s, o);
  if (choice.panel) drawPanel(ctx, width, s, o);
  if (choice.gforce) drawGforce(ctx, height, s, o);
  if (choice.route) drawRoute(ctx, width, height, s, o);
}

/** A camera with no video for this frame: black, with "No video" in the middle of its cell. */
export function drawNoVideo(ctx: Ctx, x: number, y: number, w: number, h: number, label: string): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, w, h);
  text(ctx, `${label}: no video`, x + w / 2, y + h / 2, Math.max(12, w / 40), C.text2, 500, 'center');
}

/** The camera's name at the bottom centre of its grid cell (the corners hold the other cards). */
export function drawCellLabel(ctx: Ctx, x: number, y: number, w: number, h: number, label: string): void {
  const px = Math.max(11, w / 55);
  ctx.font = `600 ${px}px ${FONT}`;
  const tw = ctx.measureText(label).width + px;
  const top = y + h - px * 2.4;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(x + (w - tw) / 2, top, tw, px * 1.7, px / 2);
  ctx.fill();
  text(ctx, label, x + w / 2, top + px * 1.2, px, C.text, 600, 'center');
}
