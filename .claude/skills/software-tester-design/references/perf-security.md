# Performance & Security Testing Reference

## Performance testing types

| Type | Question answered | Tool |
|---|---|---|
| Load test | Does it handle expected concurrent users? | k6, Locust, JMeter |
| Stress test | Where does it break? What's the ceiling? | k6, Gatling |
| Soak / endurance | Does it degrade over hours? (memory leaks?) | k6 |
| Spike test | Can it survive a sudden traffic burst? | k6 |
| Baseline | How fast is it now? (regression comparison) | k6, Lighthouse |

---

## k6 load test structure

```js
// tests/performance/order-api.k6.js
import http   from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate      = new Rate('errors');
const orderDuration  = new Trend('order_duration', true);

export const options = {
  stages: [
    { duration: '2m', target: 50  }, // ramp-up to 50 VUs
    { duration: '5m', target: 50  }, // hold at 50 VUs
    { duration: '2m', target: 100 }, // spike to 100 VUs
    { duration: '1m', target: 0   }, // ramp-down
  ],
  thresholds: {
    http_req_duration:         ['p(95)<500'],  // 95th percentile < 500ms
    http_req_failed:           ['rate<0.01'],  // < 1% error rate
    order_duration:            ['p(99)<1000'], // 99th percentile < 1s
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function setup() {
  // Create test data once before all VUs start
  const res = http.post(`${BASE_URL}/api/test/seed`, JSON.stringify({ users: 100 }), {
    headers: { 'Content-Type': 'application/json' },
  });
  return { userIds: JSON.parse(res.body).userIds };
}

export default function (data) {
  const userId = data.userIds[Math.floor(Math.random() * data.userIds.length)];
  const token  = http.post(`${BASE_URL}/api/auth/token`, JSON.stringify({ userId }), {
    headers: { 'Content-Type': 'application/json' },
  }).json('token');

  const start = Date.now();

  const res = http.post(`${BASE_URL}/api/orders`, JSON.stringify({
    items: [{ productId: 'SKU-001', qty: 1 }],
  }), {
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  orderDuration.add(Date.now() - start);
  errorRate.add(res.status !== 201);

  check(res, {
    'status is 201':             r => r.status === 201,
    'response has orderId':      r => !!r.json('orderId'),
  });

  sleep(1);
}
```

---

## Performance test scenarios to design

```
TC-PERF-01: Baseline response time
  Load: 1 VU, 100 iterations
  Threshold: p(95) < 200ms for GET /api/products

TC-PERF-02: Concurrent order placement
  Load: 50 concurrent VUs × 5min
  Threshold: p(95) < 500ms; error rate < 1%; no orders lost

TC-PERF-03: Stock decrement under concurrency (race condition test)
  Setup: Product with stock = 100
  Load: 200 concurrent requests for qty=1
  Expected: Exactly 100 succeed (201); 100 fail (409 OUT_OF_STOCK); final stock = 0

TC-PERF-04: Database connection pool exhaustion
  Load: Ramp to 200 VUs (beyond pool size)
  Expected: Requests queue, not fail; p(99) < 2s; no 500 errors

TC-PERF-05: Memory leak / soak
  Load: 20 VUs × 60min
  Expected: Heap usage stable (< 20% growth over test duration)
```

---

## Security testing (OWASP Top 10 test cases)

Design explicit security test cases — don't leave security to "pen test later".

### Authentication & Authorisation (OWASP A01, A07)

```
TC-SEC-01: Unauthenticated access to protected endpoint
  Given: No token
  When:  GET /api/users
  Then:  HTTP 401; body has error code UNAUTHORIZED

TC-SEC-02: Expired JWT rejected
  Given: Token with exp = now - 1 hour
  When:  GET /api/me
  Then:  HTTP 401; body has error code TOKEN_EXPIRED

TC-SEC-03: Customer cannot access admin endpoints
  Given: Valid customer token
  When:  GET /api/admin/users
  Then:  HTTP 403; body has error code FORBIDDEN

TC-SEC-04: User cannot access another user's resources
  Given: User A's token
  When:  GET /api/orders/{orderId of User B}
  Then:  HTTP 403 or 404 (don't reveal resource exists)

TC-SEC-05: Privilege escalation via parameter tampering
  Given: Customer token
  When:  PATCH /api/users/me { "role": "admin" }
  Then:  role field ignored; user remains customer
```

### Injection (OWASP A03)

```
TC-SEC-06: SQL injection in search
  Input: name = "'; DROP TABLE products; --"
  Then:  HTTP 200 with empty results; no DB error; table still exists

TC-SEC-07: NoSQL injection in filter
  Input: { "email": { "$gt": "" } }
  Then:  HTTP 400 or no data leak; not all records returned

TC-SEC-08: XSS in user-generated content
  Input: name = "<script>alert('xss')</script>"
  When:  Stored then rendered in browser
  Then:  Script tag is escaped/sanitised; no alert fires
```

### Data exposure (OWASP A02)

```
TC-SEC-09: Password not returned in user response
  When:  GET /api/me
  Then:  response body does not contain "password" or "passwordHash" key

TC-SEC-10: Sensitive headers not exposed
  When:  Any response
  Then:  No X-Powered-By, Server, or X-AspNet-Version headers
  And:   Strict-Transport-Security header present

TC-SEC-11: PII not logged
  When:  Request with PAN "4242424242424242" is processed
  Then:  Application logs do not contain the full card number
```

### Rate limiting & DoS (OWASP A04)

```
TC-SEC-12: Login brute force protection
  When:  POST /api/auth/login fails 10 times in 1 minute
  Then:  Subsequent requests return 429 Too Many Requests
  And:   Lockout duration is communicated in Retry-After header

TC-SEC-13: Password reset token single-use
  When:  Password reset link used once
  Then:  Second use of same token returns 400 TOKEN_USED

TC-SEC-14: Mass assignment blocked
  Input: POST /api/users { "id": "attacker-id", "role": "admin" }
  Then:  id and role fields are ignored; server assigns id and default role
```
