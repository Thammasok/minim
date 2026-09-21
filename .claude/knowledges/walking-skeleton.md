---
name: walking-skeleton
description: Use when building a tiny end-to-end implementation to validate architecture early
---

# Walking Skeleton

## Purpose
Ensure the team builds a tiny end-to-end implementation linking all major architectural components before expanding functionality. This validates the architecture, team process, and technology choices early.

## Principles
- A walking skeleton is NOT a spike — it is permanent, production-quality code with tests.
- Build the 1 most important scenario first (horizontal slice).
- Make everything functional without taking UI into account.
- Implement every integration before development.
- After the skeleton works, implement other scenarios vertically.

## Rules
- **DO**: Pick the single most important scenario from the scenario list for the skeleton.
- **DO**: Implement end-to-end: from UI action → API → service → database → response.
- **DO**: Include real integration points (docker-compose backing services, mock 3rd party).
- **DO**: Write tests for the skeleton — it must be self-testing code.
- **DON'T**: Build multiple scenarios before the skeleton is complete.
- **DON'T**: Skip integration setup — the skeleton must prove the architecture works.
- **DON'T**: Treat the skeleton as throwaway code.

## Patterns
1. Identify the most important user scenario.
2. Trace it through every architectural layer (Resources → Service → Domain → Repository → Gateway).
3. Set up backing services (docker-compose) for real integration.
4. Implement the minimum code to make the scenario work end-to-end.
5. Write tests at each layer boundary.
6. Verify the full flow works with integration tests.
7. Only then proceed to the next scenario.
