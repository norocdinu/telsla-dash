import { describe, expect, test } from 'bun:test';
import { installBannerVisible, pwaStore, shouldRegister, updateText, watchUpdates } from '../../src/app/pwa';

describe('shouldRegister', () => {
  test("dev builds don't register", () => {
    expect(shouldRegister({ prod: false, search: '', port: '5191' })).toBe(false);
  });

  test("a ?dev-root page doesn't register", () => {
    expect(shouldRegister({ prod: true, search: '?dev-root=Samples', port: '5191' })).toBe(false);
  });

  test('a production build registers on the install address', () => {
    expect(shouldRegister({ prod: true, search: '', port: '5191' })).toBe(true);
  });

  test("a production build on the dev address (vite preview) doesn't register", () => {
    expect(shouldRegister({ prod: true, search: '', port: '5190' })).toBe(false);
  });
});

describe('installBannerVisible', () => {
  test('the install banner shows only when the browser offers it', () => {
    expect(installBannerVisible({ prompt: true, dismissed: false, standalone: false })).toBe(true);
    expect(installBannerVisible({ prompt: false, dismissed: false, standalone: false })).toBe(false);
  });

  test('not in the installed app, and not after Not now', () => {
    expect(installBannerVisible({ prompt: true, dismissed: false, standalone: true })).toBe(false);
    expect(installBannerVisible({ prompt: true, dismissed: true, standalone: false })).toBe(false);
  });
});

describe('updateText', () => {
  test('update text names the version, and the build when only the build changed', () => {
    expect(updateText({ version: '0.3.0', build: 'b2' }, { version: '0.2.0', build: 'a1' })).toBe('Updated to v0.3 — reload');
    expect(updateText({ version: '0.3.0', build: 'b2' }, { version: '0.3.0', build: 'a1' })).toBe('Updated to v0.3 (build b2) — reload');
  });
});

describe('watchUpdates', () => {
  test('the update notice never reloads by itself', async () => {
    const posted: unknown[] = [];
    const changes: (() => void)[] = [];
    let reloads = 0;
    const reg = { waiting: { postMessage: (m: unknown) => posted.push(m) }, installing: null, addEventListener: () => undefined };
    const watcher = watchUpdates(reg, {
      hasController: true,
      fetchVersion: async () => ({ version: '0.3.0', build: 'b2' }),
      onControllerChange: (fn) => changes.push(fn),
      reload: () => reloads++,
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(pwaStore.get().update).toEqual({ version: '0.3.0', build: 'b2' });
    await new Promise((r) => setTimeout(r, 20));
    expect(reloads).toBe(0);
    expect(posted).toEqual([]);

    watcher.applyUpdate();
    expect(posted).toEqual(['skip-waiting']);
    changes.forEach((fn) => fn());
    changes.forEach((fn) => fn());
    expect(reloads).toBe(1);
  });

  test('the very first install shows no update notice', async () => {
    pwaStore.set({ update: null });
    const reg = { waiting: { postMessage: () => undefined }, installing: null, addEventListener: () => undefined };
    watchUpdates(reg, { hasController: false, fetchVersion: async () => ({ version: '0.3.0', build: 'b2' }), onControllerChange: () => undefined, reload: () => undefined });
    await new Promise((r) => setTimeout(r, 0));
    expect(pwaStore.get().update).toBeNull();
  });

  test('a worker that finishes installing later is noticed', async () => {
    pwaStore.set({ update: null });
    let onFound: () => void = () => undefined;
    let onState: () => void = () => undefined;
    const installing = { state: 'installing', postMessage: () => undefined, addEventListener: (_t: 'statechange', fn: () => void) => (onState = fn) };
    const reg = { waiting: null, installing: null as typeof installing | null, addEventListener: (_t: 'updatefound', fn: () => void) => (onFound = fn) };
    watchUpdates(reg, { hasController: true, fetchVersion: async () => ({ version: '0.4.0', build: 'c3' }), onControllerChange: () => undefined, reload: () => undefined });
    reg.installing = installing;
    onFound();
    installing.state = 'installed';
    onState();
    await new Promise((r) => setTimeout(r, 0));
    expect(pwaStore.get().update).toEqual({ version: '0.4.0', build: 'c3' });
  });
});

describe('watchUpdates with two windows', () => {
  test('Reload still works after another window let the update take over', async () => {
    const changes: (() => void)[] = [];
    let reloads = 0;
    const reg = { waiting: { postMessage: () => undefined }, installing: null, addEventListener: () => undefined };
    const watcher = watchUpdates(reg, {
      hasController: true,
      fetchVersion: async () => ({ version: '0.3.0', build: 'b2' }),
      onControllerChange: (fn) => changes.push(fn),
      reload: () => reloads++,
    });
    await new Promise((r) => setTimeout(r, 0));
    changes.forEach((fn) => fn()); // the other window pressed Reload: the new build now runs this one too
    expect(reloads).toBe(0); // still never by itself
    watcher.applyUpdate();
    expect(reloads).toBe(1);
  });
});
