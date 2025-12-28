import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  // Base public path when served in development or production
  base: './',

  // Build options
  build: {
    // Output directory for production build
    outDir: 'dist',

    // Generate sourcemaps for debugging
    sourcemap: true,

    // Rollup options
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
      output: {
        // Manual chunks for better code splitting
        manualChunks: {
          'three': ['three'],
          'three-addons': ['three/addons/controls/OrbitControls.js'],
        },
      },
    },

    // Asset handling
    assetsInlineLimit: 4096, // 4kb - inline assets smaller than this
  },

  // Server options for development
  server: {
    port: 5173,
    open: true,
  },

  // Resolve options
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['three', 'three/addons/controls/OrbitControls.js'],
  },
});
