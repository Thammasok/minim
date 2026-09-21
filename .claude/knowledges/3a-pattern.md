---
name: 3a-pattern
description: Use when writing unit tests to structure them into Arrange, Act, Assert phases
---

# 3A Pattern (Arrange, Act, Assert)

## Purpose
Structure every unit test into three clear phases for readability, consistency, and focused testing.

## Principles
- Every test should have exactly one reason to fail.
- The three phases should be visually distinct in the test code.
- Assert-first approach can help design tests from expected outcomes.

## Rules
- **DO**: Separate Arrange, Act, and Assert with blank lines or comments.
- **DO**: Keep each phase focused — one action, clear assertions.
- **DO**: Multiple related assertions are acceptable when testing object modifications.
- **DON'T**: Mix arrange and act phases.
- **DON'T**: Write multi-step act-assert-act-assert sequences (that's an integration scenario, not a unit test).
- **DON'T**: Assert on things unrelated to the behavior being tested.

## Patterns
### Structure
```
// Arrange — set up the test context
service = create UserService with mockRepository
userData = { name: "John", email: "john@example.com" }

// Act — execute the behavior under test
result = service.createUser(userData)

// Assert — verify the expected outcome
assert result.id is defined
assert result.name equals "John"
```

### Assert-First Approach
1. Start by writing the assertion (what should be true after the action).
2. Then write the action that produces the result.
3. Then set up whatever context the action needs.
