---
version: 1.0
status: active
date: 2026-09-21
requires: design.md
ux-design: ux-design.md
---

# Development Plan: Collection Viewer

## Summary

- **Total tasks** — 21 (19 engineering, 2 testing)
- **Estimated effort** — ~18 working days single-threaded; ~11 with the Rust and frontend tracks
  run in parallel after [T-009](#t-009)
- **Critical path** — [T-001](#t-001) → [T-002](#t-002) → [T-004](#t-004) → [T-006](#t-006) →
  [T-007](#t-007) → [T-008](#t-008) → [T-009](#t-009) → [T-016](#t-016) → [T-017](#t-017) →
  [T-021](#t-021)

### Agent assignment — deviation from the skill's table

The `solution-planner` agent table lists `software-engineer-backend` for server-side work, scoped
to Express/Fastify/NestJS under `src/{domain}/`. That does not describe this project: the core is
Rust under `src-tauri/`. All core tasks are therefore assigned to **`rust-backend-engineer`**,
which is installed in this repo. The split seam is unchanged in spirit — `src-tauri/` and `src/`
are never touched by the same task.

### Track structure

| Track | Tasks | Agent |
|---|---|---|
| Scaffold | T-001, T-002 | `react-vite-developer`, `rust-backend-engineer` |
| Fixtures | T-003 | `rust-backend-engineer` |
| Rust core | T-004 … T-012 | `rust-backend-engineer` |
| Frontend | T-013 … T-019 | `react-vite-developer` |
| Testing | T-020, T-021 | `software-tester-design`, `software-tester-automation` |

### Known blockers to raise early

- **T-003 needs real Postman exports.** [NFR-006](requirements.md#nfr-006) is the slice's central
  quality gate. Hand-authored fixtures test our *assumptions about* Postman's output; real exports
  test Postman's output. The task proceeds either way but says so explicitly.
- **T-021 must not use Playwright.** [ADR-012](design.md#key-decisions) overrides the
  `software-tester-automation` skill's default. The task description states it so the agent does
  not lose a day discovering it.

---

## Tasks

### T-001

```yaml
- title: Scaffold the Vite + React + TypeScript + Tailwind v4 + shadcn frontend
- description: >
  Create the frontend toolchain at the repo root — Vite, React, TypeScript (strict), Tailwind CSS
  v4 via @tailwindcss/vite, shadcn/ui initialised for Vite, ESLint, Prettier, Vitest with jsdom.
  Establish the feature-folder layout from design.md §Frontend Structure. No application logic
  beyond a placeholder App that renders and a passing smoke test. Tailwind v4 is CSS-first —
  there is no tailwind.config.js and no PostCSS chain. Record the resulting build/lint/test
  commands in CLAUDE.md, which currently states that none exist.
- agent: react-vite-developer
- depends_on: []
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] `npm run dev`, `npm run build`, `npm run lint`, `npm run test` all exit 0
- [ ] `tsc --noEmit` passes with `strict: true`
- [ ] No `tailwind.config.js` exists; `src/index.css` contains `@import 'tailwindcss'`
- [ ] `components.json` exists and `npx shadcn@latest add button` succeeds
- [ ] Path alias `@/` resolves in both Vite and `tsc`
- [ ] CLAUDE.md's "no build/lint/test commands" statement is replaced with the real commands

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-001
    scenario: the app shell renders without crashing
    given: a fresh Vitest + jsdom environment
    when: <App /> is rendered via React Testing Library
    then: the document contains the placeholder root element
    test_data:
      input: render(<App />)
      expected: screen.getByTestId('app-root') is in the document
  - id: TC-U-002
    scenario: the cn() utility merges conflicting Tailwind classes last-wins
    given: the shadcn cn() helper from lib/utils
    when: cn('p-2', 'p-4') is called
    then: only the later padding class survives
    test_data:
      input: cn('p-2', 'p-4')
      expected: "p-4"
```

**Notes** — Greenfield: this task creates `package.json`, which does not exist yet. Tailwind v4's
CSS-first config and v3's JS config do not compose; do not add a `tailwind.config.js` for any
reason.

---

### T-002

```yaml
- title: Add the Tauri v2 Rust shell, capability set, and CSP
- description: >
  Wrap the T-001 frontend in a Tauri v2 desktop app. Create the src-tauri Cargo crate, wire the
  dev server and build, and register tauri-plugin-dialog and tauri-plugin-store. Configure the
  capability set and CSP exactly as specified in design.md §Dependencies — this file IS the
  enforcement of NFR-007 and NFR-008, so it must grant core:default, dialog:allow-open and
  store:default and nothing else. No fs:, http: or shell: permission. Also set up CI running
  cargo fmt --check, cargo clippy -D warnings, cargo test, and the frontend checks.
- agent: rust-backend-engineer
- depends_on: [T-001]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] `cargo tauri dev` launches a window rendering the T-001 frontend
- [ ] `cargo tauri build` produces a bundle on the host platform
- [ ] `src-tauri/capabilities/default.json` contains no `fs:`, `http:` or `shell:` permission
- [ ] CSP in `tauri.conf.json` sets `default-src 'self'` with no remote origin in any directive
- [ ] `cargo clippy -- -D warnings` and `cargo fmt --check` pass
- [ ] CI runs Rust and frontend checks on Linux, macOS and Windows ([NFR-012](requirements.md#nfr-012))

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-003
    scenario: the capability manifest grants no filesystem, network, or shell permission
    given: src-tauri/capabilities/default.json parsed as JSON
    when: the permissions array is scanned for forbidden prefixes
    then: no entry starts with "fs:", "http:" or "shell:"
    test_data:
      input: permissions = ["core:default", "dialog:allow-open", "store:default"]
      expected: forbidden_matches == []
  - id: TC-U-004
    scenario: the CSP forbids remote origins
    given: the csp object from tauri.conf.json
    when: every directive value is scanned for "http://" or "https://" outside ipc.localhost
    then: no remote origin is present
    test_data:
      input: "default-src 'self'; connect-src ipc: http://ipc.localhost"
      expected: remote_origins == []
```

**Notes** — Both test cases are config assertions, deliberately: the capability file is security
surface, and a later task adding a permission "just to try something" should break a test rather
than ship. Keep them as plain Rust tests reading the JSON.

---

### T-003

```yaml
- title: Build the collection fixture corpus
- description: >
  Assemble the test corpus every later task depends on, at tests/fixtures/. Three groups.
  (1) Real exports — ask the owner for collections exported by at least three different Postman
  versions; if none are supplied, hand-author stand-ins and record in the fixture README that
  NFR-006 is only partially evidenced. (2) A polymorphism torture file exercising every shape in
  FR-010..FR-013 — url as string AND as object with and without raw, header as array AND as raw
  block, exec as string AND as array, description as string AND as object — plus every body mode,
  every auth type, nested folders 5+ deep, unknown fields at every level, and a folder/request
  with no name. (3) Rejection fixtures — malformed JSON, valid JSON that is not a collection, a
  v2.0 collection, a v1 collection, and an empty-item collection. Write a generator for a
  2000-leaf / ~5 MB collection for the performance work rather than committing the large file.
- agent: rust-backend-engineer
- depends_on: []
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] `tests/fixtures/real/` holds ≥ 3 collections, with a README naming each source version, or documenting that stand-ins were used and why
- [ ] `tests/fixtures/torture.json` exercises every polymorphic shape in [FR-010](requirements.md#fr-010)–[FR-013](requirements.md#fr-013), all 5 body modes, and every auth type in the schema
- [ ] `tests/fixtures/reject/` holds one file per [AppError](design.md#apperror-wire-shape) rejection variant
- [ ] A generator produces a deterministic 2,000-leaf collection; the large file is gitignored
- [ ] Every fixture that claims to be v2.1 validates against the published v2.1 JSON schema

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-005
    scenario: every v2.1 fixture actually declares the v2.1 schema
    given: each file in tests/fixtures/real and torture.json
    when: info.schema is read
    then: it ends with /v2.1.0/collection.json
    test_data:
      input: tests/fixtures/torture.json
      expected: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  - id: TC-U-006
    scenario: the torture fixture covers all five body modes
    given: torture.json walked for every request body
    when: the distinct set of body.mode values is collected
    then: it equals the full mode set
    test_data:
      input: torture.json
      expected: {"raw", "urlencoded", "formdata", "file", "graphql"}
  - id: TC-U-007
    scenario: the generated large fixture meets the performance-baseline shape
    given: the generator invoked with seed 0
    when: the output is parsed and its leaves counted
    then: it contains exactly 2000 request leaves and is between 4 and 6 MB
    test_data:
      input: generate(seed=0, leaves=2000)
      expected: leaf_count == 2000 and 4_000_000 < size_bytes < 6_000_000
```

**Notes** — **Owner input wanted.** Real exports materially strengthen
[NFR-006](requirements.md#nfr-006); hand-authored fixtures only encode what we already believe.
This task is deliberately dependency-free so it can start immediately, in parallel with T-001.

---

### T-004

```yaml
- title: Port the v2.1 wire model and polymorphic helpers to Rust
- description: >
  Create src-tauri/src/postman/model.rs and polymorphic.rs — serde structs mirroring the v2.1
  schema exactly, ported from .claude/docs/postman-collection.ts, which is the specification.
  Keep the Thai comments per CLAUDE.md. Implement StringOr<T> per ADR-003: untagged in shape, but
  with a hand-written Deserialize that reports which variant was attempted, because bare
  #[serde(untagged)] produces an unusable error message. Every struct carries
  #[serde(flatten)] extra: Map<String, Value> per ADR-004 so unknown fields survive. Item is a
  structurally discriminated union — a folder has item[], a leaf has request.
- agent: rust-backend-engineer
- depends_on: [T-002, T-003]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] Every fixture in `tests/fixtures/real/` and `torture.json` deserializes without error
- [ ] No struct uses `deny_unknown_fields`; unknown fields land in `extra`
- [ ] `Item` discriminates folder vs request structurally, not by a type tag ([FR-014](requirements.md#fr-014))
- [ ] Folder nesting to arbitrary depth parses ([FR-014](requirements.md#fr-014))
- [ ] A failed polymorphic field names the field and the attempted variants in its error

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-008
    scenario: url parses from the string form
    given: a request whose url is a bare string
    when: the request is deserialized
    then: url holds the String variant with the original text
    test_data:
      input: '{"url": "https://api.example.com/v1/users"}'
      expected: StringOr::Str("https://api.example.com/v1/users")
  - id: TC-U-009
    scenario: url parses from the object form
    given: a request whose url is a structured object
    when: the request is deserialized
    then: url holds the Structured variant with host and path populated
    test_data:
      input: '{"url": {"raw": "https://a.com/x", "host": ["a","com"], "path": ["x"]}}'
      expected: StringOr::Structured(Url { host: ["a","com"], path: ["x"], .. })
  - id: TC-U-010
    scenario: unknown fields are preserved rather than rejected
    given: a collection carrying a field no known Postman version emits
    when: it is deserialized
    then: parsing succeeds and the field is retrievable from extra
    test_data:
      input: '{"info": {...}, "item": [], "_futureField": {"a": 1}}'
      expected: extra["_futureField"] == {"a": 1}
  - id: TC-U-011
    scenario: a folder is discriminated from a request leaf
    given: one item with item[] and one item with request
    when: each is deserialized into Item
    then: the first is ItemGroup and the second is ItemRequest
    test_data:
      input: '[{"name":"F","item":[]}, {"name":"R","request":{"method":"GET"}}]'
      expected: [Item::Group(_), Item::Request(_)]
  - id: TC-U-012
    scenario: a polymorphic field that matches neither variant reports both attempts
    given: a request whose url is a number
    when: deserialization fails
    then: the error names the field and both attempted variants
    test_data:
      input: '{"url": 42}'
      expected: error message contains "url", "string" and "object"
```

**Notes** — This is the widest task in the plan and the one most likely to reveal that the TS
reference file is incomplete. Any shape found in a fixture but absent from
`postman-collection.ts` should be reported, not silently added — it means the reference needs
updating too.

---

### T-005

```yaml
- title: Implement the schema gate and the structured AppError type
- description: >
  Create schema_gate.rs and error.rs. The gate validates info.schema BEFORE the item tree is
  walked (FR-004) and, on rejection, detects which version the file actually is so the message can
  name it (FR-005). AppError is a thiserror enum implementing Serialize and specta::Type, tagged
  per design.md §AppError wire shape, with one variant per distinct failure the UI must
  distinguish — the UI copy in ux-design.md §S7 is written per variant, so a collapsed or
  stringly-typed error breaks that screen.
- agent: rust-backend-engineer
- depends_on: [T-004]
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] The gate runs before any `item[]` traversal and short-circuits on mismatch ([FR-004](requirements.md#fr-004))
- [ ] v1, v2.0 and v3/YAML collections are each rejected with the detected version named ([FR-005](requirements.md#fr-005))
- [ ] Invalid JSON yields `NotJson` carrying line and column ([FR-007](requirements.md#fr-007))
- [ ] Valid JSON missing `info` or `item` yields `NotACollection` naming the missing field ([FR-006](requirements.md#fr-006))
- [ ] Every `AppError` variant serializes to the `{kind, detail}` shape

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-013
    scenario: a v2.1 schema passes the gate
    given: info.schema is the canonical v2.1 URL
    when: schema_gate is called
    then: it returns Ok
    test_data:
      input: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
      expected: Ok(())
  - id: TC-U-014
    scenario: a v2.0 schema is rejected and names both versions
    given: info.schema is the v2.0 URL
    when: schema_gate is called
    then: UnsupportedSchema is returned with found and expected populated
    test_data:
      input: "https://schema.getpostman.com/json/collection/v2.0.0/collection.json"
      expected: UnsupportedSchema { found: "…v2.0.0…", expected: "…v2.1.0…" }
  - id: TC-U-015
    scenario: the gate rejects before traversing the tree
    given: a v2.0 collection whose item[] contains a structurally invalid node
    when: the file is loaded
    then: UnsupportedSchema is returned, not a deserialization error from the tree
    test_data:
      input: reject/v2.0-with-broken-item.json
      expected: AppError::UnsupportedSchema
  - id: TC-U-016
    scenario: a JSON syntax error carries its position
    given: a file with a trailing comma at line 418
    when: the file is loaded
    then: NotJson is returned with line 418
    test_data:
      input: reject/trailing-comma.json
      expected: NotJson { line: 418, column: 12, .. }
  - id: TC-U-017
    scenario: valid JSON without item is not a collection
    given: '{"info": {"name": "x", "schema": "…v2.1.0…"}}'
    when: the file is loaded
    then: NotACollection names the missing field
    test_data:
      input: '{"info": {"name":"x","schema":"…v2.1.0…"}}'
      expected: NotACollection { missing_field: "item" }
```

**Notes** — TC-U-015 is the one that actually proves [FR-004](requirements.md#fr-004). A gate that
merely runs first in source order but after `serde` has already parsed the whole tree does not
satisfy the requirement; the fixture is built to fail loudly if that happens.

---

### T-006

```yaml
- title: Implement the four normalizers
- description: >
  Create normalize.rs, porting the four normalizers that CLAUDE.md names as the real contract of
  postman-collection.ts. url_to_string must reassemble from protocol/host/port/path when raw is
  absent. headers must split a raw header block on the FIRST colon, so a value containing a colon
  survives. script_source joins exec lines. description unwraps the object form. These functions
  are the boundary between wire types and view DTOs; nothing downstream may read a polymorphic
  field directly.
- agent: rust-backend-engineer
- depends_on: [T-004]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] All four normalizers are total — every input shape returns a value, none panic
- [ ] `url_to_string` reassembles correctly when `raw` is absent ([FR-010](requirements.md#fr-010))
- [ ] `headers` splits on the first `:` only ([FR-011](requirements.md#fr-011))
- [ ] A raw header line with no `:` emits a `MalformedRawHeaderLine` warning rather than being dropped silently
- [ ] Behaviour matches `postman-collection.ts` for every fixture; any intentional divergence is documented in the module

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-018
    scenario: url_to_string prefers raw when present
    given: a structured url with raw set
    when: url_to_string is called
    then: raw is returned verbatim
    test_data:
      input: Url { raw: "https://a.com/x?y=1", host: ["a","com"], .. }
      expected: "https://a.com/x?y=1"
  - id: TC-U-019
    scenario: url_to_string reassembles when raw is absent
    given: a structured url with protocol, host, port and path but no raw
    when: url_to_string is called
    then: the parts are reassembled in order
    test_data:
      input: Url { protocol: "https", host: ["api","example","com"], port: "8443", path: ["v1","users"] }
      expected: "https://api.example.com:8443/v1/users"
  - id: TC-U-020
    scenario: url_to_string on an empty url object returns empty, not a panic
    given: a structured url with every field None
    when: url_to_string is called
    then: an empty string is returned
    test_data:
      input: Url { .. Default::default() }
      expected: ""
  - id: TC-U-021
    scenario: a raw header value containing a colon is preserved
    given: a raw header block whose value is a URL
    when: headers is called
    then: the split happens at the first colon only
    test_data:
      input: "Location: https://a.com/x"
      expected: [Header { key: "Location", value: "https://a.com/x" }]
  - id: TC-U-022
    scenario: a raw header line without a colon warns instead of vanishing
    given: a raw header block containing a bare token line
    when: headers is called
    then: the line is skipped and a MalformedRawHeaderLine warning is emitted
    test_data:
      input: "Accept: application/json\ngarbage-line"
      expected: headers.len() == 1 and warnings == [MalformedRawHeaderLine]
  - id: TC-U-023
    scenario: script_source joins the array form with newlines
    given: exec as an array of lines
    when: script_source is called
    then: the lines are joined with newline separators
    test_data:
      input: ["const a = 1;", "pm.test('x', ok);"]
      expected: "const a = 1;\npm.test('x', ok);"
  - id: TC-U-024
    scenario: description unwraps the object form
    given: a description object with content and type
    when: description is called
    then: content is returned
    test_data:
      input: Description { content: "Creates an invoice.", content_type: "text/markdown" }
      expected: "Creates an invoice."
```

**Notes** — TC-U-021 is the single highest-value test here: splitting a raw header block on every
colon instead of the first is the classic bug in this code, and it silently corrupts every
`Location`, `Referer` and timestamp header.

---

### T-007

```yaml
- title: Build the node index — arena, NodeId, folder paths, auth inheritance
- description: >
  Create index.rs. Flatten the recursive Item tree into an arena in document order (the Rust
  equivalent of walkRequests), assigning each node a positional dotted NodeId per ADR-006 and
  recording its ordered folder path (FR-015). Resolve effective auth by walking the ancestor chain
  — request, then nearest folder, then collection — recording which level it came from, because
  ux-design.md labels the source in the UI (FR-030). Build the variable reference index in the
  same pass: which {{names}} each request mentions, and the reverse count per collection variable
  that S4 displays.
- agent: rust-backend-engineer
- depends_on: [T-004, T-006]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] Document order is preserved at every level; nothing is re-sorted ([FR-018](requirements.md#fr-018))
- [ ] `NodeId` is positional and stable across a reload of an unchanged file ([FR-016](requirements.md#fr-016))
- [ ] Every leaf carries its ordered folder path ([FR-015](requirements.md#fr-015))
- [ ] Effective auth resolves request → folder → collection and records the source level ([FR-030](requirements.md#fr-030))
- [ ] `by_id` lookup is O(1) and covers every node in the arena
- [ ] Building the index for the 2,000-leaf fixture does not recurse unboundedly (deep nesting must not blow the stack)

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-025
    scenario: NodeIds follow document position depth-first
    given: a collection with two root folders, the second holding one request
    when: the index is built
    then: ids are assigned by position
    test_data:
      input: [Folder A [], Folder B [Request R]]
      expected: A -> "0", B -> "1", R -> "1.0"
  - id: TC-U-026
    scenario: folder path is ordered from the root
    given: a request nested three folders deep
    when: the index is built
    then: folder_path lists the ancestors outermost first, excluding the request
    test_data:
      input: Invoices > Drafts > Batch > "Create"
      expected: ["Invoices", "Drafts", "Batch"]
  - id: TC-U-027
    scenario: a request without auth inherits the collection's
    given: collection auth = bearer, folder auth = none, request auth = none
    when: effective auth is resolved
    then: bearer is returned with source Collection
    test_data:
      input: (collection: bearer, folder: None, request: None)
      expected: ResolvedAuth { auth_type: "bearer", source: Collection }
  - id: TC-U-028
    scenario: the nearest folder wins over the collection
    given: collection auth = bearer, enclosing folder auth = basic, request auth = none
    when: effective auth is resolved
    then: basic is returned with source Folder
    test_data:
      input: (collection: bearer, folder: basic, request: None)
      expected: ResolvedAuth { auth_type: "basic", source: Folder("…") }
  - id: TC-U-029
    scenario: the request's own auth wins over every ancestor
    given: collection auth = bearer, folder auth = basic, request auth = apikey
    when: effective auth is resolved
    then: apikey is returned with source Own
    test_data:
      input: (collection: bearer, folder: basic, request: apikey)
      expected: ResolvedAuth { auth_type: "apikey", source: Own }
  - id: TC-U-030
    scenario: NodeId is stable across a rebuild of the same input
    given: the same collection indexed twice
    when: the two id sets are compared
    then: they are identical
    test_data:
      input: index(torture.json) twice
      expected: ids_run_1 == ids_run_2
  - id: TC-U-031
    scenario: deeply nested folders do not overflow the stack
    given: a collection nested 512 folders deep
    when: the index is built
    then: it completes and reports depth 512
    test_data:
      input: generate_nested(depth=512)
      expected: max_depth == 512, no panic
```

**Notes** — TC-U-031 exists because a naive recursive walk is the obvious implementation and
[FR-014](requirements.md#fr-014) allows arbitrary depth. An explicit stack or a depth cap with a
`LoadWarning` both satisfy it; unbounded recursion does not, and a hostile fixture would turn
[FR-008](requirements.md#fr-008) into a crash.

---

### T-008

```yaml
- title: Define the view DTOs and generate TypeScript bindings
- description: >
  Create view.rs — the normalized DTOs from design.md §View DTOs, every one deriving Serialize and
  specta::Type. Map wire types to DTOs through the T-006 normalizers so no polymorphic shape
  crosses IPC. BodyView is a tagged union over all five modes so an unhandled mode is a frontend
  compile error, not a blank pane. Wire up tauri-specta to export src/bindings.ts, gated on
  debug_assertions, and commit the generated file so CI diffs catch drift (NFR-015).
- agent: rust-backend-engineer
- depends_on: [T-005, T-006, T-007]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] No DTO field has a union type; every polymorphic field is already normalized
- [ ] `BodyView` covers all five modes as a tagged union ([FR-026](requirements.md#fr-026))
- [ ] `AuthView.source` distinguishes Own / Folder / Collection / None
- [ ] Credential-bearing attributes are flagged `sensitive: true` ([FR-032](requirements.md#fr-032))
- [ ] `src/bindings.ts` is generated, committed, and CI fails if regenerating it produces a diff
- [ ] `tsc --noEmit` passes against the generated bindings

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-032
    scenario: a raw JSON body maps to BodyView::Raw with its declared language
    given: a request body with mode raw and options.raw.language = json
    when: the DTO is built
    then: BodyView::Raw carries language "json"
    test_data:
      input: Body { mode: "raw", raw: "{}", options: { raw: { language: "json" } } }
      expected: BodyView::Raw { language: "json", text: "{}" }
  - id: TC-U-033
    scenario: a raw body without a declared language defaults to text
    given: a request body with mode raw and no options
    when: the DTO is built
    then: language is "text"
    test_data:
      input: Body { mode: "raw", raw: "hello", options: None }
      expected: BodyView::Raw { language: "text", text: "hello" }
  - id: TC-U-034
    scenario: formdata distinguishes file fields from text fields
    given: a formdata body with one text and one file field
    when: the DTO is built
    then: each field carries the matching kind and the file field carries src
    test_data:
      input: [{key:"note",type:"text",value:"x"}, {key:"doc",type:"file",src:"./a.pdf"}]
      expected: [Text{value:"x"}, File{src:"./a.pdf"}]
  - id: TC-U-035
    scenario: credential-bearing auth attributes are flagged sensitive
    given: a bearer auth with a token attribute
    when: the DTO is built
    then: the token attribute has sensitive true and a non-credential attribute does not
    test_data:
      input: [{key:"token",value:"ey…"}, {key:"in",value:"header"}]
      expected: [sensitive: true, sensitive: false]
  - id: TC-U-036
    scenario: an unrecognized auth type passes through rather than failing
    given: an auth type not present in the schema enum
    when: the DTO is built
    then: the type is preserved verbatim and an UnknownAuthType warning is emitted
    test_data:
      input: Auth { auth_type: "hawk", .. }
      expected: AuthView { auth_type: "hawk" } and warnings contains UnknownAuthType
```

**Notes** — TC-U-036 is [FR-009](requirements.md#fr-009) and
[ux-design.md §S10](ux-design.md#s8--s9--s10--loading-empty-warnings) meeting: the collection
opens, the section renders raw, and the user is told which node was odd.

---

### T-009

```yaml
- title: Implement the collection Tauri commands and app state
- description: >
  Create commands/collection.rs and the AppState managed state from design.md §Components.
  Implement open_collection (size guard, read, parse, gate, normalize, index, store, push to
  recents), reload_collection, close_collection, get_node_detail and get_example. The file read
  happens here, in the core — per ADR-008 the webview holds no filesystem capability at all.
  get_node_detail must be an O(1) arena lookup with no re-parse and no file access.
- agent: rust-backend-engineer
- depends_on: [T-008]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] All five commands are registered through the `tauri-specta` builder and appear in `bindings.ts`
- [ ] A file above 64 MB is rejected with `FileTooLarge` before it is read into memory ([ADR-015](design.md#key-decisions))
- [ ] `get_node_detail` performs no file I/O and no re-parse
- [ ] `open_collection` on a second file fully replaces the first ([requirements.md Out of Scope](requirements.md#out-of-scope) — one at a time)
- [ ] `get_node_detail` with no collection open returns `NoCollectionOpen`, not a panic
- [ ] `reload_collection` re-reads from disk and preserves `NodeId`s for an unchanged file ([FR-045](requirements.md#fr-045))

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-037
    scenario: opening a valid collection returns an overview with correct counts
    given: a fixture with 12 requests in 3 folders
    when: open_collection is called
    then: the overview reports those counts and a populated tree
    test_data:
      input: fixtures/real/small.json
      expected: CollectionOverview { request_count: 12, folder_count: 3, .. }
  - id: TC-U-038
    scenario: an oversized file is rejected without being loaded
    given: a path whose file length exceeds 64 MB
    when: open_collection is called
    then: FileTooLarge is returned and no full read occurs
    test_data:
      input: a 100 MB file
      expected: FileTooLarge { size_bytes: 104857600, limit_bytes: 67108864 }
  - id: TC-U-039
    scenario: node detail for an unknown id is an error, not a panic
    given: a loaded collection
    when: get_node_detail("99.99") is called
    then: UnknownNode is returned
    test_data:
      input: "99.99"
      expected: AppError::UnknownNode { node_id: "99.99" }
  - id: TC-U-040
    scenario: commands fail cleanly with no collection open
    given: AppState holding None
    when: get_node_detail("0") is called
    then: NoCollectionOpen is returned
    test_data:
      input: state = None
      expected: AppError::NoCollectionOpen
  - id: TC-U-041
    scenario: reload preserves node identity for an unchanged file
    given: a collection opened, then reloaded without the file changing
    when: the tree ids are compared
    then: they are identical
    test_data:
      input: open then reload fixtures/real/small.json
      expected: ids_before == ids_after
  - id: TC-U-042
    scenario: opening a second collection replaces the first
    given: collection A open
    when: open_collection(B) then get_node_detail on an A-only id
    then: UnknownNode is returned
    test_data:
      input: open(A); open(B); get_node_detail(a_only_id)
      expected: AppError::UnknownNode
```

**Notes** — TC-U-038 must assert the guard uses file *metadata*, not a read-then-check. Reading
100 MB to discover it is too large defeats the purpose of the guard.

---

### T-010

```yaml
- title: Implement recents and preferences persistence
- description: >
  Create commands/session.rs on tauri-plugin-store, holding the recents list (MRU, capped at 20)
  and preferences (theme). Both live in the app config directory — outside the collection file, per
  the no-app-private-fields constraint. A recents entry whose file has vanished must be reportable
  and removable rather than silently retried (FR-042).
- agent: rust-backend-engineer
- depends_on: [T-002, T-008]
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] Recents persist across an application restart ([FR-041](requirements.md#fr-041)), holding ≥ 10 entries
- [ ] Re-opening a collection already in recents moves it to the front without duplicating it
- [ ] `forget_recent` removes exactly one entry
- [ ] Theme preference persists across restart ([FR-043](requirements.md#fr-043))
- [ ] Nothing minim-specific is ever written into the collection file ([FR-017](requirements.md#fr-017))

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-043
    scenario: opening a collection pushes it to the front of recents
    given: recents [B, A]
    when: A is opened
    then: recents becomes [A, B] with no duplicate
    test_data:
      input: recents=[B, A]; open(A)
      expected: [A, B]
  - id: TC-U-044
    scenario: recents is capped
    given: 20 entries already stored
    when: a 21st collection is opened
    then: the list holds 20 entries and the oldest is gone
    test_data:
      input: 20 entries + open(new)
      expected: len == 20, oldest absent, new first
  - id: TC-U-045
    scenario: forget_recent removes only the named entry
    given: recents [A, B, C]
    when: forget_recent(B) is called
    then: recents becomes [A, C]
    test_data:
      input: forget_recent("/path/B.json")
      expected: [A, C]
  - id: TC-U-046
    scenario: theme preference round-trips
    given: a fresh store
    when: set_preferences(theme=dark) then get_preferences
    then: dark is returned
    test_data:
      input: { theme: "dark" }
      expected: { theme: "dark" }
```

**Notes** — Default theme is `system`, not `light` ([FR-043](requirements.md#fr-043)).

---

### T-011

```yaml
- title: Harden the parse path — fuzzing and the never-panic guarantee
- description: >
  Stand up a cargo-fuzz target (or a proptest+arbitrary harness) over the full load path: read →
  JSON → gate → normalize → index. Run a corpus of at least 1000 mutated and truncated collection
  files. Every input must produce either a parsed model or a typed AppError — never a panic, never
  a hang, never unbounded memory. Fix whatever it finds; this task is not done when the harness
  runs, it is done when the corpus is clean.
- agent: rust-backend-engineer
- depends_on: [T-009]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] A fuzz/property harness covers the whole load path, not just `serde_json`
- [ ] ≥ 1,000 mutants produce zero panics and zero hangs ([NFR-005](requirements.md#nfr-005))
- [ ] Every mutant yields `Ok(model)` or a typed `AppError` — no `unwrap`/`expect`/`panic!` remains reachable in the path
- [ ] A per-input time bound is enforced so a pathological file cannot hang the app ([FR-008](requirements.md#fr-008))
- [ ] The corpus and any crash artifacts are committed for regression

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-047
    scenario: a truncated collection errors rather than panicking
    given: a valid collection cut at a random byte offset
    when: the load path runs
    then: NotJson is returned
    test_data:
      input: torture.json[0..len/2]
      expected: Err(AppError::NotJson { .. })
  - id: TC-U-048
    scenario: deeply nested JSON does not overflow the stack
    given: an input with 10000 levels of nested arrays
    when: the load path runs
    then: an error is returned and the process survives
    test_data:
      input: "[[[[…10000…]]]]"
      expected: Err(_), no abort
  - id: TC-U-049
    scenario: invalid UTF-8 is handled as an error
    given: a file containing an invalid byte sequence
    when: the load path runs
    then: FileUnreadable or NotJson is returned
    test_data:
      input: b"{\"info\": \"\xff\xfe\"}"
      expected: Err(_)
  - id: TC-U-050
    scenario: the fuzz corpus is clean
    given: the committed corpus of >= 1000 mutants
    when: the harness runs over all of them
    then: zero panics and zero timeouts are recorded
    test_data:
      input: fuzz/corpus/*
      expected: panics == 0 and timeouts == 0
```

**Notes** — [FR-008](requirements.md#fr-008) ("SHALL NOT panic, for any input file") is
unverifiable by example-based tests alone. This task is what makes that requirement real.

---

### T-012

```yaml
- title: Add the performance benchmark harness
- description: >
  Add Criterion benchmarks over the generated 2000-leaf / ~5 MB fixture from T-003, measuring
  parse-to-indexed-model and the get_node_detail lookup. Record a resident-memory measurement with
  the collection loaded. These are the machine-checkable halves of NFR-001, NFR-002 and NFR-004;
  the render-side halves belong to the frontend tasks.
- agent: rust-backend-engineer
- depends_on: [T-009]
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] Parse + index of the 2,000-leaf fixture completes well inside the 1.5 s p95 budget, leaving render headroom ([NFR-001](requirements.md#nfr-001))
- [ ] `get_node_detail` p95 is under 5 ms, leaving the rest of the 100 ms budget to render ([NFR-002](requirements.md#nfr-002))
- [ ] Resident memory with the fixture loaded is under 400 MB ([NFR-004](requirements.md#nfr-004))
- [ ] Benchmarks run in CI and fail the build on a regression beyond an agreed threshold

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-051
    scenario: parse and index of the baseline fixture stays within budget
    given: the generated 2000-leaf fixture
    when: the load path is benchmarked
    then: p95 is below the agreed core-side budget
    test_data:
      input: generated-2000.json
      expected: p95_ms < 800
  - id: TC-U-052
    scenario: node detail lookup is effectively constant time
    given: a loaded 2000-leaf collection
    when: get_node_detail is benchmarked across shallow and deep ids
    then: p95 is under 5 ms and does not scale with depth
    test_data:
      input: ids ["0", "12.4.7.2.1"]
      expected: p95_ms < 5 for both
  - id: TC-U-053
    scenario: memory stays within budget with a collection loaded
    given: the baseline fixture loaded
    when: resident memory is sampled
    then: it is below 400 MB
    test_data:
      input: generated-2000.json
      expected: rss_mb < 400
```

**Notes** — The 800 ms core-side figure is a working split of the 1.5 s end-to-end budget in
[NFR-001](requirements.md#nfr-001); confirm it against real numbers once T-015 renders, and adjust
both halves together rather than silently moving the total.

---

### T-013

```yaml
- title: Build the app shell, theme tokens, and theme provider
- description: >
  Implement the two-pane shell from ux-design.md §S2 — ResizablePanelGroup, topbar, status bar,
  persisted pane width. Define the theme per ux-design.md §Design tokens using shadcn's CURRENT
  Tailwind v4 convention: @theme inline mapping --color-* onto raw vars, with .dark overriding the
  raw layer. Note this differs from .claude/skills/react-vite-developer/references/ui-system.md,
  which documents a plain @theme block — shadcn's convention wins here because the components
  depend on it, and mixing the two silently breaks token resolution. Add the method-color and
  token-var groups. Bundle Inter and JetBrains Mono locally; the CSP forbids remote font origins.
- agent: react-vite-developer
- depends_on: [T-001]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] Shell matches [ux-design.md §S2](ux-design.md#s2--viewer-primary-state) layout; panes resize between 16% and 40% and the width persists
- [ ] Light and dark both render correctly; `.dark` overrides the raw token layer
- [ ] Method colors are defined for GET/POST/PUT/PATCH/DELETE plus an `other` fallback
- [ ] An automated contrast check asserts **WCAG AA** for every method chip, var chip and warning color against its background in **both** themes ([NFR-011](requirements.md#nfr-011))
- [ ] Fonts load from local files; no network request is made on launch ([NFR-014](requirements.md#nfr-014))
- [ ] Both animations are disabled under `prefers-reduced-motion: reduce`

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-054
    scenario: every method token meets AA contrast in both themes
    given: the resolved token values for light and dark
    when: contrast against --background is computed for each method color
    then: every ratio is at least 4.5
    test_data:
      input: [method-get, method-post, method-put, method-patch, method-delete, method-other]
      expected: all ratios >= 4.5 in both themes
  - id: TC-U-055
    scenario: an unknown HTTP verb falls back to the neutral token
    given: a request with method PROPFIND
    when: the method chip resolves its color token
    then: method-other is used
    test_data:
      input: "PROPFIND"
      expected: "text-method-other"
  - id: TC-U-056
    scenario: theme defaults to the system preference
    given: no stored preference and a system preference of dark
    when: the provider initialises
    then: the dark class is applied
    test_data:
      input: prefs = null, matchMedia('(prefers-color-scheme: dark)') = true
      expected: documentElement.classList contains "dark"
  - id: TC-U-057
    scenario: a manual override beats the system preference
    given: stored theme light and a system preference of dark
    when: the provider initialises
    then: the dark class is not applied
    test_data:
      input: prefs = { theme: "light" }, system = dark
      expected: documentElement.classList does not contain "dark"
```

**Notes** — TC-U-054 is the promise ux-design.md deliberately did **not** make by hand. The token
lightness values were chosen to clear AA but were never measured; this test is where that claim
becomes true or gets corrected.

---

### T-014

```yaml
- title: Build the empty shell — open, drag-and-drop, and recents
- description: >
  Implement ux-design.md §S1. Open via the native dialog (plugin-dialog returns a path, which is
  handed to open_collection — the webview never touches the filesystem). The whole window is the
  drop target, not a bordered zone. A multi-file or folder drop is rejected before any read. The
  recents list shows name, request count and a middle-truncated path, with a forget control that
  is reachable by keyboard, not hover-only.
- agent: react-vite-developer
- depends_on: [T-010, T-013]
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] Open button invokes the native dialog filtered to `.json` ([FR-001](requirements.md#fr-001))
- [ ] Dropping one `.json` anywhere on the window opens it ([FR-002](requirements.md#fr-002))
- [ ] Dropping multiple files or a folder shows an inline rejection and reads nothing
- [ ] Recents rows show name, count and path; path is hidden below 1000 px, name and count never are
- [ ] The forget control appears on hover **and** on keyboard focus
- [ ] A recents entry whose file is gone reports it and offers removal ([FR-042](requirements.md#fr-042))

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-058
    scenario: a single json drop triggers open
    given: the empty shell rendered
    when: a drop event carrying one .json file fires
    then: open_collection is called once with that path
    test_data:
      input: dataTransfer.files = ["/a/b.json"]
      expected: openCollection called with "/a/b.json"
  - id: TC-U-059
    scenario: a multi-file drop is rejected without reading
    given: the empty shell rendered
    when: a drop event carrying two files fires
    then: no command is invoked and a rejection message is shown
    test_data:
      input: dataTransfer.files = ["/a.json", "/b.json"]
      expected: openCollection not called; message visible
  - id: TC-U-060
    scenario: a missing recent file offers removal
    given: a recents row whose open returns FileNotFound
    when: the row is activated
    then: the message names the file and a remove action is offered
    test_data:
      input: AppError::FileNotFound { path: "/gone.json" }
      expected: "no longer exists" visible and forget_recent offered
  - id: TC-U-061
    scenario: the forget control is keyboard reachable
    given: a recents row focused via keyboard
    when: the focus state is inspected
    then: the forget control is visible and focusable
    test_data:
      input: userEvent.tab() to the row
      expected: forget button is visible and in the tab order
```

**Notes** — TC-U-061 guards a specific accessibility regression: `opacity-0 group-hover:opacity-100`
without the `focus-visible:` counterpart hides the control from keyboard users entirely.

---

### T-015

```yaml
- title: Build the virtualized collection tree
- description: >
  Implement the tree from ux-design.md §S2 and §S6 over @tanstack/react-virtual, on a flattened
  visible-node list. Full WAI-ARIA tree semantics and keyboard pattern. Indentation via padding
  computed from depth, never nested DOM, so virtualization stays flat. Filtering is client-side
  over the already-loaded summary per ADR-009, retains ancestors for context rendered dimmed, and
  restores the pre-filter expansion state when cleared.
- agent: react-vite-developer
- depends_on: [T-009, T-013]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] Document order is preserved; nothing is re-sorted ([FR-018](requirements.md#fr-018))
- [ ] Rows carry `role="treeitem"` with `aria-level`, `aria-setsize`, `aria-posinset`, `aria-selected`, and `aria-expanded` on folders ([NFR-011](requirements.md#nfr-011))
- [ ] Keyboard: `↑ ↓ ← → Home End Enter Space` plus typeahead; the tree is one tab stop
- [ ] Filter matches name, normalized URL and method, case-insensitively ([FR-021](requirements.md#fr-021))
- [ ] Ancestors of matches are shown dimmed and are visibly not themselves matches
- [ ] Expand-all / collapse-all work ([FR-020](requirements.md#fr-020))
- [ ] Filtering the 2,000-leaf fixture updates within 150 ms p95 ([NFR-002](requirements.md#nfr-002))

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-062
    scenario: the filter matches against method and URL, not just name
    given: a request named "Login" at {{baseUrl}}/auth/token with method POST
    when: the filter is set to "token"
    then: the request matches
    test_data:
      input: filter = "token"
      expected: node is present in the filtered result
  - id: TC-U-063
    scenario: ancestors are retained but marked as non-matching
    given: a matching request nested two folders deep
    when: the filter is applied
    then: both ancestors appear flagged as context, not as matches
    test_data:
      input: filter = "invoice"
      expected: [Folder(isMatch=false), Folder(isMatch=false), Request(isMatch=true)]
  - id: TC-U-064
    scenario: clearing the filter restores the prior expansion state
    given: only folder A expanded, then a filter applied which expands everything
    when: the filter is cleared
    then: only folder A is expanded again
    test_data:
      input: expanded=[A]; filter("x"); clear()
      expected: expanded == [A]
  - id: TC-U-065
    scenario: aria positional attributes are correct under virtualization
    given: a folder with 3 children, only the last rendered in the virtual window
    when: that row is inspected
    then: aria-posinset is 3 and aria-setsize is 3
    test_data:
      input: third child of a 3-child folder
      expected: aria-posinset="3" aria-setsize="3"
  - id: TC-U-066
    scenario: right arrow expands a collapsed folder then descends
    given: a collapsed folder focused
    when: ArrowRight is pressed twice
    then: the folder expands, then focus moves to its first child
    test_data:
      input: focus(folder); ArrowRight; ArrowRight
      expected: folder expanded, focus on first child
  - id: TC-U-067
    scenario: an empty collection shows a named empty state
    given: a valid collection with zero items
    when: the tree renders
    then: the collection name appears in the empty state
    test_data:
      input: { name: "Billing API", item: [] }
      expected: text containing "Billing API" and "no requests"
```

**Notes** — TC-U-065 is the one that catches the classic virtualization accessibility bug: the DOM
holds only the visible window, so assistive tech cannot infer position and the attributes must be
computed from the full list.

---

### T-016

```yaml
- title: Build the request detail header and tab shell
- description: >
  Implement the detail pane from ux-design.md §S2 — sticky header with breadcrumb, method chip,
  normalized URL and description, over a Tabs shell whose triggers carry count badges. The badge
  row is the request's fingerprint: a count for countable sections, the mode string for Body,
  inherited/none markers for Auth. The pane opens on the first NON-EMPTY tab. Every empty section
  renders an explicit "(none)", never a hidden heading. Implement params and headers tables and the
  {{variable}} token chip here; body/auth/scripts renderers are T-017.
- agent: react-vite-developer
- depends_on: [T-009, T-013]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] Header shows breadcrumb, name, method, normalized URL and description ([FR-023](requirements.md#fr-023))
- [ ] Tab badges show counts / mode / inherited markers per [ux-design.md §S2](ux-design.md#s2--viewer-primary-state)
- [ ] The first non-empty tab is selected on load
- [ ] Query params and path variables render with `disabled` state and description ([FR-024](requirements.md#fr-024))
- [ ] Headers render as key/value rows marking disabled entries ([FR-025](requirements.md#fr-025))
- [ ] Empty sections render a literal "(none)" ([FR-036](requirements.md#fr-036))
- [ ] `{{var}}` renders as a chip, distinguishing defined from undefined ([FR-035](requirements.md#fr-035))
- [ ] Collection strings render as text nodes only — no `dangerouslySetInnerHTML` ([NFR-010](requirements.md#nfr-010))
- [ ] Selecting a request renders detail within 100 ms p95 ([NFR-002](requirements.md#nfr-002))

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-068
    scenario: the pane opens on the first non-empty tab
    given: a request with no params but three headers
    when: the detail renders
    then: the Headers tab is selected
    test_data:
      input: { query: [], headers: [h1, h2, h3] }
      expected: Headers tab has aria-selected="true"
  - id: TC-U-069
    scenario: an empty section states its absence
    given: a request with no headers
    when: the Headers tab is opened
    then: the badge reads 0 and the panel shows "(none)"
    test_data:
      input: { headers: [] }
      expected: badge "0" and text "(none)"
  - id: TC-U-070
    scenario: a disabled param is marked, not hidden
    given: a query param with disabled true
    when: the params table renders
    then: the row is present and marked disabled
    test_data:
      input: { key: "dryRun", value: "true", disabled: true }
      expected: row visible with a disabled marker
  - id: TC-U-071
    scenario: an undefined variable chip is distinguished
    given: a URL referencing {{ghost}} with no such collection variable
    when: the URL renders
    then: the chip is marked undefined
    test_data:
      input: url "{{ghost}}/x", variables: []
      expected: chip with data-defined="false"
  - id: TC-U-072
    scenario: collection content is never rendered as markup
    given: a request name containing an HTML tag
    when: the header renders
    then: the tag appears as literal text and creates no element
    test_data:
      input: name = "<img src=x onerror=alert(1)>"
      expected: textContent matches the input; no img element exists
```

**Notes** — TC-U-072 is [NFR-010](requirements.md#nfr-010) and the only injection vector this
slice has: collection files come from strangers.

---

### T-017

```yaml
- title: Build the body, auth, and script renderers
- description: >
  Implement the panels in ux-design.md §S2b. Body covers all five modes off the BodyView tagged
  union — an unhandled mode must be a compile error. Raw bodies are highlighted by the declared
  language via Shiki with a fine-grained, lazily loaded bundle (js, json, xml, html, graphql,
  text). Auth shows the resolved type with an "inherited from" chip naming the level, and masks
  credential-bearing values behind a per-value reveal that re-masks when the selected node
  changes. Scripts render read-only with the permanent notice that minim never runs them.
- agent: react-vite-developer
- depends_on: [T-016]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] All five body modes render ([FR-026](requirements.md#fr-026)); adding a mode to the union without a branch fails `tsc`
- [ ] Raw bodies highlight by declared language, defaulting to plain text ([FR-027](requirements.md#fr-027))
- [ ] GraphQL shows query and variables separately ([FR-028](requirements.md#fr-028))
- [ ] Formdata distinguishes text from file fields and shows the file path ([FR-029](requirements.md#fr-029))
- [ ] Auth labels the inheritance source ([FR-030](requirements.md#fr-030)); unknown types fall back to a raw attribute list ([FR-031](requirements.md#fr-031))
- [ ] Sensitive values are masked by default and re-mask on node change ([FR-032](requirements.md#fr-032))
- [ ] Scripts render read-only and are never evaluated ([NFR-009](requirements.md#nfr-009)); the notice is always present
- [ ] Only the six needed Shiki grammars are bundled; startup stays within [NFR-003](requirements.md#nfr-003)

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-073
    scenario: each body mode renders its own shape
    given: one request per body mode
    when: the Body tab renders
    then: the matching renderer is used for each
    test_data:
      input: [raw, urlencoded, formdata, file, graphql]
      expected: [RawView, UrlencodedView, FormdataView, FileView, GraphqlView]
  - id: TC-U-074
    scenario: a raw body with no declared language falls back to text
    given: BodyView::Raw with language "text"
    when: the renderer picks a grammar
    then: the plain-text grammar is used and no fetch is attempted
    test_data:
      input: { language: "text", text: "hello" }
      expected: grammar == "text"
  - id: TC-U-075
    scenario: inherited auth names its source level
    given: AuthView with source Collection
    when: the Auth tab renders
    then: an "inherited from collection" chip is shown
    test_data:
      input: { source: "Collection", auth_type: "bearer" }
      expected: text matching /inherited from collection/i
  - id: TC-U-076
    scenario: a sensitive value is masked until revealed
    given: an auth attribute flagged sensitive
    when: the Auth tab renders
    then: the raw value is absent from the DOM text until reveal is activated
    test_data:
      input: { key: "token", value: "ey.secret", sensitive: true }
      expected: "ey.secret" absent; present after clicking reveal
  - id: TC-U-077
    scenario: revealing resets when a different request is selected
    given: a revealed token on request A
    when: request B is selected and then A again
    then: the value is masked again
    test_data:
      input: select(A); reveal(); select(B); select(A)
      expected: value masked
  - id: TC-U-078
    scenario: scripts are displayed, never executed
    given: a test script containing a side effect
    when: the Scripts tab renders
    then: the source appears as text and the side effect never occurs
    test_data:
      input: "window.__pwned = true"
      expected: text visible and window.__pwned is undefined
```

**Notes** — TC-U-078 is a direct test of [NFR-009](requirements.md#nfr-009). It should be
impossible to pass accidentally, so assert the global is untouched rather than just that text
rendered.

---

### T-018

```yaml
- title: Build the examples panel and the folder and collection detail views
- description: >
  Implement ux-design.md §S2b Examples, §S4, and the folder view. Examples list saved responses and
  load a selected one on demand via get_example — bodies can be large and are rarely all viewed.
  The collection view shows info metadata, variables with the USED reference count, collection auth
  and collection scripts. The folder view shows folder scripts, auth and variables.
- agent: react-vite-developer
- depends_on: [T-016]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] Examples list status, code and name; selecting one shows headers, cookies and body ([FR-037](requirements.md#fr-037))
- [ ] Example bodies load on demand, not with the request detail
- [ ] Collection variables show key, value, type and disabled state ([FR-038](requirements.md#fr-038))
- [ ] Collection and folder scripts are reachable from their tree nodes ([FR-039](requirements.md#fr-039))
- [ ] Collection info shows name, description, schema and version ([FR-040](requirements.md#fr-040))
- [ ] `protocolProfileBehavior` renders when present ([FR-034](requirements.md#fr-034))
- [ ] The USED count matches the number of requests referencing each variable

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-079
    scenario: example bodies are not fetched until selected
    given: a request with two examples
    when: the Examples tab opens
    then: get_example has not been called
    test_data:
      input: examples = [e0, e1]
      expected: getExample call count == 0
  - id: TC-U-080
    scenario: selecting an example loads and renders it
    given: the Examples tab open
    when: the second example is selected
    then: get_example is called with index 1 and its body renders
    test_data:
      input: click(example[1])
      expected: getExample(node_id, 1) called; body text visible
  - id: TC-U-081
    scenario: the USED count reflects real references
    given: baseUrl referenced by 3 requests and legacyId by none
    when: the collection variables table renders
    then: the counts are 3 and 0
    test_data:
      input: variables = [baseUrl, legacyId]
      expected: [3, 0]
  - id: TC-U-082
    scenario: a request with no examples states it
    given: a request whose response array is empty
    when: the Examples tab renders
    then: the badge reads 0 and "(none)" is shown
    test_data:
      input: examples = []
      expected: badge "0" and text "(none)"
```

**Notes** — The USED column is the small scope addition raised in
[ux-design.md §Open questions](ux-design.md#open-questions-for-the-owner). If the owner cut it,
drop TC-U-081 and that acceptance criterion; nothing else in the plan depends on it.

---

### T-019

```yaml
- title: Build the failure, loading, empty, and warning states
- description: >
  Implement ux-design.md §S7, §S8, §S9 and §S10. Each AppError variant gets its own copy — the
  v2.0 case must name the fix ("In Postman: Export → Collection v2.1"), and NotJson must show the
  reported line and column. Loading shows skeleton rows immediately with Cancel appearing only
  after 400 ms. The empty-collection state names the collection so a successful parse is
  distinguishable from a bug. The warnings banner is dismissible, with the count remaining in the
  status bar.
- agent: react-vite-developer
- depends_on: [T-009, T-013]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] Every `AppError` variant maps to distinct copy; an unmapped variant fails `tsc`
- [ ] The v2.0 message names the detected version and the export fix ([FR-005](requirements.md#fr-005))
- [ ] `NotJson` displays line and column ([FR-007](requirements.md#fr-007))
- [ ] `NotACollection` is worded differently from `NotJson` ([FR-006](requirements.md#fr-006))
- [ ] Skeleton appears immediately; Cancel only after 400 ms
- [ ] The empty state names the collection ([FR-022](requirements.md#fr-022))
- [ ] Warnings list node path and reason; dismissing keeps the status-bar count ([FR-009](requirements.md#fr-009))
- [ ] The error dialog carries `role="alert"`, traps focus, and restores focus on close

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-083
    scenario: the v2.0 rejection names the version and the fix
    given: UnsupportedSchema with a v2.0 found value
    when: the dialog renders
    then: it shows both versions and the export instruction
    test_data:
      input: { kind: "unsupportedSchema", detail: { found: "…v2.0.0…" } }
      expected: text contains "v2.0", "v2.1" and "Export"
  - id: TC-U-084
    scenario: a JSON syntax error shows its position
    given: NotJson with line 418 column 12
    when: the dialog renders
    then: both numbers are visible
    test_data:
      input: { kind: "notJson", detail: { line: 418, column: 12 } }
      expected: text contains "418" and "12"
  - id: TC-U-085
    scenario: not-a-collection reads differently from bad JSON
    given: NotACollection with missing field item
    when: the dialog renders
    then: it says the JSON is valid but not a collection, and names the field
    test_data:
      input: { kind: "notACollection", detail: { missing_field: "item" } }
      expected: text contains "not a Postman collection" and "item"
  - id: TC-U-086
    scenario: Cancel is withheld for the first 400ms
    given: a load in progress
    when: the state is inspected at 200 ms and at 600 ms
    then: Cancel is absent then present
    test_data:
      input: advanceTimers(200) then advanceTimers(400)
      expected: [absent, present]
  - id: TC-U-087
    scenario: the empty state names the collection
    given: a valid collection with no items
    when: the state renders
    then: the collection name appears
    test_data:
      input: { name: "Billing API", item: [] }
      expected: text contains "Billing API"
  - id: TC-U-088
    scenario: dismissing the warnings banner keeps the status bar count
    given: a collection opened with 2 warnings
    when: the banner is dismissed
    then: the banner is gone and the status bar still reports 2
    test_data:
      input: warnings.length == 2; dismiss()
      expected: banner absent; status bar shows "2"
```

**Notes** — Mapping errors exhaustively over the generated union type is what makes the first
acceptance criterion enforceable at compile time rather than by review.

---

### T-020

```yaml
- title: Design test cases — Collection Viewer
- description: >
  Using the software-tester-design skill, produce structured TC-xxx test cases covering all test
  levels: unit boundaries, Tauri command contract tests (happy path, every AppError path, state
  preconditions), frontend component tests, and E2E flows. Run Steps 0–4 (SUT definition →
  business flow → field specs → scenarios → test data). Note this SUT has no HTTP API — the
  command surface in design.md §API Contracts is the API layer, so "API tests" here means
  command-contract tests. Output must be in TC-xxx format for software-tester-automation.
- agent: software-tester-design
- depends_on: []
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] SUT definition documented
- [ ] TC-xxx cases cover happy path, boundaries, error paths, and business rules
- [ ] Each TC includes Level, Input, Expected Output, Preconditions, and Mock needed
- [ ] Every `AppError` variant has at least one case
- [ ] Every polymorphic shape in [FR-010](requirements.md#fr-010)–[FR-013](requirements.md#fr-013) has at least one case
- [ ] TC ids do not collide with the TC-U-001…TC-U-088 allocated in this plan

**Notes** — Runs in parallel with engineering; depends only on requirements/design, not on code.
The `software-tester-design` skill assumes an HTTP API — map its "API" level onto the Tauri
command surface rather than inventing endpoints.

---

### T-021

```yaml
- title: Automate tests — Collection Viewer
- description: >
  Using the software-tester-automation skill, convert the TC-xxx cases from T-020 into runnable
  scripts at the appropriate levels and run the full suite against the implementation.
  IMPORTANT — ADR-012 overrides this skill's default E2E tool: Playwright CANNOT attach to a Tauri
  webview (WKWebView / WebView2). Use tauri-driver with WebdriverIO. Rust levels use cargo test
  with insta snapshots; frontend levels use Vitest and React Testing Library. If tauri-driver
  proves unworkable on macOS, raise it as a blocker rather than silently dropping platform
  coverage — that is an owner decision, recorded as a risk in design.md §Open Risks.
- agent: software-tester-automation
- depends_on: [T-001, T-002, T-003, T-004, T-005, T-006, T-007, T-008, T-009, T-010, T-011, T-012, T-013, T-014, T-015, T-016, T-017, T-018, T-019, T-020]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] All TC-* from T-020 automated and passing
- [ ] Rust parse/normalize coverage ≥ 90%; frontend state and normalizer-consuming components ≥ 80% ([NFR-016](requirements.md#nfr-016))
- [ ] E2E runs on `tauri-driver` + WebdriverIO, not Playwright ([ADR-012](design.md#key-decisions))
- [ ] E2E covers open → tree → select → detail, plus every rejection path and recents across restart
- [ ] The fidelity suite opens every fixture in `tests/fixtures/real/` with no field silently lost ([NFR-006](requirements.md#nfr-006))
- [ ] Test report produced with pass/fail per TC-id

**Notes** — Report "T-021 done" with the full test report when all TCs pass. The
[NFR-006](requirements.md#nfr-006) fidelity check is the slice's real acceptance gate: compare the
parsed model against the raw `serde_json::Value` and assert nothing was dropped.

---

## Status Legend

| Status | Changed By | Meaning |
|--------|-----------|---------|
| `backlog` | Orchestrator | Ready, waiting to be picked up |
| `doing` | Orchestrator / Agent | Agent actively working |
| `blocked` | Agent | Stuck, needs human intervention |
| `test` | Agent | Dev done, needs testing |
| `review` | Agent / Tester | Human must review before advancing |
| `done` | Human | Approved and complete |
