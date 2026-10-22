// Writes the service worker into the build: src/sw/sw-main.ts's function, called with the list of files to keep
// (every built file plus the public folder) and a cache named after the build.
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';
import { cacheName, listHash, precacheList } from './src/sw/precache.ts';
import { swMain } from './src/sw/sw-main.ts';

function filesUnder(dir: string): string[] {
  try {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => relative(dir, join(d.parentPath, d.name)).replaceAll('\\', '/'));
  } catch {
    return [];
  }
}

export function serviceWorker(build: string): Plugin {
  let publicDir = 'public';
  return {
    name: 'service-worker',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const list = precacheList(Object.keys(bundle), filesUnder(publicDir));
      // Named after the build and its files: a rebuild of uncommitted code keeps its build id but not its files.
      const name = cacheName(`${build}-${listHash(list)}`);
      const source = `(${swMain.toString()})(self, ${JSON.stringify(list)}, ${JSON.stringify(name)});\n`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
