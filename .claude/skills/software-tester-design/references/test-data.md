# Test Data Design Reference

## Principles

1. **Concrete, not abstract** — write `"alice@example.com"`, not `"valid email"`.
2. **Minimal** — use the simplest data that exercises the case, no noise.
3. **Isolated** — each test creates its own data; no shared mutable state between tests.
4. **Realistic** — data should resemble production (use Faker, not `"test"` everywhere).
5. **Labelled** — document _why_ each value was chosen.

---

## Data categories to design for every input

```
Category            | Design intent                    | Example (email field)
--------------------|----------------------------------|--------------------------
Valid typical       | Normal, expected input           | alice@example.com
Valid boundary min  | Shortest acceptable value        | a@b.co  (6 chars)
Valid boundary max  | Longest acceptable value         | <64-char local>@<255-char domain>
Invalid: empty      | Missing required field           | ""
Invalid: null       | Null where string expected       | null
Invalid: wrong type | Integer where string expected    | 12345
Invalid: format     | Plausible but malformed          | alice@  /  @example.com
Invalid: too long   | Exceeds max length               | <256-char local>@example.com
Invalid: injection  | Adversarial input                | "'; DROP TABLE users; --"
Edge: whitespace    | Spaces around valid value        | " alice@example.com "
Edge: unicode       | Non-ASCII characters             | "ålïcé@example.com"
Edge: case          | Different casing                 | "ALICE@EXAMPLE.COM"
```

---

## Data factory pattern

```ts
// tests/factories/user.factory.ts
import { faker } from '@faker-js/faker';

export const UserFactory = {
  build: (overrides: Partial<User> = {}): User => ({
    id:        faker.string.uuid(),
    name:      faker.person.fullName(),
    email:     faker.internet.email(),
    role:      'customer',
    createdAt: faker.date.recent(),
    ...overrides,
  }),

  create: async (overrides: Partial<User> = {}): Promise<User> => {
    const data = UserFactory.build(overrides);
    return db.user.create({ data });
  },

  createAdmin: (overrides = {}) =>
    UserFactory.create({ role: 'admin', ...overrides }),

  createWithExpiredSubscription: (overrides = {}) =>
    UserFactory.create({
      subscriptionExpiresAt: faker.date.past(),
      ...overrides,
    }),
};
```

---

## Boundary value data tables

Document as a table before writing tests — makes coverage visible:

```markdown
### Field: quantity (integer, rule: 1–999)

| TC   | Value | Partition | Boundary | Expected |
|------|-------|-----------|----------|----------|
| D-01 | 0     | Invalid   | min-1    | Error: "Min quantity is 1" |
| D-02 | 1     | Valid     | min      | Accept |
| D-03 | 2     | Valid     | min+1    | Accept |
| D-04 | 500   | Valid     | midpoint | Accept |
| D-05 | 998   | Valid     | max-1    | Accept |
| D-06 | 999   | Valid     | max      | Accept |
| D-07 | 1000  | Invalid   | max+1    | Error: "Max quantity is 999" |
| D-08 | -1    | Invalid   | negative | Error: "Min quantity is 1" |
| D-09 | 1.5   | Invalid   | decimal  | Error: "Must be a whole number" |
| D-10 | "abc" | Invalid   | type     | Error: "Must be a number" |
| D-11 | null  | Invalid   | missing  | Error: "Quantity is required" |
```

---

## Stateful / sequenced test data

For tests that require a sequence of operations:

```ts
// Setup helper — creates data in the required state
async function createConfirmedOrder(overrides = {}) {
  const user    = await UserFactory.create();
  const product = await ProductFactory.create({ stock: 10 });
  const order   = await OrderFactory.create({
    userId: user.id,
    status: 'DRAFT',
    items: [{ productId: product.id, qty: 2 }],
    ...overrides,
  });
  // Advance through states
  await orderService.submit(order.id);
  await orderService.confirmPayment(order.id, { paymentRef: 'PAY-001' });
  return { user, product, order: await db.order.findById(order.id) };
}

// Test then only exercises the specific transition it cares about:
it('TC-ST-06: confirmed order can be shipped', async () => {
  const { order } = await createConfirmedOrder();
  await orderService.ship(order.id, { trackingCode: 'TRK-123' });
  const updated = await db.order.findById(order.id);
  expect(updated.status).toBe('SHIPPED');
});
```

---

## Seed data vs generated data

```
Seed data (static fixtures):
  ✓ Reference data that never changes (countries, currencies, roles)
  ✓ Performance tests (pre-load 1M rows)
  ✗ Don't use for isolation-sensitive tests — shared state causes flakiness

Generated data (factory-created per test):
  ✓ All CRUD and business logic tests
  ✓ Ensures test isolation
  ✓ Self-documenting intent via overrides
```

---

## Data cleanup strategies

```ts
// Strategy 1: Transaction rollback (fastest, unit/integration)
beforeEach(async () => { await db.$transaction(async (tx) => { testTx = tx; }) });
afterEach(async ()  => { await testTx.rollback(); });

// Strategy 2: Truncate between tests (integration, test-DB only)
afterEach(async () => {
  await db.$executeRaw`TRUNCATE orders, order_items, products CASCADE`;
});

// Strategy 3: Unique prefix per test run (avoids collisions in shared DB)
const RUN_ID = process.env.TEST_RUN_ID ?? faker.string.alphanumeric(8);
const email  = `${RUN_ID}-alice@example.com`;

// Strategy 4: Testcontainers (gold standard — fresh DB per suite)
// See software-engineer-backend or react-vite-developer testing references
```

---

## Sensitive data in tests

```ts
// ✅ Use clearly fake data — never real PII
email:  'test.user@example.com'    // RFC 2606 reserved domain
phone:  '+1-555-000-0000'          // 555 prefix = clearly fictional
card:   '4242424242424242'         // Stripe test card
ssn:    '000-00-0000'              // SSA says 000 prefix is never issued
ip:     '192.0.2.1'                // TEST-NET (RFC 5737)

// ✅ Never commit real credentials to test fixtures
// ✅ Use environment variables for auth secrets in tests
// ✅ Mark test databases with env prefix (test_, ci_) to prevent prod accidents
```
