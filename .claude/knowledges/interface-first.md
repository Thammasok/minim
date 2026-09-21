---
name: interface-first
description: Use when defining contracts before implementation for frontend and backend development
---

# Interface First

## Purpose
Define interfaces (entity, DTO, model, contracts) before writing implementation code. This applies to BOTH frontend and backend development.

## Principles
- Interfaces define the contract between layers and components.
- Designing interfaces first forces thinking about boundaries and responsibilities.
- Interfaces enable mockist testing — dependencies can be test-doubled.
- Clear interfaces make parallel development possible (frontend and backend can work against contracts).

## Rules
- **DO**: Define entity interfaces before implementing repositories.
- **DO**: Define DTO interfaces before implementing services.
- **DO**: Define API contracts (request/response types) before implementing controllers.
- **DO**: Define component prop interfaces before implementing UI components.
- **DO**: Define state model interfaces before implementing state management.
- **DO**: Define service interfaces before implementing frontend services.
- **DON'T**: Start implementing before interfaces are defined.
- **DON'T**: Let implementation details leak into interface definitions.
- **DON'T**: Create interfaces that mirror implementation structure — design for consumers.

## Patterns
### Backend Interfaces (see tech-stack-profile → Architecture Pattern for concrete layer names)
```
1. Entity interfaces                → domain objects shape
2. DTO interfaces                   → data transfer between layers
3. Data Access interface            → storage operation contract
4. Business Logic interface         → orchestration/domain rule contract
5. External Integration interface   → external service contract
6. Real-Time interface              → bi-directional communication contract (if applicable)
7. Entry Point contract             → request/response shapes
```

### Frontend Interfaces
```
1. API contract types    → request/response from backend
2. State model           → application state shape
3. Service interface     → data access and business logic
4. Component props       → component input/output contract
5. Event types           → component communication contracts
```
