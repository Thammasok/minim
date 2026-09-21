# Defect Triage Reference

Full severity/priority matrix, escalation rules, and retest guidance.

---

## Severity Definitions

| Level | Label | Meaning |
|---|---|---|
| S1 | Critical | System unusable, data loss, security breach, no workaround |
| S2 | Major | Core feature broken or contract violated; workaround may exist |
| S3 | Minor | Non-critical feature degraded; workaround available |
| S4 | Trivial | Cosmetic, typo, minor UX issue; no functional impact |

## Priority Definitions

| Level | Label | Meaning |
|---|---|---|
| P1 | Fix before release | Blocks go-live; must be resolved and retested in this cycle |
| P2 | Fix this sprint | Should be resolved before sprint end; may ship with known issue if accepted |
| P3 | Backlog | Schedule in a future sprint; no immediate impact |
| P4 | Won't fix | Accepted risk or out of scope; document and close |

## Severity × Priority Matrix

```
              P1          P2          P3          P4
S1 Critical   Required    Escalate    ❌ Invalid  Requires CTO sign-off
S2 Major      Required    Common      Acceptable  Requires PM sign-off
S3 Minor      Rare*       Common      Common      Common
S4 Trivial    ❌ Invalid  Rare        Common      Common
```

*S3/P1: Only valid when a trivial-looking issue blocks a critical path (e.g., a typo in
an API error code string that a downstream parser depends on).

---

## Auto-escalation Rules

These conditions always produce P1 defects regardless of apparent severity:

1. **Contract violation** — The actual behaviour differs from what is declared in
   `domain-contract.yaml` (wrong status code, missing required response field,
   event schema mismatch, incorrect error code).

2. **SLA breach** — Measured p99 latency or availability is worse than the contract SLA.

3. **Security vulnerability** — Any auth bypass, injection vector, secrets exposure,
   or OWASP Top 10 finding.

4. **Data integrity** — Records written with missing required fields, duplicates created
   where uniqueness is required, or FK constraints violated.

5. **Circuit breaker fallback broken** — `depends_on.fallback` behaviour not triggered
   when the dependency is unavailable (risk of cascading failure in production).

---

## Targeted Regression: What to Re-run After a Fix

After a defect is fixed and a new build deployed, run only:

1. The TC(s) directly associated with the defect (must now PASS)
2. TCs that share the same SUT and code path (risk of regression)
3. Any P1/P2 TCs that were PASS in the previous cycle (smoke regression)

Do NOT re-run the full suite unless the fix touched shared infrastructure
(middleware, DB schema, event bus config).

---

## Intermittent Failures (Flaky Tests)

A test is flaky when it passes and fails non-deterministically on the same code.

**Classify, do not ignore:**
- Run the TC 5 times. If it fails ≥ 2/5 → classify as DEFECT with Severity S3,
  type "Test reliability", Priority P2.
- If flakiness affects a P1 TC → escalate to P1 (unreliable safety net is no net).

**Common causes:**
- Race condition in async code (use explicit `await` / event-driven assertions)
- Shared state between tests (use factories, clean up in `afterEach`)
- Time-dependent logic (mock system clock)
- External service dependency (stub or use testcontainers)

---

## Blocked / Skipped TCs: Risk Acceptance

Every unexecuted TC must be given one of:

| Decision | Meaning | Who approves |
|---|---|---|
| Execute before release | Must be run; release blocked until done | Test lead |
| Defer to staging | Accept risk in this env; must run in staging | Product owner |
| Accept risk | Known gap; documented; will not be tested | Product owner + signed |
| Out of scope | TC was wrongly included; archive it | Test lead |

Unexecuted TCs with no decision are blocking — do not issue PASS verdict.
