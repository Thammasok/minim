# Exploratory Testing Reference

Session-based exploratory testing (SBET) guidelines, charter templates, and heuristics.

---

## When to Run Exploratory Sessions

Run targeted sessions after automated test results are reviewed, focusing on:

| Trigger | Charter focus |
|---|---|
| Thin automated coverage on a risk area | Probe the uncovered paths |
| Recent code change in a shared component | Regression probe around the change |
| Cross-domain interaction not in contract tests | End-to-end flow across 2+ domains |
| New feature with complex state machine | State transitions and boundary conditions |
| P3 TCs not automated (budget / time constraints) | Sample the edge cases manually |
| Intermittent failures in automation | Reproduce and characterise the flakiness |

---

## Session Charter Template

```
Session: SBET-{ID}
Charter:  {One sentence: what to explore and why}
Risk:     {What could go wrong if this area is untested}
Duration: {30 | 45 | 60} minutes
Tester:   {name}
Build:    {version / commit hash / env}
Started:  {HH:MM}
Ended:    {HH:MM}

--- During session ---

Observations:
  [{HH:MM}] {What was tried} → {What was observed}
  [{HH:MM}] {What was tried} → {What was observed}

Findings:
  DEFECT-{ID}: {Title} — {Sev/Pri}
  NOTE: {Interesting behaviour that is not a defect but worth documenting}
  PASS: {Something that worked well and was worth confirming}

Coverage achieved:
  {What was explored}

Coverage NOT achieved (time / blocker):
  {What was skipped and why}
```

---

## Heuristics (SFDPOT / San Francisco Depot)

Use these lenses to generate test ideas during a session:

| Heuristic | Questions to ask |
|---|---|
| **S**tructure | What is the system made of? What are its layers, integrations, dependencies? |
| **F**unction | What does it do? What should it NOT do? What happens at the edges of each function? |
| **D**ata | What data does it accept, transform, store, emit? What happens with null, empty, boundary, malformed, XSS? |
| **P**latform | What environment does it run in? What changes when env variables differ, load is high, disk is full? |
| **O**perations | How is it deployed, configured, monitored? What happens during restart, upgrade, rollback? |
| **T**ime | What happens with concurrency, timeouts, retries, eventual consistency lag, daylight saving boundaries? |

---

## Cross-Domain Exploration Checklist

When exploring interactions between domains (not covered by Pact contract tests):

```
□ Trigger an event in Domain A → verify Domain B's reaction matches events_consumed.reaction
□ Make Domain A's sync dependency unavailable → verify Domain B's circuit_breaker fallback fires
□ Publish a malformed event from Domain A → verify Domain B's failure_strategy (dlq/retry/ignore)
□ Create data in Domain A → verify Domain B cannot write to it (data ownership enforcement)
□ Simulate Domain A at p99 latency limit → verify no cascading timeout into Domain B
□ Verify cross-domain trace IDs propagate (observability continuity)
```
