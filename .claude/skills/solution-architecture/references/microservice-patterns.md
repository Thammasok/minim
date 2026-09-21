# Microservice Design Patterns Reference

## Table of Contents
1. Decomposition Patterns
2. Communication Patterns
3. Data Patterns
4. Resilience Patterns
5. Observability Patterns
6. Security Patterns
7. Migration Patterns
8. Pattern Selection Guide

---

## 1. Decomposition Patterns

### Decompose by Business Capability
Split services around stable business capabilities (what the business does, not how).

```
Business: E-Commerce
├── Order Management Service
├── Inventory Service
├── Payment Service
├── Shipping Service
└── Customer Service
```

### Decompose by Subdomain (DDD-driven)
Align service boundaries with DDD bounded contexts. One service = one bounded context (or one service per aggregate for very large contexts).

### Strangler Fig Pattern
Incremental migration from monolith to microservices:
```
Phase 1: Monolith serves all traffic
Phase 2: Proxy routes NEW traffic for Feature X to new service; monolith handles rest
Phase 3: Proxy routes ALL traffic for Feature X to new service
Phase 4: Remove Feature X from monolith
Repeat for each feature
```
Key: The proxy (API Gateway / facade) is the strangler — it strangles the monolith gradually.

### Sidecar Pattern
Deploy helper processes (proxies, logging agents, config) as a sidecar container alongside the main service container.

```
Pod:
├── Main Container (app)
└── Sidecar Container (Envoy proxy / log forwarder / config agent)
```
Used heavily in service meshes (Istio, Linkerd).

---

## 2. Communication Patterns

### Synchronous (Request/Response)
**REST**: HTTP + JSON. Simple, ubiquitous. Good for external APIs and simple queries.

**gRPC**: Protocol Buffers over HTTP/2. Better for internal service-to-service (strongly typed, faster, streaming support).

**GraphQL**: Query language for APIs. Good when clients need flexible queries and field selection (e.g., BFF pattern).

### Asynchronous (Message-Based)
**Point-to-Point (Queue)**: One producer, one consumer. Use for work distribution, job queues.

**Publish/Subscribe (Topic)**: One producer, many consumers. Use for event fan-out.

**Event Streaming (Kafka)**: Ordered, durable, replayable log. Use for event sourcing, audit, cross-service data sync.

### API Gateway Pattern
Single entry point for all clients. Handles:
- Authentication / authorization
- Rate limiting
- Request routing
- Protocol translation
- Response composition (aggregation)

```
[Mobile Client] ──→ |               | ──→ [Order Service]
[Web Client]   ──→ | API Gateway   | ──→ [User Service]
[3rd Party]    ──→ |               | ──→ [Product Service]
```

### Backend for Frontend (BFF)
Separate API gateway per client type, optimized for that client's needs:
```
[Mobile App] ──→ [Mobile BFF] ──→ [Services]
[Web App]    ──→ [Web BFF]    ──→ [Services]
[3rd Party]  ──→ [Public API] ──→ [Services]
```

### Service Mesh
Infrastructure layer that handles service-to-service communication:
- mTLS between services
- Circuit breaking
- Retries / timeouts
- Distributed tracing (automatic)
- Traffic shaping (canary deployments)

Examples: Istio, Linkerd, AWS App Mesh

---

## 3. Data Patterns

### Database per Service
Each service owns its own database. No shared databases.

```
✅ Order Service ──→ [Orders DB: Postgres]
✅ Product Service ──→ [Products DB: MongoDB]
✅ Search Service ──→ [Search DB: Elasticsearch]
❌ Never: Two services share one DB
```

**Why**: Shared DB creates tight coupling. A schema change by one team breaks another team.

### Saga Pattern
Manage distributed transactions across multiple services without two-phase commit.

#### Choreography-based Saga
Services react to each other's events. No central coordinator.
```
Order Service: emits OrderCreated
  → Payment Service: reserves payment, emits PaymentReserved
    → Inventory Service: reserves items, emits ItemsReserved
      → Shipping Service: schedules shipment, emits ShipmentScheduled
        → Order Service: marks OrderConfirmed

On failure: each service emits a compensation event
PaymentFailed → Order Service emits OrderCancelled
```
✅ Loose coupling
❌ Hard to track overall saga state; hard to debug

#### Orchestration-based Saga
A central **Saga Orchestrator** tells each service what to do next.
```
SagaOrchestrator:
  1. Tell PaymentService: reserve payment
  2. If OK → Tell InventoryService: reserve items
  3. If OK → Tell ShippingService: schedule
  4. If any fail → send compensation commands to already-completed steps
```
✅ Easier to track and debug
❌ Orchestrator can become a bottleneck / god object

### CQRS (Command Query Responsibility Segregation)
See architecture-styles.md for full description.

Quick pattern:
```
Write path: REST POST /orders → Command Handler → Aggregate → Event Store
Read path:  REST GET /orders  → Query Handler  → Read Model (denormalized, optimized)
```

### Event Sourcing
Persist all state changes as a sequence of domain events. Reconstruct state by replaying.

```
Store: [OrderCreated, ItemAdded(sku=A), ItemAdded(sku=B), ItemRemoved(sku=A), OrderConfirmed]
Current State: Order{items:[B], status:Confirmed}
```

### Outbox Pattern
Solves the "dual write problem": atomically writing to DB AND publishing an event.

```
Transaction:
  1. Write business data to Orders table
  2. Write event to Outbox table (same DB transaction)

Background process (Transactional Outbox Reader):
  1. Poll Outbox table
  2. Publish to message broker
  3. Mark as published
```

### Inbox Pattern
The consumer-side complement to the Outbox Pattern. Ensures a received message is processed **exactly once**, even if the broker delivers it multiple times (at-least-once delivery).

```
Message arrives → Check Inbox table (has this message_id been processed?)
  → If YES: discard (already processed)
  → If NO:  process business logic + insert into Inbox table (same transaction)
```

**Implementation:**
```sql
-- Inbox table
CREATE TABLE inbox (
  message_id   VARCHAR PRIMARY KEY,
  processed_at TIMESTAMP
);

-- Consumer logic (single transaction)
BEGIN;
  INSERT INTO inbox (message_id, processed_at)
  VALUES (:id, NOW())
  ON CONFLICT DO NOTHING
  RETURNING message_id;
  -- If no row returned → duplicate, skip
  -- If row inserted → process business logic here
COMMIT;
```

**Outbox + Inbox together (reliable messaging end-to-end):**
```
Producer:                              Consumer:
[Business Logic]                       [Inbox Check] → deduplicate
[Outbox Table]  → [Broker] → Message → [Business Logic]
[DB Transaction]                       [Inbox Table]
                                       [DB Transaction]
```

✅ Guarantees exactly-once processing despite at-least-once broker delivery
✅ Safe for retries and redeliveries
❌ Inbox table grows indefinitely — add a TTL cleanup job
❌ Adds a DB write on every message consumed

### CQRS Read Model Sync (Event-Driven Projection)
```
[Write Service] → [Event Bus] → [Projection Worker] → [Read DB]
```
The Projection Worker builds/maintains denormalized read models from domain events.

---

## 4. Resilience Patterns

### Circuit Breaker
Prevent cascading failures. Stop calling a failing service.

```
States: CLOSED → (failures exceed threshold) → OPEN → (timeout) → HALF-OPEN
CLOSED: Normal operation; failures counted
OPEN: All calls fail-fast immediately (no actual calls made)
HALF-OPEN: Trial calls; if successful → CLOSED; if fail → OPEN
```

Libraries: Resilience4j (Java), Polly (.NET), hystrix (legacy), built into service meshes

### Retry with Exponential Backoff + Jitter
```
attempt 1: wait 100ms
attempt 2: wait 200ms
attempt 3: wait 400ms + random jitter (to avoid thundering herd)
max attempts: 3–5
```
Only retry on transient errors (network timeouts, 503), not on 400/404 (client errors).

### Timeout
Set explicit timeouts on ALL outbound calls. Never wait forever.
```
Default: 500ms–2s for sync calls
Long-running: use async patterns instead of long sync timeouts
```

### Bulkhead
Isolate failures. Use separate thread pools / connection pools per dependency.
```
Service A has:
  Pool for Service B: 10 threads max
  Pool for Service C: 10 threads max
If Service C hangs and exhausts its pool, Service B calls still work
```

### Idempotency
Design write operations to be safely retried.
```
POST /payments with Idempotency-Key: abc123
  → First call: processes payment
  → Duplicate call: returns same result without processing again
```
Store idempotency keys with responses.

### Rate Limiting & Throttling
- **Client-side**: Don't overwhelm downstream
- **Server-side**: Protect yourself from abusive clients
- Token bucket or sliding window algorithms
- Return 429 Too Many Requests with Retry-After header

---

## 5. Observability Patterns

The three pillars: **Logs**, **Metrics**, **Traces**

### Distributed Tracing
Every request gets a **Trace ID**. Propagate it through all service calls.
```
Request → Service A (TraceId: abc) → Service B (TraceId: abc, SpanId: 2) → DB
```
Tools: Jaeger, Zipkin, AWS X-Ray, Honeycomb, Datadog APM

**Implement**: W3C Trace Context headers. Use OpenTelemetry SDK (vendor-neutral).

### Structured Logging
Log in JSON with consistent fields:
```json
{
  "timestamp": "2025-01-01T10:00:00Z",
  "level": "ERROR",
  "service": "order-service",
  "traceId": "abc123",
  "orderId": "order-456",
  "message": "Payment reservation failed",
  "error": "Timeout after 500ms"
}
```

### Health Check API
Every service exposes:
- `GET /health/live` → Is the process alive? (liveness)
- `GET /health/ready` → Is it ready to receive traffic? (readiness)

### Metrics (RED Method)
For every service:
- **Rate**: requests per second
- **Errors**: error rate (%)
- **Duration**: latency (p50, p95, p99)

Tools: Prometheus + Grafana, Datadog, CloudWatch

### Correlation ID
Generate a unique ID at the edge (API Gateway). Pass it through all services in headers.

---

## 6. Security Patterns

### Service-to-Service Auth
- **mTLS**: Mutual TLS; each service has a cert. Used in service meshes.
- **JWT**: Service presents signed JWT to downstream service
- **API Keys**: Simple but less secure; avoid for sensitive internal traffic

### Zero Trust
Never trust any request by default, even internal ones. Verify identity at every hop.

### Secrets Management
Never store secrets in env vars or config files.
Use: HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault

---

## 7. Migration Patterns

### Strangler Fig (see Decomposition section)

### Branch by Abstraction
1. Create an abstraction (interface) over the code you want to replace
2. Refactor existing code to use the abstraction
3. Build new implementation behind the abstraction
4. Switch the abstraction to use the new implementation
5. Remove the old implementation

### Parallel Run
Run old and new implementations simultaneously. Compare results. Switch traffic when confident.

### Feature Flags
Control which users/requests use new vs old implementation. Gradual rollout.
Tools: LaunchDarkly, Unleash, AWS CloudWatch Evidently

---

## 8. Pattern Selection Guide

### I need to handle distributed transactions
→ Saga (choreography for simple flows, orchestration for complex)
→ + Outbox Pattern for reliable event publishing

### I need to call another service and it might be slow/down
→ Circuit Breaker + Retry with Backoff + Timeout + Bulkhead

### My read and write workloads are very different
→ CQRS (reads can use different optimized stores)

### I need full audit trail / time travel
→ Event Sourcing

### I'm migrating from a monolith
→ Strangler Fig + BFF to manage the transition

### Multiple types of clients with different data needs
→ BFF (Backend for Frontend)

### I need loose coupling between services
→ Event-Driven (Pub/Sub or Event Streaming)

### I have a complex multi-step business process
→ Saga (prefer orchestration if steps > 3-4)

### I need to ensure events are reliably published
→ Outbox Pattern

### Service-to-service communication at scale
→ Service Mesh (Istio/Linkerd) for cross-cutting concerns
