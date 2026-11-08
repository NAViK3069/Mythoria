import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build works on GitHub Pages (served under /Mythoria/).
  base: './',
  server: {
    // Reachable from a phone / iPad on the same Wi-Fi for testing.
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
