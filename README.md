<p align="center">
  <img src="public/icons/icon-192.png" width="96" height="96" alt="Dashcam Viewer icon">
</p>

<h1 align="center">Dashcam Viewer</h1>

<p align="center">
  A private, offline viewer for Tesla dashcam clips, with the driving data recorded alongside every frame.<br>
  It runs in your browser or as an installed app. Your clips never leave your computer.
</p>

<p align="center">
  <a href="https://github.com/norocdinu/telsla-dash/releases/latest"><strong>Download the latest release</strong></a>
  ·
  <a href="#install">Install</a>
  ·
  <a href="#using-it">Using it</a>
  ·
  <a href="#development">Development</a>
</p>

---

Dashcam Viewer plays the clips a Tesla saves to its USB drive (the `TeslaCam` folder). Its look and layout follow the car's own Dashcam Viewer (the 2025.44 redesign). On clips from firmware 2025.44.25 or later, it also shows the driving data the car embeds in each video frame: speed, pedals, steering, blinkers, gear, Autopilot/FSD state, GPS and g-forces. It uses that data to point out the moments worth watching.

## Features

- **Every clip type:** Saved and Sentry events and Recent drives, grouped into one timeline per event or drive, across all of its one-minute files.
- **All six cameras:** one large camera with a strip of the others, or a grid of all of them, kept in sync.
- **Driving panel, as in the car:**
  - Speed and gear.
  - Accelerator and brake.
  - A steering wheel that turns with the car's, and blue while the car steers itself.
  - Blinking turn signals.
  - The Autopilot/FSD state.
- **Moments:**
  - Hard braking, swerves, self-driving turning off and the event trigger are marked on the scrubber.
  - **Jump to Event** goes straight to the trigger.
- **Route map:** the drive's route and the car's position, on OpenStreetMap.
- **Stats for nerds:** a see-through panel with every recorded value for the frame on screen, plus charts of speed, pedals, steering and g-force.
  - While playing, the charts span the whole clip; when paused, they zoom to 15 seconds either side.
- **Clip list:**
  - Filter by type (Recent, Saved, Sentry) and by reason (honk, object detected, …).
  - **Up next** follows the current filter.
- **Deleting:** remove an event or drive from the player or the list, or clear out many at once in **Manage events**. Every delete asks for confirmation first.
- **Installable app:** opens from the Start menu, works offline, and updates only when you choose.
- **Private by design:**
  - Clips are read directly from your drive by the browser.
  - Nothing is uploaded.
  - There's no account and no tracking.

## Requirements

| | |
|---|---|
| **Browser** | Chrome or Edge on desktop for every feature (opening folders, deleting, installing). Firefox and Safari can play H.264 clips. |
| **Driving data** | Firmware 2025.44.25 or later, on a car with HW3 or newer. Older clips play without the driving panel. |
| **Installed app** | Windows with Chrome or Edge. The app is served on `http://localhost:5191` during installation. |

## Install

### Windows installer (no tools needed)

1. Download `Dashcam-Viewer-Installer-vX.Y.exe` from the [latest release](https://github.com/norocdinu/telsla-dash/releases/latest).
2. Run it. The installer isn't code-signed, so Windows may show *"Windows protected your PC"*: choose **More info → Run anyway**.
3. Your browser opens at `http://localhost:5191`. In Chrome or Edge, click **Install**, either in the app's banner or with the install icon in the address bar.
4. Once it's installed, close the installer's window. Dashcam Viewer opens from the Start menu, even offline.

**Updating:** run the newer installer while Dashcam Viewer is open, then press **Reload** when it says *"Updated to …"*.

> Some managed (work) computers block unsigned programs. If that happens, install from source instead.

### From source

Requires [Bun](https://bun.sh) 1.4 or later, and Git.

```bash
git clone https://github.com/norocdinu/telsla-dash.git
cd telsla-dash
bun install
bun run install-app
```

`install-app` builds the app, serves it on `http://localhost:5191` and opens your browser so you can click **Install**. To update, pull the latest code and run it again.

## Using it

1. **Open your clips:**
   - Drop the `TeslaCam` folder (or the whole USB drive) onto the window, or use **Choose folder**.
   - **Choose files** works for a few clips at a time.
2. **Pick a clip:** pick an event or drive from the clip list (the place card at top left). Filter it by type and reason.
3. **Watch:**
   - Scrub through the whole event.
   - Switch cameras from the strip, or press **G** for the grid.
   - Click a moment's tick to jump to it.
4. **More detail:** open **Stats for nerds** with the chart button beside the map button, or press **S**. Pause to zoom the charts to 15 seconds around the moment on screen.
5. **Delete:** use the trash button, or **⋯ → Manage events…** in the clip list.
   - Deleting needs the folder opened with **Choose folder** or by drag and drop in Chrome or Edge. The browser asks once for permission to edit it.

### Keyboard shortcuts

| Key | Action |
|---|---|
| <kbd>Space</kbd> | Play / pause |
| <kbd>←</kbd> / <kbd>→</kbd> | Back / forward 15 s |
| <kbd>,</kbd> / <kbd>.</kbd> | One frame back / forward (paused) |
| <kbd>1</kbd>–<kbd>7</kbd> | Camera tiles |
| <kbd>G</kbd> | Grid |
| <kbd>E</kbd> | Jump to Event |
| <kbd>L</kbd> | Clip list |
| <kbd>M</kbd> | Map |
| <kbd>S</kbd> | Stats for nerds |

### Settings

The **⋯** menu in the clip list holds:
- Units (km/h or mph).
- The driving panel, map and Stats for nerds switches.
- **Manage events…**
- The version and build of the app you're running.

## Privacy

- Clips are opened through the browser's file APIs and processed entirely on your computer, including the driving data, which a background worker reads from each video file.
- Nothing is uploaded, and there's no analytics.
- The only network requests are for map tiles from OpenStreetMap, and only while the map is shown.
- The installed app keeps a copy of its own code for offline use. It never stores or caches your clips.

## Development

### Setup

```bash
bun install
bun run dev      # http://localhost:5190
```

### Commands

| Command | What it does |
|---|---|
| `bun run dev` | Development server on port 5190 |
| `bun run check` | Typecheck, lint, tests and production build: run before every commit |
| `bun test` | Unit tests (synthetic data only) |
| `bun run typecheck` / `bun run lint` | TypeScript and ESLint |
| `bun run build` | Production build into `dist/` |
| `bun run install-app` | Build, serve on port 5191 and open the browser to install (`--no-open` only serves) |
| `bun run build-installer` | Build `release/Dashcam Viewer Installer.exe` (about 100 MB, embeds the app) |
| `bun scripts/make-icons.ts` | Regenerate the app icons in `public/` |

### Working with real clips

Real clips contain GPS positions and place names, so they're **never committed**: `Samples/`, `.fake-drive/`, `dist/`, `release/` and `.installer/` are all git-ignored.

- **Sample clips:**
  - Copy some clips into `Samples/`, keeping the car's folder layout (`SavedClips/`, `SentryClips/`, `RecentClips/`).
  - Then open `http://localhost:5190/?dev-root=Samples` to load them without a file dialog. This only works on the development server.
- **Throwaway copies for deleting:** `bun scripts/make-delete-copy.ts` hard-links the samples into `.fake-drive/delete/`. Open it with `?dev-root=.fake-drive/delete`. The dev server only ever deletes inside `.fake-drive/`.
- **Edge cases:**
  - `bun scripts/make-damaged.ts` makes damaged, "encrypted" and partial copies.
  - `bun scripts/make-fake-drive.ts` makes a full day of Recent clips, to check how fast listing is.
- **The data report:** `bun scripts/inspect.ts <dir>` reports what's inside real clips.

### Project structure

```
src/
  app/        state, playback wiring, loading, deleting, settings, install/update (pwa.ts)
  library/    file names → events and drives (timelines)
  mp4/        MP4 box parsing (moov, frame times)
  sei/        driving data: SEI unwrapping, protobuf decoding, the background worker, caching
  player/     playback engine (two <video> elements per camera, kept in sync)
  moments/    hard braking, swerve and self-driving-off detection
  stats/      Stats for nerds: compact series, time window, scales, number rows
  delete/     delete planning and running (File System Access API)
  sources/    folder and file access (picker, drag and drop)
  sw/         the service worker (offline copy of the app)
  ui/         React components
scripts/      install server, Windows installer, icons, dev helpers
tests/        bun tests, with synthetic MP4 and SEI builders
Documentation/  specification, designs and plans for each feature
```

### How the driving data is read

Since firmware 2025.44.25, each video frame of a Tesla clip carries an H.264 SEI message (NAL type 6, payload type 5) holding a protobuf `SeiMetadata` record. The record holds speed, gear, pedal position, steering angle, blinkers, brake, Autopilot state, latitude and longitude, heading, three-axis acceleration, a frame counter and a version.

Dashcam Viewer reads the MP4 index, unwraps each frame's SEI (stripping emulation-prevention bytes) and decodes it in a Web Worker. It reads in small slices, so playback from the same USB drive isn't starved. The format follows Tesla's published [dashcam reference](https://github.com/teslamotors/dashcam).

## Releasing

1. Bump `version` in `package.json` in the release's pull request, and merge it into `main`.
2. Tag `main` (for example `v0.3`) and push the tag.
3. Run `bun run build-installer` on the tagged `main`. The build id comes from the commit, so build from a clean checkout.
4. Create the GitHub release from the tag, with the installer attached.

## Documentation

- [Specification](Documentation/dashcam-app-prompt.md): what the app does and why, including the design rules.
- Feature designs and plans:
  - [Deleting clips and events](Documentation/2026-10-22-delete-design.md)
  - [Stats for nerds](Documentation/2026-10-22-stats-for-nerds-design.md)
  - [Install as an app](Documentation/2026-10-22-install-app-design.md)

## Acknowledgements

- [teslamotors/dashcam](https://github.com/teslamotors/dashcam), for the clip and SEI metadata format.
- [Leaflet](https://leafletjs.com) and [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, for the map.
- [protobuf.js](https://github.com/protobufjs/protobuf.js), [React](https://react.dev), [Vite](https://vite.dev) and [Bun](https://bun.sh).

## Disclaimer and license

Dashcam Viewer is an independent project. It is not affiliated with, endorsed by or sponsored by Tesla, Inc. "Tesla" is a trademark of Tesla, Inc.

No license has been chosen yet, so all rights are reserved by the author.
