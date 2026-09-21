# Domain-Driven Design (DDD) Reference

## Table of Contents
1. Strategic DDD
2. Tactical DDD
3. Bounded Context Patterns
4. Context Mapping
5. Practical Application Guide
6. Common Mistakes

---

## 1. Strategic DDD

Strategic DDD is about carving up a large domain into manageable, independently owned pieces.

### Ubiquitous Language
- A shared vocabulary between domain experts and engineers
- The same word means the same thing in code, conversation, and documentation
- **Key**: The word "Account" means something different in Banking vs Marketing — that's a signal of different bounded contexts

### Subdomains
| Type | Description | Investment |
|------|-------------|-----------|
| **Core Domain** | Competitive advantage; where the business wins | High investment, build in-house |
| **Supporting Domain** | Necessary but not differentiating | Medium investment, consider build or buy |
| **Generic Domain** | Commodity (auth, payments, email) | Low investment, buy/use SaaS |

### Bounded Context
A **Bounded Context** is an explicit boundary within which a domain model is consistent and unambiguous.

```
[E-Commerce System]
  ├── Bounded Context: Order Management
  │     └── "Order" = what a customer placed, has line items, status lifecycle
  ├── Bounded Context: Fulfillment
  │     └── "Order" = a warehouse pick-pack-ship unit
  ├── Bounded Context: Customer
  │     └── "Customer" = identity, preferences, account
  └── Bounded Context: Catalog
        └── "Product" = description, images, pricing
```

Each bounded context:
- Has its own model and ubiquitous language
- Has a clear public API (anti-corruption layer if needed)
- Is owned by one team
- Maps to one or more microservices (or modules in a monolith)

---

## 2. Tactical DDD

Tactical DDD is about modeling within a single bounded context.

### Building Blocks

#### Entity
- Has a unique **identity** that persists over time
- Two entities are equal if their IDs are equal, even if attributes differ
- Example: `Order(id=42)` is the same order even after status changes

```typescript
class Order {
  constructor(public readonly id: OrderId, public status: OrderStatus) {}
  equals(other: Order) { return this.id === other.id; }
}
```

#### Value Object
- Defined by its **attributes**, not identity
- Immutable — replace, don't mutate
- Example: `Money(amount=100, currency=USD)`, `Address`, `DateRange`

```typescript
class Money {
  constructor(readonly amount: number, readonly currency: Currency) {}
  add(other: Money): Money { // returns new instance
    if (this.currency !== other.currency) throw new Error("Currency mismatch");
    return new Money(this.amount + other.amount, this.currency);
  }
}
```

#### Aggregate
- A **cluster of entities and value objects** with a clear boundary
- Has one **Aggregate Root** — the only entry point for modifications
- Enforces invariants (business rules) across the cluster
- Persisted and loaded as a whole unit
- Communicate with other aggregates via **domain events**

```
Order (Aggregate Root)
  ├── OrderLine[] (entities within aggregate)
  └── ShippingAddress (value object)

Rule: You can ONLY access OrderLines through Order, never directly.
Rule: Order enforces "total items <= 50" invariant.
```

**Aggregate size heuristic**: Keep aggregates small. If loading the aggregate requires loading thousands of child entities, it's too big. Split.

#### Domain Event
- Something significant that **happened** in the domain — past tense
- Immutable fact; carry just enough data to describe what happened
- Used for: cross-aggregate communication, integration between bounded contexts, triggering side effects

```typescript
class OrderPlaced {
  constructor(
    public readonly orderId: OrderId,
    public readonly customerId: CustomerId,
    public readonly totalAmount: Money,
    public readonly occurredAt: Date
  ) {}
}
```

#### Repository
- Abstraction over persistence for aggregates
- Returns fully reconstituted aggregate roots
- Never returns partial aggregates

```typescript
interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>;
}
```

#### Domain Service
- Stateless operations that don't naturally belong to an entity or value object
- Named after a domain concept
- Example: `TransferService.transfer(fromAccount, toAccount, amount)`

#### Application Service
- Orchestrates use cases; coordinates domain objects
- No business logic here — that belongs in the domain
- Handles transactions, authorization, input validation (structural, not business)

---

## 3. Bounded Context Patterns

### How to Identify Bounded Contexts
1. **Follow the language**: Where does the meaning of a term shift? That's a boundary.
2. **Follow team ownership**: What does one team fully own?
3. **Follow change rate**: Parts that change together belong together.
4. **Event Storming**: Workshop technique — place domain events on a timeline, find natural clusters.

### Event Storming Quick Guide
Participants: domain experts + engineers, 4–8 people, 2–4 hours

Color coding (sticky notes):
- 🟠 Orange: Domain Events (things that happened)
- 🔵 Blue: Commands (what triggers the event)
- 🟡 Yellow: Actors (who issues the command)
- 🟣 Purple: Policies ("when X happens, then Y")
- 🟩 Green: Read Models (information actors need to make decisions)
- 🩷 Pink: External Systems / Bounded Contexts

Process:
1. Brainstorm domain events (no filtering yet)
2. Place on timeline
3. Add commands that caused each event
4. Find hotspots (conflicts, confusion) — these reveal context boundaries
5. Draw bounded context boundaries around clusters

---

## 4. Context Mapping

How bounded contexts relate to each other:

| Pattern | Description | Use When |
|---------|-------------|----------|
| **Shared Kernel** | Two contexts share a subset of the model | High trust teams, small shared model |
| **Customer-Supplier** | Upstream (supplier) provides API to downstream (customer) | Different teams, upstream controls changes |
| **Conformist** | Downstream accepts whatever upstream provides | No negotiating power (external API) |
| **Anti-Corruption Layer (ACL)** | Downstream translates upstream model to its own | Protecting your model from a legacy or external system |
| **Open Host Service** | Upstream publishes a formal protocol | Many consumers; upstream can't accommodate all |
| **Published Language** | Shared, well-documented exchange format (JSON schema, Protobuf) | Open Host Service + formal schema |
| **Partnership** | Both teams move together, co-own the interface | Tight collaboration, joint roadmaps |
| **Separate Ways** | No integration | Sometimes the right answer |

### ACL Example
```
[Legacy CRM] ──→ [ACL: CustomerTranslator] ──→ [Order Context]
                    maps CRM.Contact           uses Order.Customer
```

---

## 5. Practical Application Guide

### When to Apply DDD
✅ Complex business logic that can't be captured in simple CRUD
✅ Domain experts are available and willing to collaborate
✅ Long-lived system (worth the upfront investment)
✅ Multiple teams; need to divide and conquer

❌ Simple CRUD with minimal business rules
❌ Small team with tight deadline
❌ Domain is well understood and stable (no need for heavy modeling)

### Phased Approach
1. **Start with Event Storming** — Map the domain without code
2. **Identify bounded contexts** — Draw boundaries
3. **Pick your core domain** — Where to invest in DDD tactical patterns
4. **Use lighter patterns elsewhere** — CRUD is fine for generic/support domains
5. **Evolve the model** — DDD is iterative; refactor as you learn

### Mapping DDD to Microservices
```
Bounded Context → (usually) one or more services
Aggregate → (usually) owns one DB table/collection
Domain Event → message on the event bus between services
Repository → one per aggregate, within a service
ACL → a dedicated adapter/translator layer at service boundary
```

---

## 6. Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Anemic domain model | Entities are just data bags; logic in services | Move business logic into entities/aggregates |
| Too large aggregates | Performance issues; optimistic locking conflicts | Split by invariant boundary, not convenience |
| Shared database between contexts | Tight coupling; defeats context isolation | Each context owns its data |
| Treating every domain as "core" | Over-engineering generic domains | Classify subdomains; use CRUD for generic/support |
| Skipping ubiquitous language | Code drift from business concepts | Regular domain expert reviews of the model |
| One entity per service | Too granular; chatty network calls | Group by aggregate or bounded context |
