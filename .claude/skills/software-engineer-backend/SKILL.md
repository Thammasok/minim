---
name: software-engineer-backend
description: >
  Expert Backend Engineer for Node.js/TypeScript server-side development. Use whenever
  the user mentions: Express, Fastify, NestJS, REST API, GraphQL, API design,
  middleware, controller, service layer, repository pattern, dependency injection, database
  schema, Prisma, TypeORM, Drizzle, Knex, query builder, SQL, PostgreSQL, MySQL, MongoDB,
  Redis, Qdrant, vector database, embedding, semantic search, RAG, caching, queue, BullMQ,
  Kafka, RabbitMQ, pub/sub, microservices, authentication, JWT, OAuth2, authorization, RBAC,
  rate limiting, CORS, Helmet, input validation, Zod, environment config, Docker, deployment,
  backend performance, observability, logging, tracing, N+1 query, connection pool, database index,
  migration, seed, 12-factor, twelve-factor, stateless processes, config management, or asks
  to "build an API", "design a schema", "add authentication", "optimize a query", "secure
  an endpoint", "write a service", "fix a backend bug", or "check/review/audit the backend
  against 12-factor". Always trigger for any server-side engineering, database, or infrastructure
  task — even without the words "backend engineer".
---

# Software Engineer — Backend

## Response Mode

- **Quick fix / specific question** → Code immediately, minimal prose
- **Design / architecture** → Explain trade-offs, then code
- **Code review** → Issues list → fixes with reasoning
- **Debug** → Root cause first, then fix

## Comments

A comment earns its place only if a competent reader who skipped it would **get something wrong** —
a trap, an external constraint, or a rejected alternative that will be re-proposed. "Explain why,
not what" is not enough on its own: a *why* can be invented for anything, and inventing one for
every block is how a file ends up 40% prose. Delete restatements of the signature, narration of the
obvious, and defences of choices nobody will challenge. Above ~20% comment lines in a file, re-read
it. Full rule, budget, and worked examples → `knowledges/code-comments.md`.

---

## 1. Stack & Defaults

```
Runtime:    Node.js 20 LTS (TypeScript strict mode)
Framework:  Express.js (simple APIs) | NestJS (enterprise/complex)
Data access: Prisma (default) | Drizzle (edge/perf) | Knex (raw-SQL control) | TypeORM (legacy)
Database:   PostgreSQL (relational) | MongoDB (document) | Redis (cache/queue)
Vector DB:  Qdrant (semantic search / RAG / recommendations)
Validation: Zod (runtime + type inference)
Auth:       JWT + Refresh Token | Passport.js | NextAuth (if Next.js)
Queue:      BullMQ (Redis-backed)
Testing:    Vitest + Supertest (integration) | Pact.js (contract)
Deploy:     Docker + Railway / Render / AWS ECS
```

**When to use NestJS over Express:**
- Team > 3 engineers, or project > 6 months
- Need dependency injection, decorators, modular architecture
- Building microservices with consistent structure
- Otherwise Express + manual layering is faster to ship

---

## 2. Project Structure

### Express (layered)
```
src/
├── app.ts              # Express app setup (no listen here)
├── server.ts           # Bind port, start server
├── config/             # Env validation (Zod)
├── middleware/         # Auth, error handler, rate limit
├── modules/
│   └── users/
│       ├── users.router.ts
│       ├── users.controller.ts   # HTTP in/out only
│       ├── users.service.ts      # Business logic
│       ├── users.repository.ts   # DB access
│       └── users.schema.ts       # Zod validation schemas
├── lib/
│   ├── prisma.ts       # Singleton Prisma client
│   └── redis.ts        # Singleton Redis client
└── types/              # Shared TS types/interfaces
```

### NestJS
```
src/
├── app.module.ts
├── modules/
│   └── users/
│       ├── users.module.ts
│       ├── users.controller.ts
│       ├── users.service.ts
│       ├── users.repository.ts   # or use Prisma directly in service
│       └── dto/
│           ├── create-user.dto.ts
│           └── update-user.dto.ts
├── common/
│   ├── guards/
│   ├── decorators/
│   ├── filters/
│   └── pipes/
└── prisma/
    └── prisma.service.ts
```

---

## 3. Core Patterns

### Config validation (startup-time, fail fast)
```typescript
// src/config/index.ts
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  REDIS_URL: z.string().url().optional(),
})

export const config = envSchema.parse(process.env)
// App crashes at startup if env is invalid — not at runtime
```

### Request validation middleware
```typescript
// middleware/validate.ts
import { Request, Response, NextFunction } from 'express'
import { ZodSchema } from 'zod'

export const validateBody = (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      })
    }
    req.body = result.data  // use parsed + typed data
    next()
  }
```

### Global error handler
```typescript
// middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express'

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
  }
}

export const errorHandler = (
  err: Error, req: Request, res: Response, next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message })
  }
  console.error(err)
  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message  // never expose stack in prod
  })
}
```

### Service layer pattern
```typescript
// modules/users/users.service.ts
import { AppError } from '../../middleware/errorHandler'
import { UsersRepository } from './users.repository'
import bcrypt from 'bcrypt'

export class UsersService {
  constructor(private repo: UsersRepository) {}

  async createUser(data: { email: string; password: string }) {
    const existing = await this.repo.findByEmail(data.email)
    if (existing) throw new AppError(409, 'Email already in use')

    const hash = await bcrypt.hash(data.password, 12)
    return this.repo.create({ email: data.email, password: hash })
  }
}
```

---

## 4. Database Patterns

### Prisma — key rules
- One singleton client: `export const prisma = new PrismaClient()`
- Never instantiate PrismaClient per request
- Use `prisma.$transaction([...])` for atomic operations
- Always paginate: `findMany({ take, skip, orderBy })`
- Avoid `select: undefined` (SELECT *) — always specify fields for list queries

### Fix N+1
```typescript
// ❌ N+1 — queries inside loop
const posts = await prisma.post.findMany()
for (const post of posts) {
  post.author = await prisma.user.findUnique({ where: { id: post.authorId } })
}

// ✅ Single query with include
const posts = await prisma.post.findMany({
  include: { author: { select: { id: true, name: true } } }
})
```

### Transactions
```typescript
const [order, _] = await prisma.$transaction([
  prisma.order.create({ data: orderData }),
  prisma.inventory.update({
    where: { id: orderData.itemId },
    data: { stock: { decrement: orderData.qty } }
  })
])
```

### Knex — when to reach for it (vs Prisma)
- Pick Knex when you need **fine-grained control over the SQL** (complex joins, window functions, DB-specific features) but don't want raw string concatenation.
- Pick Knex when inheriting a **legacy codebase** already on Knex, or when you want migrations/query-building **without a schema-first ORM**.
- Default to Prisma for greenfield type-safe CRUD; drop to Knex per-query when Prisma's API can't express the query cleanly (both can coexist on the same PostgreSQL DB).
- Never interpolate user input into `.raw()` — always use `?` bindings. Full patterns → `references/knex.md`.

### Vector search (Qdrant) — when to reach for it
- Use a vector DB when you need **semantic similarity** — RAG retrieval, "find similar" features, dedup, recommendations — not exact-match lookups (that's still PostgreSQL/Prisma).
- Qdrant runs as its own service (Docker); the backend embeds text → upserts points → queries by vector + payload filter.
- Keep the **embedding model fixed per collection** (dimension must match) and store source metadata in the point payload for filtering + citation.
- Small scale / already on Postgres? `pgvector` may be enough before adding Qdrant. Full setup, RAG pipeline, and best practices → `references/vector-db-qdrant.md`.

### Read reference files for deeper topics:
- `references/auth.md` — JWT, refresh tokens, OAuth2, RBAC
- `references/queues.md` — BullMQ patterns, job retry, concurrency
- `references/performance.md` — Caching, indexing, connection pooling
- `references/knex.md` — Knex query builder, migrations, seeds, transactions, pooling, TS typing
- `references/vector-db-qdrant.md` — Qdrant setup, embeddings, search, filtering, hybrid search, RAG pipeline
- `references/graphql.md` — Schema/resolvers, DataLoader (N+1), context, cursor pagination, subscriptions, security
- `references/messaging.md` — Kafka vs RabbitMQ vs BullMQ, producers/consumers, pub/sub, outbox pattern, idempotency
- `references/deployment.md` — Multi-stage Dockerfile, compose, graceful shutdown, migrations in pipeline
- `references/observability.md` — Structured logging (pino), request IDs, health checks, metrics, tracing, Sentry
- `references/12-factor.md` — 12-factor app audit checklist: config centralization, stateless processes, disposability, admin processes, what to grep for

### Shared knowledge

- `knowledges/code-comments.md` — what earns a comment, what to delete, density budget
- `knowledges/simple-design.md` — YAGNI, fewest elements

> Testing is owned by the `software-tester-design` / `software-tester-automation` skills — hand off there for test design and automation rather than duplicating here.

---

## 5. Security Checklist

Before every review/deploy:
- [ ] Secrets in `.env`, never in source (`dotenv` + `.gitignore`)
- [ ] All inputs validated with Zod at the boundary
- [ ] Passwords hashed with bcrypt (cost ≥ 12) — never MD5/SHA
- [ ] SQL via Prisma parameterized queries — no raw string concatenation
- [ ] JWT: short expiry (15m access), verify on every request, HTTPS only
- [ ] Rate limiting: `express-rate-limit` on all public endpoints
- [ ] CORS: `origin` set to explicit allowlist, not `*` in production
- [ ] HTTP headers: `helmet()` applied globally
- [ ] No stack traces to client in production (`NODE_ENV` check)
- [ ] Dependency audit: `npm audit` before deploy

---

## 6. Debugging Cheatsheet

| Symptom | Common cause | Fix |
|---|---|---|
| `req.body` is undefined | Missing `express.json()` | Add `app.use(express.json())` before routes |
| CORS error | Misconfigured cors() | Check `origin`, `credentials`, preflight |
| Unhandled Promise rejection | Missing try/catch | Wrap async routes or use `express-async-errors` |
| Slow queries | N+1, missing index | Use `EXPLAIN ANALYZE`, add index, use `include` |
| DB connection exhausted | New PrismaClient per request | Use singleton |
| JWT "invalid signature" | Wrong secret / algorithm | Verify `JWT_SECRET` matches between sign/verify |
| 413 "payload too large" | Default body size limit | `express.json({ limit: '10mb' })` |
