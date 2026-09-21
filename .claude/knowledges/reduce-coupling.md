---
name: reduce-coupling
description: Use when minimizing dependencies between components for easier testing and deployment
---

# Reduce Coupling

## Purpose
Minimize dependencies between components so that changes in one area don't ripple across the system. Loosely coupled systems are easier to test, modify, and deploy independently.

## Principles
- Depend on abstractions (interfaces), not concrete implementations.
- Bounded contexts define clear boundaries between domains.
- Published interfaces require more care than internal ones — changes affect external consumers.
- Three main decoupling strategies: interfaces, closures/functions, and notifications/events.

## Rules
- **DO**: Define clear boundaries between modules/services using interfaces.
- **DO**: Use events/notifications for cross-cutting concerns.
- **DO**: Keep bounded contexts separate — each owns its data and logic.
- **DO**: Pass functions/closures when full interface is overkill.
- **DON'T**: Share internal data structures across module boundaries.
- **DON'T**: Create circular dependencies between modules.
- **DON'T**: Change published interfaces without coordinating with consumers.
- **DON'T**: Couple modules through shared mutable state.

## Patterns
### Decoupling Strategies
| Strategy | When to Use | Example |
|----------|-------------|---------|
| **Interface** | Service boundary | `UserRepository` interface, swappable implementation |
| **Closure/Function** | Simple callback | Pass a `validate(data)` function instead of a validator object |
| **Event/Notification** | Cross-cutting | Publish `UserCreated` event, listeners react independently |

### Bounded Context
- Each context owns its domain model, data, and language.
- Communication between contexts goes through explicit contracts (APIs, events).
- Same real-world concept may have different representations in different contexts.
