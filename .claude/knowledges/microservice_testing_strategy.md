---
name: testing-strategies-in-a-microservice-architecture
description: Use when implementing any feature or bugfix by follow this structure, before writing implementation code
---

# Testing Strategies in a Microservice Architecture

Source:
https://martinfowler.com/articles/microservice-testing/

Author: Toby Clemson  
Published: 18 Nov 2014

---

# Overview

Microservice architecture introduces additional complexity in testing because services are distributed across network boundaries.

Compared to monolithic systems, testing strategies must now handle:

- Network communication
- Service dependencies
- Independent deployments
- Distributed failures
- Contract consistency
- Infrastructure configuration

The article explains different testing layers and how to combine them effectively.

---

# Microservice Architecture

A microservice architecture consists of:

- Small independently deployable services
- Separate business capabilities
- Independent scaling
- Independent teams
- Communication over network protocols (HTTP, messaging, etc.)

Benefits:

- Faster deployment
- Better scalability
- Team autonomy
- Technology flexibility

Challenges:

- Distributed systems complexity
- Increased testing complexity
- More moving parts
- Harder integration validation

---

# Anatomy of a Microservice

A microservice commonly contains:

## 1. Resource Layer

Responsibilities:

- HTTP/API handling
- Request validation
- Response mapping

Usually thin and lightweight.

---

## 2. Domain Layer

Contains:

- Business logic
- State transitions
- Calculations
- Business rules

This is the core of the service.

---

## 3. Repository Layer

Responsibilities:

- Data persistence
- Database interaction
- Entity retrieval/storage

---

# Layer Definitions

Before describing call patterns it is important to agree on what each layer means.

| Layer | Role | Files in this project |
|---|---|---|
| **Resource** | HTTP boundary — parse request, validate input, format response | `*.controller.ts`, `*.route.ts` |
| **Service** | Orchestration — coordinate repositories, enforce business rules, log activity | `*.service.ts` |
| **Domain** | Pure logic — calculations, state machines, value transformations with no I/O | `*.logic.ts`, `*.query.ts`, pure helper functions |
| **Repository** | Data access — all Prisma/DB queries, always filters `isRemove` | `*.repository.ts` |
| **Gateway** | External I/O adapter — email, S3, Google Calendar, Anthropic SDK, Redis | `libs/mail`, `libs/storage`, `api/google-calendar`, etc. |

The rule of thumb: **each layer may only call layers below it** (toward infrastructure). A layer must never call the layer above it (toward HTTP).

---

# Layer Call Patterns

All eight valid patterns are listed below. Pick the simplest one that fits the use case — do not add layers that add no value.

---

## Pattern 1 — Resource → Service → Repository

**The standard pattern for most features.**

Use when:
- Business rules exist (auth checks, not-found guards, activity logging)
- The operation modifies data

```text
Resource → Service → Repository
```

```typescript
// deal.controller.ts
export const createDeal = async (req, res, next) => {
  try {
    const deal = await DealService.createDeal({ accountId: req.account.id, ...req.body })
    return res.status(StatusCodes.CREATED).json({ data: deal })
  } catch (error) { next(error) }
}

// deal.service.ts
export const createDeal = async (data: ICreateDeal) => {
  const deal = await DealRepository.createDeal(data)
  await ActivityService.log({ ... })
  return deal
}

// deal.repository.ts
export const createDeal = async (data: ICreateDeal) => {
  return db.deal.create({ data, select: DEAL_SELECT })
}
```

---

## Pattern 2 — Resource → Service → Domain → Repository

Use when:
- The service contains complex logic that warrants its own isolated, testable unit
- Domain functions are reused across multiple services

```text
Resource → Service → Domain → Repository
```

```typescript
// payment.service.ts
import * as PaymentDomain from './payment.logic'
import * as PaymentRepository from './payment.repository'

export const createPayment = async (data: ICreatePayment) => {
  // Domain: pure calculation, no I/O
  const fee = PaymentDomain.calculateFee(data.amount, data.currency)
  const finalAmount = PaymentDomain.applyDiscount(data.amount, data.discountCode)

  return PaymentRepository.createPayment({ ...data, fee, amount: finalAmount })
}

// payment.logic.ts — pure functions, no imports from db or services
export const calculateFee = (amount: number, currency: string): number => {
  return currency === 'USD' ? amount * 0.03 : amount * 0.015
}

export const applyDiscount = (amount: number, code?: string): number => {
  if (code === 'PROMO10') return amount * 0.9
  return amount
}
```

Domain functions are pure — they take values and return values with no side effects.

---

## Pattern 3 — Resource → Service → Domain

Use when:
- The operation produces a result purely from input data, with no persistence needed
- The domain result is returned directly to the caller

```text
Resource → Service → Domain
```

```typescript
// quote.service.ts
import * as InsuranceDomain from './insurance.logic'

export const calculateQuote = (data: IQuoteInput) => {
  // No repository call needed — result is computed, not stored
  return InsuranceDomain.computePremium(data)
}

// insurance.logic.ts
export const computePremium = (data: IQuoteInput): IQuoteResult => {
  const base = data.sumInsured * 0.02
  const risk = data.age > 60 ? base * 1.5 : base
  return { premium: risk, currency: 'THB' }
}
```

---

## Pattern 4 — Resource → Service → Gateways

Use when:
- The operation calls an external system (email, storage, calendar, AI)
- No database persistence is involved in the primary flow

```text
Resource → Service → Gateway
```

```typescript
// notification.service.ts
import { sendMail } from '../../libs/mail'

export const sendWelcomeEmail = async (email: string, name: string) => {
  await sendMail({
    to: [{ email, name }],
    template_uuid: TEMPLATES.WELCOME,
    template_variables: { name },
  })
  return { sent: true }
}
```

Gateways encapsulate third-party SDKs so the service never imports them directly.

---

## Pattern 5 — Resource → Repository

Use when:
- The endpoint is a simple read with no business rules
- No activity logging, no guards, no orchestration required

```text
Resource → Repository
```

```typescript
// address.controller.ts
export const getAddress = async (req, res, next) => {
  try {
    const { postalCode } = req.query
    if (!postalCode) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Missing postal code' })
    }
    const address = await AddressRepository.findByPostalCode(postalCode as string)
    return res.status(StatusCodes.OK).json({ data: address })
  } catch (error) { next(error) }
}
```

Suitable for: read-only lookups, health checks, reference data (address lookup by postal code, country lists, etc.).

**Never use this pattern for mutations** — mutations must go through a service for activity logging and guards.

---

## Pattern 6 — Resource → Service

Use when:
- The service handles everything itself with no external I/O and no repository
- The result is derived from the input or in-memory state (e.g., token generation, OTP)

```text
Resource → Service
```

```typescript
// otp.controller.ts
export const generateOtp = async (req, res, next) => {
  try {
    const result = OtpService.generateOtp({ length: 6 })
    return res.status(StatusCodes.OK).json({ data: result })
  } catch (error) { next(error) }
}

// otp.service.ts — no repository, no gateway
export const generateOtp = ({ length }: { length: number }) => {
  const otp = crypto.randomInt(10 ** (length - 1), 10 ** length).toString()
  return { otp, expiresAt: new Date(Date.now() + 5 * 60 * 1000) }
}
```

---

## Pattern 7 — Resource → Domain

Use when:
- The response is a pure computation on the request input
- No service coordination is needed at all (no I/O, no state)

```text
Resource → Domain
```

```typescript
// calculator.controller.ts
export const convertCurrency = async (req, res, next) => {
  try {
    const { amount, from, to } = req.query
    const result = CurrencyDomain.convert(Number(amount), from as string, to as string)
    return res.status(StatusCodes.OK).json({ data: result })
  } catch (error) { next(error) }
}

// currency.logic.ts
export const convert = (amount: number, from: string, to: string) => {
  const rates: Record<string, number> = { THB: 1, USD: 36.5 }
  return (amount / rates[from]) * rates[to]
}
```

Use sparingly — most resources should talk to a service, not a domain function directly.

---

## Pattern 8 — Resource → Gateway

Use when:
- The resource proxies an external API call directly with no business logic
- Typically used in lightweight proxy or webhook endpoints

```text
Resource → Gateway
```

```typescript
// webhook.controller.ts
export const receiveStripeWebhook = async (req, res, next) => {
  try {
    const event = StripeGateway.parseWebhook(req.body, req.headers['stripe-signature'])
    return res.status(StatusCodes.OK).json({ data: { received: true } })
  } catch (error) { next(error) }
}
```

Use only when no orchestration or persistence is involved. In most cases a service layer should sit between the resource and the gateway.

---

# Pattern Selection Guide

```text
Does it touch the database?
  Yes → needs a Repository
    Does it have business rules, guards, or activity logging?
      Yes → Resource → Service → Repository          (Pattern 1)
      No  → Resource → Service → Repository          (Pattern 1, thin service)
      No  → Resource → Repository                    (Pattern 5, reads only)

Does it call an external system (email, S3, calendar)?
  Yes → needs a Gateway
    Does it also have business logic?
      Yes → Resource → Service → Gateway             (Pattern 4)
      No  → Resource → Gateway                       (Pattern 8, rare)

Is the result purely computed from inputs?
  Yes → needs a Domain function
    Does it also need persistence?
      Yes → Resource → Service → Domain → Repository (Pattern 2)
      No  → Resource → Service → Domain              (Pattern 3)
             or Resource → Domain                    (Pattern 7, only if trivial)

Does the service do everything with no I/O?
  Yes → Resource → Service                           (Pattern 6)
```

---

## Layer Responsibilities Reference

### Resource (`*.controller.ts`)

- Parse `req.params`, `req.query`, `req.body`, `req.account`
- Pass errors to `next(error)` — never handle them inline
- Wrap responses: `{ data }` for success / `{ message }` for errors
- No business logic, no DB calls

### Service (`*.service.ts`)

- Enforce business rules and guards (throw `HttpException` on violations)
- Orchestrate repositories and gateways
- Log activity via `ActivityService.log` for customer-owned mutations
- Call domain functions for complex calculations
- No `req`/`res` knowledge

### Domain (`*.logic.ts`, `*.query.ts`)

- Pure functions only — input in, value out, no side effects
- No imports from `db`, repositories, gateways, or other services
- Fully unit-testable without mocks

### Repository (`*.repository.ts`)

- All Prisma queries live here — no raw SQL or `db` calls outside this layer
- Always filter `isRemove: IS_REMOVE.NOT_REMOVED` on reads
- Use `select` to avoid over-fetching
- Use `$transaction` for multi-step writes

### Gateway (e.g. `libs/mail`, `libs/storage`, `api/google-calendar`)

- Wraps a third-party SDK or external HTTP call
- Translates domain concepts into provider-specific format
- Handles provider errors and translates them into domain errors
- Never imports from `db` or repositories

---

# Anti-Patterns to Avoid

| Anti-pattern | Why it is wrong |
|---|---|
| Service imports `db` directly | Bypasses the repository layer; breaks integration test isolation |
| Controller imports a repository | Skips business rules and activity logging |
| Repository calls another repository | Creates hidden coupling; use a service or transaction instead |
| Domain function has side effects (I/O) | Makes it untestable as a pure unit; move I/O to service or gateway |
| Gateway contains business logic | Gateway becomes a hidden service; logic cannot be unit-tested |

---

# Relationship Between Architecture and Testing

The layered separation exists mainly to improve testing strategies.

Typical mapping:

| Layer | File | Preferred Test Type |
|---|---|---|
| Domain (`*.service.ts`) | `payment.service.test.ts` | Unit Test |
| Repository (`*.repository.ts`) | `payment.repository.test.ts` | Integration Test |
| Resource/API (`*.controller.ts` + route) | `payment.route.test.ts` | Component Test (supertest) |
| Whole System | e2e/ | End-to-End Test |

---

# Modern Architecture Interpretation

Modern systems often evolve beyond traditional layered architecture.

Common approaches:

- Hexagonal Architecture
- Clean Architecture
- Vertical Slice Architecture
- Feature-Based Architecture

Example flow:

```text
API -> UseCase -> Domain -> Port
                       ↓
                  Adapter/Repository
```

This approach improves:

- Testability
- Maintainability
- Infrastructure isolation
- Independent evolution of components

---

# Practical Rules for Production Systems

See the **Layer Call Patterns** section above for the full catalogue of valid patterns (Patterns 1–8) and the Pattern Selection Guide.

Quick reference:

| Scenario | Pattern |
|---|---|
| Simple read, no business rules | Resource → Repository |
| Standard feature with business rules | Resource → Service → Repository |
| Feature with pure calculations + persistence | Resource → Service → Domain → Repository |
| Feature with external I/O (email, S3, calendar) | Resource → Service → Gateway |
| Pure computation from input | Resource → Service → Domain |

---

# Testing Strategies

The article describes several testing levels:

1. Unit Testing
2. Integration Testing
3. Component Testing
4. Contract Testing
5. End-to-End Testing

---

# 1. Unit Testing

Unit tests validate small pieces of logic.

Two major styles:

---

## Sociable Unit Testing

Tests behavior through state changes.

Characteristics:

- Uses real collaborators
- Treats unit as black box
- Focuses on outcomes

Best for:

- Domain logic
- Business rules
- Calculations

---

## Solitary Unit Testing

Tests interaction between objects.

Characteristics:

- Uses mocks/stubs/test doubles
- Verifies interactions
- Isolates dependencies

Best for:

- Coordination logic
- Infrastructure code
- External communication

---

# Unit Testing Recommendations

Use:

- Real objects for domain-heavy logic
- Test doubles for infrastructure dependencies

Avoid:

- Excessive mocking of business logic
- Coupling tests to implementation details

---

# 2. Integration Testing

Integration tests verify communication with external systems.

Examples:

- Databases
- Message brokers
- External APIs
- Third-party services

Goals:

- Validate infrastructure behavior
- Ensure compatibility
- Detect configuration issues

---

# Integration Testing Challenges

Microservices increase complexity because:

- Services communicate over network
- Failures are partial
- Data consistency is distributed
- Environment setup is harder

---

# 3. Component Testing

Component testing validates a service as a whole.

The entire microservice is started and tested through public APIs.

External dependencies are replaced by test doubles.

---

# In-Process Component Testing

Characteristics:

- Service runs in-memory
- No real network calls
- Fast execution
- Minimal infrastructure

Advantages:

- Fast feedback
- Lower build complexity
- Stable execution

---

# Out-of-Process Component Testing

Characteristics:

- Uses actual network stack
- More realistic deployment
- Better infrastructure validation

Advantages:

- Closer to production
- Better confidence

Disadvantages:

- Slower
- More brittle
- More infrastructure setup

---

# 4. Contract Testing

Contract testing ensures services agree on communication formats.

Especially useful because:

- Services are independently deployable
- Teams evolve APIs independently

---

## Consumer-Driven Contract Testing

Consumers define expectations.

Providers validate that they satisfy contracts.

Benefits:

- Prevents integration breakage
- Faster feedback
- Reduces dependency on E2E tests

Popular tools:

- Pact
- Spring Cloud Contract

---

# 5. End-to-End Testing

E2E tests validate the entire system from user perspective.

Characteristics:

- Full deployment
- Real infrastructure
- Cross-service validation
- Business workflow focused

---

# E2E Testing Goals

Validate:

- User journeys
- Infrastructure configuration
- Service orchestration
- Real-world behavior

Examples:

- User registration
- Payment processing
- Order fulfillment

---

# Problems with E2E Testing

E2E tests are:

- Slow
- Expensive
- Hard to maintain
- Brittle
- Difficult to debug

Microservices increase these problems because there are more components involved.

---

# Recommended Testing Pyramid

The article recommends a balanced testing strategy.

## Large Base

### Unit Tests

Most tests should be unit tests because they are:

- Fast
- Cheap
- Stable

---

## Middle Layer

### Component + Contract Tests

Provide confidence across service boundaries.

---

## Small Top

### End-to-End Tests

Only critical user flows should use E2E testing.

Avoid excessive E2E coverage.

---

# Suggested Test Distribution

| Test Type | Quantity | Speed | Stability |
|---|---|---|---|
| Unit Tests | High | Fast | Stable |
| Component Tests | Medium | Moderate | Moderate |
| Contract Tests | Medium | Fast | Stable |
| E2E Tests | Low | Slow | Brittle |

---

# Project Testing Examples

## Unit Test — Service Layer

```typescript
// payment.service.test.ts
import * as PaymentRepository from './payment.repository'
import * as PaymentService from './payment.service'

jest.mock('./payment.repository')

describe('PaymentService.approvePayment', () => {
  it('returns null when payment does not exist', async () => {
    (PaymentRepository.getPaymentById as jest.Mock).mockResolvedValue(null)
    const result = await PaymentService.approvePayment('missing-id', 'account-1')
    expect(result).toBeNull()
  })

  it('updates status to approved', async () => {
    const mockPayment = { id: 'pay-1', status: 'pending' }
    ;(PaymentRepository.getPaymentById as jest.Mock).mockResolvedValue(mockPayment)
    ;(PaymentRepository.updatePaymentStatus as jest.Mock).mockResolvedValue({ ...mockPayment, status: 'approved' })

    const result = await PaymentService.approvePayment('pay-1', 'account-1')
    expect(result?.status).toBe('approved')
  })
})
```

## Integration Test — Repository Layer

```typescript
// payment.repository.test.ts — hits a real test database
import db from '../../libs/db/prisma'
import * as PaymentRepository from './payment.repository'

describe('PaymentRepository', () => {
  afterEach(async () => {
    await db.payments.deleteMany()
  })

  it('creates and retrieves a payment', async () => {
    const created = await PaymentRepository.createPayment({
      accountId: 'acc-1',
      amount: 100,
      currency: 'THB',
    })
    const found = await PaymentRepository.getPaymentById(created.id)
    expect(found?.id).toBe(created.id)
  })
})
```

## Component Test — Route/Controller Layer

```typescript
// payment.route.test.ts — uses supertest against the Express app
import request from 'supertest'
import app from '../../boot/app'

describe('POST /api/v1/payment', () => {
  it('creates a payment for authenticated user', async () => {
    const res = await request(app)
      .post('/api/v1/payment')
      .set('Authorization', `Bearer ${testAccessToken}`)
      .set('x-device-id', 'test-device')
      .send({ amount: 500, currency: 'THB' })

    expect(res.status).toBe(201)
    expect(res.body.data.amount).toBe(500)
  })

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/v1/payment')
      .send({ amount: 500, currency: 'THB' })

    expect(res.status).toBe(401)
  })
})
```

---

# Key Takeaways

## 1. Prefer Smaller Scoped Tests

Smaller tests are:

- Faster
- Easier to debug
- More reliable

---

## 2. Avoid Over-Reliance on E2E Tests

Too many E2E tests create:

- Slow pipelines
- Flaky builds
- Maintenance burden

---

## 3. Use Contract Testing Extensively

Contract testing is critical for:

- Independent deployments
- API evolution
- Team autonomy

---

## 4. Keep Feedback Fast

Fast feedback loops improve:

- Developer productivity
- CI/CD efficiency
- Deployment confidence

---

# Practical Modern Interpretation

In modern cloud-native systems, teams often combine:

- Unit Tests
- API Tests
- Contract Tests
- Component Tests
- Limited E2E Tests
- Observability
- Synthetic Monitoring

to achieve confidence without excessive testing cost.

---

# Related Concepts

- Test Pyramid
- Consumer-Driven Contracts
- Domain-Driven Design
- CI/CD
- Distributed Systems
- Service Virtualization

---

# References

- https://martinfowler.com/articles/microservice-testing/
- https://martinfowler.com/articles/microservices.html

