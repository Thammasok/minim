# Pipeline State Reference

## State block specification

Render the pipeline state block at the top of **every response** after Phase 0 is confirmed.
This is the human's single source of truth for where the project stands.

### Full state block format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PIPELINE: {Project name} · {Feature name}
Started: {date}                               Rev: {N} (iteration count)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ Phase 1 – Requirements Gathering         [APPROVED · 2025-01-15]
  ✅ Phase 2 – System Analysis & Design       [APPROVED · 2025-01-16]
  ✅ Phase 3 – Test Design & Test Data        [APPROVED · 2025-01-17]
  ✅ Phase 4 – Task Breakdown                 [APPROVED · 2025-01-17]
  ✅ Phase 5 – Software Orchestration         [APPROVED · 2025-01-18]
  🔄 Phase 6a – Frontend Engineering         [IN REVIEW · revision 2]
  🔄 Phase 6b – Backend Engineering          [IN REVIEW · revision 1]
  ⬜ Phase 7  – Test Automation
  ⬜ Phase 8  – Software Testing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  GATE 6 — Awaiting human review of Phase 6a and 6b
    Pending: FE revision 2 feedback · BE awaiting FE approval
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Phase approved by human — locked, cannot be changed without re-entry |
| 🔄 | Phase deliverable presented — awaiting human review |
| 🔁 | Phase being revised based on human feedback |
| ⬜ | Phase not yet started |
| ⏸  | Pipeline paused at a gate — nothing proceeds until human acts |
| 🔴 | Phase blocked by a defect or dependency failure |

---

## State transition rules

```
⬜ NOT STARTED
  → 🔄 IN REVIEW       when: deliverable presented to human
  
🔄 IN REVIEW
  → ✅ APPROVED         when: human types APPROVE
  → 🔁 REVISING         when: human gives feedback
  
🔁 REVISING
  → 🔄 IN REVIEW        when: revised deliverable presented
  
✅ APPROVED
  → 🔴 BLOCKED          when: defect in later phase requires re-entry
  
🔴 BLOCKED
  → 🔁 REVISING         when: rework begins
```

**Approved phases are immutable** unless explicitly re-opened by the human.
If Phase 8 finds a defect requiring design changes:
1. Identify which phase owns the decision that caused the defect
2. Explicitly state: "This requires re-opening Phase N"
3. Get human approval to re-open
4. Change that phase to 🔴 BLOCKED
5. All subsequent phases also revert to 🔴 BLOCKED
6. Re-run from the re-opened phase forward

---

## Revision tracking

Each time a phase goes through a human feedback cycle, increment the revision counter.
Track what changed:

```
Phase 1 — Revision history
  Rev 1: Initial draft presented
  Rev 2: Human feedback — added NFR for availability; removed guest checkout from MVP
  Rev 3: Human feedback — split US-003 into two stories
  APPROVED at Rev 3
```

---

## Phase 0 — Project register

Before Phase 1 begins, capture the project register. This is set once and referenced
throughout.

```markdown
## Project Register

Project name:    {name}
Feature:         {feature being built}
Team:            BE: {name/role} · FE: {name/role} · QA: {name/role}
Target stack:    Backend: NestJS (REST) · Frontend: React SPA (Vite) · DB: PostgreSQL
Architecture:    {chosen style — set in Phase 2, left blank until then}
Pipeline start:  {date}
Target delivery: {date or sprint}
Scope confirmed: {what's in scope}
Out of scope:    {what's explicitly excluded}
```

---

## Cross-phase dependency log

Track which outputs feed into which phases:

```
Phase 1 → Phase 2:  Story map, stories, NFRs, user flow
Phase 1 → Phase 3:  Acceptance criteria per story
Phase 2 → Phase 3:  API contracts, bounded contexts, ADRs
Phase 2 → Phase 4:  Service map, technology choices
Phase 3 → Phase 4:  TC list (each TC becomes a test task)
Phase 4 → Phase 5:  Ordered task backlog
Phase 5 → Phase 6a: API contract types, MSW handlers
Phase 5 → Phase 6b: API contract types, DB schema
Phase 3 → Phase 7:  TC-xxx list (each TC → automation task)
Phase 7 → Phase 8:  Runnable test suite
Phase 8 → Done:     Signed-off test execution report
```

If a phase's input is not approved, the downstream phase **must not** begin.
Flag the dependency blockage in the state block with 🔴.
