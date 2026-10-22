import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { devSamples } from './vite.dev-samples.ts';
import { serviceWorker } from './vite.sw.ts';
import { buildInfo, versionFile } from './vite.version.ts';

// Its own port, so it never collides with other Vite projects on 5173. strictPort makes a clash
// an error instead of a silent move to another port.
const PORT = 5190;
const info = buildInfo();

export default defineConfig({
  plugins: [react(), devSamples(), versionFile(info), serviceWorker(info.build)],
  define: { __APP_VERSION__: JSON.stringify(info.version), __APP_BUILD__: JSON.stringify(info.build) },
  server: { port: PORT, strictPort: true },
  preview: { port: PORT, strictPort: true },
});
