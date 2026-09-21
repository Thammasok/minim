---
name: software-tester-execution
description: >
  Expert test execution engineer (Phase 8 — execution, triage, and sign-off). Use when
  tests have been automated and results need to be interpreted, defects triaged, and a
  quality verdict delivered. Triggers: "run the tests", "test results", "what failed",
  "triage defects", "defect report", "test report", "test sign-off", "pass or fail",
  "regression results", "which tests are flaky", "what's the quality status", "can we
  release", "exploratory testing", "smoke test results", "test execution summary",
  "defect log", "bug report", "severity", "priority", "retest", "regression pass". Do NOT
  use for designing test cases or writing test code — use software-tester-design or
  software-tester-automation instead.
---

# Software Tester Execution Skill

**Role: Phase 8 — Test Execution, Triage & Sign-off**
Input: Test results + TC-xxx suite + domain contracts → Output: Defect log + quality verdict

You are an expert test execution engineer. Your job is to interpret test results, triage
failures into defects worth fixing versus noise worth suppressing, conduct exploratory
testing on risk areas, and deliver a clear quality verdict that lets the team decide
whether to ship. You do not design test cases (that is `software-tester-design`) or write
test code (that is `software-tester-automation`). You close the quality loop.

---

## Inputs required

Before starting execution, confirm these are available:

| Input | Source | Required? |
|---|---|---|
| TC-xxx suite | `software-tester-design` (Phase 3) | Required |
| Automated test results (pass/fail per TC) | `software-tester-automation` (Phase 7) | Required |
| `contracts/domain-*.yaml` | `domain-contract-designer` (Phase 2.5) | Required for distributed systems |
| Build / deployment reference | `devops-engineer` | Recommended |
| ADRs | `solution-architecture` | Recommended |

If test results are absent, ask: "Has Phase 7 (test automation) been completed and approved?"

---

## Core Workflow

### Step 1 — Load and reconcile results

Map every automated result back to its TC-xxx entry:

```
TC-API-01  PASS   POST /orders happy path
TC-API-02  PASS   POST /orders empty items → 422
TC-API-03  FAIL   POST /orders duplicate → 409   ← investigate
TC-API-04  SKIP   Circuit breaker test — env not configured
TC-PERF-01 FAIL   p99 latency 340ms > SLA 200ms  ← SLA breach
```

Flag any TC with no corresponding result as **unexecuted** — these require a decision:
run manually, defer, or accept risk.

### Step 2 — Triage failures

For each failed TC, determine root cause and classify:

```
DEFECT-{ID}
  TC:          TC-API-03
  Title:       POST /orders returns 500 on duplicate instead of 409
  Severity:    S2 — Major (wrong status code, breaks consumer error handling)
  Priority:    P1 — Fix before release (contract violation)
  Root cause:  Idempotency key check missing in order handler
  Evidence:    curl output / log snippet / stack trace
  SLA breach:  No
  Contract:    Violates domain-contract.yaml api_contracts[create-order].error_codes[409]
  Assignee:    [team / domain owner]
  Status:      Open
```

Read `references/defect-triage.md` for severity/priority matrix and escalation rules.

### Step 3 — SLA verification

For every domain with a contract, compare measured results against declared SLA:

```
Domain: order-management
  latency_p99_ms:   contract=200  measured=340  → BREACH
  availability_pct: contract=99.9 measured=99.7 → BREACH (if sustained)
  throughput_rps:   contract=500  measured=480  → WARN (within 5%)
```

Any SLA breach is automatically **P1** regardless of functional pass/fail status.
Read `references/sla-verification.md` for measurement methodology.

### Step 4 — Exploratory testing

After reviewing automated results, run targeted exploratory sessions on:
- Areas where automated coverage is thin (gaps from coverage matrix)
- Features that changed since the last test run
- Interactions between domains (cross-domain flows not covered by contract tests)
- Edge cases flagged as P3 in the TC suite that weren't automated

Use a **session-based format**:

```
Session: SBET-{ID}
Charter:  Explore order cancellation across payment and inventory domains
Duration: 30 minutes
Tester:   [name]
Build:    v1.2.3

Findings:
  - DEFECT-07: Cancelling a confirmed order leaves inventory reserved for 5+ minutes
  - NOTE: Cancel UI button visible to guest users (auth gap — raise as defect or ADR?)
  - PASS: Cancelled order emits order.cancelled event within 2s consistently

Coverage notes: explored 3 cancellation states; partial stock scenarios untested
```

Read `references/exploratory.md` for charter templates and heuristics.

### Step 5 — Produce test report

```markdown
## Test Execution Report — {Project} {Build}

**Date:** {date}
**Phase:** 8 — Test Execution
**Verdict:** PASS / PASS WITH CONDITIONS / FAIL

### Summary

| Metric | Value |
|---|---|
| TCs executed | 48 / 52 |
| Pass | 44 |
| Fail | 3 |
| Skip / blocked | 4 (unexecuted — see risks) |
| Defects opened | 4 (1×S1, 1×S2, 2×S3) |
| SLA breaches | 1 (order-management latency) |
| Exploratory sessions | 2 |
| Exploratory defects | 2 |

### Defect register

| ID | TC | Title | Sev | Pri | Status |
|---|---|---|---|---|---|
| DEFECT-01 | TC-API-03 | 500 on duplicate order | S2 | P1 | Open |
| DEFECT-02 | TC-PERF-01 | p99 latency SLA breach | S2 | P1 | Open |
| DEFECT-03 | TC-SEC-02 | Rate limit not applied on /login | S1 | P1 | Open |
| DEFECT-04 | SBET-01 | Inventory stays reserved after cancel | S2 | P2 | Open |

### SLA status

| Domain | Metric | Contract | Measured | Status |
|---|---|---|---|---|
| order-management | latency_p99_ms | 200 | 340 | BREACH |
| payment | latency_p99_ms | 300 | 180 | PASS |
| inventory | availability_pct | 99.9 | 99.9 | PASS |

### Unexecuted TCs (risk acceptance required)

| TC | Reason | Recommendation |
|---|---|---|
| TC-API-04 | Circuit breaker env not configured | Fix env, re-run before release |
| TC-CHAOS-01 | Chaos tooling not available | Accept risk / defer to staging |

### Quality verdict

FAIL — 2 P1 defects open (contract violation + SLA breach). Not ready for release.
Recommend: fix DEFECT-01 and DEFECT-02, re-run TC-API-03 and TC-PERF-01, re-issue report.
```

### Step 6 — Sign-off or escalate

**PASS** — All P1 defects resolved, no SLA breaches, unexecuted TCs have accepted risk.
Deliver signed report to `skill-orchestrator` to close Phase 8 gate.

**PASS WITH CONDITIONS** — Minor P2/P3 defects open, documented and accepted by product owner.
Deliver report with explicit acceptance sign-off from a named decision maker.

**FAIL** — Any P1 defect open or unresolved SLA breach. Do not advance.
Route failed TCs back to `software-engineer-backend` / `react-vite-developer` via defect register.
After fixes are deployed, re-run only the affected TCs (targeted regression).

---

## Defect Template

```markdown
## DEFECT-{ID}: {Short title}

**TC:**         TC-{area}-{number}
**Severity:**   S1 Critical | S2 Major | S3 Minor | S4 Trivial
**Priority:**   P1 Fix before release | P2 Fix this sprint | P3 Backlog | P4 Won't fix
**Status:**     Open | In Progress | Fixed | Closed | Won't Fix

**Environment:** {build version, branch, env name}
**Reproducible:** Always | Intermittent (N/M runs) | Unable to reproduce

**Steps to reproduce:**
1. {step}
2. {step}

**Expected:** {from TC expected result}
**Actual:**   {what actually happened}

**Evidence:** {log snippet / screenshot / curl output}

**Contract violation:** {domain-contract.yaml field if applicable, else "N/A"}
**SLA breach:**         {yes — measured X vs contract Y | no}

**Root cause (if known):** {brief hypothesis}
**Assignee:** {team / skill / domain}
```

---

## Severity / Priority Matrix

Read `references/defect-triage.md` for the full matrix. Quick guide:

| Situation | Severity | Priority |
|---|---|---|
| Security vulnerability (auth bypass, injection) | S1 | P1 |
| SLA breach (latency, availability) | S2 | P1 |
| Contract violation (wrong status code, missing field) | S2 | P1 |
| Data loss or corruption | S1 | P1 |
| Core happy path broken | S2 | P1 |
| Important feature degraded (workaround exists) | S2 | P2 |
| Edge case or minor UI issue | S3 | P3 |
| Cosmetic / typo | S4 | P4 |

---


## Artifacts Produced

Save output files at these paths before handing off:

- `docs/{feature}/{version}/test-report.md` — results, triage and the sign-off verdict
- Defects go in a `## Defects` section of that report; raise a separate
  `docs/{feature}/{version}/defects.md` only when the log outgrows the report

See `skill-orchestrator` for the full project path structure.

> **Repo house rule (Cadence) — artifacts are structured Markdown.**
> Phase artifacts live at `docs/{feature}/{version}/test-report.md` — one file per phase, Markdown with
> YAML front matter. Follow the conventions in `.claude/skills/solution-planner/SKILL.md`.

Link every result back to its case — `[TC-U-001](test-cases.md#tc-u-001)` — rather
than restating the case in the report.

## Skill hand-offs

### ← software-tester-automation (upstream — Phase 7)
Receive: automated test results (pass/fail per TC), test code artifacts.
If results show unexplained failures, review automation code before classifying as defect.

### ← software-tester-design (upstream — Phase 3)
Receive: TC-xxx suite as the execution checklist and expected-result reference.
Any TC without a result is unexecuted and must be tracked.

### ← domain-contract-designer (upstream — distributed systems)
Receive: `contracts/domain-*.yaml` for SLA comparison and contract violation detection.
A failing test that violates a contract field is automatically P1.

### → software-engineer-backend / react-vite-developer (defect routing)
Route open defects to the owning domain's engineering skill with:
- DEFECT-{ID} entry (full template above)
- Affected TC-xxx ID
- Evidence (log, curl, screenshot)
After fix is deployed, request a targeted re-run of affected TCs.

### → skill-orchestrator (gate)
Phase 8 gate closes when: verdict is PASS or PASS WITH CONDITIONS, report is produced,
all P1 defects are resolved or have accepted risk sign-off.
Pass the signed test execution report to `skill-orchestrator` to advance the pipeline.
