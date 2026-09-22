import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Must stay in sync with `paths` in tsconfig.app.json, or the editor and the build disagree.
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  // A Tauri shell (T-002) attaches to a fixed dev-server port and must fail loudly, not silently
  // pick another one. `clearScreen: false` keeps the Rust compiler's output visible alongside Vite.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // src-tauri/ is Cargo's tree; watching it would restart Vite on every Rust rebuild.
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
