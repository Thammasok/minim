# Architecture Styles Reference

## Table of Contents
1. Monolith (Modular / Layered)
2. Microservices
3. Event-Driven Architecture (EDA)
4. CQRS + Event Sourcing
5. Serverless
6. Hexagonal / Ports & Adapters
7. Cell-Based Architecture
8. Service-Oriented Architecture (SOA)
9. Selection Guide

---

## 1. Monolith

### Variants
- **Layered (N-Tier)**: Presentation → Application → Domain → Infrastructure
- **Modular Monolith**: Single deployable unit with strong internal module boundaries (the modern recommended default)
- **Single-process**: All code in one process, shared memory

### When to Use
- Team < 10 engineers
- Early-stage product (high uncertainty)
- Simple domain with few integration points
- Need fast time-to-market
- Brownfield systems that haven't hit scaling pain yet

### Trade-offs
| | |
|---|---|
| ✅ Simple deployment | ❌ Scales as one unit |
| ✅ Easy to reason about | ❌ Can become a "big ball of mud" |
| ✅ Low operational overhead | ❌ Technology lock-in per component |
| ✅ Easy debugging/tracing | ❌ Long build/test cycles at scale |
| ✅ Strong consistency by default | ❌ Single point of failure |

### Key Pattern: Modular Monolith
Enforce module boundaries at build time (Java modules, NestJS modules, Go packages). Each module:
- Has its own public API (interfaces only, never reach into internals)
- Owns its own data (separate DB schemas at minimum)
- Communicates via in-process events or function calls

This is the stepping stone to microservices — your modules become your future services.

---

## 2. Microservices

### Definition
Independent, deployable services each owning a bounded business capability and its own data store.

### When to Use
- Multiple teams needing independent deployment cadences
- Different scaling requirements per component
- Polyglot persistence needs (some domains need graph DB, others relational, etc.)
- High organizational scale (Conway's Law in your favor)
- Domains are well-understood (not early-stage exploration)

### When NOT to Use
- Small team (< 6 engineers) — operational overhead kills velocity
- Unclear domain — you'll draw the wrong boundaries and regret it
- Tight latency budgets — network hops add up
- Strong consistency required across multiple entities

### Trade-offs
| | |
|---|---|
| ✅ Independent deployment | ❌ Distributed systems complexity |
| ✅ Per-service scaling | ❌ Eventual consistency everywhere |
| ✅ Tech stack flexibility | ❌ Network latency + failure modes |
| ✅ Fault isolation | ❌ Operational overhead (k8s, service mesh) |
| ✅ Team autonomy | ❌ Harder debugging / distributed tracing required |

### Service Granularity Heuristics
- **Too fine**: Services that are always deployed together, or always call each other synchronously
- **Too coarse**: Services that a single change requires modifying in multiple places
- **Right size**: A service is independently deployable; a 2-pizza team can fully own it

---

## 3. Event-Driven Architecture (EDA)

### Core Concepts
- **Events**: Immutable facts ("OrderPlaced", "PaymentFailed") — past tense
- **Producers**: Emit events without knowing consumers
- **Consumers**: React to events; multiple consumers can react to same event
- **Event Broker**: Kafka, RabbitMQ, AWS EventBridge, Google Pub/Sub

### Patterns Within EDA
- **Pub/Sub**: Fan-out to multiple consumers
- **Event Streaming**: Ordered, replayable log (Kafka) — enables temporal decoupling
- **Choreography**: No central orchestrator; services react to each other's events
- **Orchestration (Saga)**: Central coordinator tells services what to do next

### When to Use
- Decoupling producers from consumers
- Fan-out: one event triggers many downstream actions
- Audit log / event replay needs
- Async workflows where immediate response isn't required
- Cross-bounded-context communication

### Trade-offs
| | |
|---|---|
| ✅ Loose coupling | ❌ Hard to reason about flow |
| ✅ Excellent scalability | ❌ Eventual consistency |
| ✅ Natural audit trail | ❌ Debugging is hard (distributed tracing essential) |
| ✅ Resilient to consumer downtime | ❌ Event schema evolution is complex |
| ✅ Easy to add new consumers | ❌ Message ordering guarantees vary |

---

## 4. CQRS + Event Sourcing

### CQRS (Command Query Responsibility Segregation)
Separate the **write model** (commands that change state) from the **read model** (queries that read state).

```
Write Side: Command → Aggregate → Domain Events → Event Store
Read Side:  Event Store → Projections → Read Models (optimized for queries)
```

### Event Sourcing
Store state as a sequence of events, not current state. Reconstruct current state by replaying events.

```
Events: [AccountOpened, MoneyDeposited(100), MoneyWithdrawn(30)]
Current State: Balance = 70
```

### When to Use
- Audit log is a first-class requirement (finance, healthcare, compliance)
- Time-travel debugging needed
- Complex domain with many concurrent writes
- Read and write scaling requirements are very different
- Domain events are the natural language of the business

### When NOT to Use
- Simple CRUD apps — massive over-engineering
- Small teams unfamiliar with the pattern
- Low complexity domains
- Tight deadline (steep learning curve)

### Trade-offs
| | |
|---|---|
| ✅ Complete audit trail | ❌ High conceptual complexity |
| ✅ Temporal queries / time travel | ❌ Event schema migration is painful |
| ✅ Independent read/write scaling | ❌ Eventual consistency on read side |
| ✅ Natural fit for DDD aggregates | ❌ Query complexity pushed to projections |

---

## 5. Serverless

### Variants
- **FaaS**: AWS Lambda, Google Cloud Functions, Azure Functions
- **Serverless Containers**: AWS Fargate, Cloud Run
- **BaaS**: Managed databases, auth, storage

### When to Use
- Sporadic, bursty traffic (pay per use)
- Event-triggered processing (S3 upload → Lambda)
- Rapid prototyping
- Background jobs, scheduled tasks
- Microservices with very infrequent calls

### Trade-offs
| | |
|---|---|
| ✅ No infrastructure management | ❌ Cold starts add latency |
| ✅ Auto-scales to zero | ❌ Stateless by nature (no in-memory state) |
| ✅ Pay per execution | ❌ Vendor lock-in |
| ✅ Rapid iteration | ❌ Local debugging is harder |
| | ❌ Timeout limits (15 min on Lambda) |

---

## 6. Hexagonal Architecture (Ports & Adapters)

### Concept
Domain logic is the core. It communicates with the outside world only through **ports** (interfaces) and **adapters** (implementations).

```
[HTTP Adapter] → [Port: UserService] → [Domain Core] → [Port: UserRepository] → [DB Adapter]
[CLI Adapter]  ↗                                                                  ↗ [In-Memory Adapter (tests)]
```

### Benefits
- Domain logic is fully testable without infrastructure
- Easy to swap adapters (e.g., switch from Postgres to MongoDB without touching domain)
- Clear separation of concerns

### When to Use
- Complex domains where you want to protect business logic
- Systems needing high testability
- When you anticipate changing infrastructure components
- Often combined with DDD

---

## 7. Cell-Based Architecture

### Concept
Group services into isolated "cells" — each cell is a self-contained unit with its own compute, data, and networking. Cells don't share resources.

### When to Use
- Massive scale (hundreds of services)
- Strict blast-radius control (a cell failure doesn't cascade)
- Multi-region / multi-tenant isolation
- Platform teams building internal developer platforms

---

## 8. Selection Guide

```
Start here:
  Is this a new system with < 10 engineers? → Modular Monolith
  Is this a greenfield with unclear domain? → Modular Monolith (discover domain first)
  
  Multiple teams, independent deployment? → Microservices
    Are you doing cross-service workflows? → + Saga Pattern
    Is async decoupling needed? → + Event-Driven
    
  Need audit trail / time travel? → + Event Sourcing
  Read/write scaling asymmetry? → + CQRS
  
  Protecting domain logic from infra? → Hexagonal (applies at any scale)
  Bursty/infrequent workloads? → Serverless for those components
```

### Combining Styles
Most real systems combine styles:
- **Modular Monolith + Hexagonal**: Great default for most new systems
- **Microservices + EDA + Hexagonal per service**: Complex distributed systems
- **CQRS + Event Sourcing + DDD**: High-value complex domains with compliance needs
