# Component / Backend Integration Testing Reference

## What belongs here

Component tests wire one service to its real infrastructure dependencies (real DB,
real cache, real message broker) but stub all outbound HTTP calls. They run slower
than unit tests but catch query bugs, migration issues, and transaction semantics
that mocks never reveal.

```
Unit test:      Cart logic — zero I/O, <5ms
Component test: OrderRepository.save() — real Postgres, ~1s
API test:       POST /api/orders — HTTP layer, real or stubbed DB
```

---

## Query-boundary mocking (zero-infra alternative to testcontainers)

Testcontainers below is the right default. Reach for this instead specifically when you want
the *entire* fast suite — including repository/query-builder tests — runnable with no
Docker/DB at all (see `software-tester-design/references/strategy.md`'s "Backend split" for
the full reasoning on when this trade-off is worth it).

The technique: mock at the query **execution** boundary, not the repository function itself —
the real query-builder code still runs and gets exercised (right table, right `WHERE`, right
bindings), only the actual DB round trip is stubbed. For a knex-based ORM,
[`knex-mock-client`](https://github.com/felixmosh/knex-mock-client) does this directly;
Kysely/Drizzle/Prisma each have an equivalent "swap the driver, not the query builder" pattern
— same principle, different library.

```ts
// order-repository.test.ts
jest.mock('../db/knex.js', () => {
  // Self-contained factory (no outer-scope reference) — required by Jest's hoisting rules.
  const knexFactory = require('knex');
  const { MockClient } = require('knex-mock-client');
  return {
    __esModule: true, // without this, a default-import consumer sees `{ default: { default } }`
    default: knexFactory({ client: MockClient, dialect: 'pg' }),
  };
});

import db from '../db/knex.js';
import { createTracker, type Tracker } from 'knex-mock-client';
import { OrderRepository } from './order-repository.js';

let tracker: Tracker;
beforeAll(() => { tracker = createTracker(db); });
afterEach(() => tracker.reset());

// TC-COMP-01: save() persists order and findById() retrieves it
it('TC-COMP-01: insert() compiles the right columns and bindings', async () => {
  tracker.on.insert('orders').responseOnce([{ id: 'o1', user_id: 'u1', status: 'DRAFT' }]);

  const order = await new OrderRepository().save({ userId: 'u1', items: [...] });

  expect(order.status).toBe('DRAFT');
  expect(tracker.history.insert[0].bindings).toContain('u1');
});
```

**What this can't prove — don't fake it here.** A mock never rejects a duplicate key, never
cascades a delete, never recomputes a generated column. Route those specific cases to
`api-testing` (if an HTTP endpoint reaches the behavior) or a separate schema/migration
category (if nothing does) instead of writing a "pretend" assertion against the mock.

**Gotchas that cost real debugging time:**
- The mock factory must be **self-contained** — `require()` the library *inside* the factory
  function, don't reference an outer `import` (Jest's hoisting moves `jest.mock()` above other
  imports; an outer reference hits a TDZ error).
- Add `__esModule: true` to the returned object when the real module uses a default export —
  without it, interop wrapping means `import db from '...'` resolves to `undefined`.
- A query-builder value bound as JSON (e.g. a jsonb column) may arrive at the tracker already
  `JSON.stringify`'d by the query compiler — assert against the stringified form, not the
  original object, if a raw equality check on `bindings` fails unexpectedly.
- Distinguish the compiled **SET clause** from the full SQL string when asserting "only this
  column changed" on a partial update — a `RETURNING` clause lists every column regardless of
  what's in `SET`, so `sql.includes('"other_column"')` alone gives a false positive; split on
  `where` first and check only the portion before it.

---

## TypeScript — Vitest + testcontainers

### Setup

```ts
// tests/component/setup.ts
import { PostgreSqlContainer, StartedPostgreSqlContainer }
  from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

let container: StartedPostgreSqlContainer;
let pool:      pg.Pool;

export let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('testdb')
    .start();

  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  db   = drizzle(pool);
  await migrate(db, { migrationsFolder: './drizzle' });
}, 60_000); // give Docker time to start

afterAll(async () => {
  await pool.end();
  await container.stop();
});

// Truncate between tests for isolation
afterEach(async () => {
  await db.execute(sql`TRUNCATE orders, order_items, products, users CASCADE`);
});
```

### Test file

```ts
// tests/component/order-repository.test.ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { db } from './setup';
import { PgOrderRepository } from '../../src/adapters/db/order-repository';
import { UserFactory, ProductFactory } from '../factories';

describe('PgOrderRepository', () => {
  let repo: PgOrderRepository;

  beforeAll(() => { repo = new PgOrderRepository(db); });

  // TC-COMP-01: save and retrieve roundtrip
  it('TC-COMP-01: save() persists order and findById() retrieves it', async () => {
    // Arrange
    const user    = await UserFactory.insert(db, { role: 'customer' });
    const product = await ProductFactory.insert(db, { priceCents: 2490, stock: 10 });
    const order   = Order.create({
      userId: user.id,
      items:  [{ productId: product.id, qty: 2 }],
    });

    // Act
    await repo.save(order);
    const found = await repo.findById(order.id);

    // Assert
    expect(found).not.toBeNull();
    expect(found!.userId).toBe(user.id);
    expect(found!.items).toHaveLength(1);
    expect(found!.items[0].qty).toBe(2);
    expect(found!.status).toBe('DRAFT');
  });

  // TC-COMP-02: stock decrement is atomic with order creation
  it('TC-COMP-02: createWithStockDecrement() is atomic — both commit or both rollback', async () => {
    // Arrange
    const product = await ProductFactory.insert(db, { stock: 5 });

    // Act — force a rollback by providing invalid order data mid-transaction
    const badOrder = Order.create({ userId: null!, items: [{ productId: product.id, qty: 3 }] });

    await expect(repo.createWithStockDecrement(badOrder)).rejects.toThrow();

    // Assert — stock unchanged (transaction rolled back)
    const refreshed = await ProductFactory.findById(db, product.id);
    expect(refreshed!.stock).toBe(5);
  });

  // TC-COMP-03: concurrent stock decrement — race condition
  it('TC-COMP-03: only one of two concurrent orders for last item succeeds', async () => {
    // Arrange
    const product = await ProductFactory.insert(db, { stock: 1 });
    const [u1, u2] = await Promise.all([
      UserFactory.insert(db),
      UserFactory.insert(db),
    ]);

    // Act — fire both concurrently
    const results = await Promise.allSettled([
      repo.createWithStockDecrement(Order.create({ userId: u1.id, items: [{ productId: product.id, qty: 1 }] })),
      repo.createWithStockDecrement(Order.create({ userId: u2.id, items: [{ productId: product.id, qty: 1 }] })),
    ]);

    // Assert — exactly one succeeds
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected  = results.filter(r => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const finalProduct = await ProductFactory.findById(db, product.id);
    expect(finalProduct!.stock).toBe(0);
  });
});
```

---

## Factory helpers for component tests

```ts
// tests/factories/index.ts
import { faker } from '@faker-js/faker';

export const UserFactory = {
  build: (overrides: Partial<NewUser> = {}): NewUser => ({
    id:        faker.string.uuid(),
    email:     faker.internet.email(),
    name:      faker.person.fullName(),
    role:      'customer',
    createdAt: new Date(),
    ...overrides,
  }),

  insert: async (db: DB, overrides: Partial<NewUser> = {}) => {
    const data = UserFactory.build(overrides);
    await db.insert(usersTable).values(data);
    return data;
  },
};

export const ProductFactory = {
  build: (overrides: Partial<NewProduct> = {}): NewProduct => ({
    id:          faker.string.uuid(),
    name:        faker.commerce.productName(),
    priceCents:  faker.number.int({ min: 100, max: 100_00 }),
    stock:       faker.number.int({ min: 1, max: 100 }),
    ...overrides,
  }),

  insert: async (db: DB, overrides: Partial<NewProduct> = {}) => {
    const data = ProductFactory.build(overrides);
    await db.insert(productsTable).values(data);
    return data;
  },

  findById: async (db: DB, id: string) =>
    db.select().from(productsTable).where(eq(productsTable.id, id)).limit(1)
      .then(rows => rows[0] ?? null),
};
```

---

## Redis component tests

```ts
// tests/component/cache-service.test.ts
import { RedisContainer } from '@testcontainers/redis';
import { createClient }   from 'redis';

let client: ReturnType<typeof createClient>;

beforeAll(async () => {
  const container = await new RedisContainer().start();
  client = createClient({ url: container.getConnectionUrl() });
  await client.connect();
}, 30_000);

afterAll(() => client.quit());
afterEach(() => client.flushAll());

it('TC-CACHE-01: caches value and returns on second fetch', async () => {
  const svc      = new CacheService(client);
  const fetcher  = vi.fn().mockResolvedValue({ id: '1', name: 'Alice' });

  const first  = await svc.getOrSet('user:1', fetcher, 60);
  const second = await svc.getOrSet('user:1', fetcher, 60);

  expect(first).toEqual(second);
  expect(fetcher).toHaveBeenCalledOnce(); // fetcher only called once
});
```
