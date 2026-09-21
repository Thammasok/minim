---
name: parallel-test-infrastructure
description: Use when setting up per-worker database isolation for parallel Playwright E2E tests
---

# Parallel Test Infrastructure (Per-Worker Isolation)

## Purpose
Enable fully parallel Playwright E2E tests against real databases by giving each worker its own isolated infrastructure stack.

## Architecture

Each Playwright worker gets a dedicated stack:
```
Worker i:
  Vite dev server  :15100+i  →  Backend  :13100+i  →  DB {feature}_test_w{i}
```

Workers are completely isolated — no shared mutable state, no cross-worker contention.

## Why Per-Worker Isolation?

Sequential execution (`workers: 1`) is safe but slow. With N spec files and a real DB, total time is O(N). Per-worker isolation makes it O(N / workers) without sacrificing determinism.

Key insight: `CREATE DATABASE ... TEMPLATE` in PostgreSQL is a near-instant copy-on-write clone. Creating N databases from a template takes milliseconds, not seconds.

## Implementation Pattern

### 1. Global Setup — Create Worker Databases

```
globalSetup():
  1. Dump schema from canonical DB:
     pg_dump --schema-only canonical_db → schemaDdl

  2. Create a template DB:
     CREATE DATABASE {feature}_test_tpl
     Load schemaDdl into template
     Load seed-reset.sql into template

  3. Clone per-worker DBs from template:
     for i in 0..workerCount-1:
       CREATE DATABASE {feature}_test_w{i} TEMPLATE {feature}_test_tpl
```

**Important**: `CREATE DATABASE` cannot run inside a transaction. Use `psql -c "..."` (not piped stdin).

### 2. Worker-Scoped Fixtures — Per-Worker Backend + Frontend

Use Playwright's worker-scoped fixtures to spawn isolated servers:

```
workerStack [scope: worker]:
  i = workerInfo.parallelIndex   // bounded 0..workers-1
  backendPort = BACKEND_PORT_BASE + i
  vitePort = VITE_PORT_BASE + i
  dbName = "{feature}_test_w{i}"

  // Spawn backend with worker-specific DB and port
  backend = spawn("node", ["dist/main.js"], {
    env: { PORT: backendPort, DB_NAME: dbName, ... }
  })
  waitForHealth(backend)

  // Spawn Vite dev server with proxy to this worker's backend
  vite = spawn("npx", ["vite", "--port", vitePort, "--strictPort"], {
    env: { VITE_API_PROXY_TARGET: `http://localhost:${backendPort}` }
  })
  waitForPort(vite)

  yield { baseURL: `http://localhost:${vitePort}`, dbName }

  // Cleanup
  vite.kill()
  backend.kill()
```

### 3. Per-Test DB Reset — Via Worker Fixture

```
resetDb [scope: test]:
  yield () => execOnDb(workerStack.dbName, seedSql)
```

Each test calls `resetDb()` in `beforeEach` to restore clean seed state within its own worker's DB.

### 4. Global Teardown — Drop Worker Databases

```
globalTeardown():
  for i in 0..workerCount-1:
    DROP DATABASE IF EXISTS {feature}_test_w{i}
  DROP DATABASE IF EXISTS {feature}_test_tpl
```

## Port Allocation

Use stable, non-conflicting port ranges:

| Component | Port Range | Formula |
|-----------|-----------|---------|
| Backend | 13100–13199 | 13100 + parallelIndex |
| Vite dev server | 15100–15199 | 15100 + parallelIndex |

Avoid well-known ports (3000, 5173, 8080) to prevent conflicts with local dev.

## Key Decisions

### Use `parallelIndex`, NOT `workerIndex`
- `workerInfo.parallelIndex` is bounded `0..workers-1` — reused when workers recycle
- `workerInfo.workerIndex` is globally unique and unbounded — can exceed worker count
- Port allocation and DB naming must use `parallelIndex` for stability

### Use Vite Dev Server, NOT Production Build + Static Server
- Vite dev server's proxy (`server.proxy`) correctly routes API calls to the per-worker backend
- React production builds served from a static file server may break framework features (e.g., React 19 form handling)
- The small overhead of Vite dev server is worth the reliability

### `CREATE DATABASE ... TEMPLATE` Cannot Run in a Transaction
- PostgreSQL DDL like `CREATE DATABASE` and `DROP DATABASE` fails inside transactions
- When piping SQL via stdin to `psql`, it wraps in a transaction by default
- Solution: use `psql -c "CREATE DATABASE ..."` flag instead of piped stdin

## Playwright Config

```typescript
// playwright.config.ts
const workers = process.env.PLAYWRIGHT_WORKERS
  ? parseInt(process.env.PLAYWRIGHT_WORKERS, 10)
  : Math.max(1, Math.floor(os.cpus().length / 2));

export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: true,
  workers,
});
```

Override with `PLAYWRIGHT_WORKERS=1` for sequential execution (CI environments with limited resources).

## Vite Proxy Configuration

Make `vite.config.ts` accept a dynamic proxy target:

```typescript
server: {
  proxy: {
    '/api/v1': {
      target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
      changeOrigin: true,
    },
    '/ws': {
      target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
      ws: true,
    },
  },
},
```

Each worker's Vite instance gets `VITE_API_PROXY_TARGET=http://localhost:{backendPort}`.

## When to Use

- **Always use for integration tests (Stage 25)** — parallel execution with real DB
- **Also works for mock mode** — parallel execution is the default
- **CI environments**: Set `PLAYWRIGHT_WORKERS=1` if resources are constrained
- **Local development**: Auto-detect based on CPU cores (half the core count)
