import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserNote, contentType, filesFrom, portOutcome, resolvePath, serveApp } from '../../scripts/serve-app';

const files = new Map<string, Blob>([
  ['/index.html', new Blob(['page'])],
  ['/version.json', new Blob([JSON.stringify({ name: 'dashcam-viewer', version: '0.3.0', build: 'b2' })])],
  ['/assets/index-a1.js', new Blob(['js'])],
  ['/manifest.webmanifest', new Blob(['{}'])],
]);

describe('contentType', () => {
  test("content types for the app's files", () => {
    expect(contentType('/index.html')).toBe('text/html; charset=utf-8');
    expect(contentType('/assets/index-a1.js')).toBe('text/javascript; charset=utf-8');
    expect(contentType('/assets/index-b2.css')).toBe('text/css; charset=utf-8');
    expect(contentType('/manifest.webmanifest')).toBe('application/manifest+json');
    expect(contentType('/icons/icon-192.png')).toBe('image/png');
    expect(contentType('/favicon.svg')).toBe('image/svg+xml');
    expect(contentType('/version.json')).toBe('application/json');
    expect(contentType('/sw.js')).toBe('text/javascript; charset=utf-8');
  });
});

describe('resolvePath', () => {
  test('paths without an extension get the page', () => {
    expect(resolvePath('/', files)).toBe(files.get('/index.html')!);
    expect(resolvePath('/some/link', files)).toBe(files.get('/index.html')!);
  });

  test('files are served by their path, missing ones are null', () => {
    expect(resolvePath('/assets/index-a1.js', files)).toBe(files.get('/assets/index-a1.js')!);
    expect(resolvePath('/assets/missing.js', files)).toBeNull();
  });

  test("no way out of the app's files", () => {
    expect(resolvePath('/../package.json', files)).toBeNull();
    expect(resolvePath('/%2e%2e/package.json', files)).toBeNull();
    expect(resolvePath('/assets/..%2f..%2fpackage.json', files)).toBeNull();
  });
});

describe('portOutcome', () => {
  test('a free port is served', () => {
    expect(portOutcome({ inUse: false, isOurs: false, sameBuild: false })).toBe('serve');
  });

  test('another copy already running', () => {
    expect(portOutcome({ inUse: true, isOurs: true, sameBuild: true })).toBe('already-running');
  });

  test('another version of the app still running', () => {
    expect(portOutcome({ inUse: true, isOurs: true, sameBuild: false })).toBe('other-version');
  });

  test('something else on the port', () => {
    expect(portOutcome({ inUse: true, isOurs: false, sameBuild: false })).toBe('taken');
  });
});

describe('browserNote', () => {
  test('nothing to say for Chrome, Edge or an unknown default', () => {
    expect(browserNote('ChromeHTML')).toBeNull();
    expect(browserNote('MSEdgeHTM')).toBeNull();
    expect(browserNote(null)).toBeNull();
  });

  test('another default browser is told to use Chrome or Edge', () => {
    expect(browserNote('FirefoxURL-308046B0AF4A39CB')).toBe("Your default browser can't install apps like this: open http://localhost:5191 in Chrome or Edge.");
  });
});

describe('serveApp', () => {
  // Windows lets a second program bind the same port without an error, so the check must ask who's there first.
  test('a second copy finds the first one running', async () => {
    const first = Bun.serve({ port: 0, hostname: 'localhost', fetch: () => Response.json({ name: 'dashcam-viewer', version: '0.3.0', build: 'b2' }) });
    try {
      expect(await serveApp(files, first.port!)).toBe('already-running');
    } finally {
      first.stop(true);
    }
  });

  test('something else on the port is reported, not shared', async () => {
    const other = Bun.serve({ port: 0, hostname: 'localhost', fetch: () => new Response('another app', { status: 404 }) });
    try {
      expect(await serveApp(files, other.port!)).toBe('taken');
    } finally {
      other.stop(true);
    }
  });
});

describe('updating while an older copy runs', () => {
  test('an older copy still running is reported, not used', async () => {
    const older = Bun.serve({ port: 0, hostname: 'localhost', fetch: () => Response.json({ name: 'dashcam-viewer', version: '0.3.0', build: 'a1' }) });
    try {
      expect(await serveApp(files, older.port!)).toBe('other-version');
    } finally {
      older.stop(true);
    }
  });
});

describe('filesFrom', () => {
  test('files are read into memory, so a rebuild cannot break a running server', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dist-'));
    try {
      writeFileSync(join(dir, 'index.html'), 'first build');
      const loaded = filesFrom(dir);
      rmSync(join(dir, 'index.html'));
      expect(await loaded.get('/index.html')!.text()).toBe('first build');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
