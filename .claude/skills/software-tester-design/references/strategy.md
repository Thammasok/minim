# Test Strategy & Levels Reference

## The Testing Pyramid

```
          ╱▔▔▔▔▔▔▔▔╲         E2E / UI (few, slow, high-confidence)
         ╱────────────╲
        ╱  Integration  ╲     Service / API / Contract
       ╱──────────────────╲
      ╱     Component       ╲  In-process, real DB/infra
     ╱────────────────────────╲
    ╱         Unit              ╲  Fast, isolated, no I/O
   ╱▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁╲
```

**Rule of thumb:** 70% unit · 20% integration/API · 10% E2E.
Invert this pyramid = slow, brittle, expensive suite.

---

## Test Levels — when to use each

### Unit tests
- **What:** Pure functions, domain logic, algorithms, transformers, validators.
- **When:** Any stateless logic that can be exercised without I/O.
- **Characteristics:** ≤5ms, no network, no DB, no file system.
- **Tools:** Jest, Vitest, pytest, RSpec, cargo test.
- **Doubles:** Stubs, mocks, fakes for any dependency.

```
Good unit test targets:
  ✓ Price calculation with discount
  ✓ Email format validation
  ✓ Date range overlap detection
  ✓ State machine transitions (pure)
  ✗ "Is the record in the DB?" → integration test
```

### Component / integration tests
- **What:** One service/module wired to its real dependencies (DB, cache, queue).
- **When:** Repository layer, event consumers, DB query correctness.
- **Characteristics:** Seconds; use testcontainers or a local docker-compose.
- **Tools:** testcontainers, Jest + real DB, pytest + PostgreSQL.

### API tests
- **What:** HTTP contract of the service — status codes, headers, body shapes, auth.
- **When:** Every endpoint, every status code variant.
- **Tools:** Supertest, REST Assured, Playwright API, httpx, Postman/Newman.

### Contract tests
- **What:** Consumer-driven contracts — verify producer doesn't break consumer expectations.
- **When:** Any service-to-service HTTP or message dependency.
- **Tools:** Pact (pact-js, pact-rust, pact-python), Spring Cloud Contract.

### E2E / UI tests
- **What:** Critical user journeys through the full stack in a real browser.
- **When:** Smoke suite for deployment gates; critical business flows (checkout, login, signup).
- **Characteristics:** Slow (seconds–minutes), brittle to UI changes. Keep count LOW.
- **Tools:** Playwright, Cypress, Selenium.

---

## Backend split: mocked / language-independent API / schema-only

A pyramid tells you *how much* of each level to have; it doesn't tell you *where the
boundary sits* between "integration" and "API" for a backend service, or what tooling
each side should use. When a real backend project's tests all shared one live DB/broker
in one test run, the fix wasn't more pyramid — it was drawing three sharper boundaries:

```
local          — every collaborator outside the unit under test is mocked/faked, INCLUDING
                 the DB/ORM query layer. Zero infra to run: no DB, no broker, no network.
                 Runs on every save.

api-testing    — the whole service, black-box, over real HTTP against a real, separately
                 built+started instance with real infra (DB, cache, broker). No in-process
                 shortcut (no mounting the app object directly), no importing the service's
                 own internals for setup/assertions either — call it exactly the way an
                 external client would, including auth.

schema/migration — anything with no HTTP surface at all (a migration file, a raw SQL
                 view, a stored procedure). Doesn't fit "local" (needs a real DB engine
                 to prove) or "api-testing" (nothing to call over HTTP) — give it a
                 third, explicitly separate category rather than forcing it into either.
```

**Why `local` mocks the DB/ORM layer instead of using testcontainers.** Testcontainers-backed
"component" tests (`component-backend.md`) are a fine default and still the right call for
most projects. The mocked-query-layer alternative is worth reaching for specifically when you
want the *entire* fast suite — including repository/query-builder logic — runnable with zero
Docker/DB dependency, and you're willing to accept a real trade-off in exchange: a mock can
prove your query is *built* correctly (right table, right WHERE clause, right bindings) but
can never prove a schema-level guarantee (a unique constraint actually rejects a duplicate, a
`CASCADE` FK actually cascades, a generated/computed column actually recomputes). Those cases
don't get faked — they move to whichever real-infra tier can prove them (`api-testing` if an
HTTP surface reaches them, `schema/migration` if not), or get logged as an explicit, named gap
if neither can reach them (e.g. a uniqueness rule a service layer's own check already
intercepts before the DB ever sees the duplicate). See `component-backend.md`'s "Query-boundary
mocking" section for the implementation pattern and the concrete decision rule.

**Why `api-testing` specifically means language-independent tooling.** The moment an
API-testing suite imports the service's own modules — its DB client, its token-signing
helper, its repository functions — for setup or assertions, it stops being a black-box
test of the *contract* and becomes coupled to the *implementation*. That coupling is
invisible until someone actually needs to rewrite the backend in a different language or
framework, at which point the whole API-testing suite has to be rewritten too — exactly the
work a black-box HTTP suite was supposed to make unnecessary. Pick tooling that can only ever
see the HTTP contract: Bruno (`api-bruno.md` — has a documented pattern for running it fully
inside Docker via the official CLI image, so not even the *test runner* needs the project's
language installed), Postman/Newman, or plain `curl`/httpie scripts. Supertest/REST-assured/
httpx-in-process are excellent for the `local` tier's route-wiring tests (mounting the app
object directly, everything below it mocked) — but that's a different tier with a different
job, not a substitute for a language-independent `api-testing` tier.

**Decision rule** when a test case needs something a mock can't prove:
1. Is there an HTTP endpoint that reaches this behavior? → `api-testing`, asserted through
   the response/a follow-up call — never by importing the DB client to peek directly (that
   re-couples the "language-independent" tier to the implementation again). If the only
   available proof is coarser than direct inspection (e.g. "the parent resource now 404s"
   rather than "the child rows are gone"), that's an accepted, documented narrowing — not a
   reason to reach for direct DB access.
2. No HTTP surface at all? → `schema/migration`, and it's fine for this one category to stay
   coupled to the implementation language, since there's no black-box alternative to being
   coupled to a language-specific DB client here.
3. Neither reaches it (a service-layer check intercepts before the DB layer ever runs)? →
   log it as a named gap in the coverage matrix. Don't fake it in `local` and don't stretch
   `api-testing` to reach for it via direct DB access.

---

## Shift-Left Testing

Move testing earlier in the development cycle — catch defects when they're cheapest to fix.

```
Traditional:  Design → Dev → QA → Staging → Production
                                   ↑
                              bugs found here (expensive)

Shift-left:   Design → Dev → QA
              ↑────────────────┘
         tests designed here (cheap)
```

**Practical shift-left actions:**
1. **Test design at story kick-off** — write test scenarios before development starts.
2. **Three Amigos** — BA + Dev + QA review acceptance criteria together.
3. **Definition of Done includes tests** — PR requires passing unit + integration tests.
4. **BDD scenarios as specification** — Gherkin before code.
5. **Static analysis gates** — linting, type checking, SAST in CI before unit tests.

---

## Test classification by purpose

| Type | Purpose | When to run |
|---|---|---|
| Smoke | Does the critical path work at all? | Every deployment |
| Sanity | Does this specific fix work? | After targeted fix |
| Regression | Did we break anything existing? | Every PR / nightly |
| Exploratory | Find the unexpected | New features, post-release |
| Performance | Is it fast enough under load? | Before release / on infra changes |
| Security | Does it resist attacks? | On auth changes, before release |
| Accessibility | Can all users use it? | On UI changes |
| Compatibility | Works across browsers/devices? | Release gates |

---

## Risk-based prioritisation

When you can't test everything, prioritise by:

```
Risk score = Likelihood of failure × Impact of failure

P1 (must test): High likelihood OR high impact (auth, payments, data integrity)
P2 (should test): Medium risk (standard CRUD, UI flows)
P3 (nice to have): Low risk, stable code, low traffic paths
```

**High-risk indicators:**
- New code with no existing tests
- Recently changed code
- Complex business logic
- Data mutations (writes, deletes)
- External integrations
- Authentication / authorisation
- Financial calculations

---

## CI/CD test gates

```yaml
# Recommended pipeline gates

on: pull_request
jobs:
  quality:
    steps:
      - lint + type-check          # < 30s — fail fast
      - unit tests                 # < 2min — all must pass
      - integration tests          # < 5min — all must pass
      - API tests                  # < 3min — all must pass
      - contract tests (publish)   # < 2min

on: push to main
jobs:
  e2e-smoke:
    steps:
      - deploy to staging
      - smoke suite (Playwright)   # < 5min, P1 only
      - contract tests (verify)

nightly:
  - full regression suite
  - performance tests
  - accessibility audit
```
