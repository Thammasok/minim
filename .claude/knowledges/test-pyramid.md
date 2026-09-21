---
name: test-pyramid
description: Use when planning test proportions across unit, component, and E2E tests
---

# Test Pyramid

## Purpose
Maintain the right proportion of test types to maximize confidence while minimizing cost and execution time.

## Principles
- Many fast unit tests at the base, fewer integration tests in the middle, minimal E2E tests at the top.
- Avoid the ice-cream cone anti-pattern (mostly E2E tests).
- Each layer catches different types of bugs — all layers are needed.
- Tests must earn their keep — expensive tests need to justify their cost.

## Rules
- **DO**: Write many unit tests (fast, isolated, focused on boundaries).
- **DO**: Write component tests for service-level integration.
- **DO**: Write a small number of E2E tests for critical user flows.
- **DO**: Use subcutaneous tests (just under the UI) when UI testing is too brittle.
- **DON'T**: Rely primarily on E2E tests — they are slow and brittle.
- **DON'T**: Skip unit tests because "E2E covers it."
- **DON'T**: Write integration tests for logic that unit tests already cover.

## Patterns
### Pyramid Proportions
```
        /  E2E  \          Few — critical paths only (Playwright)
       / Component \       Some — service-level integration
      /    Unit     \      Many — boundary testing, fast, isolated
```

### Test Types in This Framework
| Level | Tool | Scope | Mocking Strategy |
|-------|------|-------|------------------|
| Unit | Test framework | Single function/class | Mock all dependencies |
| Component | Test framework | Service boundary | Mock external services |
| API Integration | Bruno | API endpoint | Real service + mock 3rd party + real DB |
| E2E | Playwright | Full user flow | Real API + mock 3rd party + real DB |
