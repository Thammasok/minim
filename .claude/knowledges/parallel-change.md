---
name: parallel-change
description: Use when introducing backward-incompatible changes safely using expand-migrate-contract
---

# Parallel Change (Expand-Migrate-Contract)

## Purpose
Safely introduce backward-incompatible changes by supporting both old and new versions simultaneously, migrating consumers gradually, then removing the old version.

## Principles
- Never break existing consumers with a change.
- Three phases: Expand (support both), Migrate (move consumers), Contract (remove old).
- Branch by Abstraction enables large-scale replacements through an abstraction layer.

## Rules
- **DO**: Add the new version alongside the old (expand phase).
- **DO**: Migrate consumers one at a time to the new version.
- **DO**: Remove the old version only after all consumers have migrated (contract phase).
- **DO**: Use branch by abstraction for large replacements.
- **DON'T**: Remove the old version before all consumers are migrated.
- **DON'T**: Make breaking changes without a migration path.
- **DON'T**: Skip the contract phase — old code left behind becomes technical debt.

## Patterns
### Three Phases
```
1. EXPAND:   Add new interface/behavior alongside existing
             Both old and new work simultaneously

2. MIGRATE:  Update consumers one by one to use new version
             Run both versions, verify each migration

3. CONTRACT: Remove old interface/behavior
             Clean up deprecated code
```

### Branch by Abstraction
```
1. Create abstraction layer over existing implementation
2. Move all clients to use the abstraction
3. Build new implementation behind the abstraction
4. Switch abstraction to new implementation
5. Remove old implementation
```
