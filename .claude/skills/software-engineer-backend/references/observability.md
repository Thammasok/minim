# Observability — Logs, Metrics, Traces

You can't fix what you can't see. Three pillars answer three questions: **logs** = what
happened, **metrics** = how much / how often, **traces** = where the time went across services.
Wire these before you need them — mid-incident is too late.

## Structured logging (pino)

Log **JSON**, not string-interpolated prose. Structured logs are queryable (`level:error AND
userId:123`); freeform text isn't. Log to **stdout** and let the platform ship it.

```typescript
// lib/logger.ts
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['req.headers.authorization', 'password', '*.token', '*.creditCard'],  // never log secrets/PII
  formatters: { level: (label) => ({ level: label }) },
})
```
```typescript
logger.info({ userId, orderId, amount }, 'order created')   // context as fields, not string
logger.error({ err, orderId }, 'payment failed')            // pass the error object as `err`
```

Rules: no `console.log` in production code; error object goes in the `err` field (pino
serializes stack + message); **redact** auth headers, passwords, tokens, PII.

## Request / correlation IDs

Tag every log line in a request with one id so you can trace a single request across many log
lines (and services). Use `AsyncLocalStorage` so you don't thread the id through every function.

```typescript
import { AsyncLocalStorage } from 'async_hooks'
import { randomUUID } from 'crypto'
const als = new AsyncLocalStorage<{ requestId: string }>()

app.use((req, res, next) => {
  const requestId = req.header('x-request-id') ?? randomUUID()   // honor upstream id if present
  res.setHeader('x-request-id', requestId)
  als.run({ requestId }, next)
})
// child logger everywhere: logger.child({ requestId: als.getStore()?.requestId })
```
Propagate the id to downstream services (pass `x-request-id`) so one id follows the whole flow.

## Health checks (liveness vs readiness)

Two different questions — orchestrators use them differently:
- **Liveness** (`/health`): is the process alive? Cheap, no dependencies. Fail ⇒ restart me.
- **Readiness** (`/ready`): can I serve traffic? Checks DB/Redis. Fail ⇒ pull me from the LB
  (don't restart — a DB blip shouldn't restart every pod).

```typescript
app.get('/health', (_req, res) => res.json({ status: 'ok' }))   // liveness — no deps

app.get('/ready', async (_req, res) => {                        // readiness — deep check
  try {
    await prisma.$queryRaw`SELECT 1`
    await redis.ping()
    res.json({ status: 'ready' })
  } catch (err) {
    logger.error({ err }, 'readiness check failed')
    res.status(503).json({ status: 'not ready' })
  }
})
```

## Metrics (prom-client / Prometheus)

Expose numeric time-series: request rate, error rate, latency (the **RED** method — Rate,
Errors, Duration), plus resource + business counters.

```typescript
import client from 'prom-client'
client.collectDefaultMetrics()   // CPU, memory, event-loop lag, GC

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
})

app.use((req, res, next) => {
  const end = httpDuration.startTimer()
  res.on('finish', () => end({ method: req.method, route: req.route?.path ?? 'unknown', status: res.statusCode }))
  next()
})

app.get('/metrics', async (_req, res) => {   // Prometheus scrapes this
  res.set('Content-Type', client.register.contentType)
  res.end(await client.register.metrics())
})
```
Keep label cardinality low — never label by userId/requestId (unbounded label values blow up
Prometheus). Use the **route pattern** (`/users/:id`), not the raw path.

## Distributed tracing (OpenTelemetry)

Traces show a request's path across services and where latency accrues. OTel auto-instruments
Express/HTTP/Prisma/Redis with near-zero code. Load it **before** your app so it patches libs.

```typescript
// tracing.ts — imported first, before anything else
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
  instrumentations: [getNodeAutoInstrumentations()],
}).start()
```
```jsonc
// package.json — ensure it loads first
"start": "node --require ./dist/tracing.js dist/server.js"
```
Propagate **trace context** (W3C `traceparent` header) across service calls so spans link into
one trace. Correlate logs to traces by logging the active `trace_id`.

## Error tracking (Sentry)

Aggregates exceptions with stack, breadcrumbs, and release — beyond what raw logs give.

```typescript
import * as Sentry from '@sentry/node'
Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV, tracesSampleRate: 0.1 })
// Express: Sentry request handler early, error handler after routes (before your handler)
```

## What to log — and what never to

- **Log**: request start/finish (method, route, status, duration, requestId), handled errors
  with context, key business events, external-call failures.
- **Never log**: passwords, tokens, API keys, full card numbers, raw PII, whole request bodies.
  Redaction (above) is the safety net, not the plan.
- **Levels**: `error` (needs attention) · `warn` (recoverable/degraded) · `info` (lifecycle +
  business events) · `debug` (dev only). Don't cry `error` for expected 4xx.

## Best practices

- One structured logger, JSON to stdout; platform handles shipping/rotation.
- Every request carries a correlation id, propagated downstream.
- Liveness ≠ readiness — wire both correctly to the orchestrator.
- RED metrics on every service; low-cardinality labels only.
- Auto-instrument tracing early; propagate `traceparent`; link logs↔traces by `trace_id`.
- Alert on symptoms users feel (error rate, p99 latency, readiness), not raw CPU.

## Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Can't correlate logs of one request | No request id | AsyncLocalStorage + child logger |
| Prometheus OOM / slow | High-cardinality labels (id/path) | Label by route pattern, drop id labels |
| DB blip restarts every pod | Deep check on liveness probe | Deep-check on readiness, keep liveness cheap |
| Secrets show up in logs | Logging raw headers/bodies | Configure pino `redact`, log fields not blobs |
| Traces don't span services | Context not propagated | Forward `traceparent`; auto-instrument all hops |
| Noise drowns real errors | Everything logged at `error` | Use levels; 4xx is `warn`/`info`, not `error` |
