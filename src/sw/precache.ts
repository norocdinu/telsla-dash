// What the service worker keeps for offline use: the page and every file of the build, nothing else.

const CACHE_PREFIX = 'dashcam-viewer-';

/** Every file a build needs offline, as paths: the page, the built assets and the public files (manifest, icons). */
export function precacheList(bundleFiles: string[], publicFiles: string[]): string[] {
  const skip = (f: string) => f.endsWith('.map') || f === 'sw.js' || f === 'version.json' || f.includes('__dev');
  const paths = [...bundleFiles, ...publicFiles].filter((f) => !skip(f)).map((f) => `/${f.replace(/^\/+/, '')}`);
  return [...new Set(['/', '/index.html', ...paths])];
}

/** A short hash of the file list (FNV-1a), so the cache name changes whenever the app's files do. */
export function listHash(list: string[]): string {
  let h = 0x811c9dc5;
  for (const ch of list.join('\n')) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** One cache per build; older ones are dropped when a new build takes over. */
export function cacheName(build: string): string {
  return `${CACHE_PREFIX}${build}`;
}
