# Defect Triage & Rework Loop Reference

## Defect record format

Every defect found in Phase 8 (or earlier) must be recorded before triage:

```markdown
### DEF-{ID}: {Short title}

Found in:    Phase 8 — exploratory testing | automated suite | accessibility audit
Severity:    P1 | P2 | P3
TC ref:      TC-{ID} (if an existing TC caught it) | NEW (if gap in coverage)
Reported by: {tester / automated / human reviewer}

**Steps to reproduce:**
1. …
2. …

**Expected result:** {what should happen per AC}
**Actual result:**   {what actually happened}

**Root cause hypothesis:** {which phase's decision caused this?}
  - P1 defect: logic error in domain → Phase 6b rework
  - P2 defect: missing validation → Phase 6b rework
  - Design flaw: wrong behaviour per requirements → Phase 1 or 2 re-entry
  - Test gap: missing TC → Phase 3 re-entry + Phase 7 update

**Fix:** {description of the fix}
**Re-test TCs:** {list of TCs to re-run after fix}
```

---

## Severity classification

| Severity | Definition | Action |
|----------|------------|--------|
| **P1** | Blocks a critical path (core feature doesn't work, data loss, security breach) | Must fix before Phase 8 gate can close |
| **P2** | Degrades quality but workaround exists (wrong total, poor UX, minor error message) | Fix in current sprint or log as tech debt with human approval to defer |
| **P3** | Cosmetic or low-impact (typo, minor layout issue, non-critical edge case) | Log; fix in next sprint or accept |

---

## Rework decision tree

```
Defect found in Phase 8
        │
        ▼
Is it a code bug (wrong implementation of correct design)?
        │
    YES ─────────────────────────────► Phase 6 rework
        │                               → Fix code
        │                               → Re-run affected TCs (Phase 7)
        │                               → Re-run Phase 8 for that TC
        │
    NO (it's a design problem)
        │
        ▼
Does it contradict the approved API contract (Phase 5)?
        │
    YES ─────────────────────────────► Phase 5 re-entry
        │                               → Revise contract
        │                               → Re-run Phase 6 for affected endpoints
        │                               → Re-run Phase 7 + Phase 8
        │
    NO
        │
        ▼
Does it contradict approved requirements (Phase 1)?
        │
    YES ─────────────────────────────► Phase 1 re-entry
        │                               → Revise story / AC
        │                               → Re-run Phases 2 → 8 for affected scope
        │
    NO
        │
        ▼
Is it a test coverage gap (no TC existed for this scenario)?
        │
    YES ─────────────────────────────► Phase 3 re-entry
                                        → Add TC-xxx
                                        → Add automation in Phase 7
                                        → Re-run Phase 8
```

---

## Rework notification to human

When re-entry is required, present this before proceeding:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 REWORK REQUIRED — Human approval needed to re-open pipeline
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Defect: DEF-{ID} — {title}
Severity: P{N}
Root cause: {phase} decision — {what was wrong}

Proposed re-entry point: Phase {N} — {phase name}

Impact:
  Phases to re-run: {N}, {N+1}, …, 8
  Estimated rework: {S/M/L}
  Scope change: {yes/no — describe if yes}

Type APPROVE-REWORK to re-open Phase {N} and begin rework.
Type DEFER to log as tech debt and continue to Phase 8 gate (P2/P3 only).
Type REJECT to close this defect as won't fix (requires rationale).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Test execution report template

Produced at the end of Phase 8 as the gate deliverable:

```markdown
## Test Execution Report

Project: {name}   Feature: {name}   Date: {date}   Environment: staging

### Summary
| Priority | Total | Pass | Fail | Skipped | Pass rate |
|----------|-------|------|------|---------|-----------|
| P1       | {N}   | {N}  | {N}  | {N}     | {%}       |
| P2       | {N}   | {N}  | {N}  | {N}     | {%}       |
| P3       | {N}   | {N}  | {N}  | {N}     | {%}       |
| Total    | {N}   | {N}  | {N}  | {N}     | {%}       |

### Defect Summary
| ID      | Title        | Severity | Status  | Resolution |
|---------|--------------|----------|---------|------------|
| DEF-001 | …            | P2       | Fixed   | TASK-021   |
| DEF-002 | …            | P3       | Deferred| Next sprint|

### Coverage
- Unit tests:     {N} passing
- Component:      {N} passing
- API (Bruno):    {N} passing
- Frontend (RTL): {N} passing
- E2E (Playwright):{N} passing
- Accessibility:  WCAG 2.1 AA — {pass | N violations found}
- Performance:    NFR-01 p95={Xms} — {pass | fail}

### Exploratory testing notes
{Summary of exploratory session — areas covered, findings}

### Sign-off recommendation
{READY FOR PRODUCTION | NOT READY — open P{N} defects remain}
```

---

## Definition of Done (pipeline-level)

The pipeline is complete when ALL of the following are true:

- [ ] All 8 phases have status ✅ APPROVED
- [ ] Test execution report shows 100% P1 pass, 100% P2 pass (or deferred with approval)
- [ ] Zero open P1 defects
- [ ] Accessibility audit: zero WCAG 2.1 AA violations
- [ ] Performance: all NFR thresholds met in staging
- [ ] CI pipeline green on main branch
- [ ] Human gives final `APPROVE` on Phase 8 gate
