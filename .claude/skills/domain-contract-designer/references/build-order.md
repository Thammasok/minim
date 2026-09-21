# Build Order Reference

How to resolve a set of domain contracts into a tiered build order,
detect dependency cycles, and produce `build-order.yaml`.

---

## Algorithm

### Input
All `domain-contract.yaml` files in `contracts/`. Each has:
- `domain` (unique name)
- `depends_on[].domain` (upstream dependency names)
- `implementation.build_priority` (hint; algorithm may override)

### Step 1 — Build Dependency Graph

For each contract, extract directed edges:
```
domain → depends_on[].domain
```

Example:
```
notification  → (none)
inventory     → (none)
payment       → (none)
order         → inventory, payment
fulfillment   → order, inventory
```

### Step 2 — Detect Cycles (Kahn's Algorithm)

1. Compute in-degree for each node.
2. Enqueue all nodes with in-degree = 0.
3. While queue is not empty: dequeue node, reduce in-degree of its
   dependents, enqueue any that reach 0.
4. If processed count < total nodes → **cycle detected**.

**On cycle detection:** Stop. Report the cycle path. Escalate to
`solution-architecture` — circular domain dependencies are a bounded
context design error, not a build-order problem.

### Step 3 — Assign Tiers

Process the topological sort output into tiers:
- **Tier 1** — no dependencies (leaf nodes); build first
- **Tier N** — all dependencies are in tiers < N

Domains within the same tier have no dependencies on each other
and can be built in parallel.

Example tiers from the graph above:
```
Tier 1: notification, inventory, payment
Tier 2: order
Tier 3: fulfillment
```

---

## Output Format: `build-order.yaml`

```yaml
schema_version: "1.0"
project: <string>
generated_at: <iso-datetime>
total_domains: <int>

tiers:
  - tier: 1
    parallel: true
    domains:
      - name: <domain-name>
        skill: <implementation.skill>
        stack: <implementation.stack>
        repo: <implementation.repo>       # optional
        reason: No upstream dependencies
  - tier: 2
    parallel: true
    domains:
      - name: <domain-name>
        skill: <implementation.skill>
        stack: <implementation.stack>
        depends_on: [<domain-name>, ...]
        reason: Depends on tier-1 domains

dependency_graph:
  - from: <domain>
    to: <domain>
    contract_id: <string>
    call_pattern: sync | async
```

---

## Complete Example

Given four contracts: `inventory`, `payment`, `order`, `notification`

```yaml
schema_version: "1.0"
project: e-commerce-platform
generated_at: "2025-01-15T10:00:00Z"
total_domains: 4

tiers:
  - tier: 1
    parallel: true
    domains:
      - name: inventory
        skill: software-engineer-backend
        stack: typescript
        reason: No upstream dependencies
      - name: payment
        skill: software-engineer-backend
        stack: typescript
        reason: No upstream dependencies
      - name: notification
        skill: software-engineer-backend
        stack: node
        reason: No upstream dependencies

  - tier: 2
    parallel: false
    domains:
      - name: order-management
        skill: software-engineer-backend
        stack: typescript
        depends_on: [inventory, payment]
        reason: Depends on inventory (sync) and payment (events)

dependency_graph:
  - from: order-management
    to: inventory
    contract_id: check-stock
    call_pattern: sync
  - from: order-management
    to: payment
    contract_id: initiate-payment
    call_pattern: async
```

---

## Edge Cases

| Situation | Action |
|---|---|
| Domain A and B both depend on each other | Cycle — escalate to `solution-architecture` |
| Domain has `depends_on` but the target contract doesn't exist | Validation error — block build order generation |
| `implementation.build_priority` conflicts with graph order | Graph order wins; log a warning noting the override |
| Two domains in same tier call each other via events | Allowed — async event consumption does not create a build dependency |
| Domain has no `depends_on` but has `events_consumed` | Tier 1 — event consumption is runtime, not build-time dependency |
