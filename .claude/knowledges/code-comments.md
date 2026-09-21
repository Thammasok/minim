---
name: code-comments
description: Use when writing or reviewing comments in source code — decides what earns a comment and what does not, and caps comment density
---

# Code Comments

## Purpose

A comment is the only part of a file the compiler never checks and the tests never run. Every one
is a liability that has to be carried forward, re-read on every visit, and updated whenever the code
below it moves. So a comment has to buy more than it costs.

The usual rule — _"comments explain why, not what"_ — is necessary but not sufficient. Applied on
its own it produces files where every block carries a paragraph of justification, because a _why_
can be invented for anything. The test below is the filter that rule is missing.

## The test

> Write the comment only if a competent reader who skipped it would **get something wrong** — not
> merely be curious, and not merely take longer.

Three things pass that test:

1. **A trap** — the code is correct in a way that looks incorrect, and the obvious "fix" breaks it.
2. **An external constraint** — the shape is forced by a library's behaviour, a spec, a wire format,
   or a database's rules, and nothing in this file reveals that.
3. **A rejected alternative that will be re-proposed** — a reviewer will suggest the other way, and
   the reason it fails is not local.

Everything else is deleted. In particular:

- **Restating the signature.** `/** Validated request body. */` above `type X = z.infer<typeof S>`
  adds nothing the line already says.
- **Narrating the obvious.** `// loop over the rows` — the reader can see the loop.
- **Justifying an uncontroversial choice.** No one will challenge it, so no one needs the defence.
- **Requirement IDs as decoration.** `(FR-023)` belongs where the behaviour would look arbitrary
  without it — not on every function in the file that the requirement touched.

## Budget

| Scope             | Guidance                                                                       |
| ----------------- | ------------------------------------------------------------------------------ |
| File header       | Only when the file's _existence_ is non-obvious. Two or three lines, not twenty |
| Exported function | Only when the name and signature genuinely under-specify it                     |
| Inline            | On the line that holds the trap, not above the block that contains it           |
| Whole file        | Above ~20% comment lines, re-read it — the excess is usually restatement        |

The percentage is a smell, not a gate. A file that is 40% comments because it wraps three genuine
library traps is fine; a file that is 40% comments because every function has a paragraph is not.

## Prefer code that needs no comment

Reach for these before reaching for a comment — each one moves the explanation somewhere the
compiler checks:

- **A named constant** instead of a literal plus a note explaining the literal.
- **A named function** instead of a block plus a note describing the block.
- **A test** instead of a note about what must stay true. A comment saying "the order of these
  tokens is load-bearing" is a test that was never written.
- **A type** instead of a note about what a value is allowed to be.

## Examples

Drawn from `apps/api`.

**Keep** — a trap. The obvious change breaks document generation, and nothing local says so:

```ts
// No registry `id` here: an `id` makes this a component that gets $ref-ed from `parameters`,
// which @fastify/swagger cannot resolve — generation then throws.
.meta({ title: 'List workers query' })
```

**Keep** — an external constraint invisible from the code:

```ts
// PostgreSQL 18 keeps PGDATA in a version-scoped directory; the 16-era path makes the
// container restart-loop.
- postgres-data:/var/lib/postgresql/18/docker
```

**Cut** — restates the line below it:

```ts
/** Validated `PATCH /api/v1/workers/:id` body — guaranteed to carry at least one field. */
export type UpdateWorkerInput = z.infer<typeof UpdateWorkerSchema>
```

The name says `Update…Input`; `z.infer` says validated; "at least one field" is the schema's job to
state and a test's job to prove.

**Cut** — a defence nobody asked for:

```ts
/**
 * The list response is the one that is not wrapped here: `listWorkers` already returns
 * `{ data, meta }`, and re-wrapping would nest the page inside itself.
 */
async list(request) {
  return service.listWorkers(request.query)
}
```

One line of code, four of prose. The absence of a wrapper is visible.

## Related

- [`simple-design.md`](simple-design.md) — fewest elements; a deleted comment is one fewer element.
- [`test-driven-development.md`](test-driven-development.md) — the invariants worth stating are the
  ones worth asserting.
