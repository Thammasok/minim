#!/usr/bin/env bash
# Scaffold a Vite + React + TypeScript + Tailwind v4 SPA.
#
#   bash scaffold.sh my-app             # full: + shadcn/ui, TanStack Router/Query, Vitest
#   bash scaffold.sh my-app --minimal   # Vite + React + TS + Tailwind + aliases only
#
# Scaffolding is deterministic — running this beats re-deriving a dozen commands by hand and
# getting a slightly different result each time. Read the output, then adjust to taste.

set -euo pipefail

APP_NAME="${1:-}"
MODE="${2:-full}"

if [[ -z "$APP_NAME" ]]; then
  echo "usage: bash scaffold.sh <app-name> [--minimal]" >&2
  exit 1
fi

if [[ -e "$APP_NAME" ]]; then
  echo "error: '$APP_NAME' already exists" >&2
  exit 1
fi

MINIMAL=false
[[ "$MODE" == "--minimal" ]] && MINIMAL=true

echo "==> Creating Vite + React + TS project: $APP_NAME"
npm create vite@latest "$APP_NAME" -- --template react-ts
cd "$APP_NAME"

echo "==> Installing base dependencies"
npm install

echo "==> Adding Tailwind v4"
npm install tailwindcss @tailwindcss/vite
npm install -D @types/node

echo "==> Adding utility deps"
npm install clsx tailwind-merge class-variance-authority

if [[ "$MINIMAL" == false ]]; then
  echo "==> Adding router, data layer, state, forms"
  npm install @tanstack/react-router @tanstack/react-query zustand \
    react-hook-form zod @hookform/resolvers
  npm install -D @tanstack/router-plugin @tanstack/react-query-devtools

  echo "==> Adding test tooling"
  npm install -D vitest jsdom @vitest/ui \
    @testing-library/react @testing-library/user-event @testing-library/jest-dom
fi

echo "==> Writing vite.config.ts"
cat > vite.config.ts <<'EOF'
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
    // Point at your API and call '/api/...' from the client — no CORS in dev.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
EOF

echo "==> Configuring path aliases in tsconfig"
# The alias must exist in BOTH vite.config.ts and tsconfig, or the editor and the build disagree.
node - <<'EOF'
const fs = require('fs');

function patch(file) {
  if (!fs.existsSync(file)) return false;
  // tsconfig files ship with comments; strip them before parsing.
  const raw = fs.readFileSync(file, 'utf8');
  const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  const json = JSON.parse(stripped);
  if (!json.compilerOptions) return false;
  json.compilerOptions.baseUrl = '.';
  json.compilerOptions.paths = { '@/*': ['./src/*'] };
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  return true;
}

// Vite's template splits config across tsconfig.app.json; fall back to tsconfig.json.
const target = patch('tsconfig.app.json') ? 'tsconfig.app.json' : (patch('tsconfig.json') ? 'tsconfig.json' : null);
if (!target) {
  console.warn('  ! could not patch tsconfig — add baseUrl/paths manually');
} else {
  console.log('  patched ' + target);
}

// Root tsconfig also needs paths for tooling that reads it directly.
if (fs.existsSync('tsconfig.json') && target !== 'tsconfig.json') patch('tsconfig.json');
EOF

echo "==> Writing src/index.css with design tokens"
cat > src/index.css <<'EOF'
@import 'tailwindcss';

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --font-sans: ui-sans-serif, system-ui, -apple-system, sans-serif;

  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
}

/* Semantic tokens — name colors by role so dark mode is a variable swap,
   not a `dark:` class on every element. */
:root {
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.15 0 0);
  --color-surface: oklch(0.98 0 0);
  --color-border: oklch(0.9 0 0);
  --color-primary: oklch(0.55 0.2 260);
  --color-primary-foreground: oklch(0.99 0 0);
  --color-muted: oklch(0.96 0 0);
  --color-muted-foreground: oklch(0.5 0 0);
  --color-destructive: oklch(0.58 0.22 25);
}

.dark {
  --color-background: oklch(0.15 0 0);
  --color-foreground: oklch(0.95 0 0);
  --color-surface: oklch(0.2 0 0);
  --color-border: oklch(0.3 0 0);
  --color-muted: oklch(0.25 0 0);
  --color-muted-foreground: oklch(0.65 0 0);
}

body {
  background-color: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
EOF

echo "==> Writing src/lib/utils.ts"
mkdir -p src/lib
cat > src/lib/utils.ts <<'EOF'
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes so caller overrides actually win (twMerge resolves conflicts). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
EOF

echo "==> Writing typed env"
cat > src/vite-env.d.ts <<'EOF'
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
EOF

cat > .env.example <<'EOF'
# Only VITE_-prefixed vars reach the client bundle — and they are PUBLIC.
# Never put secrets or API keys here.
VITE_API_URL=http://localhost:3000
EOF
cp .env.example .env.local

echo "==> Creating folder structure"
mkdir -p src/{routes,features,components/ui,components/layout,hooks,stores,types,test}
touch src/features/.gitkeep src/hooks/.gitkeep src/stores/.gitkeep src/types/.gitkeep

if [[ "$MINIMAL" == false ]]; then
  echo "==> Writing test setup"
  cat > src/test/setup.ts <<'EOF'
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);
EOF

  cat > src/test/render.tsx <<'EOF'
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender } from '@testing-library/react';

/** Fresh QueryClient per test — a shared one leaks cache between tests. */
export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}
EOF

  echo "==> Writing query client"
  cat > src/lib/query-client.ts <<'EOF'
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default staleTime is 0, which refetches on every mount. Pick a real baseline.
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});
EOF

  echo "==> Adding test scripts to package.json"
  node - <<'EOF'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts = {
  ...pkg.scripts,
  test: 'vitest',
  'test:run': 'vitest run',
  'test:ui': 'vitest --ui',
  typecheck: 'tsc --noEmit',
};
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
EOF
fi

echo
echo "==> Done: $APP_NAME"
echo
echo "  cd $APP_NAME && npm run dev"
echo
if [[ "$MINIMAL" == false ]]; then
  echo "  Next steps:"
  echo "   1. npx shadcn@latest init          # component primitives (uses the tokens above)"
  echo "   2. Add the TanStack Router plugin to vite.config.ts, then create src/routes/__root.tsx"
  echo "   3. Wire QueryClientProvider + RouterProvider in src/main.tsx"
  echo
  echo "  Reminder: configure SPA fallback on your host before deploying,"
  echo "  or refreshing any deep link returns 404. See references/build-deploy.md."
fi
