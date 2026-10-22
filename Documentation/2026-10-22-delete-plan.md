# Delete Clips and Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete whole events or drives from the player, the clip list, and a Manage events screen. Every delete is confirmed in a dialog, and nothing beyond what the dialog lists is ever removed.

**Architecture:**
- **Handles at listing time.** Collecting files keeps each file's directory handle (and its event folder's parent) behind small interfaces (`DirRef`, `RootRef`), so the delete logic is pure and testable with fakes.
- **A delete is a plan, then a run.** A plan lists exact `removeEntry` calls: every known file, then the emptied event folder. A run asks each root for write permission, executes the plan, and reports what was deleted and what failed.
- **The app layer** releases anything holding the files open, runs the delete, prunes the library and opens the next clip.

**Tech Stack:** the existing Vite + React + TypeScript app, bun, File System Access API (Chrome/Edge). No new dependencies.

**Spec:** `Documentation/2026-10-22-delete-design.md`, on top of `Documentation/dashcam-app-prompt.md`.

## Global Constraints
- Read-only, **except deletes the user confirms in a dialog**. Nothing else is ever written, renamed or moved.
- **Exactness:** a delete removes only the files the dialog counted, and then the event folder only if it is empty (a non-recursive `removeEntry`). Never `recursive: true`.
- **The dialog:**
  - **Cancel** is focused by default; Escape and clicking outside cancel.
  - The red Delete button is the only way in, so no keyboard shortcut deletes.
- **Permission:** ask for `readwrite` only from the Delete click in our dialog, once per root.
  - A refused root deletes nothing under it.
- **Where it works:** Chrome/Edge with folders from **Choose folder** or drag and drop.
  - **Choose files**, the `webkitdirectory` fallback, loose dropped files, Firefox and Safari: the trash buttons are greyed out with the tooltip "To delete, open the folder with Choose folder or drag it in (Chrome or Edge)."
- **Sizes:** GB of 1,024³ bytes, one decimal place.
- **Dev testing:** deletes only under `.fake-drive/`. The dev server refuses anything under `Samples/` or outside `.fake-drive/`.
- **Housekeeping:** bun / bunx only. Don't commit unless the user asks (their standing rule).

## Review Focus
1. **A file in use on Windows** (the playing video, a thumbnail capture, the driving-data worker) makes `removeEntry` fail. The delete must release them first, and still report failures honestly. → Task 6 tests the release order with fakes; Task 9 checks it in the browser on the event being watched.
2. **Several roots with one refused.** Events under granted roots go; refused ones are reported, and nothing under them is touched. → Task 2 test.
3. **Files already gone** (deleted in Explorer since loading) count as deleted, not as failures. → Task 2 test.
4. **Deleting the clip being watched** with a filter active: the next clip in the filter plays. With none left, the list shows; with an empty library, the landing screen. → Task 6 tests.
5. **A double click on Delete, or Delete pressed while a run is in progress,** never starts a second run. → Task 7 test (`useDeleteFlow` state guard).

---

## File map
```
src/delete/types.ts      DirRef, RootRef, FileLocation, DeletePlan, DeleteResult
src/delete/plan.ts       planDelete, measurePlan, pruneTimeline, removeTimelines
src/delete/run.ts        runDelete
src/delete/bulk.ts       bulkMatches, dayStartMs, formatGB, selectionTotal
src/sources/collect.ts   (modify) EntryNode gains removeEntry/requestWrite; SourceFile.loc attached
src/sources/browser.ts   (modify) handles in fromDirectoryHandle; drag and drop via getAsFileSystemHandle
src/library/types.ts     (modify) SourceFile.loc?: FileLocation
src/player/engine.ts     (modify) release()
src/sei/serial.ts        (modify) idle()
src/sei/telemetry-cache.ts (modify) forget(paths)
src/sei/telemetry-client.ts (modify) telemetryIdle()
src/ui/thumbs.ts         (modify) forgetThumbs(paths)
src/app/delete.ts        deleteTimelines (orchestration)
src/app/messages.ts      (modify) delete copy
src/ui/ConfirmDialog.tsx, src/ui/useDeleteFlow.ts, src/ui/DeleteButton.tsx, src/ui/list/ManageEvents.tsx
src/ui/player/Controls.tsx, src/ui/list/ClipRow.tsx, src/ui/list/SettingsMenu.tsx, src/ui/App.tsx (modify)
vite.dev-samples.ts, src/dev/dev-samples.ts (modify) dev-only delete under .fake-drive
scripts/make-delete-copy.ts
tests/delete/*.test.ts, tests/sources/collect.test.ts, tests/app/delete.test.ts, tests/ui/delete-text.test.ts, tests/dev/dev-delete.test.ts
```

---

### Task 1: Delete model: plan, measure, prune

**Files:**
- Create: `src/delete/types.ts`, `src/delete/plan.ts`
- Modify: `src/library/types.ts`
- Test: `tests/delete/plan.test.ts`, `tests/helpers/fake-dirs.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export interface DirRef { name: string; removeEntry(name: string): Promise<void> }   // never recursive
  export interface RootRef { id: string; requestWrite(): Promise<boolean> }
  export interface FileLocation { dir: DirRef; parent: DirRef | null; root: RootRef }
  export type DeleteStep = { kind: 'file'; dir: DirRef; name: string; path: string } | { kind: 'folder'; dir: DirRef; name: string };
  export interface DeletePlan { timeline: Timeline; steps: DeleteStep[]; files: SourceFile[]; roots: RootRef[] }
  export interface DeleteResult { timelineId: string; deletedPaths: string[]; failed: { path: string; reason: string }[]; refused: boolean }
  // library/types.ts
  SourceFile.loc?: FileLocation
  // plan.ts
  export function planDelete(tl: Timeline): DeletePlan | null;   // null when any file lacks loc
  export function measurePlan(p: DeletePlan): Promise<{ files: number; bytes: number }>;   // getFile().size, 8 at a time
  export function pruneTimeline(tl: Timeline, deletedPaths: Set<string>): Timeline | null;  // null when no camera file remains
  export function removeTimelines(lib: Library, results: DeleteResult[]): Library;          // prunes each; drops emptied ones
  ```
- Test helper: `fakeDir(name, opts?: { failOn?: string[]; goneOn?: string[]; nonEmpty?: boolean }): DirRef & { removed: string[] }` and `fakeRoot(id, grant = true)`.
  - `failOn` throws `NoModificationAllowedError`.
  - `goneOn` throws `NotFoundError`.
  - Removing a folder throws `InvalidModificationError` when `nonEmpty`.
- Test helper: `locSource(path, dir, parent, root, bytes = 10)`.

- [ ] **Step 1: Write the failing tests**
  - **Saved event** (2 segments × 2 cameras + `event.json` + `thumb.png`, all with `loc`):
    - steps are 6 `file` steps, then one `folder` step on the parent named after the event folder;
    - `files` has 6 entries;
    - `roots` has one.
  - **Lone event folder** (`parent: null`): file steps only, no folder step.
  - **Recent drive:** file steps only.
  - **Not deletable:** a timeline where one file lacks `loc` → `planDelete` returns `null`.
  - **Measuring:** `measurePlan` sums `getFile().size` and counts files.
  - **Pruning:**
    - `pruneTimeline` with every camera file deleted → `null`;
    - with one segment's files deleted → that segment is removed and `cameras` is recomputed;
    - `removeTimelines` drops emptied timelines and keeps the order of the rest.

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/delete/plan.test.ts`
  - Expected: FAIL (module missing).

- [ ] **Step 3: Implement `types.ts` and `plan.ts`** (folder step only when every known file has the same `dir` and a non-null `parent`).

- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `bun test tests/delete`
  - Expected: PASS.

---

### Task 2: Running a delete: permission, progress, stop, failures

**Files:**
- Create: `src/delete/run.ts`
- Test: `tests/delete/run.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  ```ts
  export interface RunProgress { event: number; events: number; file: number; files: number }
  export function runDelete(plans: DeletePlan[], onProgress: (p: RunProgress) => void, signal: AbortSignal): Promise<DeleteResult[]>;
  ```
  1. Ask each distinct root `requestWrite()` once, in plan order, before any removal.
  2. Plans under a refused root give `{ refused: true, deletedPaths: [] }`.
  3. Then plans run one at a time, steps in order.
  4. A `NotFoundError` on a file counts as deleted.
  5. Any other file error goes in `failed` and the plan continues.
  6. A folder step that fails with `InvalidModificationError` (not empty) or `NotFoundError` is not a failure.
  7. Abort stops before the next plan, never mid-plan.

- [ ] **Step 1: Write the failing tests**
  - **Order:** every step runs in order, and progress reports `file/files` and `event/events`.
  - **Refused root:** two roots with the second refused → plans under it come back `refused`, and its dirs' `removed` lists stay empty.
  - **Gone file:** a file that is gone counts as deleted.
  - **Failing file:** goes into `failed`; the rest of that plan still runs.
  - **Folder not empty:** the folder step is skipped silently.
  - **Abort:** aborting during plan 1 lets plan 1 finish, and plan 2 never starts.
  - **One prompt per root:** `requestWrite` is called once per root even with 3 plans under it.

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/delete/run.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement `runDelete`**

- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `bun test tests/delete`
  - Expected: PASS.

---

### Task 3: Bulk selection helpers

**Files:**
- Create: `src/delete/bulk.ts`
- Test: `tests/delete/bulk.test.ts`

**Interfaces:**
- Consumes: `listSelection` and `ListTab` (`src/ui/list/list-model.ts`); `ReasonCategory` and `Timeline`.
- Produces:
  ```ts
  export function dayStartMs(isoDate: string): number | null;           // '2026-09-01' → Date.UTC(2026,8,1); bad input → null
  export function bulkMatches(tls: Timeline[], tab: ListTab, chip: ReasonCategory | null, olderThanMs: number | null): Timeline[]; // startMs < olderThanMs
  export function formatGB(bytes: number): string;                      // 1024³ → '1.0 GB'; under 0.1 GB → '0.1 GB'
  export function selectionTotal(sizes: Map<string, number>, ids: string[]): { events: number; bytes: number; pending: number } // pending = ids not yet sized
  ```

- [ ] **Step 1: Write the failing tests**
  - `dayStartMs('2026-09-01')` → `Date.UTC(2026, 8, 1)`; `dayStartMs('nope')` → `null`.
  - **Older than:** `bulkMatches` keeps a timeline starting at 23:59 the day before, and drops one starting at 00:00 that day.
  - **Filters:** type and reason filters behave like the list (via `listSelection`).
  - **Sizes:** `formatGB(19542690611)` → `'18.2 GB'`.
  - **Running total:** `selectionTotal` counts `pending` for ids missing from `sizes`.

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/delete/bulk.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `bun test tests/delete`
  - Expected: PASS.

---

### Task 4: Handles through listing

**Files:**
- Modify: `src/sources/collect.ts`, `src/sources/browser.ts`, `src/sources/fs-access.d.ts`
- Test: `tests/sources/collect.test.ts`

**Interfaces:**
- Consumes: Task 1 `DirRef`, `RootRef`, `FileLocation`.
- Produces:
  ```ts
  // EntryNode gains:
  removeEntry?(name: string): Promise<void>;   // dirs backed by a FileSystemDirectoryHandle
  requestWrite?(): Promise<boolean>;           // roots backed by a handle
  // collectSources: each file under a dir node with removeEntry gets
  // loc = { dir: <that node>, parent: <its parent node if it has removeEntry, else null>, root }
  // where root = { id: `${rootIndex}:${rootName}`, requestWrite }; files without that get no loc.
  ```
- `browser.ts`:
  - `fromDirectoryHandle(h, isRoot)` adds:
    - `removeEntry: (n) => h.removeEntry(n)`
    - and, for roots, `requestWrite: async () => (await h.requestPermission({ mode: 'readwrite' })) === 'granted'`
  - `fromDataTransfer(items)` returns `Promise<EntryNode[]>`:
    - It starts `item.getAsFileSystemHandle()` for every item synchronously inside the drop event, then awaits them.
    - Directory handles go through `fromDirectoryHandle(h, true)`.
    - File handles become loose files (no `removeEntry`).
    - Fall back to `webkitGetAsEntry` (read-only) when the method is missing.
  - `useGlobalDrop` awaits it.

- [ ] **Step 1: Write the failing tests**
  - **Deletable tree:** a fake tree whose dirs have `removeEntry` (and whose root has `requestWrite`):
    - every collected file has `loc.dir.name` equal to its folder;
    - event files have `loc.parent.name === 'SavedClips'`;
    - `loc.root.id === '0:E'` (the drive root, even when walking starts at TeslaCam).
  - **Read-only tree:** a tree without `removeEntry` gives no `loc`.
  - **Loose files:** file roots give no `loc`.
  - **Two roots:** different `root.id`s.

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/sources`
  - Expected: FAIL.

- [ ] **Step 3: Implement** the collect changes, then the `browser.ts` adapters. Declare `getAsFileSystemHandle`, `requestPermission` and `removeEntry` in `fs-access.d.ts` where `lib.dom` lacks them.

- [ ] **Step 4: Run the checks and confirm they pass**
  - `bun test tests/sources`: PASS.
  - `bun run typecheck`: PASS.

---

### Task 5: Dev-only deleting under `.fake-drive`, and a copy to delete from

**Files:**
- Modify: `vite.dev-samples.ts`, `src/dev/dev-samples.ts`
- Create: `scripts/make-delete-copy.ts`, `src/dev/dev-delete-guard.ts`
- Test: `tests/dev/dev-delete.test.ts`

**Interfaces:**
- Produces:
  - `devDeleteAllowed(projectRoot: string, root: string, path: string): string | null`, a pure function in `src/dev/dev-delete-guard.ts`, imported by the plugin. It returns the absolute path to remove, or `null`. It allows only resolved paths strictly inside `<projectRoot>/.fake-drive/` and never anything under `Samples/`.
  - The plugin handles `POST /__dev-samples/delete?root=…&path=…`:
    - it removes a file, or an empty directory (`rmdir`, which fails when not empty → 409);
    - it answers 403 when `devDeleteAllowed` returns `null`;
    - 404 means gone.
  - **`dev-samples.ts`:**
    - When `root` starts with `.fake-drive`, files get `loc`.
    - Each folder becomes a `DirRef` whose `removeEntry` POSTs to the endpoint and maps 404 → a `NotFoundError` DOMException and 409 → `InvalidModificationError`.
    - The root `{ id: 'dev', requestWrite: async () => true }`.
  - **`make-delete-copy.ts`:** hard-links all of `Samples/` into `.fake-drive/delete/TeslaCam/` (replacing any old copy).

- [ ] **Step 1: Write the failing tests**
  - `devDeleteAllowed('/p', '.fake-drive/delete', 'TeslaCam/SavedClips/x/a.mp4')` → `/p/.fake-drive/delete/TeslaCam/SavedClips/x/a.mp4` (normalised).
  - Each of these → `null`:
    - root `Samples`
    - root `.fake-drive/../Samples`
    - path `../../Samples/a.mp4`
    - root `.fake-drive` with an empty path (the folder itself)

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/dev`
  - Expected: FAIL.

- [ ] **Step 3: Implement** the guard, the endpoint, the dev `loc` and the copy script.

- [ ] **Step 4: Run the checks and confirm they pass**
  - `bun test tests/dev`: PASS.
  - `bun run scripts/make-delete-copy.ts` prints how many links it made.

---

### Task 6: Deleting in the app: release, run, prune, next

**Files:**
- Create: `src/app/delete.ts`
- Modify:
  - `src/player/engine.ts`: `release()`
  - `src/sei/serial.ts`: `createSerial` returns `run` with `run.idle()`
  - `src/sei/telemetry-client.ts`: `telemetryIdle()`
  - `src/sei/telemetry-cache.ts`: `forget(paths)`
  - `src/ui/thumbs.ts`: `forgetThumbs(paths)`
  - `src/app/playback.ts`: `stopCurrent()` aborts the scan and measuring, and calls `engine.release()`
- Test: `tests/app/delete.test.ts`, plus additions to `tests/sei/serial.test.ts`, `tests/sei/telemetry-cache.test.ts` and `tests/player/engine.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `nextInList`; `openTimeline`.
- Produces:
  ```ts
  export type DeleteOrigin = 'player' | 'list' | 'manage';
  export function deleteTimelines(ids: string[], origin: DeleteOrigin, onProgress: (p: RunProgress) => void, signal: AbortSignal): Promise<DeleteResult[]>;
  ```
  1. Plan all of them; unplannable ids are skipped.
  2. If the current timeline is among them:
     - remember `next = nextInList(...)`, skipping ids being deleted;
     - call `stopCurrent()`;
     - then await `telemetryIdle()` (with a 5 s cap);
     - then `forgetThumbs` and `telemetryCache.forget` for its paths.
  3. `runDelete`.
  4. `library = removeTimelines(...)`, and drop `moments`, `route` and `health` entries for removed ids.
  5. If the current one is gone:
     - with `next` → `openTimeline(next.id, undefined, true)`, setting `listOpen` to `origin === 'list'` (open for list, closed for player);
     - else, with timelines left → `timelineId: null, listOpen: true`;
     - else → `library: null`, which shows the landing screen.
- Engine `release()`:
  - pauses;
  - unloads both elements of every slot;
  - releases all object URLs;
  - sets `tl = null`;
  - leaves slots attached, so a later `load()` still works.

- [ ] **Step 1: Write the failing tests**
  - **`serial.idle()`** resolves only after queued jobs finish.
  - **`cache.forget([a])`** → `peek(a)` is undefined, and `failed(a)` is false.
  - **Engine `release()`** → every fake video has no `src` and is paused, and a later `load` plays again.
  - **`deleteTimelines`** (fake videos plus `locSource` timelines in `appStore`, with list filter Saved/Honk):
    - deleting the current Honk event → the library no longer has it, the next Honk clip is current and playing, and `listOpen` is false for origin `player`;
    - the same from origin `list` → `listOpen` is true;
    - deleting the only timeline → `library` is `null`;
    - a partial failure leaves the timeline with only the files that failed;
    - the playing video had its `src` removed before the first `removeEntry` (check the order on the fake dir's log).

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/app/delete.test.ts tests/sei tests/player`
  - Expected: FAIL on the new tests.

- [ ] **Step 3: Implement** everything listed under Interfaces.

- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `bun test`
  - Expected: PASS.

---

### Task 7: Confirm dialog, trash buttons and the delete flow

**Files:**
- Create: `src/ui/ConfirmDialog.tsx`, `src/ui/useDeleteFlow.ts`, `src/ui/DeleteButton.tsx`, `src/ui/delete-text.ts`
- Modify:
  - `src/ui/player/Controls.tsx`: trash button next to the map toggle
  - `src/ui/list/ClipRow.tsx`: trash button at the right edge; hover/focus with a mouse; always on touch via `@media (hover: none)`
  - `src/app/messages.ts`
  - `src/styles/*.css`
- Test: `tests/ui/delete-text.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // delete-text.ts (pure)
  export function singleDialogText(tl: Timeline, m: { files: number; bytes: number } | null, firstTime: boolean):
    { title: string; what: string; warning: string; note: string | null; confirm: 'Delete' };
  export function bulkDialogText(events: number, m: { files: number; bytes: number }): { title: string; warning: string; confirm: string };
  export function resultText(results: DeleteResult[], bytes: number): string;
  // useDeleteFlow: { state: 'idle' | 'measuring' | 'confirm' | 'running' | 'done'; open(ids, origin); confirm(); cancel(); }
  // confirm() is a no-op unless state === 'confirm' (one run at a time).
  ```
- **Copy, exactly from the design:**
  - Title: "Delete this Sentry event?" / "Delete this Saved event?" / "Delete this Recent drive?"
  - What: `${formatWall(startMs,'full')} · ${place} · ${files} files, ${GB}`
  - Warning: "It's removed from the drive permanently. This can't be undone."
  - First-time note: "Your browser will ask to allow editing the folder."
  - Counting: "Counting files…"
  - Bulk title: "Delete 34 events?" Bulk warning: "1,904 files, 18.2 GB will be removed from the drive permanently. This can't be undone." Bulk confirm button: "Delete 34 events"
  - Refused: "Deleting needs permission to edit the folder. Nothing was deleted."
  - Done: "Deleted 34 events, 18.2 GB."
  - Failures: "Couldn't delete 2 events. The drive may be read-only or a file may be in use."
  - Not deletable: "To delete, open the folder with Choose folder or drag it in (Chrome or Edge)."
- **ConfirmDialog:**
  - `role="alertdialog"` and `aria-modal`;
  - Cancel focused on open;
  - focus kept inside;
  - Escape and clicking the backdrop cancel;
  - focus returns to the trigger on close;
  - Delete disabled while counting.

- [ ] **Step 1: Write the failing tests** for `delete-text.ts`:
  - each title by kind;
  - `what` for a known timeline: "Sun Oct 18, 2026 14:01:11 · Town · 66 files, 3.1 GB";
  - the note only when `firstTime`;
  - bulk title and warning numbers (with a thousands separator);
  - `resultText` for all done, for partial failures, and for refused.

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `bun test tests/ui/delete-text.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement** the text module, the dialog, the flow hook and the buttons.
  - `firstTime` is true until a run's permission has been granted in this session.
  - The result shows as a small toast at the bottom for 6 s (`role="status"`).

- [ ] **Step 4: Verify** (`bun test` PASS; `bun run scripts/make-delete-copy.ts`; then `http://localhost:5190/?dev-root=.fake-drive/delete`)
  - **Dialog:** trash in the player opens the dialog with "Counting files…", then the counts.
    - Enter cancels, since Cancel has focus.
    - Escape cancels.
    - Clicking Delete removes the event: the folder is gone on disk, `Samples/` is untouched, and the next clip plays.
  - **Rows:** a row's trash works the same, and the list stays open.
  - **Without delete support:** with `?dev-root=Samples` (no `loc`), the trash buttons are greyed out with the tooltip.

---

### Task 8: Manage events

**Files:**
- Create: `src/ui/list/ManageEvents.tsx`, `src/styles/manage.css`
- Modify:
  - `src/ui/list/SettingsMenu.tsx`: a "Manage events…" item
  - `src/app/state.ts`: `manageOpen`
  - `src/ui/App.tsx` or `Player.tsx`: render it
- Test: `tests/delete/bulk.test.ts` (Task 3 already covers the logic). The screen is checked in the browser.

**Interfaces:**
- Consumes: Task 3 helpers, Task 6 `deleteTimelines`, Task 7 dialog and flow.
- Behaviour, from the design:
  - **Filters:** tabs, chips and an "Older than" `<input type="date">` (empty by default).
  - **Rows:** a ticked list of `bulkMatches` (virtualised with `VirtualList`). Each row shows date and time, place, reason, and size (or "…" while counting).
  - **Unticked rows:** unticks are kept in a `Set` of ids, so newly matching events arrive ticked.
  - **Buttons:** Select all / Select none.
  - **Sizes:** measured 8 at a time from when the screen opens. The running total reads "34 events, 18.2 GB", with "(counting…)" while `pending > 0`.
  - **The red button:** "Delete 34 events (18.2 GB)…", disabled at 0 or while counting. It opens the bulk dialog.
  - **While running:** "Deleting 12 of 34…" plus a file count for long drives, and a **Stop** button (it aborts the signal).
  - **At the end:** the result text, and the list refreshes.

- [ ] **Step 1: Implement the screen**

- [ ] **Step 2: Verify in the browser** on a fresh `bun run scripts/make-delete-copy.ts`
  - **Filtering and ticks:**
    - Older than 2026-10-18 + All → 2 Saved events.
    - Untick one → the total updates.
  - **Deleting:** Delete opens the bulk dialog with matching numbers; confirming deletes exactly the ticked event, and the list and the clip list update.
  - **Stop:** with two ticked, it finishes the first and leaves the second.

---

### Task 9: Spec update, full check, browser run-through

**Files:**
- Modify: `Documentation/dashcam-app-prompt.md` (Ground rules "Read-only, except deletes the user confirms in a dialog", Anti-goals, Settings ⋯ menu mentions Manage events)

- [ ] **Step 1: Update the spec**

- [ ] **Step 2: Run the full check**
  - Run: `bun run check`
  - Expected: exit 0.
  - Then confirm `dist/` contains no `__dev-samples`.

- [ ] **Step 3: Browser run-through** on a fresh delete copy
  - **The clip being watched,** in the single view and in the grid:
    - deleting it works;
    - the next clip in the filter plays;
    - nothing under `Samples/` changes (compare file counts before and after).
  - **Edge cases:**
    - deleting the last remaining clip shows the landing screen;
    - a dev delete aimed at `Samples/` (a crafted request) gets 403.

- [ ] **Step 4: Report to the user,** including what they must try by hand: deleting on the T7 in Chrome via Choose folder and via drag and drop, including the browser's permission prompt.
