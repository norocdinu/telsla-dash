import { describe, expect, test } from 'bun:test';
import { swMain, type SwScope } from '../../src/sw/sw-main';

const ORIGIN = 'http://localhost:5191';

/** A service worker scope with in-memory caches and a network that answers 'net:<path>' (or fails when down). */
function fakeScope(opts: { networkDown?: boolean } = {}) {
  const handlers = new Map<string, (e: unknown) => void>();
  const stores = new Map<string, Map<string, string>>();
  const fetched: string[] = [];
  let skipped = 0;
  let claimed = 0;
  const scope = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (e: unknown) => void) => handlers.set(type, fn),
    skipWaiting: async () => {
      skipped++;
    },
    clients: {
      claim: async () => {
        claimed++;
      },
    },
    fetch: async (r: Request | string) => {
      const url = typeof r === 'string' ? r : r.url;
      fetched.push(url);
      if (opts.networkDown) throw new TypeError('Failed to fetch');
      return new Response(`net:${new URL(url, ORIGIN).pathname}`);
    },
    caches: {
      open: async (name: string) => {
        const store = stores.get(name) ?? new Map<string, string>();
        stores.set(name, store);
        return {
          addAll: async (paths: string[]) => {
            for (const p of paths) store.set(p, `cached:${p}`);
          },
        };
      },
      match: async (req: Request | string) => {
        const path = new URL(typeof req === 'string' ? req : req.url, ORIGIN).pathname;
        for (const store of stores.values()) if (store.has(path)) return new Response(store.get(path));
        return undefined;
      },
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    },
  };
  /** Fires an event and waits for what it asked to wait for. */
  const fire = async (type: string, extra: Record<string, unknown> = {}) => {
    let waited: Promise<unknown> | undefined;
    let responded: Promise<Response> | undefined;
    handlers.get(type)?.({ ...extra, waitUntil: (p: Promise<unknown>) => (waited = p), respondWith: (p: Promise<Response>) => (responded = p) });
    await waited;
    return responded ? await (await responded).text() : null;
  };
  return { scope: scope as unknown as SwScope, stores, fetched, fire, skipped: () => skipped, claimed: () => claimed };
}

const req = (path: string, init: { mode?: RequestMode; method?: string } = {}) => ({
  url: new URL(path, ORIGIN).href,
  method: init.method ?? 'GET',
  mode: init.mode ?? 'no-cors',
});

const LIST = ['/', '/index.html', '/assets/index-a1.js'];

describe('the service worker', () => {
  test('install keeps every listed file', async () => {
    const f = fakeScope();
    swMain(f.scope, LIST, 'dashcam-viewer-b2');
    await f.fire('install');
    expect([...f.stores.get('dashcam-viewer-b2')!.keys()]).toEqual(LIST);
    expect(f.skipped()).toBe(0); // waits for the user to choose Reload
  });

  test('activate drops older versions of its own cache, keeping the previous one for windows still open', async () => {
    const f = fakeScope();
    await f.scope.caches.open('dashcam-viewer-oldest');
    await f.scope.caches.open('someone-else');
    await f.scope.caches.open('dashcam-viewer-previous');
    swMain(f.scope, LIST, 'dashcam-viewer-b2');
    await f.fire('install');
    await f.fire('activate');
    expect([...f.stores.keys()].sort()).toEqual(['dashcam-viewer-b2', 'dashcam-viewer-previous', 'someone-else']);
    expect(f.claimed()).toBe(1);
  });

  test('a window still on the previous build gets its files after the update took over', async () => {
    const f = fakeScope({ networkDown: true });
    const previous = await f.scope.caches.open('dashcam-viewer-previous');
    await previous.addAll(['/assets/sei.worker-old.js']);
    swMain(f.scope, LIST, 'dashcam-viewer-b2');
    await f.fire('install');
    await f.fire('activate');
    expect(await f.fire('fetch', { request: req('/assets/sei.worker-old.js') })).toBe('cached:/assets/sei.worker-old.js');
  });

  test('listed files come from the cache, with no server running', async () => {
    const f = fakeScope({ networkDown: true });
    swMain(f.scope, LIST, 'dashcam-viewer-b2');
    await f.fire('install');
    expect(await f.fire('fetch', { request: req('/assets/index-a1.js') })).toBe('cached:/assets/index-a1.js');
  });

  test('opening the app gets the kept page, with no server running', async () => {
    const f = fakeScope({ networkDown: true });
    swMain(f.scope, LIST, 'dashcam-viewer-b2');
    await f.fire('install');
    expect(await f.fire('fetch', { request: req('/some/deep/link', { mode: 'navigate' }) })).toBe('cached:/index.html');
  });

  test('map tiles, other sites and files it does not keep are left alone', async () => {
    const f = fakeScope();
    swMain(f.scope, LIST, 'dashcam-viewer-b2');
    await f.fire('install');
    expect(await f.fire('fetch', { request: { url: 'https://tile.openstreetmap.org/1/1/1.png', method: 'GET', mode: 'no-cors' } })).toBeNull();
    expect(await f.fire('fetch', { request: req('/version.json') })).toBeNull();
    expect(await f.fire('fetch', { request: req('/assets/index-a1.js', { method: 'POST' }) })).toBeNull();
    expect(f.fetched).toEqual([]);
  });

  test('skip-waiting only when asked', async () => {
    const f = fakeScope();
    swMain(f.scope, LIST, 'dashcam-viewer-b2');
    await f.fire('message', { data: 'something else' });
    expect(f.skipped()).toBe(0);
    await f.fire('message', { data: 'skip-waiting' });
    expect(f.skipped()).toBe(1);
  });
});
