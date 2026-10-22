// Dev only: which paths the dev server may delete. Only files and folders strictly inside .fake-drive/
// (throwaway hard-linked copies). Never Samples/, never .fake-drive itself, never anything outside.
import { resolve, sep } from 'node:path';

export function devDeleteAllowed(projectRoot: string, root: string, path: string): string | null {
  if (!path || root.split('/')[0] !== '.fake-drive') return null;
  const base = resolve(projectRoot, '.fake-drive');
  const target = resolve(projectRoot, root, path);
  return target.startsWith(base + sep) ? target : null;
}
