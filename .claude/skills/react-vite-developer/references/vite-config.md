# Vite Configuration

Contents: [Baseline config](#baseline-config) · [Path aliases](#path-aliases) ·
[Environment variables](#environment-variables) · [Dev server & proxy](#dev-server--proxy) ·
[Plugins](#plugins-worth-knowing) · [Common failures](#common-failures)

## Baseline config

This is the config to start from. Everything in it earns its place.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true, // keep — production stack traces are worth the build time
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
```

Note on Tailwind: v4 ships a first-class Vite plugin (`@tailwindcss/vite`) and needs no
`tailwind.config.js` and no PostCSS setup. If you're in a Tailwind v3 project, it goes through
PostCSS instead (`postcss.config.js` with `tailwindcss` + `autoprefixer`) — don't mix the two.

### Conditional config

When dev and prod need to differ, take the function form:

```ts
export default defineConfig(({ mode, command }) => ({
  plugins: [react(), tailwindcss()],
  // source maps only where they're useful, drop console in prod
  build: {
    sourcemap: mode !== 'production',
    minify: 'esbuild',
  },
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
  },
}));
```

## Path aliases

The alias must be declared twice — Vite resolves it at build time, TypeScript resolves it for the
editor. Miss either half and you get red squiggles that build fine, or a build that fails while
the editor is happy.

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

Alternatively `vite-tsconfig-paths` reads `tsconfig.json` and derives the Vite side automatically,
which keeps them from drifting apart:

```ts
import tsconfigPaths from 'vite-tsconfig-paths';
export default defineConfig({ plugins: [react(), tsconfigPaths()] });
```

Prefer a single `@/` root alias over a pile of `@components`, `@hooks`, `@utils` aliases. More
aliases means more to keep in sync and more ambiguity when reading an import.

## Environment variables

Only variables prefixed `VITE_` reach the client bundle. This is a safety feature, not an
inconvenience — it stops a stray `DATABASE_URL` from ending up in a public JS file.

```bash
# .env.local  (gitignored)
VITE_API_URL=http://localhost:3000
```

```ts
const apiUrl = import.meta.env.VITE_API_URL;
import.meta.env.MODE   // 'development' | 'production'
import.meta.env.DEV    // boolean
import.meta.env.PROD   // boolean
```

**Anything in `VITE_*` is public.** It's in the shipped JavaScript, readable by anyone. API keys,
secrets, and tokens do not belong here — they belong behind your backend.

File precedence: `.env` → `.env.local` → `.env.[mode]` → `.env.[mode].local`, later wins.
Commit `.env.example` with the keys and dummy values; gitignore everything `.local`.

### Typed env

Untyped `import.meta.env` access is where "works on my machine" bugs come from. Declare the shape:

```ts
// src/vite-env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SENTRY_DSN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

Better still, validate at startup so a missing variable fails at boot with a clear message rather
than as `undefined` inside a fetch URL an hour later:

```ts
// src/lib/env.ts
import { z } from 'zod';

export const env = z
  .object({
    VITE_API_URL: z.string().url(),
    VITE_SENTRY_DSN: z.string().optional(),
  })
  .parse(import.meta.env);
```

## Dev server & proxy

The proxy exists to make the browser think the API is same-origin, which sidesteps CORS entirely
in development. Prefer it over relaxing CORS on the backend for dev.

```ts
server: {
  proxy: {
    // strip the /api prefix if the backend doesn't expect it
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/api/, ''),
    },
    // websockets need ws: true
    '/socket': {
      target: 'ws://localhost:3000',
      ws: true,
    },
  },
  host: true,   // expose on LAN — needed to test on a phone
  open: true,
}
```

With the proxy in place, call `/api/users` from the client, not the absolute backend URL. In
production the same path is handled by your host's rewrite rules or your reverse proxy.

## Plugins worth knowing

| Plugin | Why |
|---|---|
| `@vitejs/plugin-react` | Fast Refresh + JSX. The default. |
| `@vitejs/plugin-react-swc` | Same job via SWC — noticeably faster on large codebases, slightly fewer Babel escape hatches. |
| `@tailwindcss/vite` | Tailwind v4. |
| `vite-tsconfig-paths` | Aliases from tsconfig, single source of truth. |
| `vite-plugin-svgr` | Import SVGs as React components. |
| `rollup-plugin-visualizer` | Bundle treemap — see `build-deploy.md`. |
| `vite-plugin-pwa` | Service worker, offline, installable. |

Resist adding plugins speculatively. Each one is build-time cost and another thing that can break
on a Vite major upgrade.

## Common failures

**Dev works, build breaks.** Usually a dynamic import Vite can't statically analyze. Fully dynamic
paths (`import(userInput)`) don't work; a glob does:

```ts
const pages = import.meta.glob('./pages/*.tsx');
```

**Env var is `undefined` in production.** Either it's missing the `VITE_` prefix, or it wasn't
present in the CI/host environment at *build* time. Vite inlines env vars during the build — they
are not read at runtime, so setting them on the server after building does nothing.

**`process is not defined`.** A dependency assumes Node globals. Prefer replacing the dependency;
if you can't, `define: { 'process.env': {} }` is the escape hatch.

**HMR keeps full-reloading.** Fast Refresh only preserves state for files that export components
exclusively. A file exporting both a component and a constant will hard-reload — split them.

**CommonJS dependency fails to resolve.** Add it to `optimizeDeps.include` so Vite pre-bundles it:

```ts
optimizeDeps: { include: ['some-cjs-package'] }
```

**Stale dependency cache after upgrading a package.** `rm -rf node_modules/.vite` or run with
`--force`.
