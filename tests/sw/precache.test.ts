import { describe, expect, test } from 'bun:test';
import { cacheName, listHash, precacheList } from '../../src/sw/precache';

describe('precacheList', () => {
  const bundle = ['index.html', 'assets/index-a1.js', 'assets/index-b2.css', 'assets/sei.worker-c3.js', 'assets/index-a1.js.map', 'sw.js', 'version.json'];
  const publicFiles = ['manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'];

  test('keeps the page, manifest, icons and every built asset', () => {
    const list = precacheList(bundle, publicFiles);
    expect(list).toEqual(
      expect.arrayContaining([
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/favicon.svg',
        '/icons/icon-192.png',
        '/icons/maskable-512.png',
        '/assets/index-a1.js',
        '/assets/index-b2.css',
        '/assets/sei.worker-c3.js',
      ]),
    );
    expect(new Set(list).size).toBe(list.length);
  });

  test('leaves out source maps, the worker itself, version.json and dev files', () => {
    const list = precacheList([...bundle, '__dev-samples/x.js'], publicFiles);
    for (const no of ['/assets/index-a1.js.map', '/sw.js', '/version.json', '/__dev-samples/x.js']) expect(list).not.toContain(no);
  });
});

describe('cacheName', () => {
  test('cache names carry the build', () => {
    expect(cacheName('1a2b3c4')).toBe('dashcam-viewer-1a2b3c4');
  });
});

describe('listHash', () => {
  // A rebuild of uncommitted code keeps its build id ('1a2b3c4+'), so the cache must also follow the files.
  test('the same files give the same hash, different files a different one', () => {
    expect(listHash(['/', '/assets/a1.js'])).toBe(listHash(['/', '/assets/a1.js']));
    expect(listHash(['/', '/assets/a1.js'])).not.toBe(listHash(['/', '/assets/a2.js']));
    expect(listHash(['/'])).toMatch(/^[0-9a-f]{8}$/);
  });
});
