---
name: mockist-testing
description: Use when isolating units under test with interfaces and test doubles
---

# Mockist Testing

## Purpose
Use interfaces and test doubles to isolate units under test, controlling the environment and verifying interactions between components.

## Principles
- Program to interfaces, not implementations.
- Mock every layer EXCEPT gateway and repository (these use real integration tests).
- Understand the difference between mocks, stubs, fakes, spies, and dummies.
- Behavior verification (mocks) vs state verification (stubs) — choose appropriately.

## Rules
- **DO**: Define interfaces for every service boundary.
- **DO**: Use test doubles for dependencies in unit tests.
- **DO**: Mock service → service interactions.
- **DO**: Use real implementations for gateway and repository tests (with docker-compose backing services).
- **DO**: Use contract tests to verify test doubles match real service behavior.
- **DON'T**: Mock the class under test — only mock its dependencies.
- **DON'T**: Mock gateway or repository layers — test these with real backing services.
- **DON'T**: Over-specify mock expectations (brittle tests).
- **DON'T**: Use mocks as an excuse to skip integration tests.

## Patterns
### Five Types of Test Doubles
| Type | Purpose | Behavior |
|------|---------|----------|
| **Dummy** | Fill parameter lists | No behavior, never actually called |
| **Fake** | Working implementation | Simplified (e.g., in-memory DB) |
| **Stub** | Provide canned answers | Returns predetermined responses |
| **Spy** | Record interactions | Stubs that also record calls |
| **Mock** | Verify expectations | Pre-programmed with expected calls |

### When to Use What (see tech-stack-profile → Architecture Pattern for concrete layer names)
- **Business Logic → Business Logic**: Mock the dependency, verify interaction
- **Business Logic → Data Access**: Use real Data Access with docker backing service
- **Business Logic → External Integration**: Use real External Integration with mock 3rd party (Mountebank)
- **Entry Point → Business Logic**: Mock Business Logic, verify request/response
