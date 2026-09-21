# Observability Reference

## The four signals (start here)

| Signal | Question it answers | Tool |
|---|---|---|
| Metrics | Is the system healthy over time? | Prometheus + Grafana |
| Logs | What happened at time T? | Loki / ELK / CloudWatch |
| Traces | Where did this request spend its time? | Tempo / Jaeger / X-Ray |
| Profiles | What code path is burning CPU/memory? | Pyroscope / pprof |

---

## Prometheus — Alerting rules

```yaml
# alerts/slo.yaml
groups:
  - name: slo-alerts
    rules:
      # Availability: error rate > 1% over 5 min
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m]))
          /
          sum(rate(http_requests_total[5m])) > 0.01
        for: 5m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "High error rate on {{ $labels.service }}"
          description: "Error rate is {{ $value | humanizePercentage }}"
          runbook: "https://wiki.example.com/runbooks/high-error-rate"

      # Latency: p99 > 1s
      - alert: HighLatency
        expr: |
          histogram_quantile(0.99,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service)
          ) > 1
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "p99 latency > 1s on {{ $labels.service }}"
          runbook: "https://wiki.example.com/runbooks/high-latency"

      # Saturation: CPU throttling
      - alert: CPUThrottling
        expr: |
          rate(container_cpu_cfs_throttled_seconds_total[5m])
          /
          rate(container_cpu_cfs_periods_total[5m]) > 0.25
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Container CPU throttled >25% — consider raising limits"
```

---

## SLO framework

```yaml
# SLO definition (Pyrra / Sloth format)
apiVersion: pyrra.dev/v1alpha1
kind: ServiceLevelObjective
metadata:
  name: my-service-availability
  namespace: monitoring
spec:
  description: "My service should return 2xx 99.9% of the time"
  target: "99.9"
  window: 30d
  indicator:
    ratio:
      errors:
        metric: http_requests_total{job="my-service",status=~"5.."}
      total:
        metric: http_requests_total{job="my-service"}
```

Error budget = (1 - SLO target) × window
- 99.9% over 30d = 43.8 minutes of allowed downtime
- 99.5% over 30d = 3.6 hours of allowed downtime

---

## Grafana dashboard — standard layout

Every service dashboard should have these rows:
1. **Overview** — error rate, request rate, p50/p95/p99 latency (RED)
2. **Resources** — CPU usage vs request/limit, memory usage vs limit, throttling %
3. **Dependencies** — DB query latency, external API error rates
4. **Kubernetes** — Pod restarts, HPA scale events, OOMKills

---

## Structured logging — best practices

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "error",
  "service": "my-service",
  "version": "v1.2.3",
  "trace_id": "abc123",
  "span_id": "def456",
  "msg": "Database connection failed",
  "error": "dial tcp: connection refused",
  "db_host": "postgres.production.svc.cluster.local",
  "retry_count": 3,
  "duration_ms": 5032
}
```

Rules:
- Always JSON in production (log aggregators can't parse free-text reliably)
- Include `trace_id` / `span_id` for correlation with distributed traces
- Log at appropriate levels: `DEBUG` (dev only), `INFO` (key business events), `WARN` (recoverable issues), `ERROR` (action required)
- Never log PII, tokens, passwords, or raw SQL with params

---

## OpenTelemetry — instrumentation (Node.js example)

```javascript
// tracing.ts — load before application code
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: 'my-service',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
});

sdk.start();
```

---

## Alerting runbook template

```markdown
# Alert: <AlertName>

**Severity**: critical | warning
**Team**: platform | backend | data
**SLO Impact**: yes/no — which SLO

## What does this alert mean?
Plain-English description of what's wrong.

## Diagnosis steps
1. Check dashboard: <link>
2. Run: `kubectl logs -n production -l app=my-service --tail=100`
3. Check downstream dependencies: <list>
4. Check recent deployments: `helm history my-service -n production`

## Common root causes
- Database connection pool exhausted → check `db_connections` metric
- Memory leak after recent deploy → roll back with `helm rollback my-service`
- External API outage → check status page: <link>

## Remediation
- **If deploy-related**: `helm rollback my-service 1 -n production`
- **If DB overload**: Enable read replica routing, page DB team
- **If traffic spike**: Manually scale HPA: `kubectl scale deploy my-service --replicas=10`

## Escalation
- After 30 min unresolved → page on-call lead
- After 1h → page engineering manager
- Data loss risk → immediately page CTO + legal

## Post-incident
Link to post-mortem template: <link>
```
