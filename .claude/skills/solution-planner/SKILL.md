---
name: solution-planner
description: "Expert Solution Planner for software projects — runs a structured 4-phase pipeline (Requirements Gathering → System Design → UX/UI Design → Development Plan with TDD test cases) and produces machine-readable artifacts for downstream AI agents to consume. Use this skill whenever the user mentions: requirements, user stories, functional spec, system design, architecture, ERD, API design, task breakdown, development plan, sprint plan, WBS, test scenarios, test cases, test data, TDD, unit test design, API testing, integration testing, or asks to 'plan a feature', 'design a system', 'break down this project', 'create a dev plan', 'gather requirements', 'define scope', 'plan a sprint', 'design test cases', or 'prepare tasks for development'. Always trigger for any project planning, scoping, architecture, or test design task — even without the words 'solution planner'. Each phase produces a standalone artifact saved to docs/[feature-name]/v[version]/ so work can be paused and resumed at any phase boundary."
---

# Solution Planner

A 4-phase pipeline that takes a feature or project idea from raw input to a machine-readable development plan ready for an AI Orchestrator to distribute to developer agents.

## How to Use This Skill

Work through phases **sequentially**. Each phase ends with a saved artifact. You can stop after any phase and resume later by loading the artifact.

```
Phase 1: Requirements Gathering  →  docs/[feature-name]/v[version]/requirements.md
Phase 2: System Design           →  docs/[feature-name]/v[version]/design.md
Phase 3: UX/UI Design            →  docs/[feature-name]/v[version]/ux-design.md  ← skip for backend-only features
Phase 4: Development Plan        →  docs/[feature-name]/v[version]/dev-plan.md   ← Orchestrator entry point
```

**Artifact path rules:**
- `[feature-name]` — kebab-case name (e.g. `customer-health-claims`, `user-auth`)
- `[version]` — matches the `version:` field, prefixed with `v` (e.g. `v1.0`, `v1.1`)
- All artifacts share one directory: `docs/[feature-name]/v[version]/`
- New version = new directory — never overwrite a previous version
- The directory depth is **fixed** — every artifact is exactly two levels below `docs/`, which is what makes the relative asset path in the skeleton below work unchanged in every slice

Before starting, ask the user:
1. Greenfield or existing system?
2. Which phase to start from? (if resuming, ask for the artifact directory path)
3. What is the feature/project in one sentence?

---

## Artifact Format — Markdown

**All four phase artifacts are written as `.md`** (Markdown), kept in the project as version-controlled documentation.

### Conventions

| Convention | Why |
|---|---|
| Give every identifier — `FR-001`, `UC-001`, `NFR-001`, `T-001`, `TC-U-001` — a heading anchor | Makes `design.md#fr-003` a working cross-artifact link. Later phases cite earlier requirements by anchor instead of restating them. |
| Use consistent heading levels | `#` for title, `##` for major sections, `###` for subsections |
| Acceptance criteria use task list syntax `- [ ]` | Clear, readable, and can be checked off manually |
| Mermaid diagrams use fenced code blocks with `mermaid` language | Renders in most Markdown viewers (GitHub, VS Code, etc.) |
| Keep metadata at the top of each file | Front matter for version, status, date, and dependencies |

---

## Phase 1 — Requirements Gathering

**Goal:** Produce a complete, unambiguous requirements artifact.

**Steps:**
1. Run a structured elicitation session (see `refs/requirements-guide.md`)
2. Identify: actors, use cases, functional requirements, non-functional requirements, constraints, out-of-scope
3. Surface and resolve ambiguities before moving on
4. Write `docs/[feature-name]/v[version]/requirements.md`

> **If the feature has an LLM in it**, an NFR like "answers must be accurate" is unbuildable. Pin
> the success signal here — the eval set, the metric, and the threshold that counts as passing —
> plus a token budget and a p95 latency target. The `ai-engineer` skill treats an unevaluated LLM
> feature as a liability rather than a feature, and Phase 2 cannot choose a mechanism without a
> bar to measure it against.

**Output contract**:

```markdown
---
version: 1.0
status: draft
date: YYYY-MM-DD
---

# Requirements: [Feature/Project Name]

## Actors

- **[Actor]** — [role description]

## Use Cases

- **UC-001** — **[title]** — [description]

## Functional Requirements

- **FR-001** — The system SHALL [behaviour] when [condition]

## Non-Functional Requirements

- **NFR-001** — **[type]** — [requirement with a measurable threshold]

## Constraints

- [constraint]

## Out of Scope

- [item]
```

✅ **Phase gate:** Confirm with user. Save to `docs/[feature-name]/v[version]/requirements.md`.

---

## Phase 2 — System Design

**Goal:** Translate requirements into a concrete technical design.

**Steps:**
1. Read `requirements.md` (or ask user for the path)
2. Select architecture and design patterns (see `refs/design-patterns.md`)
3. **If any part of the feature prompts a model, retrieves for one, calls tools on its behalf, or
   is judged by one** — invoke the `ai-engineer` skill for that part and record its output as ADRs
   here, not in the engineering task:
   - the mechanism chosen on the **prompt → RAG → fine-tune → agent** ladder, and the measured gap
     that justifies each escalation past the cheapest one that meets the bar
   - the token budget and the p95 latency target the design is held to
   - the eval strategy — golden set, metric, threshold — that proves it works
   - the provider abstraction, so the model can be swapped without reshaping the app
4. Produce: component diagram, data model, API contracts, key decisions
5. Write `docs/[feature-name]/v[version]/design.md`

**Output contract**:

```markdown
---
version: 1.0
status: draft
date: YYYY-MM-DD
requires: requirements.md
---

# System Design: [Feature/Project Name]

## Architecture Overview

```mermaid
flowchart LR
  …
```

## Components

| Component | Responsibility |
|-----------|----------------|
| [Component] | [responsibility] |

## Data Model

```
[ERD or table definitions]
```

## API Contracts

### [Endpoint]

- **Method / Path** — `GET /path`
- **Request** — […]

```json
{ "response": "shape" }
```

- **Errors** — […]

## Key Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| ADR-001: … | … | … | … |

## Dependencies

- **[external service/library]** — [why needed]
```

Cite requirements by anchor — `[FR-003](requirements.md#fr-003)` — rather than restating them.

✅ **Phase gate:** Confirm with user. Save to `docs/[feature-name]/v[version]/design.md`.

---

## Phase 3 — UX/UI Design

**Goal:** Produce approved wireframes and developer-ready component specs before the dev plan is written. Engineering tasks in Phase 4 will reference these specs directly.

**When to run:** Run for any feature with user-facing screens, components, or UI flows. **Skip this phase for backend-only features** (no screens, no UI changes) and proceed directly to Phase 4.

**Design source of truth:** This project's screens are already designed as shadcn/ui-based HTML
mockups in `.claude/design/`. Do not invent new colors, radii, or component conventions — this
phase maps requirements to what already exists there, and only produces new lo-fi/hi-fi specs for
screens or states the mockups don't cover.

- `.claude/design/Diatome Requirements.dc.html` — authoritative functional spec; read the
  relevant numbered section for the feature before speccing any screen
- `.claude/design/Diatome {Screen}.dc.html` — per-screen mockups (Login, Signup, Verify
  Email, Forgot/Reset Password, Dashboard, Portfolio, Cashflow, Budget, Sidebar, Topbar)
- `.claude/design/diatome-theme.css` — shadcn/ui theme tokens (colors, chart palette,
  sidebar tokens); reuse existing tokens rather than picking new values
- `.claude/design/Theme Preview.dc.html` — rendered preview of the theme tokens above

**Steps:**
1. Read `requirements.md` + `design.md`
2. Identify which `.claude/design/*.dc.html` mockup(s) cover the screens in scope; read the
   matching section of `Diatome Requirements.dc.html` for field-level/edge-case detail
3. Produce lo-fi wireframes and hi-fi component specs **only** for new screens, states, or
   variations not already covered by the existing mockups — reference the existing mockup file
   directly for anything it already covers instead of re-specifying it
4. For critical or complex new flows, also invoke design review
5. Confirm with user that designs are approved before proceeding to Phase 4
6. Write `docs/[feature-name]/v[version]/ux-design.md`

**Lo-fi wireframe rules:**
- Structure and layout only — no colors, no typography styling
- Every **new** screen or state in scope must be wireframed (happy path + error + empty states);
  screens fully covered by an existing `.dc.html` mockup can be referenced by filename instead
- Annotate key interactions, user flow, and layout intent
- ASCII wireframes go inside `<pre>` so their alignment survives

**Hi-fi component spec rules:**
- Map every element to a specific shadcn/ui component with exact `variant` and `size`, consistent
  with how the existing mockups in `.claude/design/` use that component
- Specify Tailwind CSS v4 classes per element, using theme tokens from `diatome-theme.css`
  (e.g. `--primary`, `--chart-1..5`, `--sidebar-*`) rather than hardcoded colors
- Define all interactive states: default, hover, focus, disabled, error, loading
- Specify responsive breakpoints (mobile → tablet → desktop layout changes)
- Document accessibility requirements (WCAG AA contrast, aria roles, keyboard nav)

**Design review rules (optional — use for critical flows only):**
- Evaluate using Nielsen's 10 heuristics; score each issue 1–4
- Verify WCAG AA contrast on all text and interactive elements
- Confirm keyboard navigation flow
- Block Phase 4 if any critical (score 4) or major (score 3) issue is unresolved

**Output contract**:

```markdown
---
version: 1.0
status: approved
date: YYYY-MM-DD
requires: design.md
---

# UX/UI Design: [Feature/Project Name]

## Screens in Scope

- **[Screen name]** — [purpose and route]

## Lo-fi Wireframes

### [Screen name]

```
[ASCII wireframe layout]
```

- **Layout notes** — [key structural decisions]
- **User flow** — [happy path → error/empty transitions]
- **Annotations** — [interaction intent per element]

## Hi-fi Component Specs

### [Screen name]

#### Layout

- **Wrapper** — [shadcn/ui component, Tailwind classes]
- **Responsive** — [sm → md → lg layout changes]

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| … | … | … | … | default, hover, focus, disabled, error |

#### Accessibility

- **Contrast** — [ratio for each text/bg pair]
- **ARIA roles** — [roles assigned to interactive elements]
- **Keyboard navigation** — [tab order, focus trap if modal]

## Design Review

### Heuristics (Nielsen)

| # | Heuristic | Issues Found | Score (1–4) | Resolution |
|---|-----------|--------------|-------------|------------|
| … | … | … | … | … |

### Accessibility Audit

- **WCAG AA** — [pass/fail per element]
- **Keyboard flow** — [confirmed/issues]
```

✅ **Phase gate:** Confirm designs are approved with user. Save to `docs/[feature-name]/v[version]/ux-design.md`. Do **not** proceed to Phase 4 until the user confirms approval.

---

## Phase 4 — Development Plan

**Goal:** Break design into concrete, assignable engineering tasks. UX/UI design is already complete (Phase 3 artifact). Engineering tasks embed unit-level TDD specs so the engineer can write code against a clear contract.

**Steps:**
1. Read `requirements.md` + `design.md` + `ux-design.md` (if it exists)
2. Decompose into tasks using WBS (see `refs/task-breakdown.md`)
3. For each engineering task, embed **unit-level** `test_cases` (given/when/then) as the TDD contract
4. Add one `software-tester-design` task (runs in parallel with engineering — no implementation dependency)
5. Add one `software-tester-automation` task (depends on all engineering tasks + the design task)
6. For an LLM feature, add one `ai-engineer` **eval** task — the harness, the golden set, and the
   regression threshold from `design.md`. It is a deliverable of its own, never a line item inside
   the feature task, and it gates the slice the way the test tasks do
7. Assign agent types, set dependencies, initialize all statuses to `backlog`
8. Write `docs/[feature-name]/v[version]/dev-plan.md`

> **No UX/UI tasks in the dev plan.** Lo-fi, hi-fi, and design review were completed in Phase 3. Do NOT add `ux-ui-designer` tasks to the dev plan. Frontend engineering tasks may reference `ux-design.md` in their description but do not `depends_on` any design task — the design is already approved.

**Agent type assignment:**

| Agent | When to assign |
|---|---|
| `software-engineer-backend` | Express/Fastify/NestJS routes, controllers, services, repository-pattern data access, migrations, auth (JWT/OAuth2), messaging, Dockerfile — lives under `src/{domain}/` |
| `react-vite-developer` | Vite + React SPA routes (TanStack Router), components, hooks, state management (Zustand/TanStack Query), shadcn/ui components per the approved `ux-design.html` / `.claude/design/` mockups — lives under `src/frontend/` |
| `ai-engineer` | The AI-specific work the Phase 2 ADRs settled: prompts and prompt templates, structured-output schemas and their validation, the RAG pipeline (chunking strategy, embedding choice, hybrid search, reranking), the agent loop and its tool definitions, guardrails, and the eval harness |
| `software-tester-design` | Designs all formal TC-xxx test cases (unit boundaries, API, E2E, integration) — runs in parallel with engineering tasks; depends only on requirements/design |
| `software-tester-automation` | Converts TC-xxx cases into runnable scripts — depends on ALL engineering tasks + the design task |

> Never assign a task that touches both `src/{domain}/` and `src/frontend/` to a single agent — split into a `software-engineer-backend` task and a `react-vite-developer` task. Backend tasks should follow the layered architecture and conventions in `.claude/skills/software-engineer-backend/SKILL.md` rather than being re-specified here.

> **Split an AI task along the same seam.** `ai-engineer` owns the retrieval *strategy*, the prompt,
> the agent loop, and the eval; `software-engineer-backend` owns the route that calls it, the vector
> database it queries, the queue it runs on, auth, and deployment. "Design the retrieval and stand
> up Qdrant behind an endpoint" is two tasks, not one.

### Task block format — read this before writing the plan

The Orchestrator **edits this file in place**, flipping `status:` as tasks move
`backlog → doing → test → review → done` and adding `blocked_reason:` when a task stalls.

Each task's fields are stored in a YAML-style code block in the same line-oriented format
the Orchestrator already edits — one field per line, `- key: value`. The heading above it carries
the task id as an anchor so other artifacts can link to it.

**Output contract**:

```markdown
---
version: 1.0
status: active
date: YYYY-MM-DD
requires: design.md
ux-design: ux-design.md  # omit if backend-only
---

# Development Plan: [Feature/Project Name]

## Summary

- **Total tasks** — N
- **Estimated effort** — X days
- **Critical path** — [T-001](#t-001) → [T-003](#t-003) → [T-007](#t-007)

## Tasks

### T-001 — [short title — engineering task]

```yaml
- title: [short title]
- description: >
  [what needs to be done and why. For frontend tasks, reference the approved
  ux-design.md component specs directly — e.g. "implement per ux-design.md §Screen Name".]
- agent: software-engineer-backend | react-vite-developer
- depends_on: []
- status: backlog
- size: S | M | L
```

#### Acceptance criteria

- [ ] [binary, testable criterion]

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-001
    scenario: [behaviour being tested]
    given: [precondition / input state]
    when: [action or function call]
    then: [expected output or side effect]
    test_data:
      input: [concrete value]
      expected: [concrete expected result]
  - id: TC-U-002
    scenario: [edge case or error path]
    given: [precondition]
    when: [action]
    then: [expected error or boundary behaviour]
    test_data:
      input: [value]
      expected: [error type or message]
```

**Notes** — [optional context, gotchas, known edge cases]

### T-002 — Design test cases — [feature]

```yaml
- title: Design test cases — [feature]
- description: >
  Using the software-tester-design skill, produce structured TC-xxx test cases covering
  all test levels: unit boundaries, API (happy path + error paths + auth), frontend
  component, and E2E flows. Run Steps 0–4 (SUT definition → business flow → field specs
  → scenarios → test data). Output must be in TC-xxx format for software-tester-automation.
- agent: software-tester-design
- depends_on: []
- status: backlog
- size: S | M | L
```

#### Acceptance criteria

- [ ] SUT definition documented
- [ ] TC-xxx cases cover happy path, boundaries, error paths, and business rules
- [ ] Each TC includes Level, Input, Expected Output, Preconditions, and Mock needed

**Notes** — Runs in parallel with engineering tasks; depends only on requirements/design, not on code.

### T-003 — Automate tests — [feature]

```yaml
- title: Automate tests — [feature]
- description: >
  Using the software-tester-automation skill, convert the TC-xxx cases from T-002 into
  runnable scripts at the appropriate levels (Unit, API, Frontend Component, E2E).
  Run the full suite against the implementation.
- agent: software-tester-automation
- depends_on: [T-001, T-002]
- status: backlog
- size: S | M | L
```

#### Acceptance criteria

- [ ] All TC-* from T-002 automated and passing
- [ ] Coverage >= [threshold]%
- [ ] Test report produced with pass/fail per TC-id

**Notes** — Report "T-XXX done" with the full test report when all TCs pass.

## Status Legend

| Status | Changed By | Meaning |
|--------|-----------|---------|
| `backlog` | Orchestrator | Ready, waiting to be picked up |
| `doing` | Orchestrator / Agent | Agent actively working |
| `blocked` | Agent | Stuck, needs human intervention |
| `test` | Agent | Dev done, needs testing |
| `review` | Agent / Tester | Human must review before advancing |
| `done` | Human | Approved and complete |
```

✅ **Phase gate:** Confirm with user. Then:
1. Save to `docs/[feature-name]/v[version]/dev-plan.md`
2. Append a row to the "Slices under development" table in `docs/todo.md` — the Orchestrator's
   index and the entry signal named in `CLAUDE.md`. Edit that table in place; **never regenerate
   `todo.md`**, which would discard the carried-work table below it:
   ```markdown
   | [Feature Display Name] | v[version] | [dev-plan.md](feature-name]/v[version]/dev-plan.md) | todo | [gate reached] | YYYY-MM-DD |
   ```

---

## General Guidelines

- Acceptance criteria must be binary and testable — flag any that are vague
- `blocked` tasks must include a `blocked_reason` field
- Greenfield: create setup/CI/environment tasks first
- Existing systems: include a discovery/audit task as the first engineering task before any implementation tasks
- Backend-only features: skip Phase 3 entirely; no ux-design.md is created
- LLM behaviour is **evaluated, not asserted**: the golden set, LLM-as-judge rubric, and regression
  thresholds belong to an `ai-engineer` task, while `software-tester-design` / `-automation` keep
  everything deterministic around it. Never write a non-deterministic model output as the `then:` of
  a `TC-U-xxx` — pin the schema, the guardrail, and the fallback instead, and leave quality to the eval
- Every artifact must be well-formed Markdown — valid syntax, no duplicate anchor `id`s, and no internal links pointing at an anchor that does not exist

## Reference Files

| File | When to Read |
|---|---|
| `refs/requirements-guide.md` | Phase 1 — elicitation techniques |
| `refs/design-patterns.md` | Phase 2 — architecture and design decision frameworks |
| `refs/task-breakdown.md` | Phase 4 — WBS, sizing, and task writing guide |
| `refs/test-design-guide.md` | Phase 4 — TC-xxx format and test data strategy |
