// The app's version (package.json) and build id (git), baked into the build and published as /version.json:
// the update notice and the installer read it.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

export interface BuildInfo {
  name: string;
  version: string;
  build: string;
}

function git(args: string): string {
  return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/** package.json's version; the commit's short hash, '+' when the working tree has changes; 'dev' without git. */
export function buildInfo(root = process.cwd()): BuildInfo {
  const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8')) as { name: string; version: string };
  let build = 'dev';
  try {
    build = git('rev-parse --short HEAD') + (git('status --porcelain') ? '+' : '');
  } catch {
    // Not a git checkout (e.g. a downloaded ZIP): 'dev'.
  }
  return { name: pkg.name, version: pkg.version, build };
}

/** Emits /version.json with the build's info. */
export function versionFile(info: BuildInfo): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(info) });
    },
  };
}
