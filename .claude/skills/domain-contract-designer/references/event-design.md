# Event Design Reference

Guidelines for designing domain events: naming, schema evolution,
versioning, and broker-specific notes.

---

## Event Naming Convention

Format: `<domain>.<entity>.<past-tense-verb>`

| Good | Bad | Reason |
|---|---|---|
| `order.created` | `orderCreated` | Use dots, not camelCase |
| `payment.refund.initiated` | `PAYMENT_REFUND` | Verbs must be past tense |
| `inventory.stock.depleted` | `inventory_event` | Too generic |
| `user.email.verified` | `user.verify` | Use past tense |

**Sub-entity events:** When an event concerns a sub-entity, use three segments:
`<domain>.<sub-entity>.<verb>` — e.g., `order.lineitem.removed`.

---

## Mandatory Event Envelope Fields

Every event schema **must** include these fields regardless of domain:

```yaml
event_id:
  type: string
  format: uuid
  description: Globally unique identifier; used for deduplication

occurred_at:
  type: string
  format: date-time
  description: When the domain state change occurred (not when published)

schema_version:
  type: string
  description: Semver of this event's schema; e.g. "1.0.0"
```

Then add domain-specific payload fields.

---

## Schema Evolution Rules

### Non-breaking changes (allowed without version bump):
- Adding a new **optional** field
- Widening an enum (adding values, not removing)
- Relaxing a constraint (e.g., increasing `maxLength`)

### Breaking changes (require major version bump):
- Removing a field
- Renaming a field
- Changing a field's type
- Narrowing an enum (removing values)
- Tightening a constraint

### Versioning strategy:
When a breaking change is required:
1. Bump `schema_version` to next major (e.g., `1.x.x` → `2.0.0`)
2. Publish both old and new schema versions in the contract
3. Keep old schema active for a **deprecation window** (recommend: 30 days minimum)
4. Notify all `events_consumed.from_domain` references to migrate

---

## Broker-Specific Notes

### Kafka
- Use `ordering_key` to set the partition key — events with the same key land on
  the same partition and are ordered
- `consumer_group` in `events_consumed` must be unique per consuming domain to
  ensure independent consumption
- Set `retention_days` based on your slowest consumer's recovery time
- Recommended: enable idempotent producers to avoid duplicates

### RabbitMQ
- `topic_or_exchange` is the exchange name; routing key is typically the event name
- Use topic exchanges for `<domain>.*` subscription patterns
- Dead-letter queue (DLQ) must be configured when `failure_strategy: dlq`

### AWS SNS / SQS
- `topic_or_exchange` is the SNS topic ARN
- Each consumer domain gets its own SQS queue subscribed to the SNS topic
- Enable message deduplication on FIFO queues if `at_least_once: false` is needed
- Set visibility timeout ≥ max processing time to avoid double-delivery

### AWS EventBridge
- `topic_or_exchange` is the event bus name
- Define event patterns in the consumer's infrastructure config (not in the contract)
- Suitable for cross-account event routing in multi-team setups

---

## Idempotency Design

All event consumers **must** be idempotent. Design guidance:

1. Use `event_id` as the deduplication key — store processed IDs in a short-lived
   cache (Redis) or in the domain's own DB
2. Processing the same event twice must produce the same outcome
3. Document idempotency guarantee in the `reaction` field of `events_consumed`

---

## Common Anti-patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| Event carries the full entity state | Creates tight coupling; consumers depend on internal model | Carry only changed fields + entity ID; consumers fetch full state if needed |
| Event triggers synchronous callbacks | Defeats async decoupling | Use choreography (react to events) not orchestration (command-response) |
| Two domains share a Kafka topic with no schema registry | Schema drift causes silent failures | Each domain owns its topic; use Avro or JSON Schema registry |
| Consumer modifies the event before passing downstream | Contract violation | Consumers transform into internal models; never re-publish mutated events |
| Event name is a command: `order.create` | Commands are imperative; events are facts | Past tense: `order.created` |
