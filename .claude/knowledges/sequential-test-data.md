---
name: sequential-test-data
description: Use when designing seed data for sequential integration tests sharing a database
---

# Sequential Test Data Design

## Purpose
Design seed data and integration test data that works correctly when tests run sequentially sharing a database. Prevent state mutation conflicts, cascade side effects, and cross-test contamination.

## When to Apply
- Designing seed data for API integration tests (Bruno)
- Designing seed data for E2E tests (Playwright)
- Any test suite where tests share mutable state (database, file system, external service)

## Core Practices

### 1. State Mutation Trace
Before finalizing test data, walk through ALL tests in execution order and document:

| Test | Target Resource | Required Pre-State | Mutation | Post-State |
|------|----------------|-------------------|----------|------------|

This trace reveals where one test's mutation breaks another test's precondition.

**Rule**: Every test's required pre-state must be satisfied by the seed data + all previous tests' mutations.

### 2. Dedicated Resource Assignment
Assign specific database records to specific test groups. Two test groups should never depend on the same mutable record.

**Pattern**:
```
Test Group A (create tests)    → uses resource-001, resource-002
Test Group B (status changes)  → uses resource-007, resource-008, resource-014
Test Group C (delete tests)    → uses resource-099 (disposable)
```

**Why**: If Test Group A mutates a resource's state (e.g., status change, field update), and Test Group B needs that resource in its original state, they'll conflict. Dedicated resources prevent this.

### 3. Disposable Resource Pattern
Tests that destroy data (DELETE, DROP) must target disposable records — records created solely to be destroyed.

**Pattern**:
```yaml
# Seed a disposable record
- { id: resource-099, purpose: "deleted by test AT-XX, not used elsewhere" }
```

**Rule**: Never DELETE a record that any later test reads, updates, or depends on.

### 4. CASCADE Impact Analysis
Before seeding data in a parent table, identify all CASCADE DELETE paths:

```
parent_entity (parent)
  └─ child_entity (child, ON DELETE CASCADE)
       └─ grandchild_entity (grandchild, ON DELETE CASCADE)
```

**Check**: If any test DELETEs a parent record, ALL child and grandchild records under it are also deleted. Any later test that needs those records will fail with 404.

**Rule**: Keep test-critical records in parents that no test deletes. If a test must delete a parent, seed it in a separate parent that contains only disposable children.

### 5. Test Group Isolation by Parent
When tests share a parent resource (e.g., child records belong to a parent entity):

- **Safe parent**: Parent that no test deletes → put critical records here
- **Disposable parent**: Parent that a test will delete → put only disposable records here

```
parent-001 (safe — never deleted)
  ├─ child-001 ... child-015 (all test-critical records)
  └─ child-099 (disposable for delete test)

parent-002 (disposable — deleted by cascade test)
  ├─ child-010, child-011, child-012 (will be cascade-deleted)
```

### 6. Execution Order Awareness
Integration test runners may execute tests in unexpected order:
- **Bruno**: Runs folders alphabetically, then files alphabetically within folders
- **Playwright**: Runs files alphabetically by default
- **Jest**: Runs files in parallel by default (unless `--runInBand`)

**Rule**: Name folders and files to enforce correct execution order:
```
01-auth/
02-floor/
03-areas/
04-tables/
05-reservations/
06-status-transitions/
```

### 7. State Contract Documentation
For each integration test, document its state contract:

```
AT-XX {test name}:
  PRE:  {resource}.{field} = {required value}
  DO:   {HTTP method} {endpoint}
  POST: {resource}.{field} = {new value}
```

This makes the dependency chain explicit and reviewable.

## Anti-Patterns

### Don't: Share mutable records across test groups
```
# BAD: AT-03 mutates resource-001, AT-44 needs resource-001 in original state
AT-03: POST /resources/resource-001/action → resource-001 state changes
AT-44: PATCH /resources/resource-001/other → expects original state (FAILS!)
```

### Don't: Put test-critical records in deletable parents
```
# BAD: AT-18 deletes parent-002, AT-35 needs child-010 (under parent-002)
AT-18: DELETE /parents/parent-002 → cascades to child-010, child-011, child-012
AT-35: GET /children/child-010 → 404 (record was cascade-deleted!)
```

### Don't: Assume seed state persists
```
# BAD: Seed says resource-002.status = 'active', test at position 50 assumes it's still 'active'
# Earlier tests may have changed resource-002 to a different state
```

## Checklist
- [ ] State mutation trace completed for all integration tests
- [ ] Each test group has dedicated, non-overlapping resources
- [ ] Destructive tests (DELETE) target disposable-only resources
- [ ] CASCADE paths analyzed — no test-critical records under deletable parents
- [ ] Execution order verified (folder/file naming enforces order)
- [ ] State contracts documented for state-mutating tests
