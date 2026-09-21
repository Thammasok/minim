# API Automation Reference (Bruno)

## Turning a TC into a .bru file

Each TC-API-xxx becomes one `.bru` file. The mapping is direct:

```
TC field          → .bru section
──────────────────────────────────
TC-ID + Name      → meta { name: TC-API-01 … }
Preconditions     → vars + pre-request script
Action            → method, url, body
Expected result   → assert block + script:post-response test() blocks
Side effects      → script:post-response (call a DB-check endpoint or store IDs)
```

---

## Collection structure

```
bruno-collections/
└── orders-api/
    ├── bruno.json
    ├── environments/
    │   ├── local.bru
    │   ├── staging.bru
    │   └── ci.bru
    ├── _setup/
    │   ├── 00-login-customer.bru      ← runs first, stores customerToken
    │   └── 01-login-admin.bru
    ├── orders/
    │   ├── TC-API-01-create-happy-path.bru
    │   ├── TC-API-02-empty-items.bru
    │   ├── TC-API-03-no-auth.bru
    │   ├── TC-API-04-out-of-stock.bru
    │   └── TC-API-05-wrong-role.bru
    └── orders/get/
        ├── TC-API-06-get-own-order.bru
        └── TC-API-07-get-other-users-order.bru
```

---

## Environment file

```bru
# environments/local.bru
vars {
  baseUrl: http://localhost:3000
  customerEmail: test.customer@example.com
  customerPassword: Password1!
  adminEmail: test.admin@example.com
  adminPassword: AdminPass1!
}

vars:secret [
  customerToken,
  adminToken,
  createdOrderId
]
```

---

## Setup request — login and store token

```bru
# _setup/00-login-customer.bru
meta {
  name: Setup — login as customer
  type: http
  seq:  1
}

post {
  url: {{baseUrl}}/api/auth/login
  body: json
}

body:json {
  {
    "email":    "{{customerEmail}}",
    "password": "{{customerPassword}}"
  }
}

assert {
  res.status: eq 200
  res.body.accessToken: isDefined
}

script:post-response {
  bru.setVar("customerToken", res.body.accessToken);
}
```

---

## TC-API-01: Happy path

```bru
# orders/TC-API-01-create-happy-path.bru
meta {
  name: TC-API-01 POST /orders — happy path, returns 201 with orderId
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
    "items": [
      { "productId": "SKU-001", "qty": 2 }
    ]
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
  // Store for downstream TC-API-06
  bru.setVar("createdOrderId", res.body.orderId);

  test("TC-API-01: orderId is a valid UUID", () => {
    const UUID_RE = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
    expect(res.body.orderId).toMatch(UUID_RE);
  });

  test("TC-API-01: location header points to new resource", () => {
    expect(res.headers["location"]).toContain(`/api/orders/${res.body.orderId}`);
  });

  test("TC-API-01: total is 2 × priceCents(2490) = 4980", () => {
    expect(res.body.total).toBe(4980);
  });
}
```

---

## TC-API-02: Validation error — empty items

```bru
# orders/TC-API-02-empty-items.bru
meta {
  name: TC-API-02 POST /orders — 422 when items array is empty
  type: http
  seq:  3
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

script:post-response {
  test("TC-API-02: error message is human-readable", () => {
    expect(typeof res.body.error.message).toBe("string");
    expect(res.body.error.message.length).toBeGreaterThan(0);
  });
}
```

---

## TC-API-03: No auth token → 401

```bru
# orders/TC-API-03-no-auth.bru
meta {
  name: TC-API-03 POST /orders — 401 when no auth token
  type: http
  seq:  4
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

---

## TC-API-04: Out of stock → 409

```bru
# orders/TC-API-04-out-of-stock.bru
meta {
  name: TC-API-04 POST /orders — 409 when item has zero stock
  type: http
  seq:  5
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

---

## TC-API-06: GET own order → 200

```bru
# orders/get/TC-API-06-get-own-order.bru
meta {
  name: TC-API-06 GET /orders/:id — 200 for owner
  type: http
  seq:  6
}

get {
  url: {{baseUrl}}/api/orders/{{createdOrderId}}
  auth: bearer
}

auth:bearer {
  token: {{customerToken}}
}

assert {
  res.status: eq 200
  res.body.orderId: eq {{createdOrderId}}
  res.body.items: isDefined
  res.body.total: isDefined
}
```

---

## TC-API-07: GET another user's order → 403

```bru
# orders/get/TC-API-07-get-other-users-order.bru
meta {
  name: TC-API-07 GET /orders/:id — 403 for non-owner
  type: http
  seq:  7
}

get {
  url: {{baseUrl}}/api/orders/{{createdOrderId}}
  auth: bearer
}

auth:bearer {
  token: {{otherCustomerToken}}
}

assert {
  res.status: in [403, 404]
}

script:post-response {
  test("TC-API-07: does not leak order data of another user", () => {
    // Accept either 403 or 404 — both prevent data exposure
    expect([403, 404]).toContain(res.status);
    // Must not return the order body
    expect(res.body.orderId).toBeUndefined();
  });
}
```

---

## Pre-request script — dynamic data

```bru
script:pre-request {
  // Generate a unique idempotency key per run
  const idempotencyKey = `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  bru.setVar("idempotencyKey", idempotencyKey);
}

headers {
  Idempotency-Key: {{idempotencyKey}}
}
```

---

## Sandbox gotchas (cost real debugging time — check these first)

Bruno's script sandbox is not a browser and not plain Node — a few assumptions that "just
work" in either one silently don't here:

- **No global `fetch`.** For an extra HTTP call from inside a script (polling, firing several
  near-identical calls in a loop), use `bru.sendRequest(opts, callback)` — it's callback-based
  (axios underneath), not the plain awaited-promise-returns-the-response shape its own docs
  examples sometimes suggest. Read the response from the callback args; a non-2xx response's
  *body* specifically does not reliably survive back through the awaited return value in every
  CLI version — only `.status` does. Wrap it in a `Promise` if you need `await` in a loop:

  ```js
  function sendRequest(opts) {
    return new Promise((resolve) => {
      bru.sendRequest(opts, (err, r) => resolve(err ? err.status : r.status));
    });
  }
  for (let i = 0; i < 5; i++) {
    const status = await sendRequest({ method: 'POST', url: `${baseUrl}/orders`, data: {...} });
    test(`attempt ${i} returns 401`, () => expect(status).to.equal(401));
  }
  ```

- **Replaying a specific (possibly stale) cookie value** — e.g. testing that a rotated-out
  session token is rejected — needs more than the automatic cookie jar, which will have moved
  on to the newest value. Use `await bru.cookies.upsert({ key, value })` (request-scoped,
  auto-targets the current request's URL); the lower-level `bru.cookies.jar().setCookie(url,
  key, value)` API exists too but did not reliably override what actually got sent in
  practice — prefer `upsert`.

---

## Running Bruno fully inside Docker (no local Node/Bruno CLI needed)

The official image (`usebruno/cli`, entrypoint `bru`, working dir `/bruno`) lets a
docker-compose-orchestrated test run stay Bruno's whole point — language-independent — all the
way down to the *runner* itself, not just the request specs. Mount the collection, run it
alongside the SUT's own compose services, and nothing but Docker needs to be installed:

```yaml
services:
  api:
    build: .
    healthcheck: # depends_on: condition: service_healthy needs one
      test: ["CMD", "node", "-e", "fetch('http://localhost:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 3s
      timeout: 3s
      retries: 20

  bruno:
    image: usebruno/cli:latest
    # Load-bearing, not a style choice — see the note below.
    network_mode: "service:api"
    volumes:
      - ./bruno-collections/orders-api:/bruno
      - ./reports:/bruno/reports
    command:
      - run
      - --env
      - docker
      - --env-var
      - baseUrl=http://localhost:8080 # not http://api:8080 — see below
      - --reporter-junit
      - reports/api-tests-junit.xml
      - --reporter-html
      - reports/api-tests.html
    depends_on:
      api:
        condition: service_healthy
```

```bash
docker compose --profile api-test run --build --rm bruno
```

**Why `network_mode: "service:api"` instead of a shared bridge network + `baseUrl:
http://api:8080`.** If the API sets any cookie with the `Secure` attribute (a refresh-token
cookie, a session cookie), a spec-correct cookie jar only resends it over plain HTTP for hosts
on the small "trustworthy without TLS" allowlist — `localhost` is on it, an arbitrary
docker-network service hostname is not. Pointing `baseUrl` at the service name over a normal
bridge network reproducibly breaks any flow that depends on that cookie surviving a second
request (session lifecycle, token-rotation-replay tests) — the cookie is set, the jar just
silently declines to send it back. Sharing the API container's network namespace instead means
`http://localhost:<port>` from inside the `bruno` container really does reach the API over
loopback, so cookie handling matches what a host-side `bru run` against the same published
port would do. This is easy to miss because it doesn't error — it just quietly returns 401s
partway through a flow that passes in every other environment; if a Bruno CI flow that
depends on a `Secure` cookie surviving between requests works locally (`bru run` on the host)
but fails specifically when moved into a docker-network runner, check this first.

For faster local iteration (one folder, no full docker rebuild), run against the container's
host-published port directly instead of through the compose profile:

```bash
bru run bruno-collections/orders-api --env local          # everything
bru run bruno-collections/orders-api/orders --env local   # one folder
bru run bruno-collections/orders-api --env local --bail   # stop at first failure
```

## Running Bruno in a hosted CI runner (no docker-in-docker)

```yaml
# .github/workflows/api-tests.yml
- name: Install Bruno CLI
  run: npm install -g @usebruno/cli

- name: Start API server
  run: npm run start:test &
  env:
    NODE_ENV: test
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}

- name: Wait for server
  run: npx wait-on http://localhost:3000/health --timeout 30000

- name: Run Bruno collection
  run: |
    bru run bruno-collections/orders-api \
      --env ci \
      --output results/bruno.json \
      --format json
  env:
    customerToken: ${{ secrets.CI_CUSTOMER_TOKEN }}
    adminToken:    ${{ secrets.CI_ADMIN_TOKEN }}

- name: Upload results
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: bruno-api-results
    path: results/bruno.json
```
