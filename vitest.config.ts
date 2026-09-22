import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      // Nothing under test imports CSS for its behaviour; skip the Tailwind pass.
      css: false,
      // `tests/` at the repo root is the Rust fixture corpus, not a Vitest suite.
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  })
);
