---
name: simple-design
description: Use when keeping code simple and avoiding over-engineering (YAGNI principle)
---

# Simple Design (YAGNI)

## Purpose
Keep code as simple as possible. Never add functionality for the future. The simplest design that works is the best design.

## Principles
- 90% of speculative features are never used — building them wastes 90% of time.
- Extra features increase complexity without value.
- Simple code is easier to modify when real requirements emerge.
- Good design maintains productivity; complexity kills it (design stamina hypothesis).

## Rules
- **DO**: Implement only what is needed for the current scenario/story.
- **DO**: Keep solutions as small and focused as possible.
- **DO**: Delete code that is no longer used.
- **DO**: Prefer three similar lines over a premature abstraction.
- **DON'T**: Add features, parameters, or configurability "just in case."
- **DON'T**: Build abstractions for hypothetical future requirements.
- **DON'T**: Add error handling for scenarios that can't happen.
- **DON'T**: Over-engineer — the right amount of complexity is the minimum needed.

## Patterns
### Four Rules of Simple Design (Kent Beck)
1. Passes all the tests
2. Reveals intention (clear, readable)
3. No duplication (DRY, but don't force it prematurely)
4. Fewest elements (classes, methods, lines)

### Decision Checklist
- Is this needed for the current story? If no → don't build it.
- Can I solve this with less code? If yes → simplify.
- Am I adding this because I think we'll need it later? If yes → stop.
