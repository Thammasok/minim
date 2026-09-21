# SLA Verification Reference

How to measure and compare results against `sla` fields in `domain-contract.yaml`.

---

## Fields to Verify

| Contract field | How to measure | Passing condition |
|---|---|---|
| `latency_p99_ms` | k6 `http_req_duration{p(99)}` or Prometheus histogram | measured ≤ contract value |
| `latency_p50_ms` | k6 `http_req_duration{p(50)}` | measured ≤ contract value |
| `availability_pct` | (successful requests / total requests) × 100 over test window | measured ≥ contract value |
| `throughput_rps` | k6 `http_reqs` rate at sustained load | measured ≥ contract value without latency breach |
| `consistency_model: strong` | Sequential read after write returns updated value | 100% of reads reflect latest write |
| `consistency_model: eventual` | Read after write may be stale within a defined window | Staleness resolves within expected propagation time |

---

## Measurement Windows

- **Latency**: measure over a sustained load run of ≥ 60 seconds at `throughput_rps`
  (or 100 RPS minimum if `throughput_rps` is not declared).
- **Availability**: measure over the full test run; exclude planned maintenance windows.
- **Throughput**: ramp to target RPS, hold for 60 seconds, measure during hold phase only.

---

## SLA Breach Classification

| Breach magnitude | Classification |
|---|---|
| Measured within 5% of contract value | WARN — note in report, no defect required |
| Measured 5–20% worse than contract | DEFECT S2 P1 — fix before release |
| Measured >20% worse than contract | DEFECT S1 P1 — escalate immediately |

---

## Per-operation SLA Override

If `api_contracts[].sla_override` is present, use it instead of the domain-level `sla`
for that specific operation.

```yaml
sla_override:
  latency_p99_ms: 80   ← use 80ms for this operation, not the domain-level 200ms
```

Verify each operation independently when overrides exist.

---

## Reporting Format

```markdown
### SLA Verification — order-management v1.0.0

| Operation | Metric | Contract | Measured | Delta | Status |
|---|---|---|---|---|---|
| create-order (POST /orders) | latency_p99_ms | 200 | 340 | +70% | BREACH S2 P1 |
| get-order (GET /orders/{id}) | latency_p99_ms | 80 | 62 | -22% | PASS |
| cancel-order (PATCH /orders/{id}/cancel) | latency_p99_ms | 200 | 195 | -2.5% | PASS |
| Domain | availability_pct | 99.9 | 99.94 | +0.04% | PASS |
| Domain | throughput_rps | 500 | 523 | +4.6% | PASS |
```
