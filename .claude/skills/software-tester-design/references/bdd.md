# User Story Mapping Reference (Extreme Programming)

## What is User Story Mapping

Introduced by Jeff Patton and rooted in XP's user story practice, a story map is a
two-dimensional wall of index cards (or digital stickies) that keeps the entire team
aligned on **who does what, in what order, and why** before a single test case is written.

```
Horizontal axis →  narrative flow  (user activities in time order)
Vertical axis   ↓  detail / risk   (high-priority stories at top, lower below)
```

The map becomes the authoritative source of acceptance criteria — and therefore the
direct input to test design.

---

## The three layers of a story map

```
╔══════════════════════════════════════════════════════════════════════════╗
║  BACKBONE  ─ Activities (verbs, high-level user goals)                  ║
║  Browse catalogue  →  Manage cart  →  Checkout  →  Track order          ║
╠══════════════════════════════════════════════════════════════════════════╣
║  WALKING SKELETON  ─ Tasks (the thinnest slice that delivers value)      ║
║  View product list    Add item       Enter address   View order status   ║
╠══════════════════════════════════════════════════════════════════════════╣
║  DETAIL  ─ Story variations, edge cases, non-functionals                 ║
║  Filter by category   Change qty     Apply coupon   Email confirmation   ║
║  Search by keyword    Remove item    Guest checkout  Cancel order        ║
║  View product detail  Persist cart   Payment fails   Delivery estimate   ║
╚══════════════════════════════════════════════════════════════════════════╝
```

**Layer 1 — Backbone (Activities):** High-level user goals. Never decomposed into code
directly — they orient the team on the user journey.

**Layer 2 — Walking Skeleton (Tasks):** The thinnest vertical slice that makes the whole
journey work end-to-end, even poorly. This is Release 1 / MVP.

**Layer 3 — Detail (Stories):** Everything that makes the skeleton good — edge cases,
error paths, performance, accessibility, polish.

---

## The mapping ceremony (XP Planning Game)

Run this as a **Three Amigos** session: Product Owner + Developer + Tester together.

### Step 1 — Write the narrative (10 min)

Tell the user journey as a story, left to right. Write one card per activity.
Use the format: **verb + object** ("Browse catalogue", not "Product browsing system").

```
User journey: buying a product online

Browse       →   Find product   →   Manage cart   →   Checkout   →   Post-purchase
catalogue         detail                                               management
```

### Step 2 — Decompose into tasks (20 min)

Under each activity, write the tasks a user performs to complete it.
Tasks are still UI-level descriptions, not user stories.

```
Browse catalogue
├── View product list
├── Filter by category
├── Search by keyword
└── Sort by price / rating

Find product detail
├── View product images
├── Read description & specs
├── Read reviews
└── Check stock status
```

### Step 3 — Slice into releases (20 min)

Draw a horizontal line under the walking skeleton. Everything above = Release 1.
Keep slicing until you have meaningful, shippable increments.

```
┌─────────────────────────────────────────────┐  ← Release 1 (walking skeleton)
│ View list │ View detail │ Add to cart │ Buy  │
└─────────────────────────────────────────────┘
  Filter      Images         Change qty    Coupon    ← Release 2
  Search      Reviews        Save for later  Guest   ← Release 3
  Sort        Stock alert    Wishlist      Instalment  ← Release 4
```

### Step 4 — Write user stories (30 min)

For each card in the skeleton and detail rows, write a story using the XP card format.

---

## XP User Story format

```
Title: <concise name — becomes test suite label>

As a   <role>
I want <capability>
So that <business value / outcome>

Acceptance Criteria:
  ✓ <observable outcome 1>
  ✓ <observable outcome 2>
  ✗ <out of scope — explicit exclusion prevents scope creep>

Size:  S / M / L  (relative, team-calibrated)
Risk:  H / M / L
```

### Example: walking skeleton story

```
Title: Place order for in-stock item

As a   registered customer
I want to complete a purchase for items in my cart
So that I receive the goods I've chosen

Acceptance Criteria:
  ✓ I can submit an order when my cart has at least 1 in-stock item
  ✓ I receive an order confirmation number immediately
  ✓ My cart is cleared after successful purchase
  ✓ Stock count for purchased items is decremented
  ✓ I receive a confirmation email within 2 minutes
  ✗ Payment method management (separate story)
  ✗ Order modification after placement (separate story)

Size: M
Risk: H  (payment integration, stock atomicity)
```

### Example: detail story (variation)

```
Title: Apply discount coupon at checkout

As a   registered customer with a valid coupon code
I want to apply the coupon during checkout
So that I pay the discounted price

Acceptance Criteria:
  ✓ Valid coupon reduces total by the stated percentage or amount
  ✓ Invalid / expired coupon shows a specific error message
  ✓ Each coupon can only be used once per account
  ✓ Coupon discount is visible in the order summary before confirming
  ✗ Stacking multiple coupons (out of scope for this story)

Size: S
Risk: M
```

---

## From story map to test design

Each acceptance criterion maps to one or more test cases. The story map tells you
**what level** to test at and **what technique** to apply.

```
Story card                       → Test level      → Technique
─────────────────────────────────────────────────────────────────────
Walking skeleton (happy path)    → E2E + API       → Use Case Testing
Validation / error paths         → API + Component → EP + BVA
State transitions (order status) → Unit + API      → State Transition
Config combinations (shipping)   → API             → Decision Table / Pairwise
Edge cases (boundaries, limits)  → Unit + API      → BVA + Error Guessing
Non-functional (perf, a11y)      → Specialised     → k6, axe
```

### Acceptance criteria → test cases

```markdown
Story: Apply discount coupon at checkout
AC: ✓ Valid coupon reduces total by the stated percentage

→ TC-COUP-01 (P1, API): POST /orders with valid 10% coupon "SAVE10"
    Given: cart total = 100.00, coupon SAVE10 = 10% off, not previously used
    When:  order placed with { couponCode: "SAVE10" }
    Then:  res.status = 201, res.body.total = 90.00, res.body.couponApplied = "SAVE10"

→ TC-COUP-02 (P2, API): Coupon with fixed amount (£5 off)
    Given: cart total = 20.00, coupon FLAT5 = £5 off
    Then:  total = 15.00

→ TC-COUP-03 (P2, API): Coupon reduces to zero (not negative)
    Given: cart total = 3.00, coupon = 50% off
    Then:  total = 1.50  (50% of 3.00, not negative)

AC: ✗ Invalid / expired coupon shows specific error

→ TC-COUP-04 (P1, API): Expired coupon
    Given: coupon "EXPIRED10" has expiry = yesterday
    Then:  res.status = 422, error.code = COUPON_EXPIRED

→ TC-COUP-05 (P1, API): Non-existent coupon code
    Then:  res.status = 422, error.code = COUPON_NOT_FOUND

→ TC-COUP-06 (P2, API): Already-used single-use coupon
    Given: coupon "ONETIME" has been redeemed by this user
    Then:  res.status = 422, error.code = COUPON_ALREADY_USED

AC: ✗ Each coupon can only be used once per account

→ TC-COUP-07 (P1, Integration): Concurrent duplicate use (race condition)
    Given: two requests submit order with same single-use coupon simultaneously
    Then:  exactly one succeeds (201); the other gets 422 COUPON_ALREADY_USED
```

---

## Story map artefact template

Use this as a living document — update it as the team discovers new stories.

```markdown
# Story Map: [Product / Feature Name]
Last updated: YYYY-MM-DD  |  Team: [names]

## Backbone (Activities)
| 1. Browse | 2. Select | 3. Cart | 4. Checkout | 5. Post-purchase |
|-----------|-----------|---------|-------------|------------------|

## Walking Skeleton (Release 1)
| View list | View detail | Add item | Place order | View confirmation |

## Release 2
| Filter     | Images & specs  | Change qty  | Apply coupon  | Email receipt |
| Search     | Stock indicator | Remove item | Guest checkout| Cancel order  |

## Release 3 (and beyond)
| Sort           | Reviews       | Save for later | Instalment pay | Return/refund |
| Recommendations| Wishlist      | Bulk discount  | Loyalty points | Exchange      |

## Explicit exclusions (out of scope)
- Subscription / recurring orders
- B2B / wholesale pricing
- Multi-currency (deferred to internationalisation epic)

## Open questions
- [ ] Does coupon stacking need to land in Release 2 or can it wait?
- [ ] Is guest checkout in scope for MVP?
```

---

## XP practices that reinforce story mapping

**INVEST criteria** — every story should be:
- **I**ndependent — can be built and tested without another story being done first
- **N**egotiable — the card is a conversation starter, not a contract
- **V**aluable — delivers something a user or business cares about
- **E**stimable — the team can size it
- **S**mall — completable in one iteration (1–2 weeks)
- **T**estable — acceptance criteria are specific and verifiable

**Definition of Ready** — a story enters the sprint only when:
- Acceptance criteria are written and agreed by all three amigos
- Test cases are drafted (or test design has been done)
- Dependencies are identified and unblocked

**Definition of Done** — a story closes only when:
- All acceptance criteria have passing automated tests
- Edge cases from the story map detail row are tested
- No P1/P2 defects open against the story

---

## Story mapping vs Gherkin — when to use each

| Situation | Use |
|---|---|
| Align team on what to build before sprint | Story map (this file) |
| Acceptance criteria need formal executable spec | Gherkin scenarios |
| Non-technical stakeholder must approve scope | Story map cards |
| BA/Dev/QA need living documentation | Both: map → Gherkin |
| Pure unit / API tests | Neither — 3A code comments |

Story mapping and Gherkin are complementary: the map discovers and prioritises stories;
Gherkin formalises the acceptance criteria of the most critical ones as executable tests.

---

## Skill hand-off: requirements-engineering

This file covers User Story Mapping from a **test design perspective** — how to derive
test cases from stories and acceptance criteria.

For the **full mapping ceremony** (stakeholder elicitation, release slicing workshops,
BRD/SRS/PRD output, INVEST validation, Requirements Traceability Matrix), use the
`requirements-engineering` skill instead. That skill owns:

- The complete Story Mapping session facilitation guide (Steps 1–6)
- All story card formats (Role-Goal-Benefit, Job Story, Shall statements, OKR-style)
- Phases 1–5 of the requirements lifecycle (elicitation → analysis → specification → validation → management)
- NFR templates, Use Case specs, User Flow / Business Flow artefacts
- Change control and traceability matrices

**Hand-off rule:** If the user is discovering *what* to build → `requirements-engineering`.
If the user is designing *how to test* what's been agreed → this file (`bdd.md`).
