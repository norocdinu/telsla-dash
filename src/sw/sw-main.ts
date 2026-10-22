// The service worker. vite.sw.ts writes it into the build as `(swMain)(self, list, cacheName)`, so the function
// must stand alone: no imports, nothing from outside it.
//
// It keeps the app's own files and serves them when no server is running. It never touches anything else: clips
// are read from the drive through the browser's file APIs (never fetched), and map tiles come from another site.

/** The parts of a service worker's global scope it uses (so tests can pass a stand-in). */
export interface SwScope {
  location: { origin: string };
  addEventListener(type: string, fn: (e: never) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  caches: {
    open(name: string): Promise<{ addAll(paths: string[]): Promise<void> }>;
    match(req: Request | string): Promise<Response | undefined>;
    keys(): Promise<string[]>;
    delete(name: string): Promise<boolean>;
  };
  fetch(req: Request | string): Promise<Response>;
}

interface ExtendableEvent {
  waitUntil(p: Promise<unknown>): void;
}
interface FetchEvent {
  request: { url: string; method: string; mode: string };
  respondWith(p: Promise<Response>): void;
}

export function swMain(sw: SwScope, list: string[], cacheName: string): void {
  const kept = new Set(list);
  // Every build's cache starts with this (src/sw/precache.ts), whatever its build id holds.
  const prefix = 'dashcam-viewer-';

  // A new build waits (no skipWaiting here) until the user presses Reload in the update notice.
  sw.addEventListener('install', (e: ExtendableEvent) => {
    e.waitUntil(sw.caches.open(cacheName).then((c) => c.addAll(list)));
  });

  // Older builds' caches go, except the newest of them: another window may still be running that build and
  // need its files (e.g. the driving-data worker) until it reloads.
  sw.addEventListener('activate', (e: ExtendableEvent) => {
    e.waitUntil(
      sw.caches
        .keys()
        .then((keys) => {
          const older = keys.filter((k) => k.startsWith(prefix) && k !== cacheName);
          return Promise.all(older.slice(0, -1).map((k) => sw.caches.delete(k)));
        })
        .then(() => sw.clients.claim()),
    );
  });

  sw.addEventListener('message', (e: { data: unknown }) => {
    if (e.data === 'skip-waiting') void sw.skipWaiting();
  });

  sw.addEventListener('fetch', (e: FetchEvent) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== sw.location.origin) return;
    // Opening the app (any path) gets the kept page, so it opens with no server running.
    if (req.mode === 'navigate') {
      e.respondWith(sw.caches.match('/index.html').then((hit) => hit ?? sw.fetch(req.url)));
      return;
    }
    // Its own files, and (from the previous build's cache) the hashed files a window still on that build asks for.
    if (!kept.has(url.pathname) && !url.pathname.startsWith('/assets/')) return;
    e.respondWith(sw.caches.match(url.pathname).then((hit) => hit ?? sw.fetch(req.url)));
  });
}
