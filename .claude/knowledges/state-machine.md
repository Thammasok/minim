---
name: state-machine
description: Use when designing domain entities with status transitions and workflow states
---

# State Machine Design

## Purpose
Design clean, maintainable state machines for domain entities with status transitions. Ensure transitions are explicit, testable, and role-aware when needed.

## When to Apply
- Domain entities with a `status` field that changes over time
- Workflow steps (e.g., order: pending → confirmed → shipped → delivered)
- Resource lifecycle (e.g., resource: available → reserved → in-use → available)
- Approval flows (e.g., request: draft → submitted → approved → rejected)

## Core Practices

### 1. Explicit Transition Definitions
Define valid transitions as data, not scattered if/else logic:

```typescript
// Good: transitions are explicit and reviewable
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected'],
  approved: ['archived'],
  rejected: ['draft'],
  archived: [],
};

// Or as "target-from" arrays (group by target state)
const SUBMIT_FROM = ['draft'];
const APPROVE_FROM = ['submitted'];
const REJECT_FROM = ['submitted'];
const ARCHIVE_FROM = ['approved'];
const REOPEN_FROM = ['rejected'];
```

### 2. Single Validation Point
Validate transitions in one place — the service method:

```typescript
async approve(id: string): Promise<StatusResponse> {
  const entity = await this.repository.findById(id);
  if (!entity) throw new NotFoundException();

  if (!APPROVE_FROM.includes(entity.status)) {
    throw new ConflictException({
      error: `Invalid state transition: ${entity.status} → approved`
    });
  }

  await this.repository.update(id, { status: 'approved' });
  return { id, status: 'approved' };
}
```

### 3. 409 Conflict for Invalid Transitions
Use HTTP 409 Conflict (ConflictException) for invalid state transitions — not 400 Bad Request.

**Why**: 400 means "your request is malformed." 409 means "the request conflicts with the current state of the resource." State transition failures are resource state conflicts.

### 4. Role-Specific Transition Logic
When different roles have different permissions for the same transition, enforce it in the **service layer**, not the guard/middleware:

```typescript
// Guard allows all relevant roles through:
@Roles('Admin', 'Editor', 'Viewer')

// Service enforces business rules:
if (entity.status === 'submitted') {
  if (userRole === 'Viewer') {
    throw new ForbiddenException({ error: 'Only Admin or Editor can approve' });
  }
  if (userRole === 'Admin') {
    // Admin can approve and notify
    await this.notificationService.send(entity.authorId, 'approved');
  }
  // Editor: can approve without notification
}
```

**Why**: Guards enforce "who can call this endpoint." Services enforce "what business rules apply." Mixing them makes testing harder and errors less specific.

### 5. Test Every Transition Edge
For each target state, test:
- Every **valid** source state → succeeds
- At least one **invalid** source state → 409

```typescript
describe('approve', () => {
  it('should transition submitted → approved', ...);
  it('should reject draft → approved with 409', ...);
  it('should reject archived → approved with 409', ...);
});
```

### 6. Document the State Diagram
Include a state diagram in implementation notes:

```
draft ──→ submitted ──→ approved ──→ archived
               │
               └──→ rejected ──→ draft (reopen)
```

## Anti-Patterns

### Don't: Scatter transition logic
```typescript
// BAD: transition rules in multiple places
if (status === 'free') { /* some transitions */ }
// ... 200 lines later ...
if (status === 'reserved') { /* other transitions */ }
```

### Don't: Use 400 for state conflicts
```typescript
// BAD: 400 is for malformed requests, not state conflicts
throw new BadRequestException('Cannot arrive from free');
// GOOD: 409 is for state conflicts
throw new ConflictException('Invalid state transition: free → arrived');
```

### Don't: Put business rules in guards
```typescript
// BAD: guard tries to enforce business logic
@Roles('Admin', 'Editor')  // blocks Viewer entirely
// But Viewer SHOULD reach the service, which gives a specific 403

// GOOD: guard allows, service decides
@Roles('Admin', 'Editor', 'Viewer')
// Service: if Viewer + submitted → 403 with specific message
```

## Checklist
- [ ] Valid transitions defined as explicit data structures
- [ ] Invalid transitions return 409 ConflictException
- [ ] Role-specific logic in service layer, not guard
- [ ] Each valid transition has a test
- [ ] Each invalid transition has a test
- [ ] State diagram documented
