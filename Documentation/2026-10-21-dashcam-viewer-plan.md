# Dashcam Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser-only app that indexes a TeslaCam folder by file names, plays every camera in the car's own Dashcam Viewer layout, shows the per-frame driving data, marks the moments worth watching and draws the route on a map.

**Architecture:** Pure TypeScript modules handle everything testable: file names → library, MP4 boxes → frame times, SEI → telemetry arrays, telemetry → moments and route. A Web Worker runs the heavy parsing. A `PlaybackEngine` class drives the `<video>` elements, with two per camera so segment changes are seamless. React renders the UI from two small external stores: app state (low frequency) and play state (per frame).

**Tech Stack:** Vite, React, TypeScript (strict), bun (`bun test` for unit tests), protobufjs, Leaflet with OpenStreetMap tiles, ESLint (typescript-eslint and react-hooks).

**Spec:** `Documentation/dashcam-app-prompt.md` (read it alongside this plan; where they differ, the spec wins).

## Global Constraints
- Runs entirely in the browser: no server, no account, no uploads, no analytics. The only network requests are map tiles from `tile.openstreetmap.org`.
- Read-only: never write, rename, move or delete anything on the user's drive.
- Don't use Tesla's logo, wordmark, fonts or the word "Tesla" in the app name. The app name is "Dashcam Viewer". Compatibility text is fine.
- Never invent data. No sample or placeholder telemetry in the UI; missing means shown as missing.
- **Tooling:** bun / bunx only, never npm / npx.
- **Dependencies:** runtime deps are only `react`, `react-dom`, `protobufjs` and `leaflet`.
- **Git:** `git init` is allowed. **Never commit** (the user reviews the files). This plan has no commit steps.
- **Tesla's code:** don't copy any file from github.com/teslamotors/dashcam into `src/`. Our parser is our own.
- **Personal data:** `Samples/` holds real clips with GPS. Never copy them, or bytes from them, into tracked files or test fixtures. Unit tests use synthetic data only.
- **Listing speed:** build the list from file names only, never video bytes. A full day (8,640+ files) must list in under 3 s.
- **Time:** all times are local wall-clock as recorded. Parse `YYYY-MM-DD_HH-MM-SS` into `Date.UTC(...)` milliseconds ("wall ms") and format with UTC getters, so no time-zone conversion ever happens.
- **Copy:** UI text is English, using the exact strings in `src/app/messages.ts` (Task 11), which come from the spec.
- **Accessibility and motion:** touch targets ≥ 44 px, every icon has a text label, nothing relies on colour alone, and `prefers-reduced-motion` is respected.
- **Dev harness:** the dev-only sample loader (Task 11) runs only under `vite serve` and must not appear in `vite build` output.

## Review Focus
1. **Encrypted files.** Their real format is unknown; only synthetic stand-ins exist. A non-MP4 file must give an "Encrypted" row or slot, never a crash or a blank list. Pinned by `classifyHead` tests (Task 4) and `pickInitial` tests (Task 11).
2. **The whole USB drive** (Music, LightShow, other folders next to `TeslaCam`). Only `TeslaCam` may be walked. Pinned by a `collectSources` test that fails if a sibling folder is listed (Task 8).
3. **Segments with missing or damaged camera files.** The other cameras keep playing; the missing slot shows "No video". Pinned by the partial-cameras `buildLibrary` test (Task 3) and a browser check with a truncated copy (Task 16).
4. **Driving data that stops or starts mid-file** (parking). The panel flips to the "No driving data here" chip frame by frame, and Moments never count frames without data. Pinned by `telemetryAt` (Task 5) and the "runs broken by has=0" Moments test (Task 7).
5. **Drives across midnight and old file names without seconds.** One continuous drive, with its day heading taken from its start. Pinned by Task 1, Task 3 and Task 14 tests.

---

## File map
```
index.html, vite.config.ts, vite.dev-samples.ts, eslint.config.js, tsconfig*.json, package.json, .gitignore, .claude/launch.json
src/main.tsx
src/library/   types.ts, time.ts, filename.ts, event-json.ts, build-library.ts
src/mp4/       boxes.ts, read-mp4.ts
src/sei/       proto.ts, sei.ts, telemetry.ts, sei.worker.ts, telemetry-client.ts, telemetry-cache.ts, scan.ts, route.ts
src/moments/   thresholds.ts, detect.ts
src/sources/   collect.ts, browser.ts
src/player/    timeline-math.ts, engine.ts, object-urls.ts
src/app/       store.ts, state.ts, settings.ts, open-rule.ts, messages.ts, load-library.ts
src/dev/       dev-samples.ts
src/ui/        App.tsx, Landing.tsx, FullMessage.tsx, useGlobalDrop.ts, icons.tsx, format.ts, thumbs.ts
src/ui/player/ Player.tsx, VideoStage.tsx, CameraSlot.tsx, CameraStrip.tsx, Controls.tsx, Scrubber.tsx, TopCards.tsx, DrivingPanel.tsx, MapCard.tsx, useShortcuts.ts
src/ui/list/   ClipList.tsx, VirtualList.tsx, ClipRow.tsx, SettingsMenu.tsx, list-model.ts
src/styles/    tokens.css, app.css, player.css, list.css, map.css
scripts/       inspect.ts, make-fake-drive.ts, make-damaged.ts
tests/         mirrors src/ (library, mp4, sei, moments, sources, player, app, ui) + tests/helpers/
```

---

### Task 1: Project setup, wall-clock time and clip file names

**Files:**
- Create: `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.tools.json`, `eslint.config.js`, `.gitignore`, `.claude/launch.json`, `src/main.tsx`, `src/ui/App.tsx`, `src/styles/tokens.css`, `src/library/types.ts`, `src/library/time.ts`, `src/library/filename.ts`
- Test: `tests/library/time.test.ts`, `tests/library/filename.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type CameraId = 'front' | 'back' | 'left_repeater' | 'right_repeater' | 'left_pillar' | 'right_pillar';
  export const CAMERA_ORDER: CameraId[];   // the order above
  export const CAMERA_LABEL: Record<CameraId, string>; // Front, Rear, Left, Right, Left Pillar, Right Pillar
  export interface SourceFile { path: string; name: string; size: number | null; getFile(): Promise<File> }
  export interface Segment { key: string; wallMs: number; files: Partial<Record<CameraId, SourceFile>> } // key = `${folder}/${stamp}`
  export type TimelineKind = 'recent' | 'saved' | 'sentry';
  export interface Timeline { id: string; kind: TimelineKind; folder: string | null; segments: Segment[]; startMs: number;
    cameras: CameraId[]; event: EventInfo | null; eventJson: SourceFile | null; thumb: SourceFile | null }
  export interface Library { timelines: Timeline[]; ignored: number }   // timelines newest first
  export type ReasonCategory = 'object' | 'handle' | 'accel' | 'manual' | 'honk' | 'other';
  export interface EventInfo { wallMs: number | null; city: string | null; street: string | null; lat: number | null; lon: number | null;
    reason: string | null; category: ReasonCategory; label: string }
  ```
- Produces (`time.ts`): `parseWallStamp(s: string): number | null` (accepts `YYYY-MM-DD_HH-MM-SS`, `YYYY-MM-DD_HH-MM`, `YYYY-MM-DDTHH:MM:SS`); `formatWall(ms: number, style: 'full' | 'date' | 'clock'): string`; `dayHeading(ms: number, todayMs: number): string`; `nowWallMs(): number` (`Date.UTC` of the local clock's fields).
- Produces (`filename.ts`): `parseClipName(name: string): { stamp: string; wallMs: number; camera: CameraId } | null`; `isEventFolderName(name: string): boolean`.

- [ ] **Step 1: Set up the project**
  - Run `git init` in `C:\GitHub\telsla-dash`.
  - `.gitignore`: `node_modules/`, `dist/`, `Samples/`, `reference/`, `.fake-drive/`, `*.local`.
  - Runtime deps: `bun add react react-dom protobufjs leaflet`.
  - Dev deps: `bun add -d vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/leaflet @types/bun eslint @eslint/js typescript-eslint eslint-plugin-react-hooks globals`.
  - `package.json` scripts:
    - `dev`: `vite`
    - `build`: `vite build`
    - `typecheck`: `tsc -b`
    - `lint`: `eslint .`
    - `test`: `bun test`
    - `check`: `bun run typecheck && bun run lint && bun test && bun run build`
  - TypeScript: `tsconfig.app.json` (strict, DOM libs) covers `src/`. `tsconfig.tools.json` (strict, `types: ["bun"]`) covers `tests/` and `scripts/`.
  - `.claude/launch.json`: one configuration named `dev` that runs `bun run dev` on port 5173.
  - `App.tsx`: renders a full-height black screen with the text "Dashcam Viewer".
  - `tokens.css`: holds the spec's colour tokens as CSS variables:
    - `--bg #000`
    - `--card rgba(24,24,27,0.72)`, `--card-border rgba(255,255,255,0.08)`
    - `--text #fff`, `--text-2 #A1A1AA`
    - `--sheet #F4F4F5`, `--row #E4E4E7`, `--sheet-text #18181B`, `--sheet-text-2 #71717A`
    - `--red #E5484D`, `--blue #3B82F6`, `--green #22C55E`, `--amber #F59E0B`

- [ ] **Step 2: Write the failing tests**
  ```ts
  // time.test.ts
  expect(parseWallStamp('2026-10-16_20-07-11')).toBe(Date.UTC(2026, 9, 16, 20, 7, 11));
  expect(parseWallStamp('2019-06-08_12-34')).toBe(Date.UTC(2019, 5, 8, 12, 34, 0));
  expect(parseWallStamp('2026-10-16T20:10:45')).toBe(Date.UTC(2026, 9, 16, 20, 10, 45));
  expect(parseWallStamp('2026-13-40_99-00-00')).toBeNull();
  expect(formatWall(Date.UTC(2025, 10, 25, 11, 25, 0), 'full')).toBe('Tue Nov 25, 2025 11:25:00');
  expect(formatWall(Date.UTC(2025, 10, 24, 9, 0, 0), 'date')).toBe('Mon Nov 24, 2025');
  expect(formatWall(Date.UTC(2025, 10, 25, 7, 5, 9), 'clock')).toBe('07:05:09');
  const today = Date.UTC(2026, 9, 21, 23, 0, 0);
  expect(dayHeading(Date.UTC(2026, 9, 21, 0, 10, 0), today)).toBe('Today');
  expect(dayHeading(Date.UTC(2026, 9, 20, 23, 59, 0), today)).toBe('Yesterday');
  expect(dayHeading(Date.UTC(2026, 9, 19, 22, 8, 57), today)).toBe('Mon Oct 19, 2026');
  // filename.test.ts
  expect(parseClipName('2026-10-16_20-07-11-front.mp4')).toEqual({ stamp: '2026-10-16_20-07-11', wallMs: Date.UTC(2026, 9, 16, 20, 7, 11), camera: 'front' });
  expect(parseClipName('2019-06-08_12-34-left_repeater.mp4')?.wallMs).toBe(Date.UTC(2019, 5, 8, 12, 34, 0));
  for (const c of CAMERA_ORDER) expect(parseClipName(`2026-10-16_20-07-11-${c}.MP4`)?.camera).toBe(c);
  for (const n of ['thumb.png', 'event.json', 'notes.mp4', '2026-10-16_20-07-11-front.mov', '2026-10-16_20-07-11-cabin.mp4'])
    expect(parseClipName(n)).toBeNull();
  expect(isEventFolderName('2026-10-16_20-10-53')).toBe(true);
  expect(isEventFolderName('RecentClips')).toBe(false);
  ```

- [ ] **Step 3: Run the tests and confirm they fail**
  - Run: `bun test tests/library`
  - Expected: FAIL (modules not found).

- [ ] **Step 4: Implement `types.ts`, `time.ts` and `filename.ts`**
  - File-name regex: `/^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}(?:-\d{2})?)-(front|back|left_repeater|right_repeater|left_pillar|right_pillar)\.mp4$/i`.
  - Formatting uses fixed English weekday and month arrays and a 24-hour clock. Don't use Intl, because its output varies between ICU versions.

- [ ] **Step 5: Run the checks and confirm they pass**
  - `bun test tests/library`: PASS.
  - `bun run check`: PASS.
  - `bun run dev`: http://localhost:5173 shows "Dashcam Viewer" on black.

---

### Task 2: event.json parsing and reasons

**Files:**
- Create: `src/library/event-json.ts`
- Test: `tests/library/event-json.test.ts`

**Interfaces:**
- Consumes: `EventInfo`, `ReasonCategory` and `parseWallStamp` (Task 1).
- Produces:
  - `parseEventJson(text: string): EventInfo | null`
  - `reasonInfo(reason: string | null): { category: ReasonCategory; label: string }`
  - `humanize(s: string): string`
  - `CHIP_ORDER: ReasonCategory[]`, which is `['object', 'handle', 'accel', 'manual', 'honk', 'other']`
  - `CHIP_LABEL: Record<ReasonCategory, string>`:
    - object: Object detected
    - handle: Handle pulled
    - accel: Bump/accel
    - manual: Manual save
    - honk: Honk
    - other: Other

- [ ] **Step 1: Write the failing tests**
  ```ts
  const j = '{"timestamp":"2026-10-18T14:11:57","city":"Town","street":"Main St","est_lat":"10.5","est_lon":"20.25","reason":"sentry_locked_handle_pulled","camera":"5"}';
  expect(parseEventJson(j)).toEqual({ wallMs: Date.UTC(2026, 9, 18, 14, 11, 57), city: 'Town', street: 'Main St', lat: 10.5, lon: 20.25,
    reason: 'sentry_locked_handle_pulled', category: 'handle', label: 'Handle pulled' });
  expect(parseEventJson('not json')).toBeNull();
  expect(parseEventJson('{}')).toEqual({ wallMs: null, city: null, street: null, lat: null, lon: null, reason: null, category: 'other', label: 'Other' });
  expect(parseEventJson('{"est_lat":"","est_lon":"x"}')?.lat).toBeNull();
  expect(reasonInfo('sentry_aware_object_detection')).toEqual({ category: 'object', label: 'Object detected' });
  expect(reasonInfo('sentry_aware_accel_0.53').category).toBe('accel');
  expect(reasonInfo('user_interaction_honk').category).toBe('honk');
  expect(reasonInfo('user_interaction_dashcam_icon_tapped').category).toBe('manual');
  expect(reasonInfo('user_interaction_dashcam_launcher_action_tapped').category).toBe('manual');
  expect(reasonInfo('user_interaction_something_new')).toEqual({ category: 'other', label: 'User interaction something new' });
  ```

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/library/event-json.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement the parser and reason mapping**
  - Match reasons in this order:
    1. exactly `sentry_aware_object_detection` → object
    2. `/handle_pull/` → handle
    3. `/^sentry_aware_accel/` → accel
    4. exactly `user_interaction_honk` → honk
    5. `/^user_interaction_dashcam/` → manual
    6. anything else → other, with label `humanize(reason)`, or `Other` when the reason is null
  - `est_lat` and `est_lon` go through `parseFloat`; anything that isn't finite becomes null.
  - Ignore `camera`.

- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `bun test tests/library/event-json.test.ts`
  - Expected: PASS.

---

### Task 3: Library grouping (events and drives)

**Files:**
- Create: `src/library/build-library.ts`, `tests/helpers/sources.ts`
- Test: `tests/library/build-library.test.ts`

**Interfaces:**
- Consumes: Task 1 types and `parseClipName` / `isEventFolderName`; Task 2 `parseEventJson`.
- Produces:
  - `buildLibrary(files: SourceFile[]): Library`
  - `attachEvents(lib: Library, read: (f: SourceFile) => Promise<string>): Promise<void>`, which fills `event` on each timeline, and turns a lone event folder into `kind: 'sentry'` when its `reason` starts with `sentry`
  - `DRIVE_SPLIT_MS = 180_000`, the difference between consecutive starts at which a new drive begins: a 60 s segment plus the spec's 2-minute gap
  - Timeline ids: `${kind}:${folder}` for events, and `recent:${segments[0].key}` for drives
  - Test helper `fakeSource(path: string): SourceFile`

- [ ] **Step 1: Write the failing tests** (paths are relative, with `/` separators)
  - **saved event:** two stamps × 6 cameras, plus `event.json` and `thumb.png`, under `TeslaCam/SavedClips/2026-10-16_20-10-53/` gives:
    - one timeline with `kind 'saved'` and `id 'saved:TeslaCam/SavedClips/2026-10-16_20-10-53'`
    - 2 segments in time order, `cameras` equal to `CAMERA_ORDER`
    - `thumb` and `eventJson` set
  - **sentry event:** the same files under `SentryClips` give `kind 'sentry'`.
  - **drives:** `RecentClips` stamps `10-00-00`, `10-01-00`, `10-02-00`, `10-05-00`, `10-06-00`, `10-08-59` give 2 drives of 3 segments each (180 s splits; 179 s doesn't), newest first.
  - **midnight:** `2026-10-19_23-59-30` and `2026-10-20_00-00-30` give one drive.
  - **partial cameras:** one segment has only `front` and `back`, another has all 6. The first segment's `files` has 2 keys, and the timeline's `cameras` lists all 6.
  - **unknown entries:** `SavedClips/.tcvconfig/x` and `TeslaCam/notes.txt` add to `ignored`, and no timeline appears.
  - **event folder without video:** only `event.json` and `thumb.png` give no timeline.
  - **lone event folder:** `2026-10-18_14-12-00/2026-10-18_14-01-11-front.mp4` gives `kind 'saved'`. After `attachEvents` reads `{"reason":"sentry_aware_object_detection"}`, it's `kind 'sentry'` and `event.category === 'object'`.
  - **loose files:** `2026-10-16_20-07-11-front.mp4` (no folder) gives `kind 'recent'`.
  - **speed:** 1,440 stamps × 6 cameras under `TeslaCam/RecentClips` build in under 200 ms (`performance.now()`), as 1 drive with 1,440 segments.

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/library/build-library.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement `buildLibrary` and `attachEvents`**
  - Classify each `.mp4` by its parent folder:
    - parent is `RecentClips` (case-insensitive): recent
    - parent is an event folder inside `SavedClips` or `SentryClips`: that kind
    - parent is an event folder with no known grandparent: saved, for now
    - anything else: recent
  - Segments group by `folder + stamp`.
  - `attachEvents` reads event files with up to 8 reads at a time.

- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `bun test tests/library/build-library.test.ts`
  - Expected: PASS.

---

### Task 4: MP4 box reading and file health

**Files:**
- Create: `src/mp4/boxes.ts`, `src/mp4/read-mp4.ts`, `tests/helpers/mp4-builder.ts`
- Test: `tests/mp4/read-mp4.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Mp4Info { codec: string; timescale: number; durations: Uint32Array; sizes: Uint32Array; offsets: Float64Array;
    mediaTime: number; reordered: boolean; durationS: number }   // offsets: byte offset of each sample; reordered: a ctts box exists
  export class Mp4Error extends Error { kind: 'not-mp4' | 'no-moov' | 'bad-box' }
  export function parseMp4(buf: Uint8Array): Mp4Info;            // first video trak; stsd fourcc; stts, stsz, stsc + stco/co64, elst
  export function frameTimes(info: Mp4Info): Float64Array;        // seconds: cumulative durations minus mediaTime/timescale
  export const HEAD_BYTES = 65536;
  export function classifyHead(head: Uint8Array, fileSize: number): 'mp4' | 'encrypted' | 'damaged';
  ```
- Test helpers:
  - `buildMp4(o: { samples: Uint8Array[]; durations: number[]; timescale?: number; codec?: 'avc1' | 'hvc1'; mediaTime?: number; samplesPerChunk?: number; largeMdat?: boolean }): Uint8Array`
    - Layout: `ftyp`, `free`, `mdat`, then `moov`, the same order as Tesla's files.
    - Default timescale: 10000.
  - `avcc(...nals: Uint8Array[]): Uint8Array`, which joins NALs with 4-byte big-endian length prefixes.

- [ ] **Step 1: Write the failing tests**
  ```ts
  const s = [avcc(new Uint8Array([0x65, 1, 2])), avcc(new Uint8Array([0x41, 3])), avcc(new Uint8Array([0x41, 4, 5, 6]))];
  const info = parseMp4(buildMp4({ samples: s, durations: [270, 263, 278] }));
  expect(info.codec).toBe('avc1'); expect(info.timescale).toBe(10000);
  expect([...info.durations]).toEqual([270, 263, 278]); expect([...info.sizes]).toEqual(s.map(x => x.length));
  expect(info.offsets[1] - info.offsets[0]).toBe(s[0].length); expect(info.durationS).toBeCloseTo(0.0811, 4);
  expect([...frameTimes(info)].map(t => +t.toFixed(4))).toEqual([0, 0.027, 0.0533]);
  // five samples, two per chunk: offsets still increase by each sample's size
  // codec: 'hvc1' → info.codec === 'hvc1'; largeMdat: true parses the same; mediaTime: 270 → frameTimes[0] === -0.027
  // buildMp4(...).slice(0, -50) → throws Mp4Error with kind 'no-moov'
  expect(classifyHead(buildMp4({ samples: s, durations: [1, 1, 1] }).slice(0, HEAD_BYTES), 2_000_000)).toBe('mp4');
  expect(classifyHead(new Uint8Array(0), 0)).toBe('damaged');
  expect(classifyHead(randomBytes(500), 500)).toBe('damaged');
  expect(classifyHead(randomBytes(HEAD_BYTES), 2_000_000)).toBe('encrypted');
  ```

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/mp4`
  - Expected: FAIL.

- [ ] **Step 3: Implement `boxes.ts` and `read-mp4.ts`**
  - `boxes.ts` is a box iterator that handles size 1 (64-bit) and size 0 (runs to the end of the file).
  - `classifyHead` returns:
    - `damaged` when the file size is 0 or under 1 KB
    - `mp4` when bytes 4–8 are `ftyp`
    - `encrypted` otherwise
  - This encryption rule is a guess, because no real encrypted sample exists (Review Focus 1).

- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `bun test tests/mp4`
  - Expected: PASS.

---

### Task 5: SEI decoding and telemetry tracks

**Files:**
- Create: `src/sei/proto.ts`, `src/sei/sei.ts`, `src/sei/telemetry.ts`, `tests/helpers/sei-builder.ts`
- Test: `tests/sei/sei.test.ts`, `tests/sei/telemetry.test.ts`

**Interfaces:**
- Consumes: `parseMp4` and `frameTimes` (Task 4).
- Produces:
  ```ts
  export const SEI_PROTO: string;  // proto3: message SeiMetadata, enums Gear {P=0,D=1,R=2,N=3} and AutopilotState {NONE=0,SELF_DRIVING=1,AUTOSTEER=2,TACC=3}, field numbers 1–16 as listed in the spec
  export function seiType(): protobuf.Type;   // memoised protobuf.parse(SEI_PROTO).root.lookupType('SeiMetadata')
  export function stripEmulation(b: Uint8Array): Uint8Array;
  export function unwrapSei(nal: Uint8Array): Uint8Array | null;
  export interface TelemetryTrack { t: Float64Array; has: Uint8Array; speed: Float32Array; pedal: Float32Array; steering: Float32Array;
    gear: Uint8Array; autopilot: Uint8Array; flags: Uint8Array /* bit0 left blinker, bit1 right blinker, bit2 brake */;
    lat: Float64Array; lon: Float64Array; heading: Float32Array; ax: Float32Array; ay: Float32Array; az: Float32Array;
    durationS: number; codec: string }
  export interface FrameTelemetry { speedMps: number; pedal: number; steeringDeg: number; gear: number; autopilot: number;
    blinkLeft: boolean; blinkRight: boolean; brake: boolean; lat: number; lon: number; heading: number; ax: number; ay: number; az: number }
  export function extractTelemetry(buf: Uint8Array): TelemetryTrack;
  export function frameIndexAt(track: TelemetryTrack, t: number): number;     // last i with t[i] <= t + 0.001, else -1
  export function telemetryAt(track: TelemetryTrack, t: number): FrameTelemetry | null;  // null when i === -1 or has[i] === 0
  ```
- Test helpers:
  - `seiNal(fields: object): Uint8Array`:
    - Encodes with `seiType()` and inserts emulation-prevention bytes.
    - Returns `[0x06, 0x05, size, 0x42, 0x42, 0x42, 0x69, ...payload, 0x80]`.
  - `picture(type: 1 | 5): Uint8Array`.

- [ ] **Step 1: Write the failing tests**
  ```ts
  expect([...stripEmulation(new Uint8Array([0, 0, 3, 1, 0, 0, 3, 0]))]).toEqual([0, 0, 1, 0, 0, 0]);
  expect(unwrapSei(picture(1))).toBeNull();
  expect(unwrapSei(new Uint8Array([0x06, 0x04, 2, 0x42, 0x69, 0]))).toBeNull();   // wrong payload type
  expect(unwrapSei(new Uint8Array([0x06, 0x05, 2, 0x42, 0x41, 0]))).toBeNull();   // no 0x69 marker
  const f = { vehicleSpeedMps: 15.5, latitudeDeg: 1.0, gearState: 1, steeringWheelAngle: -12.5, brakeApplied: true, autopilotState: 2, blinkerOnRight: true };
  const m = seiType().toObject(seiType().decode(unwrapSei(seiNal(f))!), { enums: Number, defaults: true });
  expect(m.latitudeDeg).toBe(1.0); expect(m.vehicleSpeedMps).toBeCloseTo(15.5);   // 1.0 as a double contains 00 00 00, so this exercises emulation bytes
  // 4 samples (durations 277 at 10000): [sei+IDR, sei+slice, slice only, sei+slice]
  const tr = extractTelemetry(buildMp4({ samples: [avcc(seiNal(f), picture(5)), avcc(seiNal(f), picture(1)), avcc(picture(1)), avcc(seiNal(f), picture(1))], durations: [277, 277, 277, 277] }));
  expect([...tr.has]).toEqual([1, 1, 0, 1]); expect(tr.t[3]).toBeCloseTo(0.0831, 4); expect(tr.codec).toBe('avc1');
  expect(tr.flags[0]).toBe(0b110);
  expect(frameIndexAt(tr, -1)).toBe(-1); expect(frameIndexAt(tr, 0)).toBe(0); expect(frameIndexAt(tr, 0.03)).toBe(1); expect(frameIndexAt(tr, 10)).toBe(3);
  expect(telemetryAt(tr, 0.06)).toBeNull();
  expect(telemetryAt(tr, 0)).toMatchObject({ gear: 1, autopilot: 2, blinkRight: true, brake: true });
  // the same samples built with codec 'hvc1' → every has[i] === 0
  ```

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/sei/sei.test.ts tests/sei/telemetry.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement**
  - **`unwrapSei`:** require `nal[0] & 0x1f === 6` and `nal[1] === 5`. Skip `0x42` bytes from index 3, then require `0x69`. The payload is from the byte after the marker to `length - 1`, passed through `stripEmulation`.
  - **`extractTelemetry`:** for each sample (from `offsets` and `sizes`), walk 4-byte length-prefixed NALs. The first SEI found belongs to that sample. Decode with `toObject(..., { enums: Number, longs: Number, defaults: true })`.
  - **Non-`avc1` codecs:** return a track with every `has` set to 0.

- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `bun test tests/sei`
  - Expected: PASS.

---

### Task 6: Re-runnable data check (spec Step 1)

**Files:**
- Create: `scripts/inspect.ts`

**Interfaces:**
- Consumes: `buildLibrary` and `attachEvents` (Task 3); `parseMp4` and `classifyHead` (Task 4); `extractTelemetry` (Task 5).
- The script wraps local files as `SourceFile` with `Bun.file`.

- [ ] **Step 1: Write the script**
  - Run as `bun run scripts/inspect.ts <dir>`. It prints:
    - the timelines found (kind, segment count, cameras) and the `ignored` count
    - a count of `classifyHead` results across every file
    - **for each front file:** codec, frames, SEI count, fps (frames / `durationS`) and `reordered`
    - **across all front files:**
      - pedal min/max and steering min/max
      - the gear and autopilot values seen
      - the correlation of each 1 s speed change with the mean `ay`
      - the correlation of each 1 s clockwise heading change with steering
    - the `event.json` keys and the distinct reasons

- [ ] **Step 2: Run it on the samples**
  - Run: `bun run scripts/inspect.ts Samples`
  - **Expected, matching the spec's "What my sample clips showed":**
    - 5 timelines (1 recent, 2 saved, 2 sentry)
    - every file classifies as `mp4`, with codec `avc1` and `reordered: false`
    - full driving minutes have about 2,150–2,190 frames (about 36 fps), and parked minutes about 1,440 (about 24 fps)
    - correlation of speed change with `ay` ≤ −0.85
    - correlation of heading change with steering ≥ 0.85
    - pedal max ≤ 100
    - reasons are exactly `user_interaction_honk`, `sentry_locked_handle_pulled` and `sentry_aware_object_detection`
  - If anything differs, stop and report it to the user before Task 7.

---

### Task 7: Moments detection

**Files:**
- Create: `src/moments/thresholds.ts`, `src/moments/detect.ts`, `tests/helpers/track-builder.ts`
- Test: `tests/moments/detect.test.ts`

**Interfaces:**
- Consumes: `TelemetryTrack` (Task 5); `EventInfo` (Task 1).
- Produces:
  ```ts
  // thresholds.ts (the spec's starting values)
  export const HARD_BRAKE_MPS2 = 3.9, SWERVE_LATERAL_MPS2 = 3.9, MIN_RUN_S = 0.3, SWERVE_MIN_SPEED_MPS = 30 / 3.6,
    STEER_RATE_DEG_S = 180, STEER_RATE_WINDOW_S = 0.1, MERGE_GAP_S = 3, MOVING_MPS = 1, JUMP_LEAD_S = 3;
  // detect.ts
  export type MomentType = 'brake' | 'swerve' | 'ap_off' | 'event';
  export interface Moment { type: MomentType; wallMs: number; label: string }  // labels: Hard braking, Swerve, Self-driving off, or event.label
  export function detectMoments(track: TelemetryTrack, segmentWallMs: number): Moment[];   // already merged
  export function eventMoment(event: EventInfo | null): Moment | null;
  export function mergeMoments(m: Moment[]): Moment[];   // sorted by time; same type within MERGE_GAP_S keeps the first
  ```
- Test helper: `makeTrack(n: number, fps: number, at: (i: number) => Partial<Raw>): TelemetryTrack`. By default `has` is 1, `speed` is 10, and every other field is 0.

- [ ] **Step 1: Write the failing tests** (36 fps unless noted)
  - `ay = 4.0` for frames 36–47 (12 frames, 0.33 s) → one `brake` at `segmentWallMs + 1000`.
  - 9 frames of `ay = 4.0` (0.25 s) → none. `ay = 3.8` for 1 s → none.
  - **Runs broken by has=0:** 12 frames of `ay = 4.0`, with frame 42 set to `has 0` → none.
  - **Swerve by lateral force:** `ax = -4.0` for 0.4 s at speed 10 → `swerve`. The same at speed 8 → none (below 30 km/h).
  - **Swerve by steering rate:** steering ramps 0 → 30° over 4 frames (0.11 s) at speed 10 → `swerve`.
  - **Self-driving off:** autopilot goes 1 → 0 at speed 10 → `ap_off`. 2 → 0 at speed 0.5 → none. 3 → 0 (TACC) → none.
  - **Merging:** two brakes 2 s apart → one; 4 s apart → two.
  - **Event moment:** `eventMoment({ wallMs: 5000, label: 'Honk', ... })` → `{ type: 'event', wallMs: 5000, label: 'Honk' }`. A null `wallMs` → null.

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/moments`
  - Expected: FAIL.

- [ ] **Step 3: Implement**
  - A run is consecutive frames with `has = 1` that meet the condition, lasting ≥ `MIN_RUN_S` (from `t[last] - t[first]` plus one frame).
  - The moment's time is the run start: `segmentWallMs + t[first] * 1000`.
  - Steering rate is |Δsteering| / Δt over the frames spanning at least `STEER_RATE_WINDOW_S`.

- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `bun test tests/moments`
  - Expected: PASS.

---

### Task 8: Collecting files from drops and pickers

**Files:**
- Create: `src/sources/collect.ts`, `src/sources/browser.ts`
- Test: `tests/sources/collect.test.ts`

**Interfaces:**
- Consumes: `SourceFile` (Task 1).
- Produces:
  ```ts
  export interface EntryNode { name: string; kind: 'file' | 'dir'; list?(): Promise<EntryNode[]>; open?(): Promise<File> }
  export const KEEP = /\.mp4$|^event\.json$|^thumb\.png$/i, MAX_DEPTH = 4;
  export function collectSources(roots: EntryNode[]): Promise<SourceFile[]>;
  // browser.ts (verified by hand in Task 11)
  export function fromDataTransfer(items: DataTransferItemList): EntryNode[];       // webkitGetAsEntry; readEntries until an empty batch
  export function fromDirectoryHandle(h: FileSystemDirectoryHandle): EntryNode;
  export function fromFileList(list: FileList): SourceFile[];                         // path = webkitRelativePath || name; KEEP only
  export type PickResult = { kind: 'nodes'; nodes: EntryNode[] } | { kind: 'files'; files: SourceFile[] } | { kind: 'cancelled' } | { kind: 'refused' };
  export function pickFolder(): Promise<PickResult>;   // showDirectoryPicker({ mode: 'read', id: 'teslacam' }) if present, else hidden <input webkitdirectory>
  export function pickFiles(): Promise<SourceFile[] | null>;   // hidden <input type=file multiple accept=".mp4,video/mp4">
  ```
  - In `pickFolder`, an `AbortError` means `cancelled`, and any other `DOMException` means `refused`.
  - Declare the minimal `showDirectoryPicker` types in `src/sources/fs-access.d.ts`; don't add a types package.

- [ ] **Step 1: Write the failing tests** (helpers `dir(name, ...children)` and `file(name)`, with a spy on `list`)
  - **Whole drive:**
    - Input: a drive root containing `TeslaCam/SavedClips/2026-10-16_20-10-53/{2026-10-16_20-05-14-front.mp4, event.json, thumb.png}`, plus `Music/a.mp3` and `LightShow/x.fseq`.
    - Expected: exactly 3 files, with paths starting `TeslaCam/SavedClips/2026-10-16_20-10-53/`.
    - The `Music` and `LightShow` `list` spies are never called.
  - **Dropped folder:** dropping a `SavedClips` folder gives paths starting `SavedClips/2026-…/`.
  - **Filtering:** `notes.txt` is skipped, and so is a `.mp4` nested 6 folders deep.
  - **Loose files:** two file roots give paths equal to their names.

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/sources`
  - Expected: FAIL.

- [ ] **Step 3: Implement `collect.ts` and `browser.ts`**
  - When a dir has a child dir named `TeslaCam` (any case), walk only that child.
  - Paths join names from the walked root, including the root's own name.

- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `bun test tests/sources`
  - Expected: PASS.

---

### Task 9: Telemetry worker, cache, scanning and route

**Files:**
- Create: `src/sei/sei.worker.ts`, `src/sei/telemetry-client.ts`, `src/sei/telemetry-cache.ts`, `src/sei/scan.ts`, `src/sei/route.ts`
- Test: `tests/sei/telemetry-cache.test.ts`, `tests/sei/scan.test.ts`, `tests/sei/route.test.ts`

**Interfaces:**
- Consumes: Task 4 `classifyHead` and `HEAD_BYTES`; Task 5 `extractTelemetry` and `TelemetryTrack`; Task 1 `Timeline` and `SourceFile`.
- Produces:
  ```ts
  export type LoadFailure = 'encrypted' | 'damaged' | 'unsupported';
  export class TelemetryLoadError extends Error { constructor(public kind: LoadFailure) }
  export function readHealth(file: SourceFile): Promise<'mp4' | 'encrypted' | 'damaged'>;   // reads only the first HEAD_BYTES
  export function loadTelemetryInWorker(file: SourceFile): Promise<TelemetryTrack>;       // readHealth first; then one shared module worker; track buffers are transferred
  export class TelemetryCache { constructor(load: (f: SourceFile) => Promise<TelemetryTrack>, maxEntries?: number /* 24 */);
    get(f: SourceFile): Promise<TelemetryTrack>; peek(f: SourceFile): TelemetryTrack | undefined }   // key: f.path; in-flight dedupe; LRU; failures not cached
  export function scanOrder(count: number, start: number): number[];
  export function segmentSource(seg: Segment): SourceFile | null;   // front, else the first camera present in CAMERA_ORDER
  export function scanTimeline(tl: Timeline, get: (f: SourceFile) => Promise<TelemetryTrack>,
    onSegment: (index: number, track: TelemetryTrack | null, error?: LoadFailure) => void, signal: AbortSignal, start?: number): Promise<void>;
  export function routePoints(track: TelemetryTrack, everyS?: number /* 1 */): [number, number][];   // skips has=0 and lat=lon=0
  export function joinRoute(parts: ([number, number][] | undefined)[]): [number, number][];
  ```
  - The worker is created with `new Worker(new URL('./sei.worker.ts', import.meta.url), { type: 'module' })`.
  - Worker messages: `{ id, file }` in; `{ id, track }` or `{ id, error }` out.

- [ ] **Step 1: Write the failing tests**
  - **Cache:** two concurrent `get(a)` calls run the loader once. With `max 2`, getting a, b, c leaves `peek(a)` undefined. A rejected load is retried on the next `get`.
  - **Scan order:** `scanOrder(5, 2)` → `[2, 3, 4, 1, 0]`; `scanOrder(3, 0)` → `[0, 1, 2]`.
  - **Scanning:**
    - `scanTimeline` calls `onSegment` in scan order.
    - Aborting after the first callback stops further loads.
    - A segment whose loader throws `TelemetryLoadError('damaged')` is reported with that error, and scanning continues.
  - **Route points:** a 3 s track at 36 fps gives 3 points. Frames with `has 0` or lat=lon=0 are skipped.
  - **Joining routes:** `joinRoute([p1, undefined, p2])` → p1 followed by p2.

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/sei/telemetry-cache.test.ts tests/sei/scan.test.ts tests/sei/route.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement** the five modules.

- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `bun test tests/sei`
  - Expected: PASS.

---

### Task 10: Timeline math and the playback engine

**Files:**
- Create: `src/player/timeline-math.ts`, `src/player/engine.ts`, `src/player/object-urls.ts`
- Test: `tests/player/timeline-math.test.ts`

**Interfaces:**
- Consumes: `Timeline`, `Segment`, `CameraId` (Task 1); `classifyHead` (Task 4) for error classification.
- Produces:
  ```ts
  export interface Span { index: number; startMs: number; durationS: number }
  export const DEFAULT_SEGMENT_S = 60;
  export function buildSpans(segments: Segment[], durations: Record<string, number>): Span[];  // known, else min(60, gap to next start), else 60
  export function bounds(spans: Span[]): { startMs: number; endMs: number };
  export function locate(spans: Span[], wallMs: number): { index: number; offsetS: number };   // clamps; in a gap → next span at 0; past end → last at its duration
  export function wallAt(spans: Span[], index: number, offsetS: number): number;
  export function skipFrom(spans: Span[], wallMs: number, deltaS: number): { index: number; offsetS: number };
  // engine.ts
  export type SlotStatus = 'ok' | 'missing' | 'codec' | 'damaged' | 'encrypted';
  export interface EngineCallbacks { onFrame(p: { index: number; offsetS: number; wallMs: number }): void;
    onState(s: { playing: boolean; rate: number; waiting: boolean }): void; onDuration(segmentKey: string, seconds: number): void;
    onSlot(camera: CameraId, status: SlotStatus): void }
  export const RATES = [0.5, 1, 2, 4], PRELOAD_LEAD_S = 5, SYNC_INTERVAL_MS = 500, SYNC_TOLERANCE_S = 0.1, FALLBACK_FRAME_S = 1 / 36;
  export class PlaybackEngine { constructor(cb: EngineCallbacks);
    attachSlot(camera: CameraId, a: HTMLVideoElement, b: HTMLVideoElement): () => void;
    load(tl: Timeline, durations: Record<string, number>, startWallMs?: number): void;
    setVisible(cameras: CameraId[], master: CameraId): void;
    play(): void; pause(): void; toggle(): void; seek(wallMs: number): void; skip(deltaS: number): void;
    step(dir: 1 | -1, frameS?: number): void; cycleRate(): void; destroy(): void }
  ```

- [ ] **Step 1: Write the failing tests** (spans start at 0, 61 s and 122 s from `T = Date.UTC(2026, 9, 17, 18, 0, 0)`, with known durations 60.38, 60.4 and 0.44)
  - `bounds(spans).endMs` → `T + 122_440`.
  - `locate(spans, T + 30_000)` → `{ index: 0, offsetS: 30 }`.
  - `locate(spans, T + 60_700)` (in the gap) → `{ index: 1, offsetS: 0 }`.
  - `locate(spans, T - 5_000)` → `{ index: 0, offsetS: 0 }`.
  - `locate(spans, T + 999_000)` → `{ index: 2, offsetS: 0.44 }`.
  - `locate(spans, T + 122_200)` → `{ index: 2, offsetS: 0.2 }` (the tiny last segment).
  - `skipFrom(spans, T + 50_000, 15)` → `{ index: 1, offsetS: 4 }`.
  - **Unknown durations:** starts 0 and 56 s give a first span with `durationS` 56. A lone last span with no known duration gives 60.

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/player`
  - Expected: FAIL.

- [ ] **Step 3: Implement `timeline-math.ts`**

- [ ] **Step 4: Implement `PlaybackEngine`**
  - **Two videos per camera slot.**
    - Each slot is attached with two `<video>` elements, set to `muted` and `playsInline`.
    - The active one has the CSS class `is-active`.
    - Once the master's offset passes `durationS - PRELOAD_LEAD_S`, the inactive element of each visible slot gets the next segment's file (`preload = 'auto'`).
  - **Segment changes:** on the master's `ended`, every visible slot switches to its preloaded element and plays. Pause at the end of the last segment.
  - **Master clock:** the main camera's active element. Use `requestVideoFrameCallback` and emit `onFrame` from `metadata.mediaTime`, falling back to `timeupdate`.
  - **Followers:** every `SYNC_INTERVAL_MS`, a follower further than `SYNC_TOLERANCE_S` from the master gets its `currentTime` set to the master's.
  - **Durations:** on `loadedmetadata`, call `onDuration(segment.key, video.duration)`.
  - **Errors:**
    - A missing file is `missing`.
    - On a `<video>` error, read the head with `classifyHead`: not MP4 means `encrypted` or `damaged`, and an MP4 that won't play means `codec`.
    - If the master fails, the next `ok` camera becomes master. If every camera fails, skip to the next segment.
  - **Object URLs:** create them on demand in `object-urls.ts` and revoke them when an element's `src` changes or on `destroy()`.

- [ ] **Step 5: Run the checks and confirm they pass**
  - `bun test tests/player`: PASS.
  - `bun run typecheck`: PASS.
  - The engine is checked in the browser in Task 12.

---

### Task 11: App shell, loading, landing, auto-open, messages and settings

**Files:**
- Create: `src/app/store.ts`, `src/app/state.ts`, `src/app/settings.ts`, `src/app/open-rule.ts`, `src/app/messages.ts`, `src/app/load-library.ts`, `src/dev/dev-samples.ts`, `vite.dev-samples.ts`, `src/ui/Landing.tsx`, `src/ui/FullMessage.tsx`, `src/ui/useGlobalDrop.ts`, `src/styles/app.css`
- Modify: `src/ui/App.tsx`, `vite.config.ts`
- Test: `tests/app/store.test.ts`, `tests/app/settings.test.ts`, `tests/app/open-rule.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 8 and 9 (`buildLibrary`, `attachEvents`, `collectSources`, `pick*`, `readHealth`).
- Produces:
  ```ts
  export function createStore<T>(initial: T): { get(): T; set(p: Partial<T> | ((s: T) => Partial<T>)): void; subscribe(fn: () => void): () => void };
  export function useStore<T, U>(store: ReturnType<typeof createStore<T>>, select: (s: T) => U): U;   // useSyncExternalStore
  export interface Settings { units: 'kmh' | 'mph'; showPanel: boolean; showMap: boolean; lastView: CameraId | 'grid' }
  export const SETTINGS_KEY = 'dashcam-viewer.settings';
  export function loadSettings(locale: string, storage: Pick<Storage, 'getItem'> | null): Settings;  // en-US → mph, else kmh; try/catch
  export function saveSettings(s: Settings, storage: Pick<Storage, 'setItem'> | null): void;       // never throws
  export type Health = 'ok' | 'encrypted' | 'damaged';
  export const MAX_AUTO_OPEN_CHECKS = 20;
  export function pickInitial(lib: Library, check: (tl: Timeline) => Promise<Health>):
    Promise<{ timelineId: string | null; openList: boolean; blocked: null | 'encrypted' | 'damaged' | 'empty' }>;
  // state.ts: appStore (library, loading, blocked, timelineId, listOpen, mapOpen, mapLarge, view {main, grid}, health, moments, route, durations, settings)
  //           playStore (wallMs, index, offsetS, playing, rate, frame: FrameTelemetry | null, frameStatus 'data' | 'none' | 'loading')
  // load-library.ts: loadFromNodes(nodes), loadFromFiles(files) → collect, build, attachEvents, pickInitial, update appStore; logs `Listed N files in X ms`
  ```
- **`messages.ts`** holds the exact copy, from the spec:
  - Landing:
    - "Drop your TeslaCam folder here"
    - "or the whole USB drive"
    - buttons "Choose folder" and "Choose files"
    - "Plays on this computer. Nothing is uploaded."
    - "Shows speed, steering and Autopilot on clips from firmware 2025.44.25 or later."
    - "Clips are on the USB drive in your glovebox."
  - Encrypted:
    - per clip: "This clip is encrypted."
    - full screen: "These clips are encrypted."
    - then: "Your car encrypts clips by default since update 2026.20."
    - fix 1: "Turn it off under Controls > Safety > Dashcam for future clips."
    - fix 2: "Open these clips in Tesla's own viewer at dashcam.tesla.com."
  - No clips: "We couldn't find any dashcam clips in that folder. Try the TeslaCam folder on the USB drive."
  - Drive root refused: "Pick the TeslaCam folder on the drive instead."
  - All damaged: "These clips look damaged. Try copying them from the USB drive again." (my wording; the spec only asks to explain why and what to do)
  - Codec: `` `The ${label} camera uses a video format this browser can't play. Try Chrome or Edge.` ``
  - Damaged file: "Damaged file"
  - No data chip: "No driving data here". Tooltip: "The car was parked, or the clip is from before firmware 2025.44.25 or from a car older than HW3."
  - Map tooltip: "Map tiles load from OpenStreetMap. Your clips stay on this computer."
- **Dev sample loader** (Vite plugin, `apply: 'serve'` only):
  - It serves `GET /__dev-samples/list?root=Samples|.fake-drive` as a JSON list of relative paths, and `GET /__dev-samples/file?root=…&path=…` as the file's bytes.
  - It refuses any path outside those two folders.
  - In the app, `?dev-root=Samples` (or `.fake-drive/<sub>`) loads through `src/dev/dev-samples.ts`, which wraps each URL as a `SourceFile` using fetch → blob → `File`.
  - The query parameter is ignored in production builds.

- [ ] **Step 1: Write the failing tests**
  - **Store:** `set` merges and notifies subscribers once per call; `unsubscribe` stops notifications.
  - **Settings:**
    - `loadSettings('en-US', null)` → `{ units: 'mph', showPanel: true, showMap: true, lastView: 'front' }`.
    - `loadSettings('ro-RO', null).units` → `'kmh'`.
    - A storage whose `getItem` throws gives the defaults.
    - Stored `{"units":"kmh"}` overrides the units only.
    - `saveSettings` with a throwing `setItem` doesn't throw.
  - **Auto-open (`pickInitial`):**
    - An empty library → `{ timelineId: null, openList: false, blocked: 'empty' }`.
    - [newest encrypted, older ok] → opens the older one, with `openList: true`.
    - A single ok timeline → `openList: false`.
    - All encrypted → `{ timelineId: null, openList: false, blocked: 'encrypted' }`.
    - All damaged → `blocked: 'damaged'`.
    - 25 timelines all encrypted → `check` is called 20 times, then the newest opens with `openList: true` and `blocked: null`.

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/app`
  - Expected: FAIL.

- [ ] **Step 3: Implement the modules and screens**
  - **`Landing`:** a dark screen, centred: the drop area with its two lines of copy, **Choose folder** (primary) and **Choose files** buttons, and the three grey lines.
  - **`useGlobalDrop`:** a drop anywhere replaces the loaded library.
  - **`FullMessage`:** shown for the blocked states.
  - **Picker results:** `refused` shows the drive-root message inline on Landing; `cancelled` does nothing.
  - **`App`:** shows Landing, then a placeholder `Player` (just the timeline id) until Task 12.
  - **Health check:** `check` = `readHealth` of `segmentSource(firstSegment)`, with `'mp4'` mapped to `'ok'`.
  - **Dev loader:** paths pass through the same `KEEP` filter as `collectSources`.

- [ ] **Step 4: Verify**
  - `bun test tests/app`: PASS.
  - `bun run dev`, then open `http://localhost:5173/?dev-root=Samples`:
    - The console logs `Listed 248 files in … ms`, plus 5 timelines.
    - The placeholder shows `recent:RecentClips/2026-10-19_22-08-57` (the newest, and playable), with the list flagged open.
  - `http://localhost:5173/` shows the Landing copy exactly.
  - Clicking **Choose folder** in Chrome opens a "view files" picker, not an upload prompt. The user checks this by hand.

---

### Task 12: Player screen: video, cameras, controls, scrubber, top cards, shortcuts

**Files:**
- Create: `src/ui/player/Player.tsx`, `src/ui/player/VideoStage.tsx`, `src/ui/player/CameraSlot.tsx`, `src/ui/player/CameraStrip.tsx`, `src/ui/player/Controls.tsx`, `src/ui/player/Scrubber.tsx`, `src/ui/player/TopCards.tsx`, `src/ui/player/useShortcuts.ts`, `src/ui/icons.tsx`, `src/ui/format.ts`, `src/ui/thumbs.ts`, `src/styles/player.css`
- Modify: `src/ui/App.tsx`, `src/app/state.ts`
- Test: `tests/ui/format.test.ts`, `tests/ui/scrubber.test.ts`

**Interfaces:**
- Consumes: Task 10 engine and math; Task 9 `scanTimeline` and `TelemetryCache`; Task 7 `detectMoments`, `eventMoment` and `mergeMoments`; Task 11 stores and messages.
- Produces:
  ```ts
  export function formatDuration(s: number): string;      // 'm:ss' under an hour, else 'h:mm:ss'
  export function tickPercent(b: { startMs: number; endMs: number }, wallMs: number): number;   // 0–100, clamped
  export const SHORTCUTS: { key: string; label: string }[];
    // Space play/pause · ←/→ 15 s · , / . one frame (paused) · 1–7 camera tiles · G Grid · E Jump to Event · L clip list · M map
  export function captureFrame(f: SourceFile, atS?: number /* 0.1 */): Promise<string>;   // object URL of a 320×180 JPEG; cached by path; at most 2 at a time
  ```

- [ ] **Step 1: Write the failing tests**
  ```ts
  expect(formatDuration(0.44)).toBe('0:00'); expect(formatDuration(663)).toBe('11:03'); expect(formatDuration(3725)).toBe('1:02:05');
  expect(tickPercent({ startMs: 0, endMs: 1000 }, 250)).toBe(25); expect(tickPercent({ startMs: 0, endMs: 1000 }, -5)).toBe(0);
  expect(tickPercent({ startMs: 0, endMs: 1000 }, 2000)).toBe(100); expect(tickPercent({ startMs: 5, endMs: 5 }, 5)).toBe(0);
  ```

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/ui`
  - Expected: FAIL.

- [ ] **Step 3: Implement the player**
  - **Layout:** build it as the spec's "Player screen" describes.
  - **Grid:** 2×2 is Front, Rear / Left, Right. With pillars, 3×2 is Left Pillar, Front, Right Pillar / Left, Rear, Right.
  - **Slot placeholders:** a slot whose status isn't `ok` shows its message: "No video", the codec message, "Damaged file" or "This clip is encrypted."
  - **Background scan:** opening a timeline starts `scanTimeline` from the current segment. Each track adds to `appStore.moments[tl.id]` (merged with `eventMoment`) and to `route`.
  - **Wiring:** `durations` are fed back to `buildSpans`. The view choice is saved to `Settings.lastView`.
  - **Camera strip tiles:** each tile's thumbnail is `captureFrame` of that camera's file in the first segment. The Grid tile shows a grid icon.
  - **Ticks:** clicking a moment tick seeks to `JUMP_LEAD_S` before it.
  - **Type:** speed 40 px, card titles 15 px semibold, secondary 13 px, with `font-variant-numeric: tabular-nums` for speed and time.
  - **Cards:** blur 12 px, radius 12 px.
  - **Motion:** cards and the sheet fade or slide in over 150–200 ms.

- [ ] **Step 4: Verify** (`bun test tests/ui` PASS; then in the browser with `?dev-root=Samples`)
  - **Playback:** opening the Saved event `2026-10-17_18-12-26` plays all 11 segments in a row. Watch two boundaries: no black flash.
  - **Grid:** Grid shows 3×2 with pillars. Clicking a cell makes it the main view. Keys 1–7 select tiles, and G toggles Grid.
  - **Controls:** ±15 s and ←/→ cross segment boundaries. The speed button cycles 0.5× → 1× → 2× → 4× → 0.5×.
  - **Jump to Event:** it shows 18:12:15 in the place card (the event is at 18:12:18), and so does E.
  - **Place card:** shows the city and a ticking time.
  - **Up next:** shows the next timeline in the list, and is hidden on the oldest.
  - **Scrubber:** spans the whole event, with the red event tick and moment ticks as scanning finds them. Hover shows the time and label; dragging scrubs.
  - **No video:** with `?dev-root=Samples` and one camera file renamed away in a copy under `.fake-drive/`, that slot shows "No video" and the others play.

---

### Task 13: Driving panel

**Files:**
- Create: `src/ui/player/DrivingPanel.tsx`
- Modify: `src/ui/format.ts`, `src/app/state.ts` (on each `onFrame`: `cache.peek(segmentSource(seg))` → `telemetryAt(track, offsetS)`, then `playStore.frame` / `frameStatus`), `src/styles/player.css`
- Test: `tests/ui/format.test.ts`

**Interfaces:**
- Consumes: `FrameTelemetry` and `telemetryAt` (Task 5); `TelemetryCache` and `segmentSource` (Task 9); `Settings.units` (Task 11).
- Produces:
  - `speedValue(mps: number, units: 'kmh' | 'mph'): number`
  - `unitLabel(units): 'km/h' | 'MPH'`
  - `gearLetter(g: number): 'P' | 'D' | 'R' | 'N'`
  - `gearTone(g: number): 'blue' | 'grey'`
  - `autopilotLabel(a: number): string | null`

- [ ] **Step 1: Write the failing tests**
  ```ts
  expect(speedValue(15.778, 'kmh')).toBe(57); expect(speedValue(15.778, 'mph')).toBe(35);
  expect(unitLabel('kmh')).toBe('km/h'); expect(unitLabel('mph')).toBe('MPH');
  expect([0, 1, 2, 3].map(gearLetter)).toEqual(['P', 'D', 'R', 'N']); expect([0, 1, 2, 3].map(gearTone)).toEqual(['grey', 'blue', 'blue', 'grey']);
  expect([0, 1, 2, 3].map(autopilotLabel)).toEqual([null, 'Self Driving', 'Autosteer', 'Traffic-Aware Cruise']);
  ```

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/ui/format.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement `DrivingPanel`**
  - **Layout:** the spec's three columns plus the footer strip.
  - **Steering:** `rotate(${steeringDeg}deg)`, where positive is clockwise, meaning a right turn. Transition 100 ms, none with reduced motion.
  - **Pedal:** the fill height is `pedal`%.
  - **Brake:** lit `--red` when on.
  - **Blinker arrows:** `--green` when on, dim when off.
  - **Screen-reader labels**, e.g. "Speed 57 km/h", "Gear D", "Left turn signal off", "Brake on", "Steering 12° right", "Accelerator 23%". Each also goes in `title`.
  - **States:**
    - `frameStatus 'none'` shows the chip with its tooltip.
    - `'loading'` shows a thin progress line in place of numbers.
    - Hidden when `settings.showPanel` is false.

- [ ] **Step 4: Verify** (`bun test tests/ui` PASS; in the browser)
  - **Frame by frame:** paused in the Saved event, `,` and `.` change the speed frame by frame. Values stay within the ranges `scripts/inspect.ts` printed.
  - **Turns:** the right blinker arrow lights during the right turns, and the wheel turns clockwise.
  - **Parking mid-file:** in the Sentry event `2026-10-18_14-12-00`, segment `14-07-22` switches to the chip partway through, and `14-08-23` onward shows the chip throughout.
  - **Units:** switching units (Task 14 menu, or by editing settings in DevTools) changes the number and the unit label.

---

### Task 14: Clip list sheet and settings menu

**Files:**
- Create: `src/ui/list/ClipList.tsx`, `src/ui/list/VirtualList.tsx`, `src/ui/list/ClipRow.tsx`, `src/ui/list/SettingsMenu.tsx`, `src/ui/list/list-model.ts`, `src/styles/list.css`
- Test: `tests/ui/list-model.test.ts`

**Interfaces:**
- Consumes: `Library` and `Timeline`; `CHIP_ORDER` and `CHIP_LABEL` (Task 2); `dayHeading` and `formatWall` (Task 1); `buildSpans` and `bounds` (Task 10); `captureFrame` (Task 12); `readHealth` (Task 9); `Moment` (Task 7).
- Produces:
  ```ts
  export type ListTab = 'all' | 'recent' | 'saved' | 'sentry';
  export type Row = { kind: 'day'; label: string } | { kind: 'clip'; timeline: Timeline };
  export const ROW_HEIGHT = 88, DAY_HEIGHT = 36, OVERSCAN = 6;
  export function filterTimelines(tls: Timeline[], tab: ListTab, chip: ReasonCategory | null): Timeline[];
  export function availableChips(tls: Timeline[], tab: ListTab): ReasonCategory[];   // only categories present, in CHIP_ORDER
  export function buildRows(tls: Timeline[], todayMs: number): Row[];                  // a day header before each new start day
  export function momentsBadge(m: Moment[]): string | null;                            // event moments excluded
  ```

- [ ] **Step 1: Write the failing tests**
  - **Filtering:** `filterTimelines` by each tab. A chip narrows Saved/Sentry rows by `event.category`; Recent rows have no category and drop out when a chip is set.
  - **Chips:** `availableChips` on the sample-like set (honk, handle, object) → `['object', 'handle', 'honk']`.
  - **Rows:** `buildRows` for timelines starting 2026-10-21 08:00, 2026-10-20 23:59 and 2026-10-19 22:08 (today 2026-10-21) → day header 'Today', clip, 'Yesterday', clip, 'Mon Oct 19, 2026', clip. A drive that starts at 23:59:30 sits under its start day.
  - **Badges:** `momentsBadge([])` → null. `[brake, brake, swerve, event]` → `'2 hard brakes · 1 swerve'`. `[ap_off]` → `'1 self-driving off'`.

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/ui/list-model.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement the sheet**
  - **Sheet:** light, with the close button, the tabs All / Recent / Saved / Sentry, the chips and the ⋯ menu.
  - **Rows:** thumbnail (`thumb.png`, or `captureFrame` of the front camera; a skeleton while it loads), date and time, place (or "Recent drive"), reason label, `formatDuration` of the bounds, and the moments badge. A lock and "Encrypted", or "Damaged file", come from `appStore.health`, filled by `readHealth` when a row first renders.
  - **Opening a row:** selecting a row opens it and closes the sheet. L toggles the sheet, and the top-left card opens it.
  - **⋯ menu:** Units (km/h or mph), Show driving panel and Map toggles, saved with `saveSettings`. The `SHORTCUTS` list appears in the menu button's tooltip.

- [ ] **Step 4: Verify** (`bun test tests/ui` PASS; in the browser with `?dev-root=Samples`)
  - Rows appear under the right day headings, and the chips show Object detected, Handle pulled and Honk.
  - Tabs filter correctly.
  - Moment badges appear as the scans finish.
  - Scrolling `?dev-root=.fake-drive/day` (Task 16) stays smooth.

---

### Task 15: Map card

**Files:**
- Create: `src/ui/player/MapCard.tsx`, `src/styles/map.css`
- Modify: `src/ui/player/Controls.tsx` (map toggle), `src/sei/route.ts`
- Test: `tests/sei/route.test.ts`

**Interfaces:**
- Consumes: `appStore.route[tl.id]` (from Task 12's scan) and `playStore.frame` (lat, lon, heading).
- Produces: `routeBounds(points: [number, number][]): [[number, number], [number, number]] | null`.

- [ ] **Step 1: Write the failing test**
  - `routeBounds([])` → null.
  - `routeBounds([[10, 20], [10.2, 19.9]])` → `[[10, 19.9], [10.2, 20]]`.

- [ ] **Step 2: Run the test and confirm it fails**
  - Run: `bun test tests/sei/route.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement `MapCard`**
  - **Map:** Leaflet with the tile layer `https://tile.openstreetmap.org/{z}/{x}/{y}.png` and the attribution `© OpenStreetMap contributors`. Import `leaflet/dist/leaflet.css`.
  - **Route and marker:** the route is a polyline, fitted to `routeBounds`. A `divIcon` arrow is rotated by `heading` and pans into view when it leaves the visible area.
  - **Placement:** the card floats at the bottom right above the controls. A click toggles `mapLarge`, which makes it half the video area.
  - **Toggle:**
    - It's hidden until the route has a point.
    - Its tooltip is the Map message.
    - It starts open when `settings.showMap` is on; it starts closed under 640 px wide.

- [ ] **Step 4: Verify** (test PASS; in the browser)
  - **Route:** the Saved event draws its route, and the marker moves and turns with playback.
  - **Size and toggle:** clicking the card enlarges it and clicking again shrinks it. M toggles it.
  - **Network:** while playing, the only external requests are to `tile.openstreetmap.org`. Check with the browser's network log.

---

### Task 16: Responsive layout, accessibility, edge-case fixtures and final checks

**Files:**
- Create: `scripts/make-fake-drive.ts`, `scripts/make-damaged.ts`
- Modify: `src/styles/*.css`, and any component needing focus or label fixes

**Interfaces:**
- **`make-fake-drive.ts`:** `bun run scripts/make-fake-drive.ts` writes `.fake-drive/day/TeslaCam/RecentClips/` with 1,440 timestamps a minute apart from `2026-01-01_00-00-00`, × 6 cameras, as empty files.
- **`make-damaged.ts`:** `bun run scripts/make-damaged.ts` writes three folders under `.fake-drive/`:
  - `damaged/TeslaCam/SavedClips/2026-10-16_20-10-53/`: a copy of that Samples event, with one front file truncated to 1 MB.
  - `encrypted/TeslaCam/SavedClips/2026-10-16_20-10-53/`: the same event, with every file replaced by 2 MB of random bytes (synthetic).
  - `partial/`: the same event with the `left_pillar` files left out.

- [ ] **Step 1: Responsive and motion pass**
  - **Phone:** at 375×812, the place card and driving panel stack, the camera strip scrolls sideways, and the map starts hidden.
  - **Tablet:** at 768×1024 everything fits.
  - **Reduced motion:** with `prefers-reduced-motion` set, there are no transitions.

- [ ] **Step 2: Accessibility pass**
  - Every control is reachable by Tab, with a visible focus ring.
  - Every icon has an `aria-label`.
  - Touch targets are ≥ 44 px.
  - Text contrast on the cards meets WCAG AA.

- [ ] **Step 3: Edge-case checks in the browser**
  - **Full day:** `?dev-root=.fake-drive/day` logs `Listed 8640 files in N ms` with N < 3000. The list is smooth, and the rows show "Damaged file" (the files are empty).
  - **Damaged:** `?dev-root=.fake-drive/damaged` shows the truncated segment's slot as "Damaged file", and playback continues with the next segment.
  - **Encrypted:** `?dev-root=.fake-drive/encrypted` shows the full-screen encrypted message.
  - **Partial:** `?dev-root=.fake-drive/partial` plays a 2×3 grid with a "No video" Left Pillar slot (the pillar tiles exist because other timelines have them).

- [ ] **Step 4: Final verification**
  - Run: `bun run check`
  - Expected: typecheck, lint, every test and the build pass.
  - Confirm `dist/` contains no `__dev-samples` string.

- [ ] **Step 5: Report to the user**
  - Map each "Done when" item in the spec to what was seen.
  - List what was **not checked against real clips:** encrypted clips, H.265, the Autopilot/FSD labels, and real tablets and phones.
  - List what the user must try by hand: drag and drop, **Choose folder** (including picking the drive's root) and **Choose files** in Chrome, Edge and Firefox.
  - Don't deploy or publish.
