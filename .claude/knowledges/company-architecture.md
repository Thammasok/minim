---
name: company-architecture
description: Use when understanding how repositories relate to each other for integration planning
---

# Company Architecture

## Purpose
Understand how all repositories in the company relate to each other. This knowledge informs requirements gathering, design decisions, and integration planning.

## Usage
Read the master architecture map at `.claude/company/architecture.md` for the system overview. Fetch specific repo descriptions from `.claude/company/repos/{repo-name}.md` for detailed information about individual services.

## When to Consult
- During **requirements gathering** — to understand what systems are affected.
- During **design-flow** — to understand integration points.
- During **interface definition** — to align with existing API contracts.
- During **backing service setup** — to understand dependencies.
- When planning **deployment** — to understand deployment order and impact.

## Rules
- **DO**: Check the architecture map before designing new integrations.
- **DO**: Verify API contracts match the consuming repo's expectations.
- **DO**: Update repo descriptions when APIs or dependencies change.
- **DO**: Consider upstream/downstream impact of changes.
- **DON'T**: Duplicate functionality that already exists in another repo.
- **DON'T**: Create new integration patterns — follow existing ones.
- **DON'T**: Assume API contracts haven't changed — verify against the source repo.
