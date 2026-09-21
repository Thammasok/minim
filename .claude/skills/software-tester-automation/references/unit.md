# Unit Testing Reference (Vitest / Jest)

## Setup

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals:     true,
    environment: 'node',
    coverage: {
      provider:  'v8',
      reporter:  ['text', 'lcov'],
      exclude:   ['**/node_modules/**', '**/tests/**'],
    },
  },
});
```

```bash
# Run
npx vitest run              # single run
npx vitest                  # watch mode
npx vitest run --coverage   # with coverage
```

---

## Anatomy of a unit test file

```ts
// src/domain/cart.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Cart } from './cart';
import { Item } from './item';
import { PercentageDiscount, FixedDiscount } from './discount';

describe('Cart.applyDiscount', () => {
  // TC-UNIT-01: happy path — percentage discount
  it('TC-UNIT-01: reduces total by the stated percentage', () => {
    // Arrange
    const cart = new Cart([
      new Item('Widget', 49_00),
      new Item('Gadget', 60_00),
    ]);

    // Act
    const total = cart.applyDiscount(new PercentageDiscount(10));

    // Assert
    expect(total).toBe(97_20); // 109_00 * 0.90
  });

  // TC-UNIT-02: fixed amount discount
  it('TC-UNIT-02: subtracts fixed amount from total', () => {
    const cart  = new Cart([new Item('Widget', 50_00)]);
    const total = cart.applyDiscount(new FixedDiscount(5_00));
    expect(total).toBe(45_00);
  });

  // TC-UNIT-03: floors at zero — never negative
  it('TC-UNIT-03: returns 0 when discount exceeds total', () => {
    const cart  = new Cart([new Item('Widget', 5_00)]);
    const total = cart.applyDiscount(new PercentageDiscount(200));
    expect(total).toBe(0);
  });

  // TC-UNIT-04: empty cart
  it('TC-UNIT-04: returns 0 for empty cart regardless of discount', () => {
    const cart  = new Cart([]);
    const total = cart.applyDiscount(new PercentageDiscount(50));
    expect(total).toBe(0);
  });
});
```

---

## Mocking with vi.fn() and vi.spyOn()

```ts
import { vi } from 'vitest';

// Mock a module
vi.mock('../lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: 'msg-001' }),
}));

// Spy on a method
const sendSpy = vi.spyOn(emailService, 'send').mockResolvedValue(undefined);

// Assert the mock was called
expect(sendSpy).toHaveBeenCalledOnce();
expect(sendSpy).toHaveBeenCalledWith(
  expect.objectContaining({ to: 'alice@example.com' })
);

// Assert it was NOT called
expect(sendSpy).not.toHaveBeenCalled();

// Restore after test
afterEach(() => vi.restoreAllMocks());
```

---

## Testing async code

```ts
// ✅ Always await — never let promises float
it('TC-UNIT-05: resolves with user on valid credentials', async () => {
  const user = await authService.login('alice@example.com', 'Password1!');
  expect(user.id).toBeDefined();
});

// ✅ Test rejection with rejects.toThrow
it('TC-UNIT-06: rejects with InvalidCredentials on wrong password', async () => {
  await expect(
    authService.login('alice@example.com', 'wrong')
  ).rejects.toThrow('InvalidCredentials');
});

// ✅ Test error type exactly
it('TC-UNIT-07: throws UserNotFound for unknown email', async () => {
  await expect(
    authService.login('nobody@example.com', 'pass')
  ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
});
```

---

## Parameterised tests (data-driven)

```ts
import { it, expect } from 'vitest';

// From TC design: EP / BVA table → each row = one test
const emailCases = [
  { email: 'alice@example.com',  valid: true,  desc: 'typical valid email' },
  { email: 'a@b.co',             valid: true,  desc: 'min-length valid email' },
  { email: '',                   valid: false, desc: 'empty string' },
  { email: 'notanemail',         valid: false, desc: 'missing @ symbol' },
  { email: '@nodomain.com',      valid: false, desc: 'missing local part' },
  { email: 'user@',             valid: false, desc: 'missing domain' },
  { email: ' alice@example.com', valid: false, desc: 'leading whitespace' },
];

it.each(emailCases)(
  'TC-UNIT-EMAIL-$#: validateEmail("$email") → $valid ($desc)',
  ({ email, valid }) => {
    expect(validateEmail(email)).toBe(valid);
  }
);
```

---

## State transition unit tests

```ts
describe('OrderStateMachine', () => {
  let order: Order;

  beforeEach(() => {
    order = new Order({ status: 'DRAFT', items: [mockItem()] });
  });

  // Valid transitions
  it('TC-ST-01: DRAFT → SUBMITTED on submit()', () => {
    order.submit();
    expect(order.status).toBe('SUBMITTED');
  });

  it('TC-ST-03: PAYMENT_PENDING → CONFIRMED on paymentOk()', () => {
    order.submit();
    order.initPayment();
    order.paymentOk({ ref: 'PAY-001' });
    expect(order.status).toBe('CONFIRMED');
  });

  // Invalid transitions
  it('TC-ST-08: DELIVERED → cancel() throws InvalidTransition', () => {
    order.submit();
    order.initPayment();
    order.paymentOk({ ref: 'PAY-001' });
    order.ship({ trackingCode: 'TRK-001' });
    order.deliver();

    expect(() => order.cancel()).toThrow('InvalidTransition');
    expect(order.status).toBe('DELIVERED'); // state unchanged
  });

  it('TC-ST-10: DRAFT → ship() throws InvalidTransition', () => {
    expect(() => order.ship({ trackingCode: 'TRK-001' })).toThrow('InvalidTransition');
  });
});
```

---

## Testing with fake/in-memory implementations

```ts
// Fake repo — real logic, no I/O
class InMemoryUserRepo implements UserRepository {
  private store = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.store.get(id) ?? null;
  }
  async save(user: User): Promise<void> {
    this.store.set(user.id, user);
  }
  async findByEmail(email: string): Promise<User | null> {
    return [...this.store.values()].find(u => u.email === email) ?? null;
  }
}

describe('UserService', () => {
  let repo: InMemoryUserRepo;
  let svc:  UserService;

  beforeEach(() => {
    repo = new InMemoryUserRepo();
    svc  = new UserService(repo);
  });

  it('TC-UNIT-SVC-01: create() persists user and returns with generated id', async () => {
    // Arrange
    const dto = { email: 'alice@example.com', name: 'Alice' };

    // Act
    const user = await svc.create(dto);

    // Assert
    expect(user.id).toBeDefined();
    const persisted = await repo.findById(user.id);
    expect(persisted?.email).toBe('alice@example.com');
  });

  it('TC-UNIT-SVC-02: create() throws EmailConflict when email already registered', async () => {
    await svc.create({ email: 'alice@example.com', name: 'Alice' });
    await expect(
      svc.create({ email: 'alice@example.com', name: 'Alice 2' })
    ).rejects.toMatchObject({ code: 'EMAIL_CONFLICT' });
  });
});
```
