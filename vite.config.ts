import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { devSamples } from './vite.dev-samples.ts';

// Its own port, so it never collides with other Vite projects on 5173. strictPort makes a clash
// an error instead of a silent move to another port.
const PORT = 5190;

export default defineConfig({
  plugins: [react(), devSamples()],
  server: { port: PORT, strictPort: true },
  preview: { port: PORT, strictPort: true },
});
