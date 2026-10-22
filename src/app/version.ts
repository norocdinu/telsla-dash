// Which version of the app this is, baked in at build time (vite.version.ts).

/** From package.json, e.g. '0.3.0'. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
/** The commit's short hash, with '+' when the code wasn't committed; 'dev' when git wasn't available. */
export const APP_BUILD: string = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev';

/** '0.3.0' → 'v0.3'; anything else keeps every part. */
export function versionLabel(version: string): string {
  return `v${version.replace(/^(\d+\.\d+)\.0$/, '$1')}`;
}

/** The quiet line in Settings: 'v0.3 · 1a2b3c4'. */
export function buildLabel(version: string, build: string): string {
  return `${versionLabel(version)} · ${build}`;
}
