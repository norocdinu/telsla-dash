import type { SourceFile, Timeline } from '../library/types';

/** A folder the app may remove entries from. Removal is never recursive. */
export interface DirRef {
  name: string;
  removeEntry(name: string): Promise<void>;
}

/** The folder the user opened or dropped; edit permission is asked on it. */
export interface RootRef {
  id: string;
  requestWrite(): Promise<boolean>;
}

/** Where a file lives, for deleting it: its folder, that folder's parent (if reachable) and the root. */
export interface FileLocation {
  dir: DirRef;
  parent: DirRef | null;
  root: RootRef;
}

export type DeleteStep =
  | { kind: 'file'; dir: DirRef; name: string; path: string }
  | { kind: 'folder'; dir: DirRef; name: string };

/** Exactly what deleting one timeline removes, in order. */
export interface DeletePlan {
  timeline: Timeline;
  steps: DeleteStep[];
  files: SourceFile[];
  roots: RootRef[];
}

export interface DeleteResult {
  timelineId: string;
  deletedPaths: string[];
  failed: { path: string; reason: string }[];
  /** The root's edit permission was refused, so nothing was touched. */
  refused: boolean;
}
