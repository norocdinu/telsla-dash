# Prompt: Dashcam Viewer app

Build **"Dashcam Viewer"** (working name), a web app that plays the clips a Tesla saves to its USB drive. It shows the driving data recorded with every frame (speed, pedals, steering, blinkers, gear, Autopilot/FSD state, GPS, g-forces) and finds the moments worth watching. The look and layout copy the car's own Dashcam Viewer (the 2025.44+ redesign), described below.

The single most important goal is **ease of use**. Someone who has never used it drops in their TeslaCam folder and is watching the right clip, with the driving data on screen, without reading anything or making a choice.

## Ground rules
- **Runs entirely in the browser.** No server, no account, no uploads, no analytics. Video files and driving data never leave the computer. The only network requests allowed are map tiles (see Map).
- **Read-only.** Never write, rename, move or delete anything on the user's drive.
- **Not a Tesla product.** Copy the layout and feel, but don't use Tesla's logo, wordmark, fonts or the word "Tesla" in the app name. Describing compatibility in text is fine ("Works with Tesla dashcam clips").
- **Never invent data.** No sample or placeholder telemetry in the UI. If a field is missing, show that it's missing.
- **Tooling:** Vite + React + TypeScript (strict), using **bun / bunx** instead of npm / npx (`bun install`, `bun run dev`, `bun test`, `bunx vite build`). Keep dependencies few. Expected ones are `protobufjs` (decoding), `leaflet` (map) and nothing heavy for UI.
- **Git:** `git init` is fine. Do **not** commit anything. I'll review the files myself.
- **Reference code:** Tesla publishes the data format and a parser at https://github.com/teslamotors/dashcam (`dashcam.proto`, `dashcam-mp4.js`, `sei_explorer.html`). That repo has **no licence file**, so use it only as a reference for the format. Write our own parser and don't copy their files into `src/`. If a clone is useful, put it in `reference/` and add that folder to `.gitignore`.
- **Personal data:** my real clips are in `Samples/` (add it to `.gitignore`). They contain GPS positions, so never copy them, or bytes extracted from them, into tracked files or test fixtures.

## Step 1: check the data before building UI
I checked my sample clips on 2026-10-21; the results are below. Before any UI work, turn that check into a script (`bun run scripts/inspect.ts Samples/...`) so it can be re-run on new clips. Report anything that differs from those results. The script covers:
1. The folder layout and file names actually present (see Input).
2. The codec of each camera file (H.264 `avc1` vs H.265 `hvc1`/`hev1`). The reference parser only handles H.264.
3. Which camera files carry SEI driving data (front only, or all).
4. The frame rate, frames per file and file duration.
5. The units and ranges in real data:
   - `accelerator_pedal_position`: is it 0–1 or 0–100?
   - `steering_wheel_angle`: which sign means left?
   - `linear_acceleration_mps2_x/y/z`: which axis is forward, which is sideways, and does it include gravity? Compare against the change in speed to decide.
6. Every key in each `event.json` and every distinct `reason` value.
7. What an encrypted clip (firmware 2026.20+, encryption on by default) looks like to the parser: the cheapest reliable way to detect it from the first 64 KB, and whether its `event.json`, `thumb.png` or SEI driving data can still be read.

Stop and show me this report. Thresholds and labels in the rest of this prompt depend on it.

**If my samples don't cover a case** (encrypted, pillar cameras, H.265, SEI-bearing drive, Sentry event, a full day of Recent clips), build that part from this spec. List it as "not checked against real clips" in the final summary. For the speed test, a script may generate a folder of correctly named empty files into a git-ignored folder.

### What my sample clips showed (checked 2026-10-21)
The samples are 1 Recent clip, 2 Saved events (horn) and 2 Sentry events, from a car with six cameras including pillars (HW4).
- **Not encrypted.** Every file is a plain MP4 (`ftyp`, `mdat`, `moov`) with H.264 (`avc1`). There's no encrypted or H.265 sample yet.
- **Every camera carries the same driving data** (front and back match). Read it from the front camera only.
- **The frame rate changes:** about 36 fps while driving and about 24 fps when parked. Always use the `stts` durations, and never assume a rate.
- **Driving data stops when the car parks, even mid-file.** One file had data for its first 204 of 1,514 frames. Sentry folders start with the drive that led up to parking, so those minutes do have data.
- **Units and directions:**
  - `vehicle_speed_mps`: metres per second.
  - `accelerator_pedal_position`: 0–100 (%).
  - `steering_wheel_angle`: degrees. Positive means turning right (it matches heading changes). It reaches about ±380° at full lock.
  - `linear_acceleration_mps2_y`: the forward/back axis in m/s². It's **negative when speeding up**, so braking is positive.
  - `linear_acceleration_mps2_x`: sideways, in m/s².
  - `linear_acceleration_mps2_z`: sits near 0, so gravity is already removed.
  - `gear_state`: P, D and R seen.
  - `brake_applied` and `blinker_on_right`: both seen.
  - `autopilot_state`: always NONE, so the self-driving states are unverified.
- **`event.json`:**
  - Keys: `timestamp`, `city`, `street`, `est_lat`, `est_lon`, `reason`, `camera`.
  - Reasons seen: `user_interaction_honk`, `sentry_locked_handle_pulled`, `sentry_aware_object_detection`.
  - `camera` is a number (0, 5, 6), probably the camera that triggered the event. Its mapping is unknown, so don't show it.
- **Times:** the event folder name is when the clip was saved; `timestamp` is the trigger, a few seconds earlier.
- **Tiny last segments:** a segment can be under a second long (12 frames). Play through it without stalling.
- **Extra entries:** `SavedClips/.tcvconfig` is a folder, not a clip. Ignore anything that doesn't match the naming.

## Input: what users drop in
Accept any of these, and work out the rest:
- the whole USB drive or its `TeslaCam` folder
- one of `RecentClips`, `SavedClips` or `SentryClips`
- a single event folder
- loose `.mp4` files

**How users load files:**
- drag and drop anywhere on the window
- a **Choose folder** button:
  - Use `showDirectoryPicker()` (read-only) where the browser has it.
  - Otherwise fall back to `<input webkitdirectory>`.
  - With a directory handle, find the `TeslaCam` folder and list only that, progressively.
  - If the browser refuses the drive's root folder, say: "Pick the TeslaCam folder on the drive instead."
- a **Choose files** button (multiple `.mp4`). With loose files, rebuild clips from file names alone; there's no `event.json`, so no place, reason or Jump to Event.

**Folder layout** (confirm in Step 1):
- `RecentClips/` holds a rolling buffer of one-minute files. It's up to 24 hours on a 1 TB+ drive since the Spring 2026 update. There's no `event.json`.
- `SavedClips/<YYYY-MM-DD_HH-MM-SS>/` holds a saved event (manual save, horn), about 10 one-minute segments.
  - It contains `event.json` and `thumb.png`.
- `SentryClips/<YYYY-MM-DD_HH-MM-SS>/` is the same, triggered by Sentry Mode.
- **File names:** `YYYY-MM-DD_HH-MM-SS-<camera>.mp4`.
  - `<camera>` is one of `front`, `back`, `left_repeater`, `right_repeater`, `left_pillar` or `right_pillar`.
  - Pillar cameras exist on newer cars only.
  - Very old files use `YYYY-MM-DD_HH-MM-<camera>.mp4`, with no seconds.
- **`event.json` keys** seen in the wild: `timestamp` (local time, `YYYY-MM-DDTHH:MM:SS`, no time zone), `city`, `street`, `est_lat`, `est_lon` (strings), `reason`, `camera`.
- **Known `reason` values:**
  - `sentry_aware_object_detection`
  - `sentry_locked_handle_pulled`
  - `sentry_aware_accel_*`
  - `user_interaction_dashcam_icon_tapped`
  - `user_interaction_honk`
  - `user_interaction_*`
- **Unknown reasons:** show any other value humanised (underscores to spaces, sentence case) under "Other". Never hide a clip because its reason is unknown.

**Indexing rules:**
- List from **file names only**. Never read video bytes to build the list. A full 24-hour drive is over 8,000 files and must be listed in under 3 seconds.
- **Clip:** one timestamp across all its camera files.
- **Event:** a Saved or Sentry folder; its clips play back to back as one timeline.
- **Drive:** Recent clips grouped into one timeline, starting a new drive at any gap of 2 minutes or more.
- Show all times as local wall-clock time, exactly as recorded. Never convert time zones.

**After the drop** (make the obvious choice for the user):
- One event or drive found: open the player on it straight away.
- More than one: open the player on the newest **playable** one, with the clip list open over it.
  - Check candidates newest first by reading only the first 64 KB of one file each.
  - Skip encrypted ones.
- Nothing playable: explain why and what to do (see States).

**Encrypted clips are a per-clip state, not a dead end.** Since 2026.20 most drives mix older playable clips with newer encrypted ones.
- Detect encryption lazily, never while building the list: when a row's thumbnail loads, when a clip is opened, or during the auto-open check above.
- Rows: mark encrypted rows with a lock and "Encrypted".
- Opening an encrypted clip: show the encrypted message in place of the video.
- Partly readable clips: if Step 1 shows `event.json`, `thumb.png` or SEI are still readable, keep showing those (place, map, driving panel, Moments) next to that message.
- Full-screen message: only when every clip loaded is encrypted.

## Reading driving data (SEI)
The schema is `dashcam.proto`, message `SeiMetadata`:
- `gear_state` (P/D/R/N)
- `frame_seq_no`
- `vehicle_speed_mps`
- `accelerator_pedal_position`
- `steering_wheel_angle`
- `blinker_on_left`, `blinker_on_right`
- `brake_applied`
- `autopilot_state` (NONE, SELF_DRIVING, AUTOSTEER, TACC)
- `latitude_deg`, `longitude_deg`, `heading_deg`
- `linear_acceleration_mps2_x/y/z`

**How it is stored.** Each video frame is preceded by an SEI NAL unit (H.264 NAL type 6, payload type 5, user data unregistered). It holds a protobuf `SeiMetadata` message:
- Skip the `0x42` padding bytes after the header until the `0x69` marker.
- Take the bytes after the marker, minus the final trailing byte.
- Strip emulation-prevention bytes (`00 00 03` → `00 00`).
- Decode with protobuf.

The SEI belongs to the next picture frame. Frame durations come from the `stts` box.

**Requirements:**
- Parse in a **Web Worker**, one file at a time. Read only the clip being watched, then read ahead to the next one. Don't block the UI.
- Build a per-clip array of `{ t: secondsFromClipStart, data }` and cache it for the session.
- Sync to playback with `requestVideoFrameCallback` (`metadata.mediaTime`) and a binary search. The panel must match the frame on screen, including when paused and scrubbing.
- **No driving data:** parked cars, older firmware and HW2.5 have no SEI, and the data stops mid-file when the car parks. That's normal, not an error.
  - Decide per frame: when the frame on screen has no data, collapse the driving panel to a small "No driving data here" chip.
  - The chip's tooltip says why: the car was parked, or the clip is from before firmware 2025.44.25 or from a car older than HW3.

## Player screen (copy of the in-car layout)
Reference screenshots, for layout only:
- https://www.notateslaapp.com/img/containers/article_images/2025/dashcam_viewer_holiday_update.jpg/c0640154b32967fe5b7b20ea56130ffd/dashcam_viewer_holiday_update.webp
- https://www.notateslaapp.com/img/containers/article_images/tesla-update/dashcam-viewer-intel-compare.webp/1964fb8e741e65e437c5bdad7765af67/dashcam-viewer-intel-compare.webp
- https://www.notateslaapp.com/img/containers/article_images/2025/dashcam_viewer_filters.png/bfe14eb1fc9bb278ab3a7f8d06db8096/dashcam_viewer_filters.webp

**Layout, top to bottom:**
1. **Video fills the area edge to edge**, letterboxed on black. Nothing frames it.
2. **Three floating cards across the top of the video.** Each is dark, semi-transparent with a light blur, rounded, and has white text with grey secondary text.
   - **Left: "where and when".**
     - A list icon, then the place (`event.json` city, or "Recent drive" when there isn't one), then the date and time.
     - The time ticks with playback (`Tue Nov 25, 2025 11:25:00`).
     - Tapping it opens the clip list.
   - **Centre: the driving panel.** Three columns plus a footer strip:
     - **Left column:** the gear letter in a small circle (D/R in blue, P/N in grey); under it an accelerator-pedal icon that fills with pedal position. While pressed, its circle has a blue tint and the fill is blue.
     - **Centre:** speed as a big number, with the unit (MPH or km/h) under it. A turn-signal arrow sits on each side: it blinks green while the signal is on, as in the car, and stays dim grey when off.
     - **Right column:** a steering-wheel icon like the car's (thick rim, solid hub with three spokes) that rotates by `steering_wheel_angle`. It turns white on a blue circle while the car steers itself (Self Driving or Autosteer). Under it, a brake-pedal icon: while `brake_applied`, its circle has a red tint and the pedal fills red.
     - **Footer strip:** the driving mode in blue text: "Self Driving", "Autosteer" or "Traffic-Aware Cruise". Hide the strip when the state is NONE.
     - **Labels:** every icon has a text label for screen readers and a tooltip. Nothing relies on colour alone.
   - **Right: "Up next".**
     - A skip icon, a thumbnail, and the next event's place and date.
     - Tapping it plays the next event or drive.
     - Hide it when there's nothing next.
3. **Controls floating on the bottom of the video:**
   - **Left:** a red **Jump to Event** button. It goes to `event.json` `timestamp` minus 3 seconds, and shows only when the event has a timestamp.
   - **Centre:** back 15 s, play/pause, forward 15 s, and a speed button that cycles 0.5× / 1× / 2× / 4×.
   - **Right:** in the car this is the trash can. We never delete, so put a **map** toggle here (see Map).
4. **A thin scrubber line** under the controls, spanning the **whole event or drive**, not one file.
   - A red tick marks the event trigger.
   - Smaller ticks mark Moments (below).
   - Hovering shows the time and the moment's label.
   - Dragging scrubs, and the driving panel follows.
5. **Camera strip under the video.**
   - Tiles: **Grid**, **Front**, **Rear**, **Left**, **Right**, **Left Pillar** and **Right Pillar**. Show only the cameras that exist.
   - Each tile has a thumbnail with its label on it. The selected tile gets a white outline.
   - **Grid:** a synced 2×2 of Front/Rear/Left/Right, or 3×2 when pillars exist.
   - **Clicking a camera inside the grid** makes it the main view.

**Playback:**
- **Clock:** the front camera's video element is the master. In Grid, re-sync the others when they drift by more than 0.1 s.
- **Clip changes:** move from one one-minute file to the next with no visible gap; preload the next file.
- **Default view:** Front. Remember the last choice.

## Clip list (sheet over the player)
- **Look:** a light sheet over the player, like the in-car one: a close button on the left, tabs in the middle, a "⋯" button on the right.
- **Tabs:** **All**, **Recent**, **Saved**, **Sentry**. Under them, reason chips built from the reasons actually present (e.g. Object detected, Handle pulled, Bump/accel, Manual save, Honk, Other).
- **Rows** show:
  - a thumbnail (`thumb.png`, or for Recent the first front frame, loaded lazily)
  - date and time
  - place
  - a reason label
  - duration
  - a small badge counting Moments once they're known ("2 hard brakes")
- **Order:** newest first, grouped under day headings (Today, Yesterday, then dates).
- **Size:** it must stay smooth with thousands of rows (virtualised).

## Moments (our addition to the car's design)
Scan the driving data of the event being watched in the background, and mark these on the scrubber:
| Moment | Rule (starting values) |
|---|---|
| Hard braking | `linear_acceleration_mps2_y` ≥ +2.94 m/s² (0.3 g, Tesla's Safety Score line) for ≥ 0.5 s, starting at ≥ 15 km/h |
| Swerve | Above 30 km/h: `linear_acceleration_mps2_x` beyond ±3.92 m/s² (0.4 g, Tesla's "aggressive turning") for ≥ 0.3 s, or steering rate ≥ 180°/s followed by ≥ 0.2 g sideways within 1 s |
| Self-driving off | `autopilot_state` changes from SELF_DRIVING or AUTOSTEER to NONE while moving |
| Event trigger | The `event.json` timestamp: horn, manual save, Sentry |

- Keep the thresholds as named constants in one file. Tuned on my sample clips on 2026-10-22: the firmest stops were 0.33–0.43 g (two of them held over a second from 30–40 km/h), sideways force peaked at 0.29 g, and one fast 26° steering flick had only 0.12 g sideways force. The values above flag the two long stops and nothing else.
- Merge moments of the same type that are less than 3 s apart.
- Clicking a tick jumps to 3 s before it.

## Map
- **Placement:** a small rounded map card floating at the bottom-right of the video, above the controls. The map toggle (bottom right) shows or hides it, and it's on by default when the clip has GPS.
- **Contents:** the event's route as a line, with a marker for the car's current position, rotated by `heading_deg`.
- **Size:** clicking the card enlarges it to half the video area; clicking again shrinks it.
- **Tiles:** Leaflet with OpenStreetMap tiles and attribution. This is the only network traffic in the app. Say so in a tooltip on the toggle: "Map tiles load from OpenStreetMap. Your clips stay on this computer."
- **Without GPS:** hide the toggle.

## Landing screen
Before anything is loaded, one dark screen, centred:
- a large drop area: "Drop your TeslaCam folder here", with "or the whole USB drive" under it
- two buttons: **Choose folder** (primary) and **Choose files**
- three short lines in grey:
  - "Plays on this computer. Nothing is uploaded."
  - "Shows speed, steering and Autopilot on clips from firmware 2025.44.25 or later."
  - "Clips are on the USB drive in your glovebox."

No sign-up, no settings, no tour. A dropped folder anywhere in the app replaces what's loaded.

## Settings (behind the ⋯ in the clip list)
Keep it to:
- **Units:** km/h or mph. The default follows the browser locale (en-US → mph, otherwise km/h).
- **Show driving panel:** on or off.
- **Map:** on or off.

Store these in `localStorage`, wrapped in try/catch, with the app working without it.

## States and messages
Every message says what happened and what to do, in plain words:
- **Encrypted clips** (per clip, see Input):
  - Message: "This clip is encrypted. Your car encrypts clips by default since update 2026.20."
  - Fix 1: turn it off under Controls > Safety > Dashcam for future clips.
  - Fix 2: open these clips in Tesla's own viewer at dashcam.tesla.com.
- **No `.mp4` found:** "We couldn't find any dashcam clips in that folder. Try the TeslaCam folder on the USB drive."
- **Codec the browser can't play** (e.g. H.265 on a browser without support): name the camera and suggest Chrome or Edge. Keep playing the cameras that work.
- **Empty or broken file** (a known glitch when the drive is unplugged while in use): skip it, show it in the list as "Damaged file", and keep playing the rest.
- **Loading:** skeletons for thumbnails, and a thin progress line while driving data is read. Never a blank screen.

## Browsers and devices
- **Must load and play:** desktop Chrome and Edge (current versions), with every feature.
- **Should load and play H.264 clips:** desktop Firefox and Safari. Where a camera's codec isn't supported, show the codec message and suggest Chrome or Edge.
- **Tablets and phones:** the layout must work. Loading via **Choose files** is enough. Grid may fall back to the selected camera alone when the device can't decode four or more videos at once. Real-device testing is not part of this phase.

## Design
- **Theme:** dark by default, like the car.
  - Player background `#000`.
  - Floating cards `rgba(24,24,27,0.72)` with a 12 px blur, 12 px radius and a 1 px `rgba(255,255,255,0.08)` border.
  - Text `#FFFFFF` / `#A1A1AA`.
- **Clip list sheet:** light, `#F4F4F5`, with `#E4E4E7` rows and text `#18181B` / `#71717A`.
- **Colours with meaning:**
  - Event / Jump to Event red `#E5484D`
  - Self-driving blue `#3B82F6`
  - Blinker green `#22C55E`
  - Brake red `#E5484D`
  - Moments ticks: hard braking red, swerve amber `#F59E0B`, self-driving off blue
- **Type:**
  - System UI font stack. Use tabular numerals for speed and time.
  - Speed number 40 px; card titles 15 px semibold; secondary 13 px.
- **Icons:** simple line icons drawn as inline SVG (gear circle, pedal, steering wheel, brake, arrows, list, skip, play/pause, 15 s back/forward, map).
- **Touch targets:** at least 44 px.
- **Motion:**
  - Cards and sheet fade or slide in 150–200 ms.
  - The steering wheel rotates smoothly.
  - Respect `prefers-reduced-motion`.
- **Layout:**
  - Laptop width first (1280–1920).
  - Must work on a tablet.
  - On a phone: the top cards stack (place card and driving panel), the camera strip scrolls sideways, and the map card starts hidden.
- **Keyboard:**
  - Space: play/pause
  - ← / →: 15 s
  - , / .: one frame when paused
  - 1–7: camera tiles
  - G: Grid
  - E: Jump to Event
  - L: clip list
  - M: map
  - Show the shortcuts in a tooltip on the ⋯ menu.

## Not now (later phases, don't build)
- Export a moment as a video with the driving panel burned in.
- One-page PDF incident report (stills, map, numbers).
- Speed / g-force graph under the scrubber.
- Trip statistics across days.
- Installable offline app (PWA).
- Decrypting encrypted clips (needs Tesla's account keys; point users to dashcam.tesla.com instead).

## Non-goals and anti-goals
- **Non-goals:**
  - accounts
  - cloud storage
  - talking to the car or the Tesla API
  - reverse geocoding
  - editing or trimming video
- **Anti-goals.** It has failed, even if it works, if:
  - anything is uploaded
  - it looks like an official Tesla product
  - a full drive takes more than a few seconds to list
  - the driving panel shows numbers that don't match the frame on screen
  - a first-time user needs instructions

## Done when
1. **Step 1:** the data report is done, and I've answered anything it raised.
2. **Real data:** with my `Samples/` clips, in `bun run dev` in Chrome, I've seen:
   - a Saved event, a Sentry event and Recent drives listed correctly
   - the driving panel matching the video frame by frame (checked by pausing and stepping)
   - Grid and every camera
   - Jump to Event and the Moments ticks
   - the map route
3. **Speed:** a folder with a full day of Recent clips lists in under 3 seconds.
4. **Error messages:** encrypted, empty-folder, damaged-file and no-driving-data cases each show the right message (use a copy of a sample with bytes cut off for the damaged case).
5. **Unit tests** (`bun test`), using synthetic data only: file-name parsing (both formats), grouping into events and drives, SEI byte unwrapping and decoding, and Moments rules.
6. **Checks:** typecheck, lint, tests and `bunx vite build` pass (run serially with bun).
7. Then stop and show me a summary. Don't deploy or publish anywhere.
