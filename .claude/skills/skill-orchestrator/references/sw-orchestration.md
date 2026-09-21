# Software Orchestration Reference

## Purpose of Phase 5

Phase 5 answers three questions before any engineer writes a line of code:
1. **What is the exact API contract** — shared source of truth so FE and BE can build independently?
2. **What is the build order** — what must exist before anything else can start?
3. **How do FE and BE work in parallel** — what mocks allow FE to build before BE is ready?

---

## API contract specification

The contract is the single most important output of Phase 5. It must be agreed by all
parties (FE engineer, BE engineer, QA) before Phase 6 starts.

### REST contract format

```markdown
## API Contract v1.0

### POST /api/orders

**Auth:** Bearer JWT (role: customer)
**Request:**
```json
{
  "items": [
    { "productId": "string (UUID)", "qty": "integer (1–999)" }
  ],
  "couponCode": "string (optional, max 20 chars)"
}
```
**Response 201:**
```json
{
  "orderId":           "string (UUID)",
  "total":             "integer (cents)",
  "status":            "confirmed | pending",
  "estimatedDelivery": "string (ISO 8601 date)"
}
```
**Error responses:**
| Status | Code                | When |
|--------|---------------------|------|
| 401    | UNAUTHORIZED        | No / invalid token |
| 403    | FORBIDDEN           | Wrong role |
| 409    | OUT_OF_STOCK        | Item has zero stock |
| 422    | VALIDATION_ERROR    | Missing/invalid fields |
| 500    | INTERNAL_ERROR      | Unexpected server error |

**Side effects:**
- inventory.stock decremented for each item
- order.created event published

**Headers on success:**
- Location: /api/orders/{orderId}
```

### Typed contract (NestJS DTO → OpenAPI → generated client)

The DTO is the single source of truth. Decorate it with `@nestjs/swagger` +
`class-validator`, export the OpenAPI spec, and generate the browser types from that
spec — never hand-maintain a second copy of the shapes.

```ts
// apps/api/src/modules/orders/dto/create-order.dto.ts
export class CreateOrderDto {
  @ApiProperty({ type: [OrderItemDto] })
  @ArrayNotEmpty({ message: 'Cart is empty' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  couponCode?: string;
}

export class CreateOrderResponseDto {
  @ApiProperty() orderId!: string;
  @ApiProperty() total!: number;
  @ApiProperty({ enum: ['confirmed', 'pending'] }) status!: 'confirmed' | 'pending';
  @ApiProperty({ format: 'date' }) estimatedDelivery!: string;
}
```

```ts
// apps/web/src/api-client/types.ts — GENERATED from the OpenAPI spec, do not hand-edit
export interface CreateOrderRequest {
  items: Array<{ productId: string; qty: number }>;
  couponCode?: string;
}

export interface CreateOrderResponse {
  orderId:           string;
  total:             number;
  status:            'confirmed' | 'pending';
  estimatedDelivery: string;
}

export type CreateOrderError =
  | { code: 'UNAUTHORIZED' }
  | { code: 'FORBIDDEN' }
  | { code: 'OUT_OF_STOCK'; productId: string }
  | { code: 'VALIDATION_ERROR'; fields: Record<string, string[]> };
```

---

## Parallel tracks diagram

```
Sprint 0     Sprint 1                Sprint 2         Sprint 3
──────────   ──────────────────────  ───────────────  ──────────

BACKEND  ──► Domain logic ─────────► API error paths ─► Perf/Sec
TRACK       Unit tests               Auth guards        Hardening
            DB repo layer

FRONTEND ──► Components w/ MSW ────► Connect real API ─► A11y + polish
TRACK       Forms + validation       Page routing        Visual QA
            TanStack Query mock

TEST     ──► Unit test scripts ────► Bruno suite ──────► E2E + exploratory
TRACK       MSW handler library      RTL component       Accessibility audit
                                     tests

SHARED   ──► API contract types (both tracks consume this from Day 1)
             DB migrations (BE writes, FE reads via API)
             CI pipeline (all tracks push to same pipeline)
```

### Integration checkpoint

Define the exact task after which FE switches from MSW to real API:

```
Integration checkpoint: After TASK-010 (POST /api/orders handler) is merged to main
  → FE removes MSW override for POST /api/orders
  → FE runs against real BE in staging
  → QA runs Bruno collection against staging
  → All three must agree: same request → same response shape
```

---

## Mock strategy (Frontend)

FE must never be blocked waiting for BE. The mock strategy defines how FE builds
independently using MSW (Mock Service Worker).

```ts
// tests/mocks/handlers.ts — mirrors the Phase 5 API contract exactly
import { http, HttpResponse } from 'msw';

export const handlers = [
  // Happy path — matches Phase 5 contract response shape
  http.post('/api/orders', async ({ request }) => {
    const body = await request.json() as CreateOrderRequest;
    if (!body.items?.length) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', fields: { items: ['Cart is empty'] } } },
        { status: 422 }
      );
    }
    return HttpResponse.json<CreateOrderResponse>({
      orderId:           crypto.randomUUID(),
      total:             body.items.reduce((s, i) => s + i.qty * 2490, 0),
      status:            'confirmed',
      estimatedDelivery: '2025-06-01',
    }, { status: 201 });
  }),
];
```

**Rule:** MSW handler response shapes must be byte-for-byte compatible with the real API
contract. If the real API changes, the MSW handler changes first — this is the contract.

---

## Event contract (if event-driven)

```markdown
## Event: order.created

**Producer:** order-service
**Consumers:** notification-service, inventory-service, analytics-service
**Broker:** Kafka topic: orders.events
**Schema:**
```json
{
  "eventId":   "UUID",
  "eventType": "order.created",
  "occurredAt":"ISO 8601 timestamp",
  "payload": {
    "orderId":  "UUID",
    "userId":   "UUID",
    "items":    [{ "productId": "UUID", "qty": "integer" }],
    "total":    "integer (cents)"
  }
}
```
**Guarantee:** At-least-once delivery. Consumers must be idempotent on eventId.
```

---

## Build order: critical path

Present the critical path explicitly so the team knows what must land first:

```
Day 1–2:  INFRA + SCHEMA     → unblocks everything
Day 3–5:  DOMAIN + REPO      → unblocks API handlers
Day 4–7:  COMPONENTS + MSW   → FE builds in parallel (unblocked from Day 1 by contract)
Day 6–8:  API HANDLERS       → unblocks integration checkpoint
Day 8:    INTEGRATION POINT  → FE connects to real API
Day 9–11: TEST AUTOMATION    → Bruno, RTL, Playwright suites
Day 12+:  HARDENING          → perf, security, a11y, exploratory
```

---

## Orchestration checklist (Phase 5 gate)

Before presenting to human for approval:
- [ ] API contract has all endpoints with full request/response/error shapes
- [ ] Web client types are generated from the OpenAPI spec, not hand-written (no field name drift)
- [ ] MSW handlers generated for every endpoint in the contract
- [ ] Parallel tracks diagram shows BE and FE are independent
- [ ] Integration checkpoint clearly named (which task, which branch)
- [ ] Event contracts defined if event-driven architecture chosen
- [ ] Critical path identified with day estimates
