---
name: bdd-scenarios
description: Use when defining system behavior using Given/When/Then format for acceptance criteria
---

# BDD Scenarios

## Purpose
Define system behavior using Given/When/Then format in ubiquitous language, bridging communication between developers, QA, and business stakeholders.

## Principles
- Shift vocabulary from "testing" to "behavior."
- Scenarios are written in the language of the domain, not the implementation.
- Scenarios serve as living documentation and acceptance criteria.
- Fragments of scenarios can be reused across features.

## Rules
- **DO**: Write scenarios using Given/When/Then structure.
- **DO**: Use ubiquitous language — terms the business understands.
- **DO**: Write scenarios before implementation begins.
- **DO**: Cover happy path, edge cases, and error cases.
- **DO**: Keep each scenario focused on one behavior.
- **DON'T**: Use technical implementation details in scenario descriptions.
- **DON'T**: Write scenarios that test multiple behaviors at once.
- **DON'T**: Skip error/edge case scenarios.

## Patterns
### Scenario Template
```
Scenario: {descriptive name}
  Given {precondition / initial context}
  And {additional precondition if needed}
  When {action / trigger}
  And {additional action if needed}
  Then {expected outcome}
  And {additional outcome if needed}
```

### Example
```
Scenario: Successful login with valid credentials
  Given a registered user with email "user@example.com"
  And the user is on the login page
  When the user enters email "user@example.com" and password "valid123"
  And clicks the login button
  Then the user is redirected to the dashboard
  And a welcome message is displayed
```
