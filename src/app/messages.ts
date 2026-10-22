// Every user-facing sentence, as given in the spec.

export const LANDING = {
  drop: 'Drop your TeslaCam folder here',
  dropSub: 'or the whole USB drive',
  chooseFolder: 'Choose folder',
  chooseFiles: 'Choose files',
  lines: [
    'Plays on this computer. Nothing is uploaded.',
    'Shows speed, steering and Autopilot on clips from firmware 2025.44.25 or later.',
    'Clips are on the USB drive in your glovebox.',
  ],
  reading: 'Reading clips…',
  dropHere: 'Drop to open',
};

export const ENCRYPTED = {
  clip: 'This clip is encrypted.',
  all: 'These clips are encrypted.',
  why: 'Your car encrypts clips by default since update 2026.20.',
  fixes: ['Turn it off under Controls > Safety > Dashcam for future clips.', "Open these clips in Tesla's own viewer at dashcam.tesla.com."],
};

export const NO_CLIPS = "We couldn't find any dashcam clips in that folder. Try the TeslaCam folder on the USB drive.";
export const ROOT_REFUSED = 'Pick the TeslaCam folder on the drive instead.';
export const LIST_FAILED = "We couldn't read that folder. Try the TeslaCam folder on the USB drive.";
/** Not in the spec's copy: it asks only to explain why and what to do. */
export const ALL_DAMAGED = 'These clips look damaged. Try copying them from the USB drive again.';
export const codecMessage = (cameraLabel: string) => `The ${cameraLabel} camera uses a video format this browser can't play. Try Chrome or Edge.`;
export const DAMAGED_FILE = 'Damaged file';
export const NO_VIDEO = 'No video';
export const NO_DATA = 'No driving data here';
export const NO_DATA_WHY = 'The car was parked, or the clip is from before firmware 2025.44.25 or from a car older than HW3.';
export const MAP_TOOLTIP = 'Map tiles load from OpenStreetMap. Your clips stay on this computer.';
export const RECENT_PLACE = 'Recent drive';

export const DELETE = {
  warning: "It's removed from the drive permanently. This can't be undone.",
  firstTime: 'Your browser will ask to allow editing the folder.',
  counting: 'Counting files…',
  refused: 'Deleting needs permission to edit the folder. Nothing was deleted.',
  refusedSome: (events: number) =>
    events === 1 ? '1 event was left: no permission to edit its folder.' : `${events} events were left: no permission to edit their folder.`,
  unreadable: "Couldn't read this event's files, so it can't be deleted here.",
  failed: (events: number) =>
    `Couldn't delete ${events} ${events === 1 ? 'event' : 'events'}. The drive may be read-only or a file may be in use.`,
  notDeletable: 'To delete, open the folder with Choose folder or drag it in (Chrome or Edge).',
  error: 'Something went wrong while deleting. Check the clip list for what is left.',
  uncounted: "Couldn't read the files to delete. Nothing was deleted.",
};
