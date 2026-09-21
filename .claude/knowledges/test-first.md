---
name: test-first
description: Use when writing tests before implementation to drive design (TDD)
---

# Test First (TDD)

## Purpose
Write tests BEFORE implementation code to clarify requirements, drive design, and ensure every piece of code has a corresponding test from the start.

## Principles
- Red → Green → Refactor cycle.
- Tests define the expected behavior before code exists.
- Writing tests first produces better design through testability pressure.
- No code is written without a failing test that demands it.

## Rules
- **DO**: Write a failing test first that describes the expected behavior.
- **DO**: Write the minimum code to make the test pass (green).
- **DO**: Refactor only after the test is green.
- **DO**: Keep the red-green-refactor cycle small (minutes, not hours).
- **DON'T**: Write implementation code before a test exists.
- **DON'T**: Write more test than needed — test boundaries only, not all cases.
- **DON'T**: Skip the refactor step.
- **DON'T**: Write tests that depend on other tests.

## Patterns
### The TDD Cycle
```
1. RED:    Write a test that fails (describes desired behavior)
2. GREEN:  Write minimum code to pass the test
3. REFACTOR: Clean up code while keeping tests green
4. REPEAT
```

### Two Hats
- Hat 1: Adding behavior (write test + make it pass)
- Hat 2: Refactoring (improve structure, tests stay green)
- Never wear both hats at the same time.
