# SLA Guide

How to derive measurable SLA thresholds from NFRs, and what consistency
model to choose given your domain's CAP theorem trade-offs.

---

## Deriving Latency Targets

### From NFR to contract field

| NFR Statement | Contract Field | Example Value |
|---|---|---|
| "Response must feel instant" | `latency_p50_ms` | 50 |
| "99% of requests under X ms" | `latency_p99_ms` | 200 |
| "No request takes longer than X" | `latency_p99_ms` | 1000 |

**Rule of thumb by operation type:**

| Operation Type | Recommended p99 |
|---|---|
| Simple read (cache-backed) | < 50 ms |
| Simple read (DB) | < 100 ms |
| Write with validation | < 200 ms |
| Write with downstream sync call | < 500 ms |
| Batch / background operation | < 5000 ms |
| Async (event-driven, no user waiting) | Not applicable |

### Cascading latency budget

In a synchronous call chain, latency compounds:
```
API Gateway (10ms) → Order Service (200ms) → Inventory (50ms)
Total user-perceived latency: ~260ms
```

When a domain calls another domain synchronously (`depends_on.call_pattern: sync`),
its own `latency_p99_ms` must account for the dependency's latency plus its own
processing time plus network overhead (~10ms per hop).

---

## Deriving Availability Targets

| Availability % | Max downtime / month | Suitable for |
|---|---|---|
| 99.0% ("two nines") | ~7.2 hours | Internal tools |
| 99.9% ("three nines") | ~43 minutes | Standard B2C services |
| 99.95% | ~22 minutes | Payment-critical paths |
| 99.99% ("four nines") | ~4.4 minutes | Core financial services |

**Cascading availability:** When domain A depends on domain B (sync):
```
Effective availability of A = availability(A) × availability(B)
Example: 99.9% × 99.9% = 99.8%
```

Use circuit breakers (`circuit_breaker: true`) and graceful fallbacks to
prevent cascading failures from pulling availability below target.

---

## Choosing a Consistency Model

### Strong Consistency
- **When:** Financial transactions, inventory deductions, anything where
  stale reads cause incorrect business decisions
- **Trade-off:** Higher latency; requires distributed locks or 2PC
- **CAP implication:** Sacrifices availability (CP system)

### Eventual Consistency
- **When:** Read-heavy domains, analytics, notifications, search indexes
- **Trade-off:** Reads may be temporarily stale; simpler implementation
- **CAP implication:** Sacrifices consistency (AP system)

### Causal Consistency
- **When:** Social/collaborative features where order matters but global
  strong consistency is too expensive (e.g., comment threads)
- **Trade-off:** More complex to implement than eventual; weaker than strong
- **CAP implication:** Middle ground; partial ordering guarantees

### Quick reference by domain type

| Domain Type | Recommended Model |
|---|---|
| Order / Payment / Inventory | strong |
| User profile / Preferences | eventual |
| Notification / Email | eventual |
| Search / Recommendation | eventual |
| Audit log | strong |
| Session / Cache | eventual |

---

## RPO and RTO

| Field | Definition | Typical Values |
|---|---|---|
| `rpo_minutes` | Max acceptable data loss (Recovery Point Objective) | 0 (zero loss) to 1440 (24h) |
| `rto_minutes` | Max acceptable downtime (Recovery Time Objective) | 5 to 240 |

**Guidelines:**
- If `rpo_minutes: 0` → synchronous replication required; higher cost
- If `rto_minutes < 15` → active-active or hot standby required
- Financial domains: typically RPO=0, RTO=5
- Notification domains: typically RPO=60, RTO=60

---

## SLA Validation Checklist

Before accepting an SLA block in a contract:

```
□ latency_p99_ms is a positive integer (not a string, not "fast")
□ availability_pct is between 99.0 and 99.999
□ consistency_model is one of: strong | eventual | causal
□ If depends_on has sync calls: p99 budget accounts for dependency latency
□ If availability_pct ≥ 99.99: circuit_breaker: true on all sync dependencies
□ rpo and rto are set for any domain with data_ownership entries
```
