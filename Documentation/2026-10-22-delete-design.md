# Design: deleting clips and events

Phase 2, project 1 of 6. The app is the Dashcam Viewer in this repo; read `Documentation/dashcam-app-prompt.md` first for how it works today.

## Why
While reviewing clips, some turn out irrelevant or too old. The user wants to delete them on the spot:
- from the player, while watching
- from the clip list on the left

Now and then they also want a clear-out, but "not something I will often do". Their drive (a 1 TB Samsung T7, exFAT) holds about 20,000 clip files (437 GB of Sentry, 139 GB of Saved), so cleaning up matters.

**Above all: no accidental deletes.** The user asked for a confirmation dialog on every delete.

## This changes a founding rule
The app was built read-only ("never write, rename, move or delete anything on the user's drive"). That rule becomes:

> Read-only, except deletes the user confirms in a dialog. Nothing else is ever written, renamed or moved.

Update the spec's Ground rules and Anti-goals to match.

## What gets deleted
- **A delete always removes a whole row of the clip list:** a Saved or Sentry event, or a Recent drive.
- **Saved or Sentry event:** the event folder and everything in it (all camera files, `event.json`, `thumb.png`).
- **Recent drive:** every camera file of every minute in that drive. `RecentClips` itself stays.
- **No partial deletes:** never part of an event, and never single minutes.
- **Edge case:** a lone event folder dropped on its own has no parent the app can reach. Delete every file inside it, and leave the empty folder.

## Where
1. **Player:** a trash button in the controls' right group, next to the map button. It's where the car's own viewer has one. It deletes the event or drive being watched.
2. **Clip list:** a trash button on each row, at its right edge. Show it on hover and on keyboard focus with the mouse, and always on touch screens.
3. **Manage events:** a screen opened from the clip list's ⋯ menu, for the occasional clear-out (see below).

## Confirmation (every delete)
**Dialog for one event or drive:**
- Title: "Delete this Sentry event?", "Delete this Saved event?" or "Delete this Recent drive?"
- One line saying what it is: date and time, place, number of files and total size, e.g. "Sun Oct 18, 2026 14:01:11 · Town · 66 files, 3.1 GB"
- Text: "It's removed from the drive permanently. This can't be undone."
- Buttons:
  - **Cancel**, focused by default, also on Escape or a click outside
  - **Delete** in red
- While the sizes are being totted up: "Counting files…", with Delete disabled.

**Dialog for Manage events:**
- Title: "Delete 34 events?"
- Text: "1,904 files, 18.2 GB will be removed from the drive permanently. This can't be undone."
- Buttons: **Cancel** (default) and **Delete 34 events** in red.

**Browser permission:** the first delete in a session asks the browser for edit access to the folder (Chrome shows its own "allow this site to edit files?" prompt).
- Request it when the user presses Delete in our dialog, not before.
- If they refuse, delete nothing and say: "Deleting needs permission to edit the folder. Nothing was deleted."
- The dialog warns about the prompt the first time: "Your browser will ask to allow editing the folder."

## Manage events
- **Opening:** from the clip list's ⋯ menu ("Manage events…"). It's a plain screen in the same light style as the clip list.
- **Filters,** each optional:
  - type (All, Recent, Saved, Sentry), reusing the list's tabs
  - reason, reusing the list's chips
  - **older than** a date, from a date picker; the default is empty, meaning no date limit
- **List:** the events that match, all ticked, each showing date and time, place, reason and size. Ticking or unticking one updates a running total, "34 events, 18.2 GB".
  - Buttons: Select all / Select none.
- **Delete button:** red, "Delete 34 events (18.2 GB)…". It opens the bulk confirmation dialog.
- **Ticks when filters change** (my call): events that newly match arrive ticked. An event you unticked stays unticked while it still matches.
- **"Older than" a date** (my call): events whose start is before midnight at the start of that day, by the car's local clock (the same wall-clock times the list shows).
- **Sizes** (my call): in GB of 1,024³ bytes, the way Windows Explorer shows them, with one decimal place.
- **While deleting:** progress shows ("Deleting 12 of 34…"), with a **Stop** button that finishes the event in progress and then stops. Afterwards: "Deleted 34 events, 18.2 GB."
  - For a long Recent drive, progress also counts files ("Deleting 1 of 1 · 230 of 8,640 files") (my call).
  - If anything failed: "Couldn't delete 2 events. The drive may be read-only or a file may be in use." Then list them.

## After a delete
- **The library:** deleted rows leave the list, the moment and route data for them is dropped, and Up next and the filters update.
- **If the event or drive being watched was deleted,** open the next one in the list as filtered (the same rule as Up next) and play it.
  - If there is none, show the clip list.
  - If the library is now empty, show the landing screen.
  - A delete started from the clip list leaves the list open; one started from the player leaves it closed (my call).
- **Before deleting anything being shown:**
  - stop playback;
  - unload its video elements and release their object URLs;
  - cancel the driving-data reads and the scan for it;
  - drop its thumbnails.

  Windows can refuse to delete a file that is still open.

## Which ways of opening a folder allow deleting
Deleting needs the File System Access API, so only Chrome and Edge can do it, and only for folders opened in one of these ways:

| How the clips were opened | Delete |
|---|---|
| **Choose folder** (`showDirectoryPicker`) | Yes. Ask for `readwrite` on the picked folder when the user first deletes. |
| **Drag and drop** in Chrome or Edge | Yes. Switch drag and drop to `DataTransferItem.getAsFileSystemHandle()` where it exists, keeping `webkitGetAsEntry()` as the fallback for other browsers. |
| **Choose files**, the `<input webkitdirectory>` fallback, Firefox, Safari | No. The trash buttons are greyed out, with a tooltip: "To delete, open the folder with Choose folder or drag it in (Chrome or Edge)." |
| The dev sample loader (`?dev-root=`) | Only for `.fake-drive` copies, through a dev-only delete endpoint (see Testing). **Never `Samples/`.** |

To do this, each source file needs to know its directory handle (and each event folder its parent's). The library tracks its root handles, to ask permission on.

**Several folders dropped at once** (my call):
- Each dropped folder is its own root, with its own permission prompt the first time something under it is deleted.
- A bulk delete that spans several roots asks for each one in turn, starting from the Delete click.
- If any prompt is refused, nothing under that root is deleted, and the result says so per event. Events under other roots still go.

**Loose `.mp4` files dropped without their folder** (my call): no reachable parent folder, so the trash buttons are greyed out with the same tooltip as **Choose files**. Chrome's non-standard `FileSystemHandle.remove()` is not used.

## Errors
- **Partial failures:** a file that can't be deleted (in use, read-only drive, or gone already) doesn't stop the rest of that event. The result lists what failed.
- **Files already gone:** a file deleted outside the app since loading counts as deleted.
- **Re-listing:** after any failure, re-list the affected folder so the list shows what is really on the drive.

## Non-goals
- Deleting parts of an event (single minutes or single cameras).
- An undo or app-level trash: deletes are permanent, and the dialog says so.
- Deleting from Firefox or Safari.
- Moving, renaming or editing clips.

## Anti-goals
It has failed, even if it works, if:
- anything is deleted without the user pressing Delete in our dialog;
- a delete removes anything other than the row(s) shown in the dialog;
- the dialog's counts or size differ from what is actually removed;
- Delete can be triggered by a stray key press (Enter or Space must land on Cancel by default).

## Testing (for the builder)
- **Unit tests** with fake directory handles that record `removeEntry` calls:
  - which entries are removed for a Saved event, a Sentry event, a Recent drive and a lone event folder;
  - sizes and counts;
  - the bulk selection (type, reason, older than);
  - the library and current-timeline update after a delete;
  - stopping, partial failures, a refused permission.
- **Browser checks** go through a dev-only path:
  - The dev sample loader gets delete support for `.fake-drive/` copies only.
  - The copies are made by a fixture script. Hard links are fine: deleting a link leaves the original in `Samples/` untouched.
  - The dev server must refuse any delete under `Samples/` or outside `.fake-drive/`.
- **Manual check by the user:** deleting on the real T7 in Chrome, from Choose folder and from drag and drop.

## Left to the builder
- Component structure, styling within the existing design tokens, and icon drawing.
- How handles are threaded through `collectSources` and `SourceFile`.
- The dialog's markup: an accessible modal with focus kept inside, Escape to cancel, and the trigger refocused afterwards.
