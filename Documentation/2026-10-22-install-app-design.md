# Install as an app (works offline) — design

Make Dashcam Viewer installable: its own window, a Start menu entry and an icon. It works with no internet and with no terminal running. It's installed from the user's own computer, never from a public website.

## Why

Today the viewer only runs while `bun run dev` is running in a terminal, from this project folder. The user wants to open it like any other app on their Windows laptop, and to put it on another computer by downloading it from their private GitHub repo.

## Decisions (the user's)

- **Installed from the computer itself, not from a website.** Nothing is published online. The code stays in the private GitHub repo (norocdinu/telsla-dash).
- **On this laptop:** one command builds the app, serves it briefly on a fixed local address and opens the browser. The user clicks Install, and from then on no terminal is needed.
- **On another computer:** each GitHub release, from v0.3 on, carries a small Windows program (working name `Dashcam Viewer Installer.exe`). The user downloads it from the release and runs it. It does the same as the command (serve, open the browser), so that computer needs only Chrome or Edge, with no Bun and no code.
- **Updating:** run the new release's installer, or the command on this laptop. The installed app picks up the new version the next time it opens.

## My calls (accepted by the user when played back)

- **The fixed address is `http://localhost:5191`.** The installed app's identity is its address, so this port never changes: a different port would be a different app with separate settings. It's separate from the development server on 5190.
- **An in-app Install button.**
  - When the browser offers installation (`beforeinstallprompt`), a small banner says "Install Dashcam Viewer", with Install and "Not now".
  - "Not now" hides it for this visit.
  - It never shows inside the installed app.
- **Update notice.** When a new version has been picked up, a quiet message reads "Updated to v0.3 — reload", with a Reload button. It never interrupts playback: nothing reloads by itself.
- **The map is the one part that needs internet,** because its tiles come from OpenStreetMap. Offline, the map card says "Map needs internet" instead of grey squares. Clips, the driving panel, Stats for nerds, moments, the list and deleting all work offline.
- **The installer is not code-signed.** Windows SmartScreen will likely warn the first time ("Windows protected your PC"); the user clicks "More info → Run anyway". A signing certificate costs money every year, so it's skipped.
- **Settings are separate** between the installed app (5191) and the development server (5190), because browsers keep settings per address. That's expected.

## What the installer and command do

1. Serve the built app (the production build, never the dev-only sample loader) on `http://localhost:5191`.
   - If the port is busy because another copy is already running, say so plainly and open the browser at that address anyway.
   - If something else holds the port, say what to do.
2. Open the default browser at that address. If the default browser isn't Chrome or Edge, show a line saying to open the address in Chrome or Edge.
3. Keep serving until the user closes the window, and say so in the window ("You can close this window once Dashcam Viewer is installed").

The installed app must keep working after the installer or command is closed, and after the computer restarts.

## What makes it installable and offline

- A web app manifest:
  - Name "Dashcam Viewer", short name "Dashcam".
  - `display: standalone`, with a dark theme and background matching the app.
  - Icons: at least 192 and 512 px, plus a maskable one. They're new: a simple mark in the app's style (a camera lens or a road with a dot); no Tesla logo or branding.
- A service worker that keeps every file of the build for offline use and serves them when the server isn't running.
  - It never stores or intercepts clip files: those are read from the drive through the browser's file APIs, never fetched.
  - It doesn't cache map tiles (the map needs internet, see above).
- The version number is shown somewhere quiet (e.g. the bottom of Settings: "Dashcam Viewer v0.3"), so the user can tell which one is installed.

## Version numbers *(my calls)*

- **`package.json` is the one place the version lives.** It's bumped in each release's pull request.
  - It says `0.1.0` today, even though v0.1 and v0.2 were tagged.
  - This feature ships as **v0.3**, so it sets `0.3.0`.
- **The build embeds the version and the commit's short hash.**
  - Settings shows "Dashcam Viewer v0.3 · 1a2b3c4".
  - The update notice names the version, adding the hash when a rebuild kept the same version: "Updated to v0.3 (build 1a2b3c4) — reload".
  - A build from code that isn't committed shows the hash with "+", e.g. "1a2b3c4+".
- **Release order:**
  1. Bump the version in the pull request, then merge it.
  2. Tag `main`.
  3. Build the installer from the tagged `main`.
  4. Create the GitHub release with the installer attached. This step asks the user first.

## Releases

- From v0.3 on, a GitHub release (not only a tag) is created for each version, with the Windows installer attached.
- Building the installer is a command in the repo. Creating the release and uploading it is an outward step that asks the user first, like every push.
- The installer contains the built app inside it: it doesn't download anything when it runs.

## Goals

- Open the viewer from the Start menu with no terminal and no internet.
- Install it on another Windows computer with only Chrome or Edge and a file downloaded from the private GitHub release.
- New versions arrive by running the newer installer or command, with nothing to uninstall first.

## Non-goals

- Publishing the app on a public website, or any hosting account.
- Mac or Linux installers. The command works wherever Bun runs, but only a Windows program is attached to releases.
- An app-store listing, auto-updates without running the installer, or code signing.
- Offline map tiles.
- Opening a TeslaCam folder automatically when the app starts. The user still chooses or drops a folder.

## Anti-goals

- The development server (5190, `?dev-root=…`) changes behaviour, or the dev-only sample loader or delete endpoint ends up in the installed app.
- A clip or anything read from the drive is cached, copied or sent anywhere by the service worker.
- An update reloads the page by itself in the middle of watching a clip.
- The installed app breaks when the installer isn't running.

## Constraints

- Same stack: Vite + React + TypeScript, bun. No new runtime dependencies. A build-time plugin is fine if there's a real need, but a small hand-written service worker plus a Vite plugin that lists the built files is preferred.
- The Windows program is built with Bun's single-file executable (`bun build --compile`, Windows x64 target), with the built app embedded. It carries the Bun runtime, so it's about 100 MB. The user accepted that over a 1 MB zip with a PowerShell launcher, for the simpler double-click.
- Chrome and Edge on Windows are the targets, matching the rest of the app (folder access already needs them).

## Testing (for the builder)

- Pure parts with tests:
  - The list of files the service worker keeps (from the build output).
  - The installer's port handling.
  - The decision of when to show the Install banner and the update notice.
- A browser check:
  - Install from 5191.
  - Stop the server, reopen the installed app, and load the sample clips with the network off.
  - Confirm the map shows "Map needs internet".
  - Rebuild with a bumped version, run the server, open the installed app, and see the update notice.
- Run the compiled installer on this laptop once, to check it serves and opens the browser.

## Left to the builder

- The icon artwork, within the constraints above.
- The exact command name (e.g. `bun run install-app`) and the installer's file name.
- How the service worker gets its file list, and its cache naming.
- Where exactly the version number and the banners sit.
