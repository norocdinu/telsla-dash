// The app icon's artwork: a camera lens with a red record dot on a dark tile (no Tesla branding), drawn as
// pixels so no image library is needed. Used by make-icons.ts and build-installer.ts.

type RGBA = [number, number, number, number];
const SUPERSAMPLE = 4;

const hex = (h: string, a = 1): RGBA => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];
const TILE_TOP = hex('#1c1c21');
const TILE_BOTTOM = hex('#0b0b0e');
const RING = hex('#d4d4d8');
const BODY = hex('#09090b');
const IRIS = hex('#3b82f6');
const PUPIL = hex('#0b1220');
const SHINE = hex('#ffffff', 0.85);
const DOT = hex('#e5484d');

/** Inside a rounded square of corner radius r (unit coordinates). */
function inRoundedSquare(x: number, y: number, r: number): boolean {
  const dx = Math.max(r - x, 0, x - (1 - r));
  const dy = Math.max(r - y, 0, y - (1 - r));
  return dx * dx + dy * dy <= r * r;
}

/** The colour at a point of the icon (unit coordinates), or null outside it. */
function colourAt(x: number, y: number, maskable: boolean): RGBA | null {
  if (!maskable && !inRoundedSquare(x, y, 0.22)) return null;
  // The maskable icon keeps its mark inside the central safe zone, since the system may crop it to a circle.
  const s = maskable ? 0.62 : 0.8;
  const cx = 0.5;
  const cy = 0.52;
  const d = Math.hypot(x - cx, y - cy) / s;
  const dot = Math.hypot(x - (cx + 0.3 * s), y - (cy - 0.31 * s)) / s;
  if (dot <= 0.055) return DOT;
  if (Math.hypot(x - (cx - 0.07 * s), y - (cy - 0.07 * s)) / s <= 0.035) return SHINE;
  if (d <= 0.09) return PUPIL;
  if (d <= 0.17) return IRIS;
  if (d <= 0.29) return BODY;
  if (d <= 0.36) return RING;
  const t = y;
  return TILE_TOP.map((c, i) => (i === 3 ? 1 : c + (TILE_BOTTOM[i] - c) * t)) as RGBA;
}

/** The icon as RGBA pixels, `size` square; the maskable one keeps its mark in the central safe zone. */
export function renderIcon(size: number, maskable: boolean): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const n = SUPERSAMPLE;
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const c = colourAt((pxi + (sx + 0.5) / n) / size, (py + (sy + 0.5) / n) / size, maskable);
          if (!c) continue;
          // White shine over the body: blend with what's under it.
          const under = c === SHINE ? IRIS : c;
          const k = c[3];
          r += (c[0] * k + under[0] * (1 - k)) * 1;
          g += (c[1] * k + under[1] * (1 - k)) * 1;
          b += (c[2] * k + under[2] * (1 - k)) * 1;
          a += 1;
        }
      }
      const o = (py * size + pxi) * 4;
      if (a) {
        px[o] = Math.round(r / a);
        px[o + 1] = Math.round(g / a);
        px[o + 2] = Math.round(b / a);
      }
      px[o + 3] = Math.round((a / (n * n)) * 255);
    }
  }
  return px;
}
