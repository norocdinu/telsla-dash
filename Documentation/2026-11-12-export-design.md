# Export a moment — design

Save part of an event or drive as an MP4, with the driving data burned into the picture. Until now this was listed under "Not now" in the spec.

## Why

A clip that shows a near miss or a bad driver gets shared: with an insurer, the police, a forum, or a friend. The car's files are one-minute pieces per camera with the driving data hidden inside them, so today the user has to find the right minute and camera and hand over raw files that show no speed. Export makes one ordinary video of exactly the part that matters, with the speed, pedals and steering visible.

## The user's choices (2026-11-12)

- **Range:** the user marks **In** and **Out** on the scrubber. There's no fixed default length.
- **Cameras:** chosen in the export dialog.
- **Format:** MP4 (H.264), made frame by frame with WebCodecs, faster than real time. No new dependency: we write our own small MP4 writer, as we wrote our own reader.
- **Burned in:** the user picks from a list in the dialog: driving panel, date, time and place, a route trace, and g-force.

## Marking the range

- An **Export** button (a scissors icon) sits in the controls' right group, before the map toggle.
  - Pressing it puts the scrubber into **marking mode**. *(My call.)*
  - Two handles appear, In and Out, with the part between them highlighted.
  - They start at the playhead − 10 s and + 10 s, kept inside the clip, so there's something to drag. *(My call: handles need a starting place.)*
- **Keys:** **I** sets In and **O** sets Out at the playhead, and either one starts marking mode. *(My call, as in video editors.)* **X** toggles marking mode. Escape leaves it.
- **Dragging a handle** moves it and seeks the video to it, so the user sees the frame they're cutting at. Clicking elsewhere on the scrubber seeks as usual.
- **A bar** floats just above the controls while marking: "In 11:25:03 · Out 11:25:23 · 0:20", with **Cancel** and **Export…**.
- **Limits:** at least 1 s and at most **3 minutes**. *(My call: the whole video is built in memory, and 3 minutes at 8 Mbit/s is about 180 MB.)* A handle can't be dragged past the limit. If the range is too long, the bar says so and Export… is disabled.
- The range is per timeline. Opening another clip leaves marking mode.

## The export dialog

A modal like the delete dialog, but its main button is blue, because nothing is destroyed.

- **Title:** "Export video".
- **Range line:** "Tue Nov 25, 2025 · 11:25:03 – 11:25:23 (20 s)".
- **Cameras:** a checkbox for each camera the clip has, in strip order.
  - By default it's what's on screen: the main camera, or every grid camera in Grid view.
  - With one camera ticked, the video is that camera alone. With 2 or more, it's a grid: 2 side by side, 3 or 4 in a 2×2, 5 or 6 in a 3×2. *(My call: the same as the player's grid.)*
  - At least one must be ticked.
- **Burned in:** four checkboxes, remembered across visits *(my call)*:
  - Driving panel (on by default)
  - Date, time and place (on by default)
  - Route trace (off by default)
  - G-force (off by default)
- **Buttons:** Cancel, and **Export**.
- **While exporting:** a progress bar, "Exporting… 42%", and a **Stop** button. The video is paused, and the player behind the dialog can't be used.
- **When it's done:** "Your video is ready: 20 s, 14 MB", with **Save video** and **Close**.
  - Save video opens a save dialog where the browser has one (`showSaveFilePicker`), and otherwise downloads.
  - It needs a click because browsers only allow a save right after a click, and an export can take a while.
  - The file name is `dashcam-2025-11-25_11-25-03.mp4`, the In time.
- **Errors**, each in plain words:
  - The browser can't export (no WebCodecs): the Export button is greyed out, with "Exporting needs a recent Chrome or Edge."
  - None of the ticked cameras can be read in that range (encrypted, damaged or missing): "These cameras have no video here. Tick another camera or pick another part of the clip."
  - Encoding fails partway: "The export stopped: <reason>. Try a shorter part or fewer cameras."

## The video

- **Size:**
  - One camera: the camera's own size, scaled down to at most 1920 px wide. HW4's 2896×1876 front camera becomes 1920×1244.
  - Grid: 960 px cells for 2 columns, 640 px cells for 3. The height follows the front camera's shape.
  - Sizes are rounded to even numbers, as H.264 needs.
- **Frame timing:** one output frame per frame of the *clock camera*. That's the first ticked camera in strip order (front when it's ticked) that can be read in that minute, and its own frame times are kept, so the car's variable frame rate survives. Other cameras show their latest frame at or before that time.
  - A camera with no video in a minute draws as black with "No video" in its cell.
  - A gap between minutes is skipped: the video jumps.
- **Encoding:** H.264 High profile at about 8 Mbit/s for 1080p-class video (scaled by pixel count), with a keyframe every 2 s. If the browser can't do High profile, it falls back to Main, then Baseline.
- **Container:** MP4 with the index (`moov`) at the front, so it starts playing at once when shared.
  - Video only: the car records no sound.
  - Frames that come out of the encoder in a different order from display get a `ctts` box.

## What's burned in

Drawn on a canvas over each frame, sized relative to the video width, with the player's colours.
- **Driving panel:** top centre, the player's driving panel redrawn: gear circle, accelerator, both blinkers, speed with its unit, steering wheel (turned, and blue while self-driving), brake, and the mode strip.
  - Frames with no data show the small "No driving data here" chip, as the player does.
  - Uses the km/h or mph setting.
- **Date, time and place:** top left. The place, then the date and the time ticking per frame (`Tue Nov 25, 2025 11:25:03`).
- **Route trace:** bottom right. The exported range's GPS points as a line, north up, with a dot for the car. No map tiles, so export stays offline and nothing goes to the network. *(My call.)*
- **G-force:** bottom left, "Braking 0.32 g · Sideways 0.05 g". Forward and back use Stats for nerds' sign convention (positive Y is braking). Sideways is shown as a size only, because which sign of X means left hasn't been checked on real clips.

The driving data comes from the same per-minute tracks the player uses (the telemetry cache), read at the clock camera's frame time with the same lookup, so the export always agrees with the player.

## How it runs

- **In a worker** (`export.worker.ts`), with `VideoDecoder`, `OffscreenCanvas` and `VideoEncoder`, so the page stays responsive.
- **Reading files:** the worker reads each file's index (`moov`) only, then just the frames it needs, from the keyframe before In to Out, in small slices. It never loads whole files, so six cameras stay cheap.
- **Driving data:** the main thread gets each minute's track from the cache, loading it if needed, and sends the worker copies.
- **Stop** aborts the worker and frees everything. Nothing is written until the user saves.
- **Privacy:** nothing leaves the computer. The only output is the file the user saves.

## Non-goals

- Sound, music or text titles.
- Speed changes, slow motion or picture-in-picture layouts.
- Burning in the map with tiles.
- Exporting several ranges at once, or more than 3 minutes.
- Choosing the resolution or quality.
- Firefox and Safari, where WebCodecs H.264 encoding is missing or partial: the button explains why it's greyed out.

## Anti-goals (a failure even if it works)

- The burned-in numbers don't match the frame they're drawn on.
- Anything is uploaded, or map tiles are fetched to make the video.
- The exported file doesn't play in a standard player (Windows Media Player, VLC, QuickTime, a phone).
- The app freezes while exporting.
- Exporting changes any clip on the drive.

## Testing

- **Unit tests** (synthetic data):
  - range limits and clamping
  - grid layout and output size
  - file name
  - which minutes and frames a range covers
  - the MP4 writer: its output read back by our own reader, including `ctts` and the keyframe list
  - the new reader fields (`avcC`, keyframes, composition offsets)
  - the g-force and time text
- **In the browser:** a dev-only `?dev-synthetic` mode builds a small fake TeslaCam event in memory (real H.264 from `VideoEncoder`, with driving data inserted). It shows that the player plays files from our writer, and that an export of them plays.
- **Not checked against real clips:** there are no sample clips on this computer, so exports of real Tesla files (HW3 and HW4 sizes, six cameras) are untested.
