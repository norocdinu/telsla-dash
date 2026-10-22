# Install as an app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashcam Viewer installs from `http://localhost:5191` as an offline app, from a Bun command on this laptop or from a single Windows installer program attached to each GitHub release.

**Architecture:**
- **Making it installable:** a web app manifest and generated PNG icons.
- **Offline:** a hand-written service worker whose list of files to keep comes from a small Vite plugin at build time.
- **Version:** the version and build id are baked in with Vite `define`.
- **Install banner and update notice:** registration code in the app shows them from small pure decision functions.
- **The local server:** one Bun server module (`scripts/serve-app.ts`) serves either `dist/` from disk (`bun run install-app`) or the files embedded in a `bun build --compile` program (the installer).

**Tech Stack:** Vite 8, React 19, TypeScript 6, Bun 1.4 (tests, server, `--compile`). No new dependencies.

**Spec:** `Documentation/2026-10-22-install-app-design.md` (binding). The app's overall spec is `Documentation/dashcam-app-prompt.md`.

## Global Constraints

- Use bun and bunx, never npm. `bun run check` must pass at the end.
- No new dependencies.
- No commits: the user commits when they ask. Work stays on branch `install-app`.
- The install address is exactly `http://localhost:5191`. The dev server stays on 5190 and must not change behaviour: no service worker in dev, and the dev sample loader stays out of builds.
- The service worker never caches, intercepts or forwards clip files or map tiles. It handles only same-origin GET requests for the app's own files.
- No automatic reload while the app is open. An update only reloads when the user presses Reload.
- The icons are original artwork: no Tesla logo or branding.
- `Samples/` is private: nothing from it goes in tracked files.
- Creating a GitHub release or uploading the installer is an outward step that needs the user's go-ahead. It isn't part of this build.

## Review Focus

1. **The installed app opened while no server is running** (after a restart). It must load fully from the cache, including the driving-data worker script and the CSS. → Task 8 browser check with the server stopped.
2. **An update while a clip is playing.** The notice appears, and nothing reloads until Reload is pressed. → Task 4 test "the update notice never reloads by itself"; Task 8 browser check.
3. **Port 5191 already in use,** by another copy of the installer or by something else. → Task 6 tests "another copy already running" and "something else on the port".
4. **Map with no internet.** The card says "Map needs internet" instead of grey squares, and comes back when the connection returns. → Task 5 tests.
5. **A dev build or `?dev-root=` page never registers the service worker,** and the sample loader never ships. → Task 3 test "dev builds don't register"; Task 8 checks `dist/` for the dev loader.

---

### Task 1: Version and build id

**Files:**
- Modify: `package.json` (`"version": "0.3.0"`)
- Modify: `vite.config.ts` (define `__APP_VERSION__`, `__APP_BUILD__`; emit `version.json` in the build)
- Create: `src/app/version.ts`, `src/vite-env-globals.d.ts` (or extend the existing `vite-env.d.ts`)
- Modify: `src/ui/list/SettingsMenu.tsx` (a quiet "Dashcam Viewer v0.3 · 1a2b3c4" line under the shortcuts)
- Create: `vite.version.ts` (`buildInfo()` reads `package.json` and git: short hash, plus a `+` when the working tree isn't clean; it falls back to `'dev'` when git is unavailable)
- Test: `tests/app/version.test.ts`

**Interfaces:**
- Produces: `versionLabel(version: string): string` ('0.3.0' → 'v0.3'; '1.2.3' → 'v1.2.3'), `buildLabel(version: string, build: string): string` ('v0.3 · 1a2b3c4'), `APP_VERSION`, `APP_BUILD` (from the defines), and `/version.json` in builds: `{ "name": "dashcam-viewer", "version": "0.3.0", "build": "1a2b3c4" }`.

- [ ] Write tests:
  - `test('a .0 patch is dropped')` and `test('other versions stay whole')` for versionLabel.
  - `test('settings line joins version and build')` for buildLabel.
- [ ] Run `bun test tests/app/version.test.ts`. Expected: FAIL.
- [ ] Implement. Run it again. Expected: PASS.

### Task 2: Icons and manifest

**Files:**
- Create: `scripts/png.ts` (`encodePng(width, height, rgba: Uint8Array): Uint8Array`, using `Bun.deflateSync` and CRC32), `scripts/make-icons.ts` (draws the mark at 4× supersampling and writes `public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`, plus `public/favicon.svg`)
- Create: `public/manifest.webmanifest`
- Modify: `index.html` (manifest link, `theme-color` dark, favicon)
- Test: `tests/scripts/png.test.ts`

**Manifest values:**

| Field | Value |
|---|---|
| `name` | "Dashcam Viewer" |
| `short_name` | "Dashcam" |
| `id` and `start_url` | "/" |
| `scope` | "/" |
| `display` | "standalone" |
| `background_color` and `theme_color` | "#000000" |
| `icons` | the three PNGs; maskable with `purpose: "maskable"` |

- [ ] Write tests:
  - `test('a PNG starts with the signature and an IHDR of the right size')`.
  - `test('the pixel data round-trips through inflate')`, using `Bun.inflateSync` on the IDAT, with one filter byte per row.
- [ ] Run `bun test tests/scripts/png.test.ts`. Expected: FAIL.
- [ ] Implement, then run `bun scripts/make-icons.ts`. Expected: 3 PNGs written. Look at them in the browser.
- [ ] Run the test again. Expected: PASS.

### Task 3: The service worker

**Files:**
- Create: `vite.sw.ts`:
  - A plugin that in `generateBundle` emits `sw.js` from `src/sw/sw-template.ts`'s output, with the list of files to keep and the cache name injected.
  - It also emits `version.json` (moved here from Task 1 if simpler).
- Create: `src/sw/precache.ts`:
  - `precacheList(fileNames: string[]): string[]` → always includes '/', '/index.html' and '/manifest.webmanifest', plus the icons, every emitted JS, CSS and worker file, and the public files.
  - It excludes `.map` files, `sw.js` itself and anything under `__dev`.
  - Also `cacheName(build: string): string` → `dashcam-viewer-<build>`.
- Create: `src/sw/sw.ts`, the worker logic (compiled by the plugin with esbuild/Vite transform into `sw.js`):
  - **install:** open the cache and `addAll(list)`. No `skipWaiting` on install.
  - **activate:** delete older `dashcam-viewer-*` caches, then `clients.claim()`.
  - **fetch:** handle only same-origin GET requests whose path is in the list, or navigations. Navigations get the network first, falling back to the cached `/index.html`; listed files come from the cache first. Everything else is untouched.
  - **message `skip-waiting`:** call `skipWaiting()`.
- Create: `src/app/pwa.ts` (`shouldRegister(env: { prod: boolean; search: string }): boolean`, false in dev or when `?dev-root=` is present; plus `registerServiceWorker()`)
- Modify: `vite.config.ts` (add the plugin), `src/main.tsx` (call `registerServiceWorker()`)
- Test: `tests/sw/precache.test.ts`, `tests/app/pwa.test.ts`

- [ ] Write tests:
  - `test('keeps the page, manifest, icons and every built asset')`.
  - `test('leaves out source maps, the worker itself and dev files')`.
  - `test('cache names carry the build')`.
  - `test('dev builds don't register')` and `test('a ?dev-root page doesn't register')`.
- [ ] Run `bun test tests/sw tests/app/pwa.test.ts`. Expected: FAIL.
- [ ] Implement. Run `bun run build`, then check that `dist/sw.js` exists and lists the hashed assets. Expected: present.
- [ ] Run the tests again. Expected: PASS.

### Task 4: Install banner and update notice

**Files:**
- Modify: `src/app/pwa.ts`:
  - A small store `pwaStore = { installPrompt: Event | null, installDismissed: boolean, update: { version: string; build: string } | null }`.
  - Listeners for `beforeinstallprompt` (call `preventDefault` and keep the event) and `appinstalled`.
  - Registration watches `updatefound` and the installed state. When a new worker is waiting, it fetches `/version.json` with `cache: 'no-store'` and sets `update`.
  - `applyUpdate()` posts `skip-waiting`, and on `controllerchange` reloads once.
- Create: `src/ui/AppNotices.tsx` (the install banner and the update notice, rendered in `App`)
- Create: decision helpers in `src/app/pwa.ts`:
  - `installBannerVisible(s: { prompt: boolean; dismissed: boolean; standalone: boolean }): boolean`.
  - `updateText(next: { version: string; build: string }, current: { version: string; build: string }): string`. It gives 'Updated to v0.3 — reload' when the version changed, and 'Updated to v0.3 (build 1a2b3c4) — reload' when only the build changed.
- Test: `tests/app/pwa.test.ts`

- [ ] Write tests:
  - `test('the install banner shows only when the browser offers it')`.
  - `test('not in the installed app, and not after Not now')`.
  - `test('update text names the version, and the build when only the build changed')`.
  - `test('the update notice never reloads by itself')`: create a fake registration with a waiting worker. Assert that no reload happens until `applyUpdate()`, and that `controllerchange` reloads exactly once after it.
- [ ] Run `bun test tests/app/pwa.test.ts`. Expected: FAIL.
- [ ] Implement. Run it again. Expected: PASS.

### Task 5: Map without internet

**Files:**
- Create: `src/ui/player/map-status.ts` (`mapOffline(s: { online: boolean; tilesLoaded: number; tileErrors: number }): boolean`, offline when the browser says so, or when tiles have failed and none has loaded)
- Modify: `src/ui/player/MapCard.tsx`:
  - Count `tileload` and `tileerror` on the tile layer.
  - Listen to `online` and `offline`.
  - When offline, show a centred "Map needs internet" over the map box, and keep the route line.
- Modify: `src/app/messages.ts` (`MAP_OFFLINE = 'Map needs internet'`)
- Test: `tests/ui/map-status.test.ts`

- [ ] Write tests:
  - `test('offline when the browser is offline')`.
  - `test('offline when tiles fail and none loaded')`.
  - `test('online again once a tile loads')`.
- [ ] Run, expect FAIL. Implement, run again, expect PASS.

### Task 6: The local server and `bun run install-app`

**Files:**
- Create: `scripts/serve-app.ts`:
  - `INSTALL_PORT = 5191`.
  - `contentType(path)`.
  - `resolvePath(urlPath: string, files: Map<string, Blob>): Blob | null`. It falls back to `/index.html` for paths without a file extension, and never allows `..` traversal.
  - `portOutcome(probe: { inUse: boolean; isOurs: boolean }): 'serve' | 'already-running' | 'taken'`.
  - `serveApp(files): Promise<'serving' | 'already-running' | 'taken'>`, which probes the port by fetching `/version.json` with a 1 s timeout. If it's ours, the result is already-running; if the port is held by something else, taken.
  - `openBrowser(url)`, which runs `cmd /c start "" <url>` on Windows (`open` or `xdg-open` elsewhere).
  - `defaultBrowserNote()`, which reads `HKCU\…\UrlAssociations\http\UserChoice` ProgId through `reg query` and returns a line when it isn't Chrome or Edge.
- Create: `scripts/install-app.ts`:
  - Runs `vite build`, loads `dist/` into a `Map`, then `serveApp` and `openBrowser`.
  - Prints: "Dashcam Viewer is at http://localhost:5191 — click Install in Chrome or Edge. You can close this window once it's installed."
- Modify: `package.json` scripts (`"install-app": "bun scripts/install-app.ts"`)
- Test: `tests/scripts/serve-app.test.ts`

- [ ] Write tests:
  - `test('content types for the app's files')`.
  - `test('paths without an extension get the page')`.
  - `test('no way out of the app's files')`: `/../package.json` and `/%2e%2e/x` give null.
  - `test('another copy already running')` and `test('something else on the port')`, using portOutcome.
- [ ] Run `bun test tests/scripts/serve-app.test.ts`. Expected: FAIL.
- [ ] Implement. Run `bun run install-app` and check that `http://localhost:5191` serves the app. Run it a second time while the first is running: it reports already running and opens the browser.
- [ ] Run the tests again. Expected: PASS.

### Task 7: The Windows installer program

**Files:**
- Create: `scripts/build-installer.ts`:
  1. Runs `vite build`.
  2. Writes `.installer/embedded.ts`, which imports every `dist/` file with `import f from '…' with { type: 'file' }` and exports `Map<urlPath, string>` of embedded paths.
  3. Runs `bun build --compile --target=bun-windows-x64 scripts/installer-main.ts --outfile "release/Dashcam Viewer Installer.exe"`.
- Create: `scripts/installer-main.ts` (loads the embedded files as Blobs with `Bun.file(path)`, then calls `serveApp`, `openBrowser` and `defaultBrowserNote`; it keeps running until the window closes)
- Modify: `.gitignore` (`release/`, `.installer/`), `package.json` scripts (`"build-installer": "bun scripts/build-installer.ts"`), `tsconfig.tools.json` (include the new scripts and Vite plugins)
- No unit test: the parts it uses are tested in Task 6.

- [ ] Run `bun run build-installer`. Expected: `release/Dashcam Viewer Installer.exe`, about 100 MB.
- [ ] Run the exe once from the terminal, in the background. Expected:
  - `http://localhost:5191/` returns the page and `/version.json` returns 0.3.0.
  - Stop it afterwards.

### Task 8: Check it end to end, and the docs

**Files:**
- Modify: `Documentation/dashcam-app-prompt.md`:
  - In "Not now", mark the PWA item done.
  - Add a short "Install" section: the command, the release installer, the 5191 address, and that the map needs internet.

- [ ] **Browser check** with `bun run install-app` serving 5191:
  - The manifest loads and the service worker is active.
  - The install banner appears (`beforeinstallprompt`), or the browser shows it can be installed.
- [ ] **Offline check:**
  1. Stop the server and reload: the app loads from the cache.
  2. Open the sample clips (Choose folder isn't scriptable, so use the dev drop path or check that the page and worker load).
  3. With the network off, the map says "Map needs internet".
- [ ] **Update check:**
  1. Change the build (any committed-or-not change gives a new build id) and run install-app again.
  2. With a clip playing in the open page, the notice appears and nothing reloads.
  3. Press Reload: the page reloads once, on the new build.
- [ ] **Dev check:** `dist/` contains no `__dev-samples`, and the dev server at 5190 registers no service worker.
- [ ] Run `bun run check`. Expected: exit 0.
