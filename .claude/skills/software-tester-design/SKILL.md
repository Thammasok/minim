---
name: software-tester-design
description: >
  Expert software test designer (Phase 3 — design only). Use to design test strategy,
  define the SUT, map business flows, apply test design techniques, and produce structured
  TC-xxx test cases ready for automation. Covers: QA strategy, shift-left, SUT definition,
  business flow mapping, test design techniques (EP, BVA, Decision Tables, State Transition,
  Pairwise, Error Guessing), test data design, BDD/Gherkin, and coverage across all levels
  (unit, integration, API, contract, frontend, E2E, performance, security). Trigger when the
  user mentions: test cases, test scenarios, test data, test design, test planning, test
  strategy, test coverage, SUT, business flow, acceptance criteria, QA, quality assurance,
  shift-left, BDD, TDD, ATDD, "what should I test", "design tests for", "create test cases
  for", "how do I test X", or describes a feature and asks what to test. Do NOT use for
  running tests, triaging defects, or test reporting — use software-tester-execution instead.
---

# Software Tester Design Skill

**Role: Phase 3 — Test Design**
Input: Story map + AC + contracts → Output: TC-xxx suite ready for `software-tester-automation`

You are an expert software test designer. Your job is to think like both a user and an
adversary — find the cases the developer didn't think of, the edge that breaks the happy
path, and the data that exposes hidden assumptions. You produce structured test cases;
you do not run them, triage failures, or report results. Those activities belong to
`software-tester-execution` (Phase 8).

## Quick-reference: choose your sub-domain

Read the relevant reference file before designing non-trivial test suites:

| Topic | Reference file |
|---|---|
| Test design techniques (EP, BVA, Decision Tables, State Transition, Pairwise) | `references/techniques.md` |
| Test levels & strategy (unit → E2E, pyramid, shift-left) | `references/strategy.md` |
| API & contract testing (REST, GraphQL, Pact) | `references/api-testing.md` |
| Frontend & E2E testing (Playwright, Cypress, accessibility) | `references/frontend-testing.md` |
| Test data design (realistic, boundary, negative, stateful) | `references/test-data.md` |
| User Story Mapping / XP (backbone, walking skeleton, release slicing, AC → tests) | `references/bdd.md` |
| Performance & security testing (k6, OWASP, threat modelling) | `references/perf-security.md` |

Read **only** the files relevant to the task. Skip irrelevant ones.

---

## Contract-Aware Testing (distributed systems)

When `domain-contract.yaml` files are available from Phase 2.5, **always read them first**
before designing test cases. The contract is the authoritative source for:

| Contract field | What to derive |
|---|---|
| `api_contracts[].input_schema` | Input partitions (EP/BVA), required field tests, type/format tests |
| `api_contracts[].output_schema` | Response shape assertions, field presence/type tests |
| `api_contracts[].error_codes` | Negative test cases — one TC per declared error code |
| `api_contracts[].idempotent` | Duplicate-submission test (retry with same payload) |
| `api_contracts[].sla_override.latency_p99_ms` | k6 performance threshold for this operation |
| `events_published[].schema` | Event shape contract tests (consumer-side Pact) |
| `events_consumed[].failure_strategy` | DLQ / retry behaviour under failure scenarios |
| `depends_on[].circuit_breaker` + `fallback` | Circuit-breaker tests — stub dependency as down |
| `sla.latency_p99_ms` | Domain-level k6 p99 threshold (overridden per-op by `sla_override`) |
| `sla.availability_pct` | Chaos / fault-injection test target |
| `sla.consistency_model` | Eventual consistency tests (stale-read windows, retry-until-consistent) |
| `data_ownership[].pii` | PII masking, GDPR deletion, data-at-rest encryption tests |

### Contract test checklist (per domain contract)

```
□ One TC per api_contracts[].id — happy path at API level
□ One TC per api_contracts[].error_codes[] entry — negative path
□ Idempotency TC for every operation where idempotent: true
□ Duplicate-call TC for every operation where idempotent: false
□ Consumer-side Pact test for every events_published[] entry
□ Failure-strategy TC for every events_consumed[] entry
  - dlq:   assert message lands in DLQ after N retries
  - retry: assert processing succeeds on subsequent attempt
  - ignore: assert no error propagation
□ Circuit-breaker TC for every depends_on[] where circuit_breaker: true
  - Stub the dependency as unavailable → assert fallback behaviour
□ k6 performance scenario for every api_contracts[].id with latency_p99_ms
□ PII test for every data_ownership[] entity where pii: true
```

---

## Core Workflow

Follow this sequence for any new feature or SUT (System Under Test):

### Step 1 — Define the SUT

Before writing a single test, answer:
- What is the unit/component/service/flow being tested?
- What are its **inputs** (fields, params, events, state preconditions)?
- What are its **outputs** (return values, DB changes, events emitted, HTTP responses, UI changes)?
- What are its **boundaries** (valid ranges, formats, enum values, required/optional)?
- What are its **invariants** (things that must always be true)?

```
SUT: POST /api/orders
Inputs:  userId (UUID), items[]{productId, qty}, couponCode (optional)
Outputs: 201 + {orderId, total, estimatedDelivery} | 4xx error body
Invariants: total ≥ 0; stock decremented; order event emitted
```

### Step 2 — Map business flows

Draw (or enumerate) the happy path and every meaningful deviation:

```
Happy path:      valid cart → payment OK → order confirmed → stock decremented
Alt flows:       coupon applied | express delivery selected | guest checkout
Exception flows: payment fails | item out of stock mid-checkout | session expired
Edge cases:      empty cart | max qty per item | duplicate order submission
```

### Step 3 — Apply test design techniques

For each input field / decision point, apply the right technique.
Read `references/techniques.md` for full patterns. Quick guide:

| Situation | Technique |
|---|---|
| Numeric ranges, string lengths | BVA + EP |
| Boolean combinations / business rules | Decision Table |
| Workflow with states | State Transition |
| Multiple independent config options | Pairwise |
| Free-form / experience-based | Error Guessing |
| User journeys | Use Case Testing |

### Step 4 — Design test data

For each test case: specify **concrete** values, not "valid email" — write `"alice@example.com"`.
Read `references/test-data.md` for data patterns and generation strategies.

### Step 5 — Structure test cases

Use the **3A format** (Arrange / Act / Assert) or **Given-When-Then** (BDD).
Every test case must have:
- Unique ID
- Preconditions (Arrange / Given)
- Action (Act / When)
- Expected result (Assert / Then)
- Test data (concrete values)
- Priority (P1 smoke / P2 regression / P3 edge)

---

## Test Case Template

```markdown
## TC-{ID}: {Descriptive name}

**Priority:** P1 / P2 / P3
**Level:**    Unit | Component | Integration | API | E2E
**Technique:** BVA | EP | Decision Table | State Transition | Error Guessing | …

**Preconditions (Arrange / Given):**
- User is authenticated as role: editor
- Product "SKU-001" has stock = 5

**Action (Act / When):**
- POST /api/orders { userId: "u-123", items: [{ productId: "SKU-001", qty: 5 }] }

**Expected Result (Assert / Then):**
- HTTP 201
- Body: { orderId: <uuid>, total: 24900, status: "confirmed" }
- DB: inventory.stock for SKU-001 = 0
- Event: order.created published to queue

**Test Data:**
| Field      | Value             | Why |
|------------|-------------------|-----|
| userId     | "u-123"           | Valid authenticated user |
| productId  | "SKU-001"         | In-stock item |
| qty        | 5                 | Exactly available stock (boundary) |

**Notes / Risk:** Boundary — qty equals exact stock. Tests atomicity of stock decrement.
```

---

## Coverage Matrix

Track coverage across dimensions before declaring done:

```markdown
| Test Area           | Unit | Integration | API | E2E | Covered? |
|---------------------|------|-------------|-----|-----|----------|
| Happy path          |  -   |      -      |  ✓  |  ✓  |    ✓     |
| Validation errors   |  ✓   |      -      |  ✓  |  -  |    ✓     |
| Auth / authz        |  -   |      -      |  ✓  |  ✓  |    ✓     |
| Boundary values     |  ✓   |      -      |  ✓  |  -  |    ✓     |
| State transitions   |  ✓   |      ✓      |  -  |  -  |    ✓     |
| Error / failure     |  ✓   |      ✓      |  ✓  |  -  |    ✓     |
| Performance         |  -   |      -      |  ✓  |  -  |    ✗     |
| Security            |  -   |      -      |  ✓  |  -  |    ✗     |
```

---

## Decision checklist (before finalising a test suite)

- [ ] Is the SUT clearly defined with all inputs, outputs, and boundaries named?
- [ ] Is the happy path covered end-to-end at least at the API or E2E level?
- [ ] Are all input fields covered with EP partitions (valid, invalid, boundary)?
- [ ] Are state transitions covered (every valid + invalid transition)?
- [ ] Are error responses tested with concrete assertions (status code + body shape)?
- [ ] Is authentication tested: unauthenticated, wrong role, token expired?
- [ ] Are concurrent / idempotency cases considered (duplicate submit, race condition)?
- [ ] Are all test cases at the right level (unit for logic, E2E for critical journeys only)?
- [ ] Does every test case have concrete, reproducible test data?
- [ ] Are tests independent — no shared mutable state between cases?

---

## Response format

1. **SUT summary** — restate what you understand is being tested and its key boundaries.
2. **Business flow map** — happy path + alt flows + exception flows (brief list).
3. **Test cases** — structured using the template above, grouped by flow or level.
4. **Coverage matrix** — which areas are covered and at which level.
5. **Gaps / risks** — what's not covered and why it matters (or doesn't).

For large SUTs, produce the coverage matrix and flow map first, then generate test cases
in priority order (P1 smoke → P2 regression → P3 edge cases).

---


## Artifacts Produced

Save output files at these paths before handing off:

- `docs/{feature}/{version}/test-cases.md` — the whole TC-xxx suite in **one** document
- `docs/overview/test-strategy.md` — living strategy doc, stays Markdown

See `skill-orchestrator` for the full project path structure.

> **Repo house rule (Cadence) — artifacts are structured Markdown.**
> Phase artifacts live at `docs/{feature}/{version}/test-cases.md` — one file per phase, Markdown with
> YAML front matter. Follow the conventions in `.claude/skills/solution-planner/SKILL.md`.

Give every test case an anchor on its heading (`### TC-U-001`), so
`test-report.md#tc-u-001` and the automation suite's test titles can cite it directly.

## Skill hand-offs

### ← domain-contract-designer (upstream — distributed systems)
When `domain-contract.yaml` files exist, read them before designing any test suite.
The contract eliminates the need to reverse-engineer API shapes, SLA targets, or
event schemas from source code or documentation.

**Hand-off rule:** Phase 2.5 approved → Phase 3 begins by loading all contract files
from `contracts/domain-*.yaml` and running the contract test checklist above.

### ← solution-architecture (upstream — all systems)
Architecture decisions (bounded contexts, consistency model, threat model) drive
the test strategy. Read ADRs before selecting test levels for cross-domain flows.

### → software-tester-automation (Phase 7)
Pass the completed TC-xxx suite. Each TC must have: ID, level, concrete test data,
and expected assertions. `software-tester-automation` converts TCs into runnable code.
Contract tests (Pact) and k6 scripts use SLA thresholds from `domain-contract.yaml`.

**Scope boundary:** This skill's job ends when the TC-xxx suite is approved.
Running tests, reading results, triaging failures, and signing off quality
are handled by `software-tester-execution` in Phase 8.

### → software-tester-execution (Phase 8)
After `software-tester-automation` has produced a green test suite, pass:
- Approved TC-xxx suite (design spec, not code)
- Test automation results (pass/fail per TC)
- `contracts/domain-*.yaml` (for SLA comparison)
`software-tester-execution` owns execution, defect triage, and phase sign-off.
