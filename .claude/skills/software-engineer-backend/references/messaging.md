# Messaging — Brokers & Event Streaming

For work that shouldn't block a request or that crosses service boundaries. Three tools,
different jobs — pick by shape, not familiarity.

## Which broker

| Tool | Model | Reach for |
|---|---|---|
| **BullMQ** (Redis) | Job queue | In-app background jobs, retries, cron — single app owns the work. See `references/queues.md` |
| **RabbitMQ** | Message broker | Flexible routing (topic/fanout/direct), task distribution across services, per-message ack |
| **Kafka** | Event log / stream | High-throughput event streaming, replayable log, multiple independent consumers, event sourcing |

Rule of thumb: **BullMQ** for "run this later," **RabbitMQ** for "route this message to the
right consumer," **Kafka** for "durable stream many services replay independently."

## Core concepts (shared vocabulary)

- **Producer / Consumer** — who sends vs who processes.
- **Topic / Queue / Exchange** — where messages land + how they're routed.
- **Consumer group** — a set of consumers sharing a workload (Kafka partitions split across them).
- **Ack / Nack** — consumer confirms success (message removed) or failure (redeliver/DLQ).
- **Delivery guarantee** — almost always **at-least-once** ⇒ consumers must be **idempotent**.
  Exactly-once is rare and expensive; design for duplicates instead.

## RabbitMQ (amqplib)

```typescript
import amqp from 'amqplib'

// Producer
const conn = await amqp.connect(process.env.RABBITMQ_URL!)
const ch = await conn.createChannel()
await ch.assertExchange('orders', 'topic', { durable: true })
ch.publish('orders', 'order.created', Buffer.from(JSON.stringify(order)), { persistent: true })

// Consumer — manual ack, DLQ on failure
await ch.assertQueue('email-svc', {
  durable: true,
  deadLetterExchange: 'orders.dlx',   // failed messages go here, not lost
})
await ch.bindQueue('email-svc', 'orders', 'order.created')
await ch.prefetch(10)   // don't fetch more than you can process
ch.consume('email-svc', async (msg) => {
  if (!msg) return
  try {
    await handleOrder(JSON.parse(msg.content.toString()))
    ch.ack(msg)
  } catch (err) {
    ch.nack(msg, false, false)   // don't requeue → routes to DLQ
  }
})
```
`persistent`/`durable` survive broker restart; `prefetch` prevents one consumer hogging;
a **dead-letter queue** captures poison messages instead of infinite redelivery.

## Kafka (kafkajs)

```typescript
import { Kafka } from 'kafkajs'
const kafka = new Kafka({ clientId: 'orders', brokers: [process.env.KAFKA_BROKER!] })

// Producer — key controls partition (same key ⇒ same partition ⇒ ordered)
const producer = kafka.producer()
await producer.connect()
await producer.send({
  topic: 'orders',
  messages: [{ key: order.id, value: JSON.stringify(order) }],
})

// Consumer group — Kafka splits partitions across group members
const consumer = kafka.consumer({ groupId: 'email-service' })
await consumer.connect()
await consumer.subscribe({ topic: 'orders', fromBeginning: false })
await consumer.run({
  eachMessage: async ({ message }) => {
    await handleOrder(JSON.parse(message.value!.toString()))
    // offset auto-commits after success; commit manually for finer control
  },
})
```
Ordering is per-partition only. Same-key messages share a partition (stays ordered);
throughput scales by adding partitions + consumers in the group.

## Pub/Sub

Fanout: one event, many independent subscribers. RabbitMQ `fanout` exchange, Kafka multiple
consumer groups on one topic, or Redis pub/sub for ephemeral in-memory signals (no durability).

## Outbox pattern (the reliability pattern for microservices)

Problem: you must **update the DB and publish an event atomically**. Do them separately and a
crash between the two loses the event (or publishes one that got rolled back).

Solution: write the event to an `outbox` table **in the same DB transaction** as the state
change, then a relay publishes committed outbox rows to the broker.

```typescript
await db.transaction(async (trx) => {
  await trx('orders').insert(order)
  await trx('outbox').insert({                 // same txn ⇒ atomic
    id: randomUUID(),
    topic: 'order.created',
    payload: JSON.stringify(order),
    published: false,
  })
})
// Separate relay (poller or Debezium CDC) reads unpublished rows → publishes → marks published
```
Guarantees the event exists iff the state change committed. Pair with idempotent consumers to
tolerate the resulting at-least-once redelivery.

## Idempotent consumers

Since delivery is at-least-once, the same message can arrive twice. Make handlers safe to rerun:
- Dedup on a **message/event id** (store processed ids, skip seen ones), or
- Make the operation naturally idempotent (upsert, `SET status='paid'` not `balance -= x`).

```typescript
async function handleOrder(evt) {
  const seen = await db('processed_events').where({ id: evt.id }).first()
  if (seen) return                          // already handled — skip
  await db.transaction(async (trx) => {
    await doWork(trx, evt)
    await trx('processed_events').insert({ id: evt.id })
  })
}
```

## Best practices

- **Idempotent consumers always** — at-least-once is the default reality.
- **Versioned event schemas** — add fields, don't repurpose; consumers deploy independently.
- **DLQ + alerting** on poison messages; never silently drop or infinitely requeue.
- **Backpressure**: set `prefetch` (RabbitMQ) / limit concurrency; don't fetch faster than you process.
- **Don't put huge payloads on the bus** — publish an id/pointer, fetch the body from source (claim-check).
- **Outbox (or CDC)** whenever a state change and its event must both happen or neither.

## Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Duplicate side effects | At-least-once + non-idempotent handler | Dedup on event id / idempotent op |
| Event lost after crash | Publish separate from DB commit | Outbox pattern |
| One consumer overloaded | No prefetch / concurrency cap | Set `prefetch` / limiter |
| Poison message loops forever | Requeue on failure, no DLQ | Route failures to a dead-letter queue |
| Consumers break on new field | Breaking schema change | Additive, versioned event contracts |
