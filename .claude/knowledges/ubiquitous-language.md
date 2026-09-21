---
name: ubiquitous-language
description: Use when building common vocabulary between developers, QA, and business stakeholders
---

# Ubiquitous Language

## Purpose
Build and maintain a common vocabulary between developers, QA, and business stakeholders. The same terms used in conversation should appear in code, tests, and documentation.

## Principles
- Language is based on the domain model, not technical implementation.
- Terms must be tested with domain experts — if they don't recognize a term, it's wrong.
- Language evolves with understanding — update code when language changes.
- Beware semantic diffusion: terms losing meaning as they spread without discipline.

## Rules
- **DO**: Use domain terms in code (class names, method names, variable names).
- **DO**: Use the same terms in scenarios, tests, documentation, and conversation.
- **DO**: Update code when the team's understanding of a term changes.
- **DO**: Define terms explicitly when they're ambiguous.
- **DON'T**: Use different names for the same concept in different layers.
- **DON'T**: Invent technical jargon when a domain term exists.
- **DON'T**: Let terms drift — re-articulate meaning when confusion arises.

## Patterns
### Language in Code
```
// BAD: technical terms
class DataProcessor { processRecord(obj) {} }

// GOOD: domain terms
class LoanApplication { submitForApproval(applicant) {} }
```

### Bounded Context Language
- The same word may mean different things in different contexts.
- "Account" in billing context ≠ "Account" in identity context.
- Each bounded context maintains its own language explicitly.
