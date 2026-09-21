# Phases Reference

Each phase section defines: objective, specialist skill, inputs required, process steps,
deliverable format, and the gate review checklist the human must approve before proceeding.

---

## Phase 1 — Requirements Gathering

**Objective:** Capture and baseline what needs to be built — no architecture, no code.

**Skill:** `requirements-engineering`

**Inputs:** User's initial description of what they want to build.

**Process:**
1. Run the Story Mapping session (Step 0 of requirements-engineering):
   - Identify user activities (backbone)
   - Decompose into tasks (walking skeleton)
   - Slice into releases (MVP line)
2. For each story in the MVP slice, write:
   - User story card (As a / I want / So that)
   - Acceptance criteria (Given / When / Then)
   - Explicit out-of-scope exclusions
3. Document NFRs: performance thresholds, availability, security, compliance.
4. Produce a User Flow for the primary business journey.

**Deliverable format:**
```markdown
## Phase 1 Deliverable — Requirements Baseline

### Story Map (MVP slice)
[backbone → walking skeleton table]

### User Stories — Release 1
#### US-001: [Title]
As a [role], I want [goal], so that [value].
Acceptance Criteria:
  ✓ Given … When … Then …
  ✗ Out of scope: …

### Non-Functional Requirements
| ID     | Category     | Requirement                                  |
|--------|--------------|----------------------------------------------|
| NFR-01 | Performance  | p95 response ≤ 500ms under 100 concurrent    |

### Primary User Flow
[table: Step | Actor | Action | Response | Decision | Notes]

### Open Questions
- [ ] …
```

**Gate 1 checklist:**
- [ ] All MVP stories have acceptance criteria with Given/When/Then
- [ ] Out-of-scope items explicitly named per story
- [ ] NFRs have measurable thresholds (no "must be fast")
- [ ] Primary user flow covers happy path + 2 exception paths
- [ ] No architectural decisions embedded in requirements
- [ ] Open questions captured
- [ ] Human has read and agrees the scope is correct

---

## Phase 2 — System Analysis & Design

**Objective:** Translate requirements into a concrete system design with documented decisions.

**Skill:** `solution-architecture`

**Inputs:** Approved Phase 1 deliverable (story map, stories, NFRs, user flow).

**Process:**
1. Extract quality attributes from NFRs → feed into architecture selection.
2. Identify bounded contexts from the story map activities.
3. Select architecture style (monolith vs microservices vs event-driven) with justification.
4. Map bounded contexts to services / modules.
5. Define API contracts (endpoint shapes, event schemas).
6. Produce ADRs for every significant decision.
7. Produce a service map.

**Deliverable format:**
```markdown
## Phase 2 Deliverable — System Design

### Architecture Style
[chosen style + one-paragraph justification referencing NFRs]

### Bounded Contexts
| Context | Responsibilities | Owns |
|---------|-----------------|------|

### Service / Module Map
[Service A] --sync REST--> [Service B]
[Service A] --async event--> [Event Bus] --> [Service C]

### API Contracts (summary)
| Endpoint                | Method | Request shape   | Response shape  | Auth |
|-------------------------|--------|-----------------|-----------------|------|
| /api/orders             | POST   | {items[]}       | {orderId,total} | JWT  |

### Event Schemas (if event-driven)
| Event              | Producer    | Consumer(s)  | Payload shape   |
|--------------------|-------------|--------------|-----------------|

### ADRs
#### ADR-001: [Title]
Status: Proposed
Context: …
Decision: …
Consequences: …
Alternatives: …

### Technology Choices
| Layer      | Technology | Rationale |
|------------|------------|-----------|
| Backend    | NestJS (REST)        | …         |
| Frontend   | React SPA (Vite)     | …         |
| Database   | PostgreSQL | …         |
```

**Gate 2 checklist:**
- [ ] Every NFR maps to an architectural decision
- [ ] All bounded contexts named with clear ownership
- [ ] ADR produced for every non-obvious technology or pattern choice
- [ ] API contracts defined (method, path, request/response shape, auth)
- [ ] Service map shows sync vs async communication
- [ ] No implementation detail (no code, no file names)
- [ ] Human agrees the design matches their vision

---

## Phase 3 — Test Design & Test Data

**Objective:** Produce structured, implementation-independent test cases ready for automation.

**Skill:** `software-tester-design`

**Inputs:** Approved Phase 1 (stories + AC) + Phase 2 (API contracts, service map, ADRs).

**Process:**
1. For each story's acceptance criteria, identify the SUT and its input/output boundaries.
2. Apply test design techniques per input field: EP, BVA, Decision Tables, State Transition.
3. Map stories to test levels: unit for logic, API for contracts, E2E for critical journeys.
4. Design concrete test data (factories, boundary values, negative cases).
5. Apply error guessing to API contracts and user flows.
6. Produce the coverage matrix.
7. Flag security and performance TCs from NFRs.

**Deliverable format:**
```markdown
## Phase 3 Deliverable — Test Suite Design

### Coverage Matrix
| Area              | Unit | Component | API | E2E | Security | Perf |
|-------------------|------|-----------|-----|-----|----------|------|
| [story name]      |  ✓   |     ✓     |  ✓  |  ✓  |          |      |

### Test Cases

#### TC-API-01: [Name]
Priority: P1
Level: API
Technique: Use Case / BVA
Preconditions: …
Action: POST /api/orders { … }
Expected: HTTP 201, body {orderId, total}, stock decremented
Test Data: | Field | Value | Why |

[... all TCs ...]

### Test Data Specification
[factories, boundary value tables, seed data requirements]

### Gaps & Risks
- [What's not covered and why]
```

**Gate 3 checklist:**
- [ ] Every AC has at least one TC-xxx
- [ ] Every TC has concrete test data (no "valid email" — actual values)
- [ ] Happy path, validation errors, auth/authz, and edge cases all covered
- [ ] State transitions tested (valid + invalid)
- [ ] Security TCs for auth bypass and injection present
- [ ] Performance TCs reference NFR thresholds
- [ ] Coverage matrix shows no unexplained gaps
- [ ] Human agrees test coverage is sufficient

---

## Phase 4 — Task Breakdown

**Objective:** Decompose the approved design into an ordered, sprint-ready engineering backlog.

**Skill:** This skill (orchestrator) — read `references/task-breakdown.md`.

**Inputs:** Approved Phase 1 (stories), Phase 2 (design), Phase 3 (TCs).

**Process:**
1. For each bounded context / service, create implementation tasks.
2. Assign each task a type: `infra` | `schema` | `domain` | `api` | `ui` | `test`.
3. Identify dependencies between tasks (nothing builds on a missing foundation).
4. Group into sprints based on dependency order.
5. Assign story points and risk flags.

**Deliverable format:** See `references/task-breakdown.md`.

**Gate 4 checklist:**
- [ ] Every story from Phase 1 has at least one implementation task
- [ ] Every TC from Phase 3 has a corresponding automation task
- [ ] Dependencies are explicit — no task references something not yet built
- [ ] Sprint 1 = infrastructure + schema only (no feature code)
- [ ] No task is larger than 3 days estimated
- [ ] Human agrees the breakdown is correct and complete

---

## Phase 5 — Software Orchestration

**Objective:** Define the exact build order, interface contracts between engineers, and
parallel work streams so FE and BE can build concurrently without blocking each other.

**Skill:** This skill (orchestrator) — read `references/sw-orchestration.md`.

**Inputs:** Approved Phase 4 task backlog.

**Process:**
1. Define the API contract as a shared interface (NestJS DTOs → OpenAPI spec → generated client types).
2. Split into parallel work streams: Backend track, Frontend track, Test track.
3. Identify the critical path (what blocks everything else).
4. Define mock/stub strategy so FE can work before BE is complete.
5. Define integration checkpoints (when FE + BE connect for the first time).

**Deliverable format:** See `references/sw-orchestration.md`.

**Gate 5 checklist:**
- [ ] API contracts are fully typed (request + response + error shapes)
- [ ] Frontend mock strategy defined (MSW handlers match API contract)
- [ ] Backend and frontend tracks are independent — no blocking dependency
- [ ] Integration checkpoint defined (which task triggers FE+BE connect)
- [ ] Test track has tasks scheduled throughout (not just at the end)
- [ ] Human agrees the parallel plan is executable

---

## Phase 6 — Engineering (Frontend + Backend)

**Objective:** Implement the approved design following specialist skill patterns.

**Parallel execution:** Phase 6a (Frontend) and 6b (Backend) run simultaneously.
Each is gated independently — both must reach APPROVED before Phase 7 begins.

### Phase 6a — Frontend Engineering

**Skill:** `react-vite-developer`

**Inputs:** Phase 5 API contract (OpenAPI-generated client types), MSW mock strategy,
Phase 3 TCs for UI.

**Process:**
1. Build routes with React Router; code-split at the route level.
2. Fetch through TanStack Query using the client types generated from the NestJS OpenAPI spec.
3. Implement forms with React Hook Form + Zod validation matching AC.
4. Point TanStack Query at MSW mocks initially; swap to the real API at the integration checkpoint.
5. Ensure all components pass accessibility checklist (WCAG 2.1 AA).

**Gate 6a checklist:**
- [ ] All UI acceptance criteria implemented
- [ ] Forms validate all fields per TC specs
- [ ] Loading, error, and empty states all handled
- [ ] No TypeScript `any`; API types come from the generated client, not hand-written
- [ ] Accessibility: all interactive elements keyboard-navigable
- [ ] Human reviews UI and agrees it matches requirements

### Phase 6b — Backend Engineering

**Skill:** `software-engineer-backend`

**Inputs:** Phase 5 API contract, DB schema from Phase 4, Phase 3 TCs for API.

**Process:**
1. Implement the Nest module: providers for business logic, no I/O in domain services.
2. Implement the data layer with Drizzle; metric logic belongs in SQL views, not TypeScript.
3. Implement controllers + DTOs, decorated with `@nestjs/swagger` so the OpenAPI spec stays current.
4. Add validation (class-validator), guards, and rate limiting.
5. Add observability (structured pino logs, per-run/per-project counters).

**Gate 6b checklist:**
- [ ] All API endpoints implemented per Phase 5 contract
- [ ] All domain logic has unit tests (mocked providers, no I/O)
- [ ] OpenAPI spec regenerated and the web client types updated
- [ ] Auth guard on every protected endpoint
- [ ] Observability: every handler emits a trace span
- [ ] Human reviews code and agrees it matches design

---

## Phase 7 — Test Automation

**Objective:** Turn every TC-xxx from Phase 3 into runnable automated test code.

**Skill:** `software-tester-automation`

**Inputs:** Approved Phase 3 TCs, Phase 6 implemented code.

**Process:**
1. Implement unit tests (Vitest) for all unit-level TCs.
2. Implement backend component tests (testcontainers) for repository TCs.
3. Implement Bruno `.bru` files for all API TCs.
4. Implement RTL component tests for all frontend TCs.
5. Implement Playwright E2E for all P1 E2E TCs.
6. Run full suite — all tests must be green before gate.

**Gate 7 checklist:**
- [ ] Every TC-xxx has a corresponding automated test
- [ ] All tests green locally and in CI
- [ ] TC-IDs present in test names
- [ ] No hardcoded IDs — all use factories
- [ ] Side effects asserted (DB state, events, headers)
- [ ] Human reviews test output (coverage report + CI run)

---

## Phase 8 — Software Testing (Execution & Sign-off)

**Objective:** Execute the test suite, triage defects, and reach sign-off.

**Skill:** `software-tester-design` (execution mode) + `software-tester-automation`

**Inputs:** Approved Phase 7 automated suite, full system running in staging.

**Process:**
1. Run full automated suite against staging.
2. Conduct exploratory testing on P1 flows.
3. Run accessibility audit (axe).
4. Triage any failures — read `references/defect-triage.md`.
5. Fix defects → re-run affected TCs → document results.
6. Produce test execution report.

**Gate 8 checklist (Definition of Done):**
- [ ] All P1 tests pass
- [ ] All P2 tests pass (or have accepted deferrals with rationale)
- [ ] Zero open P1 defects
- [ ] Accessibility audit passes WCAG 2.1 AA
- [ ] Test execution report signed off
- [ ] Human gives final APPROVE → feature is Done

---

## Re-entry rules

If a defect found in Phase 8 requires code changes:
- Severity P1 → re-enter Phase 6 (rework) → re-run Phase 7 → re-run Phase 8
- Severity P2 → log as tech debt task; may defer to next sprint with human approval
- Design flaw (wrong behaviour, not a bug) → re-enter Phase 1 or 2 depending on scope
- Test gap found → re-enter Phase 3 → update Phase 7

Always document the re-entry reason and update the pipeline state block.
