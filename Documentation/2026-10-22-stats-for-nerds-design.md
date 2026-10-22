# Stats for nerds — design

A see-through panel over the video with every number the car recorded for the frame on screen, plus small charts of the whole clip. It works like YouTube's "Stats for nerds", applied to the car's driving data.

This replaces the phase-2 idea of "a speed/g-force graph under the scrubber". The user chose this instead.

## Why

The driving panel shows a few values the way the car shows them. Some people want everything: every value the car recorded, how it changed over the clip, and the details of the file playing. They want to see exactly what happened around a hard brake or a swerve. This is an opt-in view for them. It stays out of the way until opened.

## Where it sits

- **A panel down the right side of the video** (the user picked this over a small corner box or a bottom strip).
  - It runs from just below the top cards (place, driving panel, Up next) to just above the floating controls, and never covers either.
  - About 300 px wide.
  - Dark see-through background (roughly 60% black) with monospace numbers, in the style of YouTube's "Stats for nerds".
  - It overlays the video and doesn't resize it. In grid view it covers part of the right-hand cameras; that's accepted.
- **The map card moves left while the panel is open**, so the two sit side by side instead of on top of each other. That includes the large map. *(My call.)*
- **Phone layout (≤ 640 px):** the panel takes the full width of the video, between the top cards and the controls. The map card is hidden while it's open, and comes back when it closes. *(My call.)*

### Fitting the space (the user asked for dynamic scaling; the details are my call)

- **Why:** on a laptop window the space between the top cards and the controls is only about 300 px tall, about half of what all the numbers and four charts need. On a big monitor everything fits.
- **The layout adapts to the height it has, in this order:**
  1. **The charts always stay in view.** They share whatever height is left after the numbers, each stretching up to about 90 px on a tall screen and shrinking to no less than about 40 px.
  2. **The numbers pack tighter as space runs out.** One column of label and value when there's room, two columns when there isn't. Their text size eases between about 12 px and 10 px, never smaller.
  3. **Only when even that doesn't fit** (very short windows, phones) do the numbers scroll inside their own area. The charts stay put below them.
- It re-fits live when the window is resized or the browser goes full screen.

## Opening and closing *(my calls, accepted by the user)*

- A **"Stats for nerds"** switch in Settings, alongside "Show driving panel" and "Map".
- The **S** key toggles it. Add it to the shortcut list shown in Settings and the tooltip.
- An **×** in the panel's top-right corner closes it.
- Remembered across visits like the other settings (a new `showStats` setting, off by default). The switch, the S key and the × all change and save it.

## The numbers (top of the panel)

Everything the car records for the frame on screen, plus the video file details *(my call, accepted)*. Four groups, label then value:

- **Car**
  - Speed, in the km/h or mph setting.
  - Gear.
  - Accelerator, in %.
  - Brake, on or off.
  - Steering wheel angle, in degrees, with + or −.
  - Left and right blinker, each on or off.
  - Autopilot state: Off, Self Driving, Autosteer or Traffic-Aware Cruise.
- **Motion**
  - Acceleration on all three axes: in g (1 g = 9.81 m/s²), with the raw m/s² beside it.
  - Compass heading, in degrees with a compass letter (e.g. 212° SW).
- **Position:** latitude and longitude, 5 decimals.
- **Frame**
  - The car's own frame number (`frame_seq_no`) and data version (`version`). Neither is kept today: the driving-data track must start carrying both.
  - The file playing: the main camera's file, or the front camera in grid view.
  - Which minute of the clip it is, e.g. "4 of 11".
  - The time in the clip.
  - Frame rate, resolution and video codec of that file.

The numbers follow the frame on screen, exactly like the driving panel, and must always agree with it for the same frame.
- **Precision** *(my call)*: this panel shows one decimal for speed, accelerator, steering, g (two decimals) and m/s² (two decimals). "Agree" means the same frame, rounding to the same whole number the driving panel shows.
- **Frame details** *(my call)*:
  - The frame number and data version come from the file the driving data is read from: the front camera, or the first camera present.
  - The file, frame rate, resolution and codec are for the camera shown largest (front in grid view).
  - The frame rate is that file's average (frames ÷ length).

Where a frame has no driving data (parked, older firmware), the driving values show "—" and the Frame group still shows the file details.

## The charts (below the numbers)

Four small charts stacked:

| Chart | Lines |
|---|---|
| Speed | speed, in the km/h or mph setting |
| Pedals | accelerator % in blue, brake in red (on/off as a band), matching the driving panel's colours |
| Steering | wheel angle, ° |
| G-force | side-to-side and forward-back, two lines, in g |

Each chart:
- Shows its current value at its top right.
- Has a white line marking the moment on screen.
- Has small ticks for the detected moments (hard braking, swerves and the event trigger), matching the scrubber's ticks. *(My call, accepted.)*

**Vertical scale** *(my call)*:
- Each chart's scale fits the data in view, so a hard brake fills the zoomed chart.
- The whole-clip scale covers the whole clip. While minutes are still being read, it only ever grows, never shrinks.
- The zoomed scale covers the 30 seconds in view.
- A minimum span per chart keeps normal driving from looking like noise: speed at least 0–30 km/h (or the mph equivalent), steering at least ±30°, g-force at least ±0.3 g. Pedals are always 0–100%.
- Scales round to tidy values, and a change of scale eases along with the zoom rather than jumping.

**Acceleration axes:** use the same axes the moment detection uses (`src/moments/`) for side-to-side and forward-back. Braking draws downward on the forward-back line.

### Time span (the user's design)

- **While playing:** each chart spans the **whole clip** (the whole event or drive), start to end, with the white line moving across.
- **When paused:** the charts **zoom in to 15 seconds either side** of the moment on screen, so a brake or a swerve fills the chart. Pressing play zooms back out to the whole clip.
- The change eases quickly (around 200 ms) rather than jumping. *(My call, accepted.)*
- While paused, scrubbing, frame stepping (`,` and `.`) and jumping keep the zoom. The window slides so the moment on screen stays in the middle. *(My call, accepted.)*
- Near the start or end of a clip, the 30-second window stays 30 seconds wide and stops at the clip's edge, so the line moves off-centre. A clip shorter than 30 seconds doesn't zoom. *(My call.)*
- There are no zoom buttons: pausing is the zoom. *(My call, accepted.)*

### Filling in

- The charts draw from the same background reading of the clip that finds the moments. It reads each one-minute file in turn, starting with the one being watched.
- The full width of the clip is laid out at once. Minutes not read yet are blank, and each minute's lines appear as it's read. Minutes that can't be read, or that have no driving data, stay blank.
- When you jump or pause somewhere whose minute (or the neighbouring minute inside the 30-second window) isn't read yet, those minutes are read next. *(My call.)*
- The user asked whether a chart would be limited to one minute. It isn't: a chart always spans the whole clip.

### Using the charts *(my calls, accepted)*

- **Hover** shows the time (car clock) and that chart's value(s) at that point.
- **Click** jumps the video to that moment, like the scrubber. It doesn't change whether the video is playing or paused.

## Goals

- Every recorded value for the frame on screen, readable at a glance by someone who wants detail.
- What happened around a moment is visible by pausing: 30 seconds of speed, pedals, steering and g-force.
- Off by default; one key or one switch away.

## Non-goals

- Exporting the data (CSV, copy to clipboard).
- Choosing which charts or numbers appear, or reordering them.
- More charts: heading, position or altitude.
- Zoom buttons or a zoom slider.
- Changing the scrubber, the driving panel or the map, beyond moving the map aside.

## Anti-goals (a failure even if it works)

- **Opening the panel makes playback stutter**, or the scrubber or driving panel lag. The charts must redraw sparingly (a few times a second at most for the moving line; the lines themselves only when new minutes are read or the zoom changes). The numbers must not cost more than the driving panel does.
- The panel shows a value that disagrees with the driving panel for the same frame.
- The panel covers the controls, the top cards or the Delete button.
- Anything about the clip leaves the computer. No new network requests.

## Constraints

- Same stack and rules as the rest of the app: Vite + React + TypeScript, bun, tests first, no new runtime dependencies unless there is a real need. Charts can be plain SVG or canvas.
- Memory stays bounded for an hour-long Recent drive:
  - Keep a compact chart series per minute alongside the moments and route, not every frame of every minute. The driving-data cache holds only 24 minutes on purpose.
  - The zoomed view may use the full-resolution track where it's cached, but must also look right from the compact series alone.
- Wall-clock times follow the app's existing rule: car local time, never time-zone converted.
- Private data rule: no sample coordinates, places or clip details in tracked files or test fixtures.

## Testing (for the builder)

- Pure functions with tests:
  - The time window: whole clip versus the 30-second window, including clamping at the edges and clips shorter than 30 s.
  - Building the compact series from a track.
  - Value formatting: g from m/s², heading letters, units.
  - The new `showStats` setting (load, save, default).
- A browser check with the panel open versus closed, on a long clip, that playback stays smooth. Count dropped frames or frame callbacks per second.
- A browser check of the pause zoom, hover, click-to-jump and the map moving aside, on desktop and phone sizes.

## Left to the builder

- Exact sizes, spacing, line colours (except the pedal blue and brake red), and how the brake band is drawn.
- SVG or canvas.
- How compact the per-minute series is (points per second), as long as the zoomed view still shows a hard brake clearly.
- How the numbers are throttled, within the anti-goal.
- The exact ease of the zoom.
