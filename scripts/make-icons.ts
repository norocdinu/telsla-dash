// Draws the app icon (a camera lens with a red record dot on a dark tile) and writes the PNGs the web app
// manifest needs, plus the favicon. Run: bun scripts/make-icons.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderIcon } from './icon-art';
import { encodePng } from './png';

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#141418"/>
  <circle cx="32" cy="33" r="18.4" fill="#d4d4d8"/>
  <circle cx="32" cy="33" r="14.8" fill="#09090b"/>
  <circle cx="32" cy="33" r="8.7" fill="#3b82f6"/>
  <circle cx="32" cy="33" r="4.6" fill="#0b1220"/>
  <circle cx="28.4" cy="29.4" r="1.8" fill="#fff" fill-opacity=".85"/>
  <circle cx="47.4" cy="17.1" r="2.8" fill="#e5484d"/>
</svg>
`;

mkdirSync('public/icons', { recursive: true });
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
] as const) {
  writeFileSync(`public/icons/${name}`, encodePng(size, size, renderIcon(size, maskable)));
  console.log(`wrote public/icons/${name}`);
}
writeFileSync('public/favicon.svg', FAVICON);
console.log('wrote public/favicon.svg');
