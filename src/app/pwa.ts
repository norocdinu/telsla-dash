// The installable, offline app: registering the service worker (production builds only), the Install banner
// and the update notice.
import { createStore } from './store';
import { versionLabel } from './version';

export interface UpdateInfo {
  version: string;
  build: string;
}

/** Chrome and Edge's install offer (not in TypeScript's DOM types). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

interface PwaState {
  /** The browser's install offer, kept until the user acts on it. */
  installPrompt: InstallPromptEvent | null;
  /** "Not now" was pressed this visit. */
  installDismissed: boolean;
  /** A new build is installed and waiting for the user to reload. */
  update: UpdateInfo | null;
}

export const pwaStore = createStore<PwaState>({ installPrompt: null, installDismissed: false, update: null });

/** The address the app is installed from (scripts/serve-app.ts). */
const INSTALL_PORT = '5191';

/**
 * Only a production build on the install address registers the service worker: never the dev server, its sample
 * pages, or a `vite preview` on the dev address (its offline copy would then take over the dev server).
 */
export function shouldRegister(env: { prod: boolean; search: string; port: string }): boolean {
  return env.prod && env.port === INSTALL_PORT && !new URLSearchParams(env.search).has('dev-root');
}

export function installBannerVisible(s: { prompt: boolean; dismissed: boolean; standalone: boolean }): boolean {
  return s.prompt && !s.dismissed && !s.standalone;
}

/** 'Updated to v0.3 — reload', naming the build too when the version didn't change. */
export function updateText(next: UpdateInfo, current: UpdateInfo): string {
  if (!next.version) return 'Update ready — reload';
  const v = versionLabel(next.version);
  return next.version === current.version ? `Updated to ${v} (build ${next.build}) — reload` : `Updated to ${v} — reload`;
}

interface WorkerLike {
  postMessage(message: unknown): void;
}
interface InstallingLike extends WorkerLike {
  state: string;
  addEventListener(type: 'statechange', fn: () => void): void;
}
export interface RegistrationLike {
  waiting: WorkerLike | null;
  installing: InstallingLike | null;
  addEventListener(type: 'updatefound', fn: () => void): void;
}
export interface UpdateDeps {
  /** A build was already running this page: anything newly installed is an update (not the very first install). */
  hasController: boolean;
  fetchVersion(): Promise<UpdateInfo | null>;
  onControllerChange(fn: () => void): void;
  reload(): void;
}

/**
 * Notices a new build waiting to take over and puts it in pwaStore.update. Nothing reloads until applyUpdate()
 * (the notice's Reload button): only then does the new build take over and the page reload, once.
 */
export function watchUpdates(reg: RegistrationLike, deps: UpdateDeps): { applyUpdate(): void } {
  let waiting: WorkerLike | null = null;
  const found = (w: WorkerLike) => {
    if (!deps.hasController) return;
    waiting = w;
    void deps.fetchVersion().then(
      (info) => pwaStore.set({ update: info ?? { version: '', build: '' } }),
      () => pwaStore.set({ update: { version: '', build: '' } }),
    );
  };
  if (reg.waiting) found(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    if (!w) return;
    w.addEventListener('statechange', () => {
      if (w.state === 'installed') found(w);
    });
  });
  let reloading = false;
  let applied = false;
  // Another window can press Reload first: the new build then takes over this one too (never reloading it).
  let tookOver = false;
  const reloadOnce = () => {
    if (reloading) return;
    reloading = true;
    deps.reload();
  };
  deps.onControllerChange(() => {
    if (applied) reloadOnce();
    else tookOver = true;
  });
  return {
    applyUpdate() {
      if (tookOver) return reloadOnce();
      if (!waiting) return;
      applied = true;
      waiting.postMessage('skip-waiting');
    },
  };
}

let watcher: { applyUpdate(): void } | null = null;

/** The update notice's Reload button. */
export function applyUpdate(): void {
  watcher?.applyUpdate();
}

export async function promptInstall(): Promise<void> {
  const p = pwaStore.get().installPrompt;
  if (!p) return;
  pwaStore.set({ installPrompt: null });
  await p.prompt();
}

export function dismissInstall(): void {
  pwaStore.set({ installDismissed: true });
}

export function isStandalone(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
}

async function fetchVersion(): Promise<UpdateInfo | null> {
  try {
    const r = await fetch('/version.json', { cache: 'no-store' });
    return r.ok ? ((await r.json()) as UpdateInfo) : null;
  } catch {
    return null;
  }
}

export function registerServiceWorker(): void {
  if (!shouldRegister({ prod: Boolean(import.meta.env.PROD), search: location.search, port: location.port }) || !('serviceWorker' in navigator)) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pwaStore.set({ installPrompt: e as InstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => pwaStore.set({ installPrompt: null }));
  const sw = navigator.serviceWorker;
  const hasController = sw.controller !== null;
  void sw.register('/sw.js').then(
    (reg) => {
      watcher = watchUpdates(reg, {
        hasController,
        fetchVersion,
        onControllerChange: (fn) => sw.addEventListener('controllerchange', fn),
        reload: () => location.reload(),
      });
    },
    () => undefined,
  );
}
