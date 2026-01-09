import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // Allow external access if needed
    open: true, // Open browser on start
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  }
});
