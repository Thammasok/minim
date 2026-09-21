---
name: e2e-test-isolation
description: Use when setting up Playwright E2E tests for deterministic parallel execution
---

# E2E Test Isolation & Parallel Execution

## Purpose
Ensure Playwright E2E tests are deterministic, independent, and optimally parallelized across mock and real-backend environments.

## Execution Modes

### Mock Mode (Mountebank — Stages 21, 23)
- **No shared mutable state** — Mountebank returns static responses
- **Parallel-safe** — tests can run with multiple Playwright workers
- **No DB reset needed** — there is no database
- **Config**: `fullyParallel: true, workers: auto`

### Integration Mode (Real Backend — Stage 25)
- **Per-worker isolation** — each Playwright worker gets its own DB, backend, and frontend
- **Parallel-safe** — no shared mutable state between workers
- **DB reset per test** — each `test.describe` block resets its worker's DB via `test.beforeEach`
- **Config**: `fullyParallel: true, workers: auto` (same as mock mode)
- **See**: `guidelines/parallel-test-infrastructure.md` for full implementation pattern

#### Per-Worker Isolation Architecture
```
Worker 0:  Vite :15100  →  Backend :13100  →  DB {feature}_test_w0
Worker 1:  Vite :15101  →  Backend :13101  →  DB {feature}_test_w1
Worker N:  Vite :1510N  →  Backend :1310N  →  DB {feature}_test_wN
```

Each worker is fully isolated. No cross-worker contention.

#### Fallback: Sequential Mode
If per-worker isolation is not set up, use `workers: 1` as a safe fallback:
- **Config**: `fullyParallel: false, workers: 1`
- All tests share one DB — resets between each test prevent state leakage
- Much slower but requires no infrastructure changes

## DB Reset Strategy

### Global Setup
Prepare databases before the suite runs:
- **Per-worker mode**: Clone N databases from a template via `CREATE DATABASE ... TEMPLATE`
- **Sequential mode**: Reset the single shared database via `seed-reset.sql`

### Per-Test Reset
Each `test.describe` block resets the DB in `beforeEach`:
```
describe "Feature Group":
  beforeEach({ resetDb }):
    resetDb()  // re-runs seed-reset.sql against THIS worker's DB

  test "scenario A": ...
  test "scenario B": ...
```

### Global Teardown
- **Per-worker mode**: Drop all worker databases and the template database
- **Sequential mode**: No teardown needed (single DB persists)

### Seed Data Rules
1. **Use dynamic times** — never hardcode dates. Use `NOW() + INTERVAL` in SQL and computed getters in test fixtures
2. **Use `timestamp without time zone`** columns consistently — ensure both PostgreSQL `NOW()` and application code use the same timezone interpretation
3. **Assign dedicated resources per test group** — see `guidelines/sequential-test-data.md`

## Parallel Grouping Strategy

### Related Scenarios in Same Worker
Tests that share a logical flow (e.g., create → verify → delete) should be in the **same spec file** so they run in the same Playwright worker process.

### Independent Scenarios in Separate Files
Tests that are truly independent (e.g., auth tests vs area management tests) should be in **separate spec files** so they can run in parallel across workers.

### File Organization Pattern
```
e2e/{feature}/
  walking-skeleton.spec     # Core happy path
  auth-roles.spec           # Independent: auth scenarios
  area-management.spec      # Independent: area CRUD
  table-management.spec     # Independent: table CRUD
  reservations.spec         # Independent: reservation scenarios
  status-transitions.spec   # Independent: status changes
  manager-override.spec     # Independent: manager-specific
  settings.spec             # Independent: settings CRUD
  realtime-sync.spec        # Depends on WebSocket (may be skipped in mock mode)
```

## Auth Token Persistence

When tests navigate between pages (via `page.goto()`), in-memory state is lost. Store auth credentials in `sessionStorage` so that:
1. Login sets token in sessionStorage
2. Service constructors restore token from sessionStorage on page load
3. API calls work after full page navigation

## Dynamic Test Data

Never hardcode dates or timestamps in test fixtures:
```
// BAD
startTime: "2026-04-01T19:00:00"

// GOOD
get startTime() { return futureTime(2); }  // computed 2h from now
```

For Bruno API tests, use `script:pre-request` blocks to compute dynamic values:
```
script:pre-request {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  bru.setVar("futureStartTime", d.toISOString());
}
```
