# Knowledges

Shared knowledge base for AI agent skills. Each knowledge file provides domain expertise that can be referenced by multiple skills.

## Format

Each knowledge file uses YAML frontmatter for AI agent discovery:

```yaml
---
name: knowledge-name
description: When and how to use this knowledge
---

# Title

## Purpose
...
```

## Knowledge Index

### Testing & QA

| Knowledge | Description |
|-----------|-------------|
| `test-driven-development` | TDD red-green-refactor cycle for features and bugfixes |
| `test-first` | Write tests before implementation to drive design |
| `test-pyramid` | Proportions of unit, component, and E2E tests |
| `test-boundary-only` | Focus tests on public interfaces, not implementation |
| `3a-pattern` | Structure tests into Arrange, Act, Assert phases |
| `bdd-scenarios` | Given/When/Then format for acceptance criteria |
| `mockist-testing` | Isolate units with interfaces and test doubles |
| `e2e-test-isolation` | Deterministic parallel Playwright E2E tests |
| `parallel-test-infrastructure` | Per-worker database isolation for parallel tests |
| `sequential-test-data` | Seed data design for sequential integration tests |
| `microservice-testing-strategy` | Testing strategy for microservice architecture |

### Architecture & Design

| Knowledge | Description |
|-----------|-------------|
| `solid-principles` | SRP, OCP, LSP, ISP, DIP for maintainable OO design |
| `simple-design` | YAGNI - keep code simple, avoid over-engineering |
| `interface-first` | Define contracts before implementation |
| `dependency-injection` | Testable code with explicit dependencies |
| `reduce-coupling` | Minimize dependencies between components |
| `state-machine` | Domain entities with status transitions |
| `ubiquitous-language` | Common vocabulary across team and code |
| `walking-skeleton` | End-to-end implementation to validate architecture |
| `company-architecture` | How repositories relate for integration planning |
| `acid-principles` | Database transaction guarantees for data integrity |
| `prosemirror` | Schema/state/plugins for ProseMirror-based editors (Tiptap's engine) |
| `tiptap` | Tiptap v3 extensions, React node views, and command chains (wraps ProseMirror) |
| `react-flow` | React Flow (`@xyflow/react`) node-based editors — custom nodes/edges, controlled state, handles |

### Development Practices

| Knowledge | Description |
|-----------|-------------|
| `conventional-commits` | Git commit message format |
| `feature-flag` | Safely introduce changes behind toggles |
| `parallel-change` | Backward-incompatible changes via expand-migrate-contract |
| `symlink-skills` | Share skills across repos via symlinks |
