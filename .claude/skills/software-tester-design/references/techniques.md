# Test Design Techniques Reference

## 1. Equivalence Partitioning (EP)

Divide input space into partitions where all values in a partition are expected to behave
identically. Test one value from each partition — testing more gives diminishing returns.

**Partition types:**
- Valid partitions (system should accept)
- Invalid partitions (system should reject)

```
Field: age (integer, registration form, rule: must be 18–120)

Partition        | Range        | Example | Expected
Valid            | 18–120       | 25      | Accept
Invalid: too low | < 18         | 17      | Reject: "Must be 18 or older"
Invalid: too high| > 120        | 121     | Reject: "Invalid age"
Invalid: type    | non-integer  | "abc"   | Reject: "Must be a number"
Invalid: empty   | null/missing | null    | Reject: "Age is required"
```

**Rule:** At minimum, one test per partition. Use BVA on top for numeric ranges.

---

## 2. Boundary Value Analysis (BVA)

Errors cluster at boundaries. Test the value at, just below, and just above each boundary.

**Classic BVA (3-point):**
```
Boundary: min value = 18, max value = 120

Test points:
  min - 1 = 17   → INVALID
  min     = 18   → VALID
  min + 1 = 19   → VALID

  max - 1 = 119  → VALID
  max     = 120  → VALID
  max + 1 = 121  → INVALID
```

**String length example:**
```
Field: password (rule: 8–72 characters)

length = 0   → INVALID (empty)
length = 7   → INVALID (too short)
length = 8   → VALID   (min boundary)
length = 9   → VALID   (min + 1)
length = 71  → VALID   (max - 1)
length = 72  → VALID   (max boundary)
length = 73  → INVALID (too long)
```

**BVA for collections:**
```
Field: cart items (rule: 1–50 items)

qty = 0   → INVALID: "Cart is empty"
qty = 1   → VALID   (min)
qty = 50  → VALID   (max)
qty = 51  → INVALID: "Maximum 50 items"
```

---

## 3. Decision Table Testing

Use when behaviour depends on combinations of conditions (business rules).
Each column = one test case.

```
Feature: Loan approval rules
Conditions:                  T1   T2   T3   T4   T5   T6   T7   T8
Income > $50k?               Y    Y    Y    Y    N    N    N    N
Credit score ≥ 700?          Y    Y    N    N    Y    Y    N    N
Existing debt < 30%?         Y    N    Y    N    Y    N    Y    N

Actions:
Approve standard rate        X
Approve high rate                      X              X
Approve with conditions           X
Reject                                      X    X         X    X
```

Each column drives one test case with concrete data for each condition.

**Collapsed table (when some combos are impossible/irrelevant):**
```
Feature: Discount eligibility
Premium member?   Y    Y    N
Order ≥ $100?     Y    N    -    (N/A if not premium)
Discount applied  20%  10%  0%
```

---

## 4. State Transition Testing

Use for entities or workflows that move through discrete states.
Model: states → transitions → events/triggers → guards.

```
Order lifecycle:
States:  DRAFT → SUBMITTED → PAYMENT_PENDING → CONFIRMED → SHIPPED → DELIVERED
                                             ↘ CANCELLED (from SUBMITTED or CONFIRMED)
                                             ↘ FAILED    (from PAYMENT_PENDING)

Transitions to test:
  Valid:
    TC-ST-01: DRAFT       → submit()        → SUBMITTED
    TC-ST-02: SUBMITTED   → initPayment()   → PAYMENT_PENDING
    TC-ST-03: PAY_PENDING → paymentOk()     → CONFIRMED
    TC-ST-04: PAY_PENDING → paymentFail()   → FAILED
    TC-ST-05: SUBMITTED   → cancel()        → CANCELLED
    TC-ST-06: CONFIRMED   → ship()          → SHIPPED
    TC-ST-07: SHIPPED     → deliver()       → DELIVERED

  Invalid (must reject):
    TC-ST-08: DELIVERED   → cancel()        → Error: "Cannot cancel delivered order"
    TC-ST-09: CANCELLED   → ship()          → Error: "Cannot ship cancelled order"
    TC-ST-10: DRAFT       → ship()          → Error: "Order not confirmed"
```

**State table format:**

| Current State \ Event | submit | pay_ok | pay_fail | cancel | ship    | deliver |
|-----------------------|--------|--------|----------|--------|---------|---------|
| DRAFT                 | SUBMIT | -      | -        | -      | -       | -       |
| SUBMITTED             | -      | -      | -        | CANCEL | -       | -       |
| PAYMENT_PENDING       | -      | CONFIR | FAILED   | -      | -       | -       |
| CONFIRMED             | -      | -      | -        | CANCEL | SHIPPED | -       |
| SHIPPED               | -      | -      | -        | -      | -       | DELIVER |
| DELIVERED / CANCELLED / FAILED | all transitions → Error |

---

## 5. Pairwise (Combinatorial) Testing

Use when there are many independent options and full combination coverage is impractical.
Pairwise guarantees every pair of values appears in at least one test.

```
Feature: Export report
Options:
  Format:   PDF | CSV | XLSX       (3 values)
  Range:    Last7d | Last30d | YTD (3 values)
  Locale:   EN | ES | FR           (3 values)
  Theme:    Light | Dark           (2 values)

Full combinations: 3×3×3×2 = 54 tests
Pairwise coverage: ~12–18 tests (use a pairwise tool: pairwise.yuuniworks.com)

Sample pairwise set (partial):
  TC | Format | Range  | Locale | Theme
   1 | PDF    | Last7d | EN     | Light
   2 | PDF    | Last30d| ES     | Dark
   3 | PDF    | YTD    | FR     | Light
   4 | CSV    | Last7d | ES     | Light
   5 | CSV    | Last30d| FR     | Dark
   6 | CSV    | YTD    | EN     | Dark
   7 | XLSX   | Last7d | FR     | Dark
   8 | XLSX   | Last30d| EN     | Light
   9 | XLSX   | YTD    | ES     | Light
```

---

## 6. Error Guessing

Experience-based — think like an attacker and a careless user. Augments other techniques.

**Common error guesses by category:**

*Strings:*
- Empty string `""`
- Whitespace only `"   "`
- Max+1 length
- Unicode: `"José"`, `"日本語"`, `"𝕳𝖊𝖑𝖑𝖔"`
- SQL injection: `"'; DROP TABLE users; --"`
- XSS: `"<script>alert(1)</script>"`
- Null byte: `"hello\x00world"`
- Leading/trailing spaces: `" alice@example.com "`

*Numbers:*
- Zero `0`
- Negative: `-1`
- `MAX_INT` / `MAX_SAFE_INTEGER`
- Floating point: `0.1 + 0.2` precision issues
- Scientific notation: `1e308`

*Dates:*
- End-of-month: Feb 28/29, Dec 31
- Leap year: `2000-02-29` (valid), `1900-02-29` (invalid)
- Timezone edge: midnight UTC transitions
- Far future: `9999-12-31`
- Past-the-epoch: `1970-01-01`

*Collections:*
- Empty array `[]`
- Single item
- Duplicate items
- Items in reverse / random order

*Concurrency:*
- Double submit (same form submitted twice in quick succession)
- Optimistic lock violation (edit same record from two sessions)
- Race condition on inventory decrement

*Auth:*
- No token
- Expired token
- Token for different tenant
- Revoked token
- Elevated role accessing lower-role endpoint and vice versa

---

## 7. Use Case Testing

For each user-facing use case, test:
1. **Basic flow** — happy path, everything works
2. **Alternate flows** — each branching condition
3. **Exception flows** — each error condition in the use case spec
4. **Pre/post-condition failures** — what if precondition isn't met?
