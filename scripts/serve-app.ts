// Serves the built app on http://localhost:5191 so Chrome or Edge can install it, then opens the browser.
// Used by `bun run install-app` (files from dist/) and by the Windows installer (files embedded in the program).
// Once installed, the app runs from the browser's offline copy: this server is only needed to install or update.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const INSTALL_PORT = 5191;
export const INSTALL_URL = `http://localhost:${INSTALL_PORT}`;
const APP_NAME = 'dashcam-viewer';

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  webmanifest: 'application/manifest+json',
  png: 'image/png',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
};

export function contentType(path: string): string {
  return TYPES[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

/** Hashed build files never change; the page, the worker and version.json must always be asked for afresh. */
function cacheControl(path: string): string {
  return path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
}

/** The file for a request path; paths without an extension get the page; never anything outside the app's files. */
export function resolvePath(urlPath: string, files: Map<string, Blob>): Blob | null {
  let path: string;
  try {
    path = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (path.includes('\\') || path.split('/').includes('..')) return null;
  const hit = files.get(path);
  if (hit) return hit;
  const last = path.split('/').pop() ?? '';
  return last.includes('.') ? null : (files.get('/index.html') ?? null);
}

export type PortOutcome = 'serve' | 'already-running' | 'other-version' | 'taken';

export function portOutcome(probe: { inUse: boolean; isOurs: boolean; sameBuild: boolean }): PortOutcome {
  if (!probe.inUse) return 'serve';
  if (!probe.isOurs) return 'taken';
  return probe.sameBuild ? 'already-running' : 'other-version';
}

interface BuildInfo {
  name?: string;
  version?: string;
  build?: string;
}

/**
 * Who's on the port: nothing (the connection is refused), a copy of Dashcam Viewer (its /version.json answers
 * with our name, and says which build), or something else (any other answer, or no answer in time).
 */
async function probePort(port: number): Promise<{ inUse: boolean; info: BuildInfo | null }> {
  try {
    const r = await fetch(`http://localhost:${port}/version.json`, { signal: AbortSignal.timeout(1500) });
    const body = r.ok ? ((await r.json().catch(() => null)) as BuildInfo | null) : null;
    return { inUse: true, info: body?.name === APP_NAME ? body : null };
  } catch (e) {
    return { inUse: e instanceof Error && e.name === 'TimeoutError', info: null };
  }
}

/** The build these files are (their /version.json). */
async function ownInfo(files: Map<string, Blob>): Promise<BuildInfo | null> {
  try {
    return JSON.parse(await files.get('/version.json')!.text()) as BuildInfo;
  } catch {
    return null;
  }
}

/** The copy of Dashcam Viewer found running, after serveApp said 'other-version'. */
export let runningInfo: BuildInfo | null = null;

/**
 * Starts serving, unless the port is already in use: by this same build, by another version of the app (which
 * must be closed for this one to be served), or by something else. It asks first: Windows lets a second program
 * bind the same port without an error.
 */
export async function serveApp(
  files: Map<string, Blob>,
  port = INSTALL_PORT,
): Promise<'serving' | 'already-running' | 'other-version' | 'taken'> {
  const probe = await probePort(port);
  const own = await ownInfo(files);
  runningInfo = probe.info;
  const sameBuild = !!probe.info && !!own && probe.info.version === own.version && probe.info.build === own.build;
  const outcome = portOutcome({ inUse: probe.inUse, isOurs: probe.info !== null, sameBuild });
  if (outcome !== 'serve') return outcome;
  try {
    Bun.serve({
      port,
      // Only this computer: never reachable from the network.
      hostname: 'localhost',
      fetch(req) {
        const { pathname } = new URL(req.url);
        const file = resolvePath(pathname, files);
        if (!file) return new Response('Not found', { status: 404 });
        const path = files.has(pathname) ? pathname : '/index.html';
        return new Response(file, { headers: { 'Content-Type': contentType(path), 'Cache-Control': cacheControl(path) } });
      },
    });
    return 'serving';
  } catch {
    return 'taken';
  }
}

export function openBrowser(url: string): void {
  const cmd =
    process.platform === 'win32'
      ? ['rundll32', 'url.dll,FileProtocolHandler', url]
      : process.platform === 'darwin'
        ? ['open', url]
        : ['xdg-open', url];
  try {
    Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' });
  } catch {
    // The address is printed anyway.
  }
}

/** A line to show when the default browser can't install the app (only Chrome and Edge can). */
export function browserNote(progId: string | null): string | null {
  if (progId === null || /chrome|msedge/i.test(progId)) return null;
  return `Your default browser can't install apps like this: open ${INSTALL_URL} in Chrome or Edge.`;
}

/** The Windows default browser's ProgId, or null when it can't be read (or not on Windows). */
export function defaultBrowserProgId(): string | null {
  if (process.platform !== 'win32') return null;
  try {
    const out = Bun.spawnSync([
      'reg',
      'query',
      'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice',
      '/v',
      'ProgId',
    ]).stdout.toString();
    return /ProgId\s+REG_SZ\s+(\S+)/.exec(out)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * The files of a build folder, read into memory: a later rebuild (or `bun run check`) replaces the folder's
 * hashed files, and a running server must keep serving the build it started with.
 */
export function filesFrom(dir: string): Map<string, Blob> {
  const files = new Map<string, Blob>();
  for (const d of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!d.isFile()) continue;
    const abs = join(d.parentPath, d.name);
    files.set(`/${relative(dir, abs).replaceAll('\\', '/')}`, new Blob([readFileSync(abs)]));
  }
  return files;
}

/**
 * Serves the app and opens the browser (unless `open` is false: `--no-open`), saying what's happening. Resolves
 * with the process exit code when it should stop, or null while it keeps serving.
 */
export async function runInstaller(files: Map<string, Blob>, open = true): Promise<number | null> {
  const outcome = await serveApp(files);
  if (outcome === 'taken') {
    console.log(`Port ${INSTALL_PORT} is used by another program, so Dashcam Viewer can't start.`);
    console.log('Close that program and try again.');
    return 1;
  }
  if (outcome === 'other-version') {
    const v = runningInfo?.version ? `v${runningInfo.version} · ${runningInfo.build ?? '?'}` : 'another version';
    console.log(`An older Dashcam Viewer (${v}) is still running in another window.`);
    console.log('Close that window, then run this again to update.');
    return 1;
  }
  console.log(
    outcome === 'already-running'
      ? `Dashcam Viewer is already running at ${INSTALL_URL} (in another window).`
      : `Dashcam Viewer is at ${INSTALL_URL}.`,
  );
  console.log('In Chrome or Edge, click Install (in the app, or the install icon in the address bar).');
  console.log('Already installed? Open Dashcam Viewer while this window is open and press Reload when it says "Updated".');
  const note = browserNote(defaultBrowserProgId());
  if (note) console.log(note);
  if (open) openBrowser(INSTALL_URL);
  if (outcome === 'already-running') return 0;
  console.log("You can close this window once it's installed or updated: the app then works on its own, even offline.");
  return null;
}
