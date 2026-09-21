# Contract Schema Reference

Full specification for `domain-contract.yaml`. Every field is documented with
its type, whether it is required, validation rules, and an inline example.

---

## Top-Level Structure

```yaml
# ─────────────────────────────────────────────
# DOMAIN CONTRACT
# Schema version: 1.0
# ─────────────────────────────────────────────

schema_version: "1.0"            # required | string | always "1.0" for this spec
domain: <string>                 # required | kebab-case | e.g. "order-management"
version: <semver>                # required | string | e.g. "1.0.0"
description: <string>            # required | one sentence, plain English
owner_team: <string>             # required | team or squad name
status: draft | active | deprecated   # required

api_contracts: [ ... ]           # optional | list of sync endpoints
events_published: [ ... ]        # optional | list of domain events this domain emits
events_consumed: [ ... ]         # optional | list of events this domain reacts to
depends_on: [ ... ]              # optional | list of upstream domain contracts
data_ownership: [ ... ]          # required | entities this domain owns exclusively
sla: { ... }                     # required | measurable quality targets
implementation: { ... }          # required | stack details — NOT for consuming domains
```

---

## `api_contracts[]`

Each entry describes one synchronous operation this domain exposes.

```yaml
api_contracts:
  - id: <string>                 # required | kebab-case, unique within domain
    summary: <string>            # required | one-line description
    protocol: REST | gRPC | GraphQL   # required
    method: GET | POST | PUT | PATCH | DELETE   # REST only
    path: <string>               # REST only | e.g. "/orders/{orderId}"
    grpc_method: <string>        # gRPC only | e.g. "OrderService.CreateOrder"
    graphql_operation: query | mutation | subscription   # GraphQL only
    auth: none | jwt | api_key | mtls   # required
    input_schema: <json-schema>  # required | JSON Schema draft-07 object
    output_schema: <json-schema> # required | JSON Schema draft-07 object
    error_codes:                 # optional but recommended
      - code: <int|string>
        description: <string>
    idempotent: true | false     # required | can this be safely retried?
    sla_override:                # optional | overrides domain-level SLA for this op
      latency_p99_ms: <int>
      availability_pct: <float>
```

**Example:**

```yaml
api_contracts:
  - id: create-order
    summary: Create a new customer order
    protocol: REST
    method: POST
    path: /orders
    auth: jwt
    idempotent: false
    input_schema:
      type: object
      required: [customer_id, items]
      properties:
        customer_id:
          type: string
          format: uuid
        items:
          type: array
          minItems: 1
          items:
            type: object
            required: [sku, quantity]
            properties:
              sku: { type: string }
              quantity: { type: integer, minimum: 1 }
    output_schema:
      type: object
      required: [order_id, status]
      properties:
        order_id: { type: string, format: uuid }
        status: { type: string, enum: [pending, confirmed] }
    error_codes:
      - code: 422
        description: Validation error — missing required fields
      - code: 409
        description: Duplicate order detected (idempotency key collision)
```

---

## `events_published[]`

Events this domain emits when significant state changes occur.

```yaml
events_published:
  - name: <string>               # required | dot-notation: domain.entity.action
                                 # e.g. "order.created", "payment.refund.initiated"
    summary: <string>            # required | one-line description
    broker: kafka | rabbitmq | sns | sqs | eventbridge   # required
    topic_or_exchange: <string>  # required | broker-specific resource name
    schema: <json-schema>        # required | full event payload schema
    ordering_key: <string>       # optional | field used for partition/ordering
    retention_days: <int>        # optional | how long broker retains the event
    at_least_once: true | false  # required | delivery guarantee
```

**Naming convention:** `<domain>.<entity>.<past-tense-verb>`

Good: `order.created`, `payment.refund.initiated`, `inventory.stock.depleted`
Bad: `orderCreated`, `NEW_ORDER`, `order_event`

**Example:**

```yaml
events_published:
  - name: order.created
    summary: Emitted when a new order is successfully placed
    broker: kafka
    topic_or_exchange: orders.events
    ordering_key: customer_id
    retention_days: 7
    at_least_once: true
    schema:
      type: object
      required: [event_id, occurred_at, order_id, customer_id, total_amount]
      properties:
        event_id:
          type: string
          format: uuid
          description: Unique event identifier for deduplication
        occurred_at:
          type: string
          format: date-time
        order_id:
          type: string
          format: uuid
        customer_id:
          type: string
          format: uuid
        total_amount:
          type: number
          minimum: 0
        currency:
          type: string
          pattern: "^[A-Z]{3}$"
```

---

## `events_consumed[]`

Events from other domains this domain subscribes to and reacts to.

```yaml
events_consumed:
  - name: <string>               # required | must match a name in the publisher's contract
    from_domain: <string>        # required | must match a domain name in contracts/
    reaction: <string>           # required | what this domain does when it receives this event
    consumer_group: <string>     # required for Kafka | consumer group name
    failure_strategy: retry | dlq | ignore   # required
```

**Example:**

```yaml
events_consumed:
  - name: payment.confirmed
    from_domain: payment
    reaction: Transition order status from 'pending_payment' to 'confirmed'
    consumer_group: order-management.payment-consumer
    failure_strategy: dlq
```

---

## `depends_on[]`

Upstream domain contracts this domain's sync API depends on at runtime.

```yaml
depends_on:
  - domain: <string>             # required | must match a domain name in contracts/
    contract_id: <string>        # required | must match an api_contracts[].id
    reason: <string>             # required | why this dependency exists
    call_pattern: sync | async   # required
    circuit_breaker: true | false  # required | does this domain implement a circuit breaker?
    fallback: <string>           # required if circuit_breaker: true | what happens on failure
```

**Example:**

```yaml
depends_on:
  - domain: inventory
    contract_id: check-stock
    reason: Must verify item availability before confirming order
    call_pattern: sync
    circuit_breaker: true
    fallback: Return 503 with Retry-After header; do not create order
```

---

## `data_ownership[]`

Entities this domain owns exclusively. No other domain may write to these entities.
Reading (via API or event replay) is permitted.

```yaml
data_ownership:
  - entity: <string>             # required | PascalCase entity name
    description: <string>        # required
    storage: postgres | mysql | mongodb | dynamodb | redis | s3 | other
    pii: true | false            # required | contains personally identifiable information?
    retention_policy: <string>   # required | e.g. "7 years", "90 days", "indefinite"
```

**Example:**

```yaml
data_ownership:
  - entity: Order
    description: Customer purchase record including line items and status history
    storage: postgres
    pii: false
    retention_policy: 7 years
  - entity: OrderLineItem
    description: Individual product within an Order
    storage: postgres
    pii: false
    retention_policy: 7 years
```

---

## `sla`

Domain-level quality targets. These apply to all `api_contracts` unless
overridden by `sla_override` on an individual operation.

```yaml
sla:
  latency_p99_ms: <int>          # required | p99 response time in milliseconds
  latency_p50_ms: <int>          # optional | median response time
  availability_pct: <float>      # required | e.g. 99.9 (three nines)
  throughput_rps: <int>          # optional | peak requests per second
  consistency_model: strong | eventual | causal   # required
  rpo_minutes: <int>             # optional | recovery point objective (data loss tolerance)
  rto_minutes: <int>             # optional | recovery time objective (downtime tolerance)
```

**Example:**

```yaml
sla:
  latency_p99_ms: 200
  latency_p50_ms: 50
  availability_pct: 99.9
  throughput_rps: 500
  consistency_model: eventual
  rpo_minutes: 60
  rto_minutes: 15
```

---

## `implementation`

**Private block** — consumed only by the engineering skill assigned to this domain
and by the orchestrator's stack-router. Consuming domains must never reference
implementation details in their own contracts.

```yaml
implementation:
  stack: rust | python | go | node | typescript | java | kotlin | dotnet | other
  language_version: <string>     # e.g. "1.75", "3.12", "21"
  framework: <string>            # e.g. "axum", "fastapi", "gin", "express"
  database:
    type: postgres | mysql | mongodb | dynamodb | redis | s3 | other
    version: <string>
  message_broker:
    type: kafka | rabbitmq | sns | sqs | eventbridge | none
    version: <string>
  skill: <string>                # required | skill name for orchestrator routing
  build_priority: <int>          # required | 1 = build first; resolves dependency order
  repo: <string>                 # optional | git repository URL or path
  deploy_target: k8s | ecs | lambda | vm | other   # optional
```

**Example:**

```yaml
implementation:
  stack: typescript
  language_version: "22"
  framework: nestjs
  database:
    type: postgres
    version: "16"
  message_broker:
    type: kafka
    version: "3.7"
  skill: software-engineer-backend
  build_priority: 2
  deploy_target: k8s
```

---

## Complete Annotated Example

```yaml
schema_version: "1.0"
domain: order-management
version: 1.0.0
description: Manages the full lifecycle of customer orders from creation to fulfillment.
owner_team: platform-squad
status: active

api_contracts:
  - id: create-order
    summary: Create a new customer order
    protocol: REST
    method: POST
    path: /orders
    auth: jwt
    idempotent: false
    input_schema:
      type: object
      required: [customer_id, items]
      properties:
        customer_id: { type: string, format: uuid }
        items:
          type: array
          minItems: 1
          items:
            type: object
            required: [sku, quantity]
            properties:
              sku: { type: string }
              quantity: { type: integer, minimum: 1 }
    output_schema:
      type: object
      required: [order_id, status]
      properties:
        order_id: { type: string, format: uuid }
        status: { type: string, enum: [pending, confirmed] }
    error_codes:
      - code: 422
        description: Validation error
      - code: 503
        description: Inventory service unavailable

  - id: get-order
    summary: Retrieve order by ID
    protocol: REST
    method: GET
    path: /orders/{orderId}
    auth: jwt
    idempotent: true
    input_schema:
      type: object
      required: [orderId]
      properties:
        orderId: { type: string, format: uuid }
    output_schema:
      type: object
      required: [order_id, status, items, created_at]
      properties:
        order_id: { type: string, format: uuid }
        status:
          type: string
          enum: [pending, confirmed, shipped, delivered, cancelled]
        items:
          type: array
          items:
            type: object
            properties:
              sku: { type: string }
              quantity: { type: integer }
              unit_price: { type: number }
        created_at: { type: string, format: date-time }

events_published:
  - name: order.created
    summary: Emitted when an order is successfully placed
    broker: kafka
    topic_or_exchange: orders.events
    ordering_key: customer_id
    retention_days: 7
    at_least_once: true
    schema:
      type: object
      required: [event_id, occurred_at, order_id, customer_id]
      properties:
        event_id: { type: string, format: uuid }
        occurred_at: { type: string, format: date-time }
        order_id: { type: string, format: uuid }
        customer_id: { type: string, format: uuid }
        total_amount: { type: number, minimum: 0 }
        currency: { type: string, pattern: "^[A-Z]{3}$" }

  - name: order.cancelled
    summary: Emitted when an order is cancelled by customer or system
    broker: kafka
    topic_or_exchange: orders.events
    ordering_key: customer_id
    retention_days: 7
    at_least_once: true
    schema:
      type: object
      required: [event_id, occurred_at, order_id, reason]
      properties:
        event_id: { type: string, format: uuid }
        occurred_at: { type: string, format: date-time }
        order_id: { type: string, format: uuid }
        reason: { type: string, enum: [customer_request, payment_failed, stock_unavailable] }

events_consumed:
  - name: payment.confirmed
    from_domain: payment
    reaction: Transition order status to 'confirmed' and trigger fulfillment
    consumer_group: order-management.payment-consumer
    failure_strategy: dlq

  - name: inventory.stock.reserved
    from_domain: inventory
    reaction: Mark order items as reserved; proceed to payment step
    consumer_group: order-management.inventory-consumer
    failure_strategy: retry

depends_on:
  - domain: inventory
    contract_id: check-stock
    reason: Must verify stock availability synchronously before accepting order
    call_pattern: sync
    circuit_breaker: true
    fallback: Return 503 with Retry-After 30s; do not persist order

data_ownership:
  - entity: Order
    description: Core order record with status lifecycle
    storage: postgres
    pii: false
    retention_policy: 7 years
  - entity: OrderLineItem
    description: Individual SKU line within an order
    storage: postgres
    pii: false
    retention_policy: 7 years

sla:
  latency_p99_ms: 200
  latency_p50_ms: 40
  availability_pct: 99.9
  throughput_rps: 500
  consistency_model: eventual
  rpo_minutes: 60
  rto_minutes: 15

implementation:
  stack: typescript
  language_version: "22"
  framework: nestjs
  database:
    type: postgres
    version: "16"
  message_broker:
    type: kafka
    version: "3.7"
  skill: software-engineer-backend
  build_priority: 2
  deploy_target: k8s
```
