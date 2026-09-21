---
name: acid-principles
description: Use when designing database transactions and ensuring data integrity
---

# ACID Principles

## Purpose
Guarantee reliable database transactions. ACID properties ensure data remains consistent even when systems fail, concurrent users access data, or errors occur mid-operation.

## Principles

### A — Atomicity
All operations in a transaction succeed, or none of them do.

- Transaction is an indivisible unit of work
- If any part fails, the entire transaction rolls back
- No partial updates — "all or nothing"
- Symptoms of violation: orphaned records, inconsistent state after errors

### C — Consistency
A transaction brings the database from one valid state to another valid state.

- All constraints, triggers, and rules are satisfied after commit
- Business invariants are preserved
- Invalid data is rejected before commit
- Symptoms of violation: constraint violations, broken referential integrity

### I — Isolation
Concurrent transactions execute as if they were sequential.

- Transactions don't see each other's uncommitted changes
- Multiple isolation levels trade off consistency vs performance
- Prevents dirty reads, non-repeatable reads, phantom reads
- Symptoms of violation: race conditions, lost updates, inconsistent reads

### D — Durability
Once a transaction commits, the changes persist permanently.

- Survives system crashes, power failures, hardware failures
- Write-ahead logging (WAL) ensures recoverability
- Committed data is never lost
- Symptoms of violation: data loss after restart, missing committed records

## Rules

- **DO**: Wrap related operations in a single transaction
- **DO**: Keep transactions short to reduce lock contention
- **DO**: Choose appropriate isolation level for your use case
- **DO**: Handle transaction failures with proper rollback
- **DO**: Use database constraints to enforce consistency
- **DON'T**: Perform external side effects (HTTP calls, emails) inside transactions
- **DON'T**: Hold transactions open during user interaction
- **DON'T**: Assume default isolation level is sufficient for all cases
- **DON'T**: Ignore deadlock possibilities in concurrent systems

## Patterns

### Atomicity Example
```sql
-- BAD: Separate statements can partially fail
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
-- System crashes here — money disappeared!
UPDATE accounts SET balance = balance + 100 WHERE id = 2;

-- GOOD: Atomic transaction
BEGIN TRANSACTION;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
-- Either both succeed or both rollback
```

### Consistency Example
```sql
-- Database enforces consistency via constraints
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  total DECIMAL CHECK (total >= 0),
  status VARCHAR(20) CHECK (status IN ('pending', 'paid', 'shipped'))
);

-- Transaction rejected if constraints violated
INSERT INTO orders (customer_id, total, status)
VALUES (999, -50, 'invalid');  -- Fails: FK, CHECK violations
```

### Isolation Levels
```
| Level            | Dirty Read | Non-Repeatable Read | Phantom Read |
|------------------|------------|---------------------|--------------|
| READ UNCOMMITTED | Possible   | Possible            | Possible     |
| READ COMMITTED   | Prevented  | Possible            | Possible     |
| REPEATABLE READ  | Prevented  | Prevented           | Possible     |
| SERIALIZABLE     | Prevented  | Prevented           | Prevented    |
```

```sql
-- Set isolation level for critical operations
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN;
  -- Concurrent transactions execute as if sequential
  SELECT balance FROM accounts WHERE id = 1;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
COMMIT;
```

### Durability Example
```
Transaction flow with WAL:

1. BEGIN TRANSACTION
2. Write changes to WAL (write-ahead log)
3. Apply changes to data pages (in memory)
4. COMMIT — flush WAL to disk
5. Acknowledge commit to client
6. Later: checkpoint writes dirty pages to disk

On crash recovery:
- Replay WAL to restore committed transactions
- Rollback uncommitted transactions
```

## ACID vs BASE

| Property | ACID | BASE |
|----------|------|------|
| **Focus** | Strong consistency | High availability |
| **Transactions** | Strict, synchronous | Eventual consistency |
| **Use case** | Financial, inventory | Social media, analytics |
| **Trade-off** | Lower availability | Temporary inconsistency |

```
ACID: Atomicity, Consistency, Isolation, Durability
BASE: Basically Available, Soft state, Eventually consistent
```

## Common Issues

### Lost Update Problem
```
-- Without proper isolation:
T1: READ balance = 100
T2: READ balance = 100
T1: WRITE balance = 100 + 50 = 150
T2: WRITE balance = 100 - 30 = 70  -- T1's update lost!

-- Solution: Use proper isolation or optimistic locking
SELECT balance, version FROM accounts WHERE id = 1;
UPDATE accounts SET balance = 120, version = version + 1
WHERE id = 1 AND version = 5;  -- Fails if version changed
```

### Deadlock Prevention
```
-- BAD: Inconsistent lock order causes deadlock
T1: LOCK table_a, then LOCK table_b
T2: LOCK table_b, then LOCK table_a  -- Deadlock!

-- GOOD: Consistent lock order
T1: LOCK table_a, then LOCK table_b
T2: LOCK table_a, then LOCK table_b  -- Same order, no deadlock
```

## When to Apply

| Scenario | Recommendation |
|----------|----------------|
| Money transfer | SERIALIZABLE isolation, single transaction |
| Inventory update | REPEATABLE READ, optimistic locking |
| User registration | READ COMMITTED usually sufficient |
| Analytics queries | READ UNCOMMITTED acceptable |
| Distributed systems | Consider saga pattern instead of ACID |
