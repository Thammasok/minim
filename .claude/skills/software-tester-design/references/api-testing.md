# API & Contract Testing Reference (Bruno)

## Choosing Bruno at design time

Reach for Bruno specifically when the API-testing tier needs to stay **language-independent**
— able to survive a full backend rewrite untouched, because it never imports the service's own
code, only calls its HTTP contract. That's a design-time decision, not just a tooling
preference: if any test case in this tier is designed assuming direct access to the service's
DB client, ORM models, or internal token-signing helper for setup/assertions, it has quietly
stopped being this tier and become a `local`-tier (or a schema-only) test wearing an API-test's
clothes — see `software-tester-design/references/strategy.md`'s "Backend split" section for the
full three-tier reasoning and the decision rule for where a given case actually belongs.
`software-tester-automation/references/api-bruno.md` has the implementation-level patterns this
implies (running the collection itself inside Docker via the official CLI image so not even
the *runner* needs the project's language installed, plus the sandbox-scripting gotchas).

## What is Bruno

Bruno is a Git-native API client. Collections are plain `.bru` files on disk — no JSON blobs,
no cloud sync required. Every request, environment variable, and test script lives in version
control alongside the code it tests.

```
bruno-collections/
└── orders-api/
    ├── bruno.json               # collection metadata
    ├── environments/
    │   ├── local.bru
    │   ├── staging.bru
    │   └── ci.bru
    ├── auth/
    │   ├── login.bru
    │   └── refresh-token.bru
    └── orders/
        ├── create-order-happy-path.bru
        ├── create-order-empty-cart.bru
        ├── create-order-no-auth.bru
        ├── create-order-out-of-stock.bru
        └── get-order.bru
```

---

## API test coverage checklist

For every endpoint, cover:

```
☐ Happy path          — valid input → expected 2xx + correct body
☐ Validation errors   — missing required field → 422 + error body
☐ Type errors         — wrong type (string where int expected) → 400/422
☐ Business rule error — valid input, violates rule → 409/422
☐ Not found           — resource doesn't exist → 404
☐ Unauthorised        — no token → 401
☐ Forbidden           — wrong role/ownership → 403
☐ Conflict            — duplicate / optimistic lock → 409
☐ Idempotency         — repeat same request → same result (or 409)
☐ Large payload       — max size boundary
☐ Pagination          — first page, last page, empty result, beyond-end page
```

---

## Bruno collection setup

### `bruno.json`

```json
{
  "version": "1",
  "name": "Orders API",
  "type": "collection",
  "ignore": ["node_modules", ".git"]
}
```

### Environment files

```bru
# environments/local.bru
vars {
  baseUrl: http://localhost:3000
  jwtSecret: dev-secret-change-me
}

vars:secret [
  adminToken,
  customerToken
]
```

```bru
# environments/ci.bru
vars {
  baseUrl: http://localhost:3000
}

vars:secret [
  adminToken,
  customerToken
]
```

---

## Request file anatomy

```bru
meta {
  name: TC-API-01 Create order — happy path
  type: http
  seq:  1
}

post {
  url: {{baseUrl}}/api/orders
  body: json
  auth: bearer
}

auth:bearer {
  token: {{customerToken}}
}

headers {
  Content-Type: application/json
}

body:json {
  {
    "items": [
      { "productId": "{{productId}}", "qty": 2 }
    ]
  }
}

assert {
  res.status: eq 201
  res.headers["content-type"]: contains application/json
  res.body.orderId: isDefined
  res.body.orderId: matches ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$
  res.body.total: eq 4980
  res.body.status: eq confirmed
  res.headers["location"]: isDefined
}

script:post-response {
  // Stash orderId for downstream tests in the same run
  bru.setVar("createdOrderId", res.body.orderId);
}
```

---

## Full test suite: POST /api/orders

### TC-API-01: Happy path

```bru
meta {
  name: TC-API-01 Create order — happy path
  type: http
  seq:  1
}

post {
  url: {{baseUrl}}/api/orders
  body: json
  auth: bearer
}

auth:bearer {
  token: {{customerToken}}
}

body:json {
  {
    "items": [{ "productId": "SKU-001", "qty": 2 }]
  }
}

assert {
  res.status: eq 201
  res.body.orderId: isDefined
  res.body.total: eq 4980
  res.body.status: eq confirmed
  res.headers["location"]: isDefined
}

script:post-response {
  bru.setVar("createdOrderId", res.body.orderId);
  test("order id is a valid UUID", () => {
    const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
    expect(res.body.orderId).toMatch(UUID);
  });
  test("location header points to new resource", () => {
    expect(res.headers["location"]).toContain(res.body.orderId);
  });
}
```

### TC-API-02: Empty items array → 422

```bru
meta {
  name: TC-API-02 Create order — empty items array
  type: http
  seq:  2
}

post {
  url: {{baseUrl}}/api/orders
  body: json
  auth: bearer
}

auth:bearer {
  token: {{customerToken}}
}

body:json {
  {
    "items": []
  }
}

assert {
  res.status: eq 422
  res.body.error.code: eq VALIDATION_ERROR
  res.body.error.fields.items: isDefined
}
```

### TC-API-03: No auth token → 401

```bru
meta {
  name: TC-API-03 Create order — no auth token
  type: http
  seq:  3
}

post {
  url: {{baseUrl}}/api/orders
  body: json
}

body:json {
  {
    "items": [{ "productId": "SKU-001", "qty": 1 }]
  }
}

assert {
  res.status: eq 401
  res.body.error.code: eq UNAUTHORIZED
}
```

### TC-API-04: Out of stock → 409

```bru
meta {
  name: TC-API-04 Create order — out of stock item
  type: http
  seq:  4
}

post {
  url: {{baseUrl}}/api/orders
  body: json
  auth: bearer
}

auth:bearer {
  token: {{customerToken}}
}

body:json {
  {
    "items": [{ "productId": "SKU-OUT-OF-STOCK", "qty": 1 }]
  }
}

assert {
  res.status: eq 409
  res.body.error.code: eq OUT_OF_STOCK
}
```

### TC-API-05: Wrong role → 403

```bru
meta {
  name: TC-API-05 Cancel order — customer cannot cancel others' order
  type: http
  seq:  5
}

delete {
  url: {{baseUrl}}/api/orders/{{otherUsersOrderId}}
  auth: bearer
}

auth:bearer {
  token: {{customerToken}}
}

assert {
  res.status: eq 403
  res.body.error.code: eq FORBIDDEN
}
```

---

## Auth flow with pre-request script

```bru
# auth/login.bru
meta {
  name: Login — obtain customer token
  type: http
  seq:  1
}

post {
  url: {{baseUrl}}/api/auth/login
  body: json
}

body:json {
  {
    "email":    "test.customer@example.com",
    "password": "Password1!"
  }
}

assert {
  res.status: eq 200
  res.body.accessToken: isDefined
  res.body.refreshToken: isDefined
}

script:post-response {
  // Persist token for all subsequent requests in this run
  bru.setVar("customerToken",      res.body.accessToken);
  bru.setVar("customerRefreshToken", res.body.refreshToken);
}
```

---

## Scripted assertions (test blocks)

Use `test()` for assertions that need logic beyond simple matchers:

```bru
script:post-response {
  const { body, status } = res;

  // Group related assertions under a named test
  test("TC-API-01: response shape is correct", () => {
    expect(status).toBe(201);
    expect(body.orderId).toBeDefined();
    expect(body.total).toBeGreaterThan(0);
    expect(["confirmed", "pending"]).toContain(body.status);
  });

  test("TC-API-01: total calculation is correct", () => {
    // qty=2 × priceCents=2490 = 4980
    expect(body.total).toBe(4980);
  });

  test("TC-API-01: location header format", () => {
    expect(res.headers["location"]).toMatch(/^\/api\/orders\/[0-9a-f-]+$/);
  });
}
```

---

## GraphQL requests

```bru
meta {
  name: TC-GQL-01 createOrder mutation — authenticated
  type: http
  seq:  1
}

post {
  url: {{baseUrl}}/graphql
  body: json
  auth: bearer
}

auth:bearer {
  token: {{customerToken}}
}

body:json {
  {
    "query": "mutation CreateOrder($input: CreateOrderInput!) { createOrder(input: $input) { orderId total status } }",
    "variables": {
      "input": {
        "items": [{ "productId": "SKU-001", "qty": 1 }]
      }
    }
  }
}

assert {
  res.status: eq 200
  res.body.errors: isUndefined
  res.body.data.createOrder.status: eq confirmed
}
```

---

## Running Bruno in CI

```yaml
# .github/workflows/api-tests.yml
- name: Install Bruno CLI
  run: npm install -g @usebruno/cli

- name: Run API test collection
  run: |
    bru run bruno-collections/orders-api \
      --env ci \
      --output results/bruno-report.json \
      --format json
  env:
    customerToken: ${{ secrets.CI_CUSTOMER_TOKEN }}
    adminToken:    ${{ secrets.CI_ADMIN_TOKEN }}

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: bruno-api-results
    path: results/bruno-report.json
```

```bash
# Run locally against a specific folder
bru run bruno-collections/orders-api/orders --env local

# Run entire collection and bail on first failure
bru run bruno-collections/orders-api --env local --bail
```

---

## Contract testing with Pact (code-level, complements Bruno)

Bruno covers functional HTTP tests. Use Pact for consumer-driven contracts between services.

### Consumer side

```ts
// order-service.pact.spec.ts
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
const { like, uuid, string } = MatchersV3;

const provider = new PactV3({
  consumer: 'order-service',
  provider: 'user-service',
  dir:      './pacts',
});

describe('User Service contract', () => {
  it('returns user for valid ID', () => {
    provider
      .given('user abc-123 exists')
      .uponReceiving('a request for user abc-123')
      .withRequest({ method: 'GET', path: '/users/abc-123' })
      .willRespondWith({
        status: 200,
        body: { id: uuid(), email: string('user@example.com'), name: string('Alice') },
      });

    return provider.executeTest(async (mockServer) => {
      const client = new UserServiceClient(mockServer.url);
      const user   = await client.getUser('abc-123');
      expect(user.email).toBeDefined();
    });
  });
});
```

### Provider side

```ts
const verifier = new Verifier({
  providerBaseUrl: 'http://localhost:3000',
  pactBrokerUrl:   process.env.PACT_BROKER_URL,
  provider:        'user-service',
  stateHandlers: {
    'user abc-123 exists': async () => {
      await db.user.upsert({ id: 'abc-123', email: 'user@example.com', name: 'Alice' });
    },
  },
});
await verifier.verifyProvider();
```

---

## Bruno vs other tools — when to use each

| Tool | Use for | Coupled to the service's implementation language? |
|---|---|---|
| Bruno | Manual exploration, collection-level API tests, Git-tracked regression suite, the black-box `api-testing` tier | No — pure HTTP, runnable via the official Docker image with no local install of anything |
| Supertest / httpx | In-process integration tests co-located with code (unit-speed) — the `local` tier's route-wiring coverage, not a substitute for `api-testing` | Yes, by design — that's what makes it fast |
| Pact | Consumer-driven contracts across service boundaries | Yes, one client library per language on each side |
| k6 | Load and performance tests (see `perf-security.md`) | No — scripts are JS, but this is orthogonal to the language-independence question above |
