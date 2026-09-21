# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What minim is

**minim is an alternative Postman app.** It authors Postman Collection Format **v2.1 JSON** files and runs them through the **Newman CLI**.

Two consequences shape every decision in this repo:

- **The v2.1 JSON file is the product's output and its interchange format.** Anything minim can express must round-trip through a valid v2.1 collection, and anything a user imports from Postman must survive being read back. Don't invent app-private fields in the collection tree — v2.1 allows extension only where the schema does (e.g. `variable`, `protocolProfileBehavior`).
- **Newman is the execution engine**, so Newman's constraints are minim's constraints: v2.1 JSON only (no v3 YAML), iteration data supplied as a *separate* file via `-d`, and iteration values arriving in scripts as strings.

## Repository state

`minim` (`git@github.com:Thammasok/minim.git`) is greenfield: the `main` branch has **no commits yet**, and there is no `package.json`, `tsconfig.json`, test runner, or linter. There are therefore no build/lint/test commands to run — if a task needs them, scaffold the toolchain first and record the resulting commands here. The UI stack and how Newman is invoked (child process, programmatic `newman.run`, …) are not decided yet in code; don't assume one.

Only two things exist:

- `postman-collection.ts` — the sole source file, and currently the whole domain model (see below).
- `.claude/` — the agent workspace: a delivery-pipeline skill set and a shared knowledge base.

## `postman-collection.ts`

Standalone, dependency-free TypeScript describing the **Postman Collection Format v2.1**, plus runtime helpers. It is minim's contract with both sides of the product: the shape it *writes* for Newman, and the shape it must tolerate when *reading* a collection exported by Postman itself. Comments are in Thai; match that when editing this file.

That asymmetry drives the main design constraint: **the Postman schema is polymorphic**. Several fields are legitimately either a string or a structured object/array, and collections exported by different Postman versions differ. minim's own writer can emit one canonical shape, but its reader must accept all of them — so never read these fields directly, always go through the normalizers, which are the file's real contract:

| Field | Shapes | Normalizer |
|---|---|---|
| `Request.url` | `Url \| string` | `getUrlString` (falls back to reassembling from `protocol`/`host`/`path`/`port` when `raw` is absent) |
| `Request.header` | `Header[] \| string` | `getHeaders` (splits a raw header block on the first `:`) |
| `Script.exec` | `string[] \| string` | `getScriptSource` |
| `*.description` | `Description \| string` | `getDescription` |

On import, gate on `info.schema` — it should end in `/v2.1.0/collection.json`. Check it before parsing rather than letting an older/newer collection fail deep in the tree.

`Item` is a recursive union: `ItemGroup` (a folder, has `item[]`) or `ItemRequest` (a leaf, has `request`). Discriminate with `isItemGroup` / `isItemRequest`, and traverse with `walkRequests(items, cb)`, which yields each leaf together with its folder path — that path is what UI listing and search are expected to key on.

Iteration data (`newman -d`) is a *separate* file from the collection, one array element per iteration, exposed to scripts as `{{key}}` / `pm.iterationData.get(key)`. `parseCsv` turns CSV into that shape and deliberately mirrors Newman's behaviour: **every value stays a string**, callers cast. It is RFC 4180-compliant via the `tokenizeCsv` state machine (quoted fields containing delimiters/newlines, `""` escaping, CRLF, and BOM stripping for Excel exports). `detectDelimiter` picks comma vs. tab from the first line; `previewIterationData` summarizes rows/columns for a pre-run confirmation UI.

## `.claude/` workspace

### Skills — the delivery pipeline

`.claude/skills/` holds a staged software-delivery pipeline. `skill-orchestrator` is the entry point for any "build X" request and routes through the phases; each phase has a **mandatory human review gate** before the next begins:

1. requirements-engineering → 2. solution-architecture → 2.5 domain-contract-designer (distributed systems only; skip for monoliths/single-domain/frontend-only) → 3. software-tester-design → 4–5. orchestrator (task breakdown + build order) → 6a react-vite-developer ‖ 6b software-engineer-backend (parallel) → 7. software-tester-automation → 8. software-tester-execution.

`orchestrator` then drives execution from a `dev-plan.md` produced by `solution-planner`. Two rules there are non-negotiable:

- **Never regenerate `dev-plan.md`.** Task state lives in a per-task YAML block; edit the single `status:` line in place (and the matching front-matter `status:` and `docs/todo.md` row).
- Status flows `backlog → doing → test → review → done`, with `blocked` re-entering via `doing`. Only a **human** moves a task out of `review`; the orchestrator must pause and ask.

### Knowledges — shared reference

`.claude/knowledges/` is a flat set of one-topic files (YAML frontmatter `name` + `description`, then Purpose/Rules/Usage), indexed in `.claude/knowledges/README.md` and cited by multiple skills rather than duplicated into them. Add new guidance as a new file plus a README index row, in the same frontmatter format.

Two are load-bearing for how work is done here:

- `conventional-commits` — commit messages follow Conventional Commits.
- `company-architecture` — before designing an integration, read `.claude/company/architecture.md` and `.claude/company/repos/{repo}.md`. Those paths do **not** exist in this repo; per `symlink-skills`, `.claude/company` (and `commands`, `guidelines`, `roles`, `settings.json`) are meant to be symlinked individually from a sibling `saas-factory` checkout, with the symlinks committed. If a skill references a missing `.claude/` path, that symlink is the likely gap — say so rather than inventing the content.
