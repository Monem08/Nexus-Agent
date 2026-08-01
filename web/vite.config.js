import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build to ../server/webdist so the Express backend can serve the app.
// base: './' keeps asset URLs relative so it works behind any path/tunnel.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../server/webdist',
    emptyOutDir: true,
  },
});
