# Task Breakdown Reference

## Task taxonomy

Every implementation task is one of these types — the type determines which skill
implements it and what its acceptance condition is:

| Type     | Produces                             | Skill               | Done when |
|----------|--------------------------------------|---------------------|-----------|
| `infra`  | CI config, Docker, DB container, env | orchestrator        | Pipeline green |
| `schema` | Drizzle schema, migrations, SQL views, Zod types | software-engineer-backend | Migration runs; types compile |
| `domain` | Pure business logic, state machines  | software-engineer-backend  | Unit tests green |
| `api`    | Nest controller, DTO, guard, auth    | software-engineer-backend  | API TC suite green |
| `ui`     | React components, routes, forms      | react-vite-developer       | RTL + Playwright TCs green |
| `test`   | Automation scripts (TC→code)         | software-tester-automation | All TCs green in CI |
| `config` | Feature flags, env vars, secrets     | orchestrator        | Config documented + applied |

---

## Task card format

```markdown
### TASK-{ID}: {Title}

Type:       infra | schema | domain | api | ui | test | config
Story ref:  US-{ID}
TC refs:    TC-API-01, TC-UNIT-03 (tests that verify this task is done)
Depends on: TASK-{ID}, TASK-{ID}
Assigned:   backend | frontend | qa | devops
Estimate:   {S=0.5d | M=1d | L=2d | XL=3d}
Risk:       H | M | L
Sprint:     {N}

**Description:**
One paragraph describing exactly what needs to be built.

**Acceptance condition:**
The task is Done when:
- [ ] {specific, verifiable condition}
- [ ] {test IDs that must be green}

**Notes / constraints:**
- {anything the implementer must know}
```

---

## Sprint structure rules

**Sprint 0 (foundations — always first):**
- All `infra` tasks: CI/CD pipeline, Docker Compose, environment setup
- All `schema` tasks: DB migrations, shared type definitions, API contract types
- No feature code. Sprint 0 exists so Sprint 1 has a stable foundation.

**Sprint 1 (domain + API skeleton):**
- `domain` tasks: pure business logic with unit tests
- `api` tasks: route handlers (happy path only)
- First `test` tasks: unit test automation and API Bruno collection skeleton

**Sprint 2+ (feature completion + UI):**
- Remaining `api` tasks (error paths, edge cases)
- All `ui` tasks (can start once API contracts from Sprint 0 are defined)
- Remaining `test` tasks

**Sprint N (hardening):**
- All `test` tasks complete
- Exploratory testing + accessibility audit
- Performance tests against NFR thresholds
- Defect fixes

---

## Example task breakdown (Order feature)

```markdown
### Sprint 0 — Foundations

TASK-001: Set up pnpm workspace + Turborepo with NestJS skeleton  [infra, M, BE]
TASK-002: PostgreSQL migration — orders, order_items, products tables  [schema, M, BE]
TASK-003: Drizzle schema + shared types — Order, OrderItem, UserId  [schema, S, BE]
TASK-004: Vite + React SPA scaffold with Tailwind + shadcn  [infra, S, FE]
TASK-005: Zod schemas matching API contract                [schema, S, FE]
TASK-006: MSW handlers for POST /orders, GET /orders/:id   [test, S, QA]
TASK-007: Bruno collection skeleton with environment files [test, S, QA]

### Sprint 1 — Domain & API

TASK-008: Order domain — OrderStateMachine pure logic     [domain, M, BE]
  depends: TASK-003
  TCs: TC-UNIT-ST-01 through TC-UNIT-ST-10

TASK-009: OrderRepository (Drizzle) — save, findById, createWithStockDecrement  [api, L, BE]
  depends: TASK-002, TASK-003
  TCs: TC-COMP-01, TC-COMP-02, TC-COMP-03

TASK-010: POST /api/orders handler                        [api, M, BE]
  depends: TASK-008, TASK-009
  TCs: TC-API-01, TC-API-02, TC-API-03, TC-API-04

TASK-011: CheckoutForm component (connected to MSW)       [ui, L, FE]
  depends: TASK-005, TASK-006
  TCs: TC-FRONT-01, TC-FRONT-02, TC-FRONT-03, TC-FRONT-04

### Sprint 2 — Completion

TASK-012: GET /api/orders/:id handler + auth guard        [api, M, BE]
  depends: TASK-010
  TCs: TC-API-06, TC-API-07

TASK-013: Unit test automation (TC-UNIT-*)                [test, M, QA]
  depends: TASK-008

TASK-014: Bruno API test suite (TC-API-*)                 [test, M, QA]
  depends: TASK-010, TASK-012

TASK-015: Playwright E2E — checkout flow                  [test, L, QA]
  depends: TASK-011, TASK-012

TASK-016: Connect CheckoutForm to real API endpoint       [ui, S, FE]
  depends: TASK-010, TASK-011

### Sprint 3 — Hardening

TASK-017: Performance tests (k6) against NFR-01           [test, M, QA]
TASK-018: Security TCs — auth bypass, injection           [test, M, QA]
TASK-019: Accessibility audit + fix                       [ui, S, FE]
TASK-020: Full exploratory testing session                [test, M, QA]
```

---

## Dependency graph validation

Before presenting to the human, verify:
1. No circular dependencies
2. Every `ui` task depends on an MSW mock task (not the real API) for Sprint 1
3. Every `test` task depends on the `api` or `ui` task it tests
4. Sprint 0 tasks have no feature code dependencies
5. The critical path is identified: the longest chain from TASK-001 to final test task

```
Critical path example:
TASK-001 → TASK-002 → TASK-009 → TASK-010 → TASK-014 → TASK-015
(infra)    (schema)   (repo)     (handler)  (Bruno)    (E2E)
  0.5d       1d         2d          1d         1d         2d    = 7.5 days minimum
```
