# Knex.js — SQL Query Builder

Knex is a query builder (not an ORM). It builds and runs SQL for PostgreSQL, MySQL, SQLite,
MSSQL, and others, and ships a first-class migration + seed system. Use it when you want
SQL control without hand-concatenating strings.

## When Knex vs Prisma / Drizzle

| Situation | Reach for |
|---|---|
| Greenfield, type-safe CRUD, schema-first | Prisma |
| Edge runtime / minimal overhead, typed SQL | Drizzle |
| Complex/dynamic SQL, DB-specific features, full query control | **Knex** |
| Legacy project already on Knex | **Knex** |
| Migrations without adopting a full ORM | **Knex** |

They can coexist: many teams run Prisma for everyday CRUD and drop to Knex (or `prisma.$queryRaw`)
for the handful of queries an ORM can't express cleanly. Pick one as the migration source of
truth though — don't run Prisma Migrate and Knex migrations against the same schema.

## Setup

```bash
npm install knex pg          # pg driver for PostgreSQL
npx knex init                # creates knexfile.ts
```

### knexfile.ts (env-driven)
```typescript
import type { Knex } from 'knex'

const config: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 },
    migrations: { directory: './migrations', extension: 'ts' },
    seeds: { directory: './seeds' },
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 20 },
    migrations: { directory: './migrations' },
  },
}

export default config
```

### Singleton instance (never create per-request)
```typescript
// lib/db.ts
import knex from 'knex'
import config from '../knexfile'

export const db = knex(config[process.env.NODE_ENV ?? 'development'])
// Reuse this single instance everywhere. Creating a new knex() per request
// spawns a new connection pool each time → exhausts the database.
```

## Query Builder — core patterns

```typescript
// SELECT with where + specific columns (never SELECT * for list endpoints)
const users = await db('users')
  .select('id', 'email', 'name')
  .where('active', true)
  .orderBy('created_at', 'desc')

// Single row
const user = await db('users').where({ id }).first()

// INSERT ... RETURNING (Postgres)
const [created] = await db('users')
  .insert({ email, name })
  .returning(['id', 'email'])

// UPDATE
const updatedCount = await db('users')
  .where({ id })
  .update({ name, updated_at: db.fn.now() })

// DELETE
await db('users').where({ id }).del()

// JOIN — avoids N+1 by fetching related rows in one query
const posts = await db('posts')
  .join('users', 'posts.author_id', 'users.id')
  .select('posts.id', 'posts.title', 'users.name as author_name')
  .where('posts.published', true)

// Aggregation
const [{ count }] = await db('orders').where({ status: 'paid' }).count('* as count')

// Pagination (keyset preferred at scale; offset shown here)
const page = await db('posts')
  .select('*')
  .orderBy('created_at', 'desc')
  .limit(pageSize)
  .offset((pageNum - 1) * pageSize)
```

### Conditional / dynamic queries
```typescript
const q = db('products').select('*')
if (filters.category) q.where('category', filters.category)
if (filters.minPrice) q.where('price', '>=', filters.minPrice)
if (filters.search) q.whereILike('name', `%${filters.search}%`)
const results = await q  // builder is lazy — only runs when awaited
```

## Transactions

```typescript
// Callback style — auto commit on resolve, auto rollback on throw (preferred)
const order = await db.transaction(async (trx) => {
  const [o] = await trx('orders').insert(orderData).returning('*')
  await trx('inventory')
    .where({ id: orderData.item_id })
    .decrement('stock', orderData.qty)
  return o  // committed automatically
  // any thrown error rolls the whole thing back
})
```

Always pass `trx` (not `db`) to every query inside the transaction, or that query runs
outside the transaction and won't roll back.

## Migrations

```bash
npx knex migrate:make create_users_table   # new timestamped migration
npx knex migrate:latest                     # apply all pending (dev + prod)
npx knex migrate:rollback                   # undo the last batch
npx knex migrate:status                     # what's applied / pending
```

```typescript
// migrations/20240101120000_create_users_table.ts
import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.string('email').notNullable().unique()
    t.string('name')
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.timestamp('updated_at').defaultTo(knex.fn.now())
    t.index('email')  // index columns used in WHERE/JOIN
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('users')
}
```

Rules: every migration needs a working `down`. Never edit a migration after it has been
applied to any shared/production DB — write a new one. Keep migrations in version control.

## Seeds

```typescript
// seeds/01_users.ts
import type { Knex } from 'knex'

export async function seed(knex: Knex): Promise<void> {
  await knex('users').del()  // clear first (dev only)
  await knex('users').insert([
    { email: 'alice@example.com', name: 'Alice' },
    { email: 'bob@example.com', name: 'Bob' },
  ])
}
```
```bash
npx knex seed:run
```

## Raw SQL — safely

```typescript
// ✅ Parameterized with bindings
const rows = await db.raw('SELECT * FROM users WHERE id = ? AND active = ?', [id, true])

// ✅ Named bindings
await db.raw('SELECT * FROM users WHERE id = :id', { id })

// ❌ NEVER — string interpolation = SQL injection
await db.raw(`SELECT * FROM users WHERE id = ${id}`)
```
Use `.raw()` only for what the builder can't express. Bindings are non-negotiable for any
value that originates from a request.

## TypeScript typing

Knex returns `any` by default. Type results by parameterizing the builder:

```typescript
interface User {
  id: string
  email: string
  name: string | null
  created_at: Date
}

// Per-query typing
const user = await db<User>('users').where({ id }).first()  // user: User | undefined
const users = await db<User>('users').select('*')           // users: User[]
```

For project-wide typing, declare a table registry with declaration merging:
```typescript
// types/knex.d.ts
import 'knex/types/tables'
declare module 'knex/types/tables' {
  interface Tables {
    users: User
    posts: Post
  }
}
// Now db('users') is typed everywhere without the generic.
```
For heavy type safety across a large schema, consider Drizzle instead — Knex's typing is
opt-in and shallow by design.

## Connection pooling & shutdown

- Set `pool: { min, max }` to your DB's connection budget. `max` too high exhausts Postgres
  (`too many clients`); too low throttles throughput. Start `max: 10`, tune with load.
- Call `await db.destroy()` on graceful shutdown (SIGTERM) to drain the pool.
- One pool per process — the singleton above guarantees this.

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `too many connections` | New `knex()` per request | Use the singleton instance |
| Query silently doesn't run | Forgot to `await` the builder | Builders are lazy — always await |
| Transaction changes not rolled back | Used `db` instead of `trx` inside txn | Pass `trx` to every query |
| `undefined` where a row expected | `.first()` on empty result | Handle `undefined` explicitly |
| SQL injection flagged in review | Interpolated value into `.raw()` | Use `?` / named bindings |
| Migration can't roll back | Missing/incorrect `down()` | Always write a reversible `down` |
