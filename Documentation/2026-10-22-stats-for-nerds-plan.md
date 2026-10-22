# Stats for nerds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A see-through side panel over the video with every recorded value for the frame on screen and four charts that span the whole clip while playing and zoom to ±15 s when paused.

**Architecture:**
- The background scan that already finds moments also keeps a compact chart series per minute in the app store.
- Pure modules in `src/stats/` turn that series into a time window, scales and drawable points, and turn a frame into rows of numbers.
- A `StatsPanel` component in the player draws them with SVG and fits itself to the height it has, using CSS container queries.

**Tech Stack:** Vite 8, React 19, TypeScript 6, bun test, SVG. No new dependencies.

**Spec:** `Documentation/2026-10-22-stats-for-nerds-design.md` (binding). The app's overall spec is `Documentation/dashcam-app-prompt.md`.

## Global Constraints

- Use bun and bunx, never npm. `bun run check` (typecheck, lint, test, build) must pass at the end.
- No new runtime dependencies. TypeScript stays on `^6`.
- No commits: the user commits when they ask. Work stays on branch `stats-for-nerds`.
- Wall-clock times are car local time, stored as `Date.UTC` of the local fields ("wall ms"), never time-zone converted.
- `Samples/` holds private clips: no coordinates, places or clip names from it in tracked files or fixtures.
- The dev server runs on port 5190 (`bun run dev`; `?dev-root=Samples` loads the samples).
- Anti-goals from the spec:
  - Opening the panel must not make playback stutter.
  - The panel never disagrees with the driving panel for the same frame.
  - The panel never covers the controls or top cards.
  - Nothing goes over the network.

## Review Focus

1. **An hour-long Recent drive with the panel open while playing.** Playback stays smooth, and memory grows with the compact series only. → Task 9 browser check: frame callbacks per second, panel open versus closed.
2. **Minutes with no driving data** (parked mid-clip, older firmware) **and minutes that fail to read.** Charts show gaps, numbers show "—", and scales aren't broken by `NaN`. → Task 3 test "frames without data become gaps"; Task 4 test "ranges ignore gaps"; Task 7 test "a frame without data shows dashes".
3. **Pausing in the first or last 15 s of a clip, or in a clip shorter than 30 s.** The window clamps or doesn't zoom. → Task 4 tests.
4. **A short window** (1280×650 laptop, phone). The charts always stay visible; the numbers go to two columns, then scroll. → Task 9 browser check at 1280×650 and the mobile preset.
5. **Jumping while paused into a minute not read yet.** That minute is read next and the zoomed chart fills in. → Task 6 test "scanNear reads the minutes around a time first".

---

### Task 1: The driving-data track carries the frame number and data version

**Files:**
- Modify: `src/sei/telemetry.ts` (`TelemetryTrack`, `FrameTelemetry`, `emptyTrack`, `extractTelemetry`, `telemetryAt`)
- Modify: `src/sei/sei.worker.ts` (`buffers`)
- Modify: `tests/helpers/track-builder.ts` (`Raw` gains `seq`, `version`)
- Test: `tests/sei/telemetry.test.ts`

**Interfaces:**
- Produces:
  - `TelemetryTrack.seq: Float64Array` holds `frame_seq_no`, which is a uint64, so a Float64Array is safe up to 2^53.
  - `TelemetryTrack.version: Uint32Array`.
  - `FrameTelemetry.seq: number` and `FrameTelemetry.version: number`.

- [ ] **Step 1: Write the failing tests** in `tests/sei/telemetry.test.ts`:
  - `test('decodes the frame number and data version')`: build a clip with `seiNal({ version: 1, frameSeqNo: 123456789012, … })`. Then `extractTelemetry(buf).seq[0]` is `123456789012` and `.version[0]` is `1`.
  - `test('telemetryAt reports the frame number and version')`: `makeTrack(3, 36, (i) => ({ seq: 100 + i, version: 2 }))`. Then `telemetryAt(tr, 1 / 36)` matches `{ seq: 101, version: 2 }`.
- [ ] **Step 2: Run** `bun test tests/sei/telemetry.test.ts`. Expected: FAIL (`seq` undefined).
- [ ] **Step 3: Implement.** Add the arrays to `emptyTrack`, fill them in `extractTelemetry` (`m.frameSeqNo`, `m.version`) and return them from `telemetryAt`. Add both buffers to the worker's `buffers()` transfer list. Add `seq` and `version` to `Raw` (default 0) in the track builder.
- [ ] **Step 4: Run** `bun test tests/sei`. Expected: PASS.

### Task 2: The `showStats` setting, the S key and the Settings switch

**Files:**
- Modify: `src/app/settings.ts` (`Settings.showStats`, default `false`, load and validate)
- Modify: `src/ui/player/useShortcuts.ts` (`SHORTCUTS` gains `{ key: 'S', label: 'Stats for nerds' }`; `s` toggles)
- Modify: `src/ui/list/SettingsMenu.tsx` (a "Stats for nerds" checkbox row after "Map")
- Test: `tests/app/settings.test.ts`

**Interfaces:**
- Produces:
  - `Settings.showStats: boolean`.
  - `toggleStats(): void` in `src/app/playback.ts`, which calls `updateSettings({ showStats: !current })`.

- [ ] **Step 1: Write the failing tests:**
  - `test('stats for nerds is off by default')`: `loadSettings('en-US', null).showStats === false`.
  - `test('a stored showStats is kept')`: stored `{"showStats":true}` → `true`; stored `{"showStats":"yes"}` → `false`.
- [ ] **Step 2: Run** `bun test tests/app/settings.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the setting, `toggleStats`, the `s` key branch in `useShortcuts` (it calls `toggleStats()`) and the checkbox row (`checked={settings.showStats}`, `onChange` → `updateSettings({ showStats })`).
- [ ] **Step 4: Run** `bun test tests/app`. Expected: PASS.

### Task 3: A compact chart series per minute

**Files:**
- Create: `src/stats/series.ts`
- Test: `tests/stats/series.test.ts`

**Interfaces:**
- Produces:

```ts
/** One minute's chart data at a fixed step; NaN where the car recorded nothing. */
export interface ChartMinute {
  stepS: number;            // 0.1
  speed: Float32Array;      // m/s
  pedal: Float32Array;      // %
  brake: Uint8Array;        // 1 if braking at any frame in the step
  steering: Float32Array;   // degrees
  side: Float32Array;       // m/s², track.ax (sideways, as moment detection uses it)
  forward: Float32Array;    // m/s², −track.ay (braking negative, so it draws downward)
}
export const SERIES_STEP_S = 0.1;
export function compactSeries(track: TelemetryTrack, stepS?: number): ChartMinute;
```

- [ ] **Step 1: Write the failing tests:**
  - `test('one sample per step, from the frame on screen at that time')`: a 36 fps, 2 s track with speed `i`. Then `speed.length === 20`, and `speed[10]` is the speed of `frameIndexAt(track, 1.0)`.
  - `test('frames without data become gaps')`: frames 0–35 have `has: 0`. Then `Number.isNaN(speed[5])`, and `brake[5] === 0`.
  - `test('a brake shorter than a step still shows')`: one braking frame inside step 3. Then `brake[3] === 1`.
  - `test('forward is braking negative')`: `ay: 3`. Then `forward[0] === -3`.
- [ ] **Step 2: Run** `bun test tests/stats/series.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `compactSeries`. The length is `ceil(durationS / stepS)`. Each step takes the value from the frame at or before its start, and `brake` ORs the frames inside the step.
- [ ] **Step 4: Run.** Expected: PASS.

### Task 4: The time window and the vertical scales

**Files:**
- Create: `src/stats/window.ts`, `src/stats/scale.ts`
- Test: `tests/stats/window.test.ts`, `tests/stats/scale.test.ts`

**Interfaces:**
- Produces:

```ts
export const ZOOM_HALF_S = 15;
export interface TimeWindow { fromMs: number; toMs: number }
/** Whole clip while playing; when paused, 30 s around now, clamped to the clip, never wider than it. */
export function chartWindow(clip: { startMs: number; endMs: number }, nowMs: number, paused: boolean): TimeWindow;
/** Linear blend for the zoom ease (t in 0..1). */
export function blendWindow(a: TimeWindow, b: TimeWindow, t: number): TimeWindow;

export interface Range { min: number; max: number }
export type ChartKind = 'speed' | 'pedals' | 'steering' | 'g';
/** Fits values (NaN ignored) to tidy bounds with the chart's minimum span; pedals are always 0..100. */
export function chartRange(kind: ChartKind, values: Iterable<number>, units: 'kmh' | 'mph'): Range;
```

Minimum spans, from the spec:

| Chart | Minimum range |
|---|---|
| Speed | 0 to 30 km/h (in m/s; shown in the user's unit) |
| Steering | ±30° |
| G-force | ±0.3 g (input is m/s²; 1 g = 9.81) |

Ranges are symmetric for steering and g. Tidy bounds round up to 1, 2 or 5 × 10ⁿ in the shown unit.

- [ ] **Step 1: Write the failing tests:**
  - window: `test('playing shows the whole clip')`.
  - window: `test('paused shows 15 s either side of now')`.
  - window: `test('near the start the window stays 30 s wide and stops at the edge')`: now = start + 5 s → from = start, to = start + 30 s.
  - window: `test('near the end likewise')`.
  - window: `test('a clip shorter than 30 s does not zoom')`.
  - window: `test('blendWindow halfway')`.
  - scale: `test('speed never shows less than 0–30 km/h')`: speeds of 2 m/s give `max` ≥ 30 / 3.6.
  - scale: `test('speed rounds up to a tidy value')`: max 87 km/h → 100 km/h in m/s.
  - scale: `test('steering is symmetric with at least ±30°')`: values −12 and 20 → `{ min: -30, max: 30 }`; values up to 140 → ±200.
  - scale: `test('g-force is symmetric with at least ±0.3 g')`.
  - scale: `test('pedals are always 0 to 100')`.
  - scale: `test('ranges ignore gaps')`: `[NaN, 5]` behaves as `[5]`; all `NaN` gives the minimum range.
- [ ] **Step 2: Run** `bun test tests/stats`. Expected: FAIL.
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run.** Expected: PASS.

### Task 5: Points to draw, and the value under the pointer

**Files:**
- Create: `src/stats/points.ts`
- Test: `tests/stats/points.test.ts`

**Interfaces:**
- Consumes: `ChartMinute` (Task 3), `TimeWindow` (Task 4), `Span` and `buildSpans` from `src/player/timeline-math.ts`.
- Produces:

```ts
export type SeriesKey = 'speed' | 'pedal' | 'brake' | 'steering' | 'side' | 'forward';
/** Min and max per pixel column across the window (so a short spike survives); null where there is no data. */
export function columns(minutes: (ChartMinute | undefined)[], spans: Span[], w: TimeWindow, key: SeriesKey, width: number):
  ({ min: number; max: number } | null)[];
/** The sample at a wall time, or null (not read yet, gap, or outside the clip). */
export function valueAt(minutes: (ChartMinute | undefined)[], spans: Span[], wallMs: number, key: SeriesKey): number | null;
/** Every value in the window, for chartRange. */
export function valuesIn(minutes: (ChartMinute | undefined)[], spans: Span[], w: TimeWindow, key: SeriesKey): Iterable<number>;
```

- [ ] **Step 1: Write the failing tests:**
  - `test('a minute not read yet leaves its columns empty')`.
  - `test('a one-sample spike survives squeezing an hour into 300 columns')`.
  - `test('the window picks samples from the right minute')`: a window crossing a minute boundary takes the second half of minute 0 and the first half of minute 1.
  - `test('valueAt finds the sample, or null in a gap or an unread minute')`.
  - `test('valuesIn yields only samples inside the window')`.
- [ ] **Step 2: Run** `bun test tests/stats/points.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Map wall time to (minute, sample) through `spans`.
- [ ] **Step 4: Run.** Expected: PASS.

### Task 6: The scan keeps chart series, and reads near a time first when asked

**Files:**
- Modify: `src/sei/scan.ts` (`scanTimeline` gains an optional `skip?: (index: number) => boolean`)
- Modify: `src/app/state.ts` (`AppState.charts: Record<string, (ChartMinute | undefined)[]>`, initially `{}`)
- Modify: `src/app/playback.ts`:
  - `startScan`'s `onSegment` stores `compactSeries(track)`.
  - Remember which indices have been scanned (done or failed).
  - Export `scanNear(wallMs)`.
- Modify: `src/app/delete.ts` (`tidy` also drops `charts` for deleted timelines)
- Test: `tests/sei/scan.test.ts`, `tests/app/playback.test.ts`

**Interfaces:**
- Produces:
  - `AppState.charts`.
  - `scanNear(wallMs: number): void`. It restarts the background scan at the first minute within ±`ZOOM_HALF_S` of `wallMs` that hasn't been read, skipping every minute already read. It does nothing when all of them have been read.

- [ ] **Step 1: Write the failing tests:**
  - scan: `test('skips the segments it is told to')`: `skip = (i) => i === 1` over 3 segments. Then it reports `[0, 2]`.
  - playback: `test('the scan stores a chart series per minute')`: open a 2-segment timeline with a fake loader and flush. Then `appStore.get().charts[id]` has 2 entries with `stepS === 0.1`.
  - playback: `test('scanNear reads the minutes around a time first')`:
    - Set up a 5-segment timeline whose loader blocks until released, and let segments 0–1 finish.
    - `scanNear(start of segment 3 + 5 s)`.
    - The next load requested is segment 3, then 2 (inside the window), then 4. Segments 0–1 aren't loaded again.
  - delete: in `tests/app/delete.test.ts`, extend `test('deleting the clip being watched plays the next one in the filter')` to assert that `charts` has no entry for the deleted id.
- [ ] **Step 2: Run** `bun test tests/sei/scan.test.ts tests/app`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `scanNear` aborts the current scan and calls `startScan(tl, firstUnread, skipRead)`.
  - Keep the read set in the module, next to `scanAbort`, and reset it when a new timeline loads.
- [ ] **Step 4: Run** `bun test`. Expected: PASS (the whole suite, since `AppState` changed).

### Task 7: The numbers

**Files:**
- Create: `src/stats/rows.ts`
- Modify: `src/mp4/read-mp4.ts` (`inspectFile` also returns `frames: number | null`, the sample count from the moov)
- Modify: `src/player/engine.ts` (`videoSize(camera: CameraId): { width: number; height: number } | null`, from the slot's active element)
- Modify: `tests/helpers/fake-video.ts` (`videoWidth` and `videoHeight` fields)
- Test: `tests/stats/rows.test.ts`, `tests/mp4/read-mp4.test.ts`, `tests/player/engine.test.ts`

**Interfaces:**
- Consumes: `FrameTelemetry` with `seq` and `version` (Task 1); `gearLetter`, `autopilotLabel` and `unitLabel` from `src/ui/format.ts`.
- Produces:

```ts
export interface FileDetails { name: string; frames: number | null; durationS: number | null; codec: string | null; width: number | null; height: number | null }
export interface RowContext { minute: number; minutes: number; clipS: number; file: FileDetails | null }
export interface RowGroup { title: 'Car' | 'Motion' | 'Position' | 'Frame'; rows: [label: string, value: string][] }
export function statsRows(frame: FrameTelemetry | null, ctx: RowContext, units: 'kmh' | 'mph'): RowGroup[];
export function compass(deg: number): string;   // 212 → '212° SW' (8 points)
export function gText(mps2: number): string;     // 2.06 → '0.21 g · 2.06 m/s²'
```

- [ ] **Step 1: Write the failing tests:**
  - `test('speed shows one decimal and rounds to what the driving panel shows')`: for speeds 0..60 m/s in 0.07 steps, `Math.round(parse(row))` equals `speedValue(mps, units)`, in both units.
  - `test('accelerator and steering show one decimal')`.
  - `test('g-force shows g and m/s²')`: `gText(2.06)` → `'0.21 g · 2.06 m/s²'`.
  - `test('compass letters')`: 0 → N, 44 → NE, 212 → SW, 359 → N.
  - `test('autopilot names include Off')`.
  - `test('a frame without data shows dashes, file details stay')`: `statsRows(null, ctx, 'kmh')`. Every Car, Motion and Position value is `'—'`, and Frame has the file name and `'4 of 11'`.
  - `test('frame rate is frames over length')`: frames 2160, durationS 60 → `'36.0 fps'`.
  - read-mp4: `test('inspectFile reports the frame count')`, using an existing `mp4-builder` clip of n samples.
  - engine: `test('videoSize reports the active element of a camera')`.
- [ ] **Step 2: Run** `bun test tests/stats tests/mp4 tests/player`. Expected: FAIL.
- [ ] **Step 3: Implement.** Plain `toFixed(1)` can disagree with the driving panel: 52.46 shows as 52.5, which rounds to 53, while the panel shows 52. So start from the whole number the panel shows, and clamp the shown decimal part so it still rounds to that number.
- [ ] **Step 4: Run.** Expected: PASS.

### Task 8: The panel

**Files:**
- Create: `src/ui/player/StatsPanel.tsx`, `src/ui/player/StatsChart.tsx`, `src/styles/stats.css` (imported in `src/main.tsx`)
- Modify: `src/ui/player/Player.tsx`:
  - Render `<StatsPanel tl={tl} />` inside `.stage` when `settings.showStats`.
  - Add the class `has-stats` to `.stage`.
- Modify: `src/styles/map.css` and `src/styles/player.css`:
  - `.stage.has-stats .map-card` moves left of the panel.
  - At ≤ 640 px it's hidden.
- Modify: `src/ui/player/useShortcuts.ts` only if Task 2 left anything out.

**Interfaces:**
- Consumes:
  - From Tasks 2–7: `settings.showStats`, `toggleStats`, `charts`, `chartWindow`, `blendWindow`, `chartRange`, `columns`, `valueAt`, `valuesIn`, `statsRows`, `compass`, `scanNear`.
  - From the app: `engine.seek`, `engine.videoSize`, `inspectFile` (through a small cached `fileDetails(file)` helper in `StatsPanel.tsx`), and `moments`.
- Produces: nothing other tasks consume.

Behaviour (from the spec):
- **Panel layout:**
  - `role="region"`, `aria-label="Stats for nerds"`, with an × button (`aria-label="Close Stats for nerds"`) that calls `toggleStats()`.
  - The panel sits between the top cards and the controls. Measure both with a `ResizeObserver` and set `--stats-top` and `--stats-bottom` on `.stage`.
  - It's about 300 px wide, on a dark see-through background with monospace text.
- **Fitting** (CSS only):
  - `container-type: size` on the panel. The numbers area is `overflow: auto; min-height: 0`.
  - The charts area flexes, each chart 40–90 px.
  - `@container (max-height: …)` switches the numbers to two columns.
  - Font size is `clamp(10px, …cqh, 12px)`.
- **Charts:**
  - Four `StatsChart`s: speed; pedals (accelerator blue `var(--blue)`, brake as a red band `var(--red)`); steering; g-force (side and forward lines).
  - Each draws SVG paths from `columns()` at the chart's measured pixel width.
  - Each has the current value at top right, the white now-line, and moment ticks (the same `tick-<type>` colours as the scrubber).
- **Time span:**
  - The window is `chartWindow(clip, wallMs, !playing)`, eased with `blendWindow` over 200 ms when `playing` changes.
  - Scales come from `chartRange(kind, valuesIn(...))`, eased together with the window.
  - While playing, the lines recompute only when `charts` or the size changes. The now-line moves by updating one `x` attribute, at most 10 times a second.
  - While paused, everything recomputes when the window moves.
- **Hover:** a tooltip with `formatWall(wall, 'clock')` and `valueAt` for that chart's series.
- **Click:** `engine.seek(wall)`. The play state is unchanged.
- **Filling in:** when paused, call `scanNear(wallMs)` when the window settles or moves.
- **Numbers:** from `statsRows(playStore.frame, ctx, units)`, re-rendered at most 10 times a second.
- **File details:**
  - The file is the main camera's (front in grid view).
  - Its frames, duration and codec come from `inspectFile`, cached by path.
  - The size comes from `engine.videoSize(main)`.

- [ ] **Step 1: Build the component and styles.** There's no unit test for this task: its logic lives in Tasks 3–7.
- [ ] **Step 2: Run** `bun run typecheck && bun run lint`. Expected: clean.
- [ ] **Step 3: Check in the browser** (dev server on port 5190, `?dev-root=Samples`):
  - S opens and closes the panel.
  - The Settings switch matches, and the panel is remembered after a reload.
  - Numbers tick and agree with the driving panel when paused and stepped with `,` and `.`.
  - Pausing zooms to 30 s with an ease; play zooms out.
  - Hover shows values; clicking a chart jumps.
  - Moment ticks show.
  - The map sits beside the panel.
  - Nothing covers the controls or top cards.

### Task 9: Fit, speed and the spec

**Files:**
- Modify: `Documentation/dashcam-app-prompt.md` (Settings and the keyboard shortcuts list gain Stats for nerds; one line pointing at the design)
- Modify: `src/styles/stats.css`, only if the checks below need it

- [ ] **Step 1: Fit check** at 1920×1080, 1280×650 and the mobile preset:
  - The charts are always fully visible.
  - The numbers use two columns, then scroll, at 1280×650.
  - On the phone, the panel is full width and the map is hidden.
- [ ] **Step 2: Speed check.** On the longest sample clip, count `requestVideoFrameCallback` calls per second on the main video over 10 s of playback, with the panel closed and then open. Expected: within 5% of each other, and no long tasks over 50 ms that the panel caused (check in the Performance timeline).
- [ ] **Step 3: Update the spec** lines.
- [ ] **Step 4: Run** `bun run check`. Expected: exit 0, and all tests pass.
