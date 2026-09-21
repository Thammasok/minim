---
version: 1.0
status: draft
date: 2026-09-21
---

# Requirements: Collection Viewer

The first vertical slice of **minim**: open a Postman Collection Format **v2.1** JSON file from
disk and render it — the folder/request tree plus a full request detail view — in a Tauri desktop
app. Read-only. No request execution, no Newman, no editing.

This slice exists to prove the load-bearing seam of the product: **Rust owns the v2.1 domain model,
the React webview only renders it.** Every later slice (send, run, edit, author) depends on that
seam being right, so the acceptance bar here is *parsing fidelity*, not feature count.

## Actors

#### Actor: API Developer

Primary user. Works on an API day to day, has collections exported from Postman (their own or a
teammate's), and wants to read what a request actually does without opening Postman.

#### Actor: QA Engineer

Secondary user. Receives collections authored by someone else, often exported from a different
Postman version, and needs to inspect headers, auth, body and test scripts before trusting a run.

#### Actor: Postman Export

*External system.* The source of input files. Not controlled by minim: its output varies by
Postman version, which is why the reader must tolerate every legal shape of the schema rather
than one canonical shape.

## Use Cases

#### UC-001

**Open a collection file** — The API Developer picks a `.json`
file through the native file dialog; minim validates it is v2.1, parses it, and shows the tree.

#### UC-002

**Browse the collection tree** — The user expands and collapses
nested folders and selects a request leaf; the tree reflects the collection's own ordering.

#### UC-003

**Inspect a request** — The user reads a selected request's
method, URL, query params, path variables, headers, body, auth, and pre-request/test scripts.

#### UC-004

**Inspect saved examples** — The user reads the saved responses
(`response[]`) attached to a request: status, headers, cookies, body.

#### UC-005

**Find a request** — The user filters the tree by text and finds
a request by name, URL, or method without knowing which folder it lives in.

#### UC-006

**Inspect collection-level context** — The user reads the
collection's variables, collection-level auth, and collection-level scripts, and can see which
request-level values are inherited rather than locally defined.

#### UC-007

**Diagnose a file minim cannot open** — The user picks a file
that is not JSON, not a collection, or not v2.1; minim explains precisely why it was rejected
instead of failing silently or crashing.

#### UC-008

**Reopen a recent collection** — The user relaunches minim and
reopens a previously opened collection from a recents list without re-navigating the filesystem.

#### UC-009

**Work in the OS theme** — The user runs minim in light or dark
mode and the UI follows the system preference, with a manual override.

## Functional Requirements

### Loading and validation

#### FR-001

The system SHALL let the user select a collection file via the
native OS file dialog, filtered to `.json`, when the user invokes Open.

#### FR-002

The system SHALL accept a collection file opened by drag-and-drop
onto the application window, applying the same validation path as [FR-001](#fr-001).

#### FR-003

The system SHALL read and parse the selected file in the Rust
core process, not in the webview.

#### FR-004

The system SHALL gate on `info.schema` **before** parsing the
item tree, and SHALL accept the file only when that value ends with
`/v2.1.0/collection.json`.

#### FR-005

The system SHALL reject a file whose `info.schema` identifies a
different collection version (v1, v2.0, v3/YAML) with a message naming the detected version and
stating that minim supports v2.1 JSON only.

#### FR-006

The system SHALL reject a file that is not valid JSON, or that is
valid JSON but lacks `info` or `item`, with a message distinguishing those two cases.

#### FR-007

The system SHALL report the byte offset (or line/column) of a
JSON syntax error when one is available from the parser.

#### FR-008

The system SHALL NOT terminate, panic, or enter an unrecoverable
state for any input file, regardless of content, size, or encoding.

#### FR-009

The system SHALL preserve unknown fields encountered anywhere in
the collection tree rather than erroring on them, so that a collection from a newer Postman
export still opens.

### Domain model and normalization

#### FR-010

The system SHALL treat `Request.url` as either a structured
object or a string, and SHALL normalize it to a display string; when the object form has no
`raw`, the system SHALL reassemble the URL from `protocol`, `host`, `port`, and `path`.

#### FR-011

The system SHALL treat `Request.header` as either an array of
header objects or a single raw header block string, and SHALL normalize it to an array by
splitting each raw line on its **first** `:`.

#### FR-012

The system SHALL treat `Script.exec` as either an array of lines
or a single string, and SHALL normalize it to one source string.

#### FR-013

The system SHALL treat any `description` field as either a
structured object or a string, and SHALL normalize it to a string.

#### FR-014

The system SHALL discriminate a folder (`ItemGroup`, has `item[]`)
from a request leaf (`ItemRequest`, has `request`) structurally, and SHALL support folder nesting
to arbitrary depth.

#### FR-015

The system SHALL expose every request leaf together with the
ordered folder path that contains it, and SHALL use that path as the identity key for tree
selection, search results, and the detail view's breadcrumb.

#### FR-016

The system SHALL assign every node a stable identifier derived
from its position in the tree when the collection supplies no `id`, so that selection survives
re-render without mutating the collection data.

#### FR-017

The system SHALL NOT introduce app-private fields into the
collection tree; any minim-only state SHALL live outside the parsed collection structure.

### Display — tree

#### FR-018

The system SHALL render the collection as a tree preserving the
document order of `item[]` at every level, without re-sorting.

#### FR-019

The system SHALL display each request leaf with its HTTP method
and name, with the method visually distinguished per verb.

#### FR-020

The system SHALL allow expanding and collapsing every folder, and
SHALL provide expand-all and collapse-all actions.

#### FR-021

The system SHALL filter the tree by a case-insensitive substring
match against request name, normalized URL, and HTTP method, showing matching leaves with their
ancestor folders retained for context.

#### FR-022

The system SHALL display a collection containing zero items as an
explicit empty state naming the collection, not as a blank pane.

### Display — request detail

#### FR-023

The system SHALL display, for a selected request: the folder path
breadcrumb, name, method, normalized URL, and description.

#### FR-024

The system SHALL display query parameters and path variables from
the structured URL form, including each entry's `disabled` state and description.

#### FR-025

The system SHALL display headers as key/value rows, marking
entries that are `disabled`.

#### FR-026

The system SHALL display the request body according to its `mode`,
covering all five modes: `raw`, `urlencoded`, `formdata`, `file`, and `graphql`.

#### FR-027

The system SHALL syntax-highlight a `raw` body according to the
language declared in `body.options.raw.language`, defaulting to plain text when absent.

#### FR-028

The system SHALL display a `graphql` body as its query and its
variables separately.

#### FR-029

The system SHALL display a `formdata` body distinguishing text
fields from file fields, showing the referenced file path for the latter.

#### FR-030

The system SHALL display the effective auth for a request: its own
`auth` when present, otherwise the nearest ancestor folder's, otherwise the collection's, and
SHALL label which level the displayed auth was inherited from.

#### FR-031

The system SHALL display the auth type and its attributes for every
auth type the schema defines, and SHALL fall back to a raw attribute list for an unrecognized type.

#### FR-032

The system SHALL mask credential-bearing auth attribute values
(for example `password`, `token`, `secret`, `key`) behind a per-value reveal control.

#### FR-033

The system SHALL display the request's pre-request and test
scripts as read-only, syntax-highlighted JavaScript, labelled by event type.

#### FR-034

The system SHALL display `protocolProfileBehavior` entries for a
request when present.

#### FR-035

The system SHALL render every `{{variable}}` placeholder occurring
in a displayed value as a visually distinct token, and SHALL indicate whether a collection
variable of that name is defined.

#### FR-036

The system SHALL display an omitted or empty section (no headers,
no body, no auth, no scripts) as an explicit "none" state rather than hiding the section.

### Display — examples and collection context

#### FR-037

The system SHALL list the saved examples (`response[]`) attached to
a request, and SHALL display a selected example's status code, status text, headers, cookies, and
body.

#### FR-038

The system SHALL display the collection's `variable[]` entries as
name, value, type, and disabled state.

#### FR-039

The system SHALL display collection-level and folder-level scripts,
reachable from the corresponding tree node.

#### FR-040

The system SHALL display the collection's `info` metadata: name,
description, schema URL, and version.

### Session and shell

#### FR-041

The system SHALL record opened collections in a recents list of at
least 10 entries, persisted across application restarts outside the collection file.

#### FR-042

The system SHALL remove a recents entry, on selection, whose file
no longer exists at its recorded path, and SHALL tell the user the file is gone.

#### FR-043

The system SHALL follow the OS light/dark preference on launch and
SHALL offer a manual light/dark override that persists across restarts.

#### FR-044

The system SHALL display an empty "no collection open" state, with
the open action and the recents list, when no collection is loaded.

#### FR-045

The system SHALL reload the currently open collection from disk on
demand, replacing the in-memory model.

## Non-Functional Requirements

#### NFR-001

**Performance (load)** — A 5 MB collection containing 2,000
request leaves SHALL parse in the Rust core and render its first interactive tree within **1.5 s
p95** on an Apple M1 / 16 GB baseline machine.

#### NFR-002

**Performance (interaction)** — Selecting a request SHALL render
its detail view within **100 ms p95**; typing in the tree filter SHALL update results within
**150 ms p95** for the same 2,000-leaf collection.

#### NFR-003

**Performance (startup)** — Cold launch to the "no collection
open" state SHALL complete within **2 s p95** on the NFR-001 baseline machine.

#### NFR-004

**Resource use** — Resident memory with a 5 MB collection open
SHALL stay below **400 MB**.

#### NFR-005

**Robustness** — A fuzz corpus of at least 1,000 mutated and
truncated collection files SHALL produce zero panics and zero hangs in the Rust parse path; every
input SHALL yield either a parsed model or a typed error.

#### NFR-006

**Parsing fidelity** — A corpus of real collections exported by
at least three different Postman versions, plus one hand-written collection exercising every
polymorphic shape in [FR-010](#fr-010)–[FR-013](#fr-013), SHALL open with no field silently lost.

#### NFR-007

**Security (network)** — The application SHALL make no outbound
network request of any kind in this slice; the Tauri capability set SHALL grant no HTTP or shell
permission.

#### NFR-008

**Security (filesystem)** — Filesystem access SHALL be limited to
paths the user selected through the file dialog or drag-and-drop, plus the app's own config
directory; no directory-wide read scope SHALL be granted.

#### NFR-009

**Security (webview)** — The webview SHALL run under a Content
Security Policy that forbids remote script and remote connections, and collection content SHALL
never be evaluated as code — scripts in `event[]` are displayed as text only.

#### NFR-010

**Security (injection)** — Every string originating from a
collection file SHALL be rendered as text, never as HTML, so a crafted collection cannot inject
markup into the UI.

#### NFR-011

**Accessibility** — The UI SHALL meet WCAG 2.1 AA contrast, SHALL
be fully operable by keyboard including tree navigation and selection, and the tree SHALL expose
correct ARIA tree semantics.

#### NFR-012

**Portability** — The application SHALL build and run on macOS 12+
(Apple Silicon and Intel), Windows 10+ (x86-64), and Ubuntu 22.04+ (x86-64).

#### NFR-013

**Distribution size** — The installed application SHALL stay under
**50 MB** per platform.

#### NFR-014

**Offline** — All functionality SHALL work with no network
connection present.

#### NFR-015

**Type safety across the seam** — TypeScript types for every
Tauri command payload SHALL be generated from the Rust definitions, and a drift between them SHALL
fail the build rather than surface at runtime.

#### NFR-016

**Test coverage** — The Rust parsing and normalization module
SHALL reach ≥ 90% line coverage; frontend state and normalizer-consuming components SHALL reach
≥ 80%.

## Constraints

- **Stack is fixed** — Tauri v2 (Rust core) + React + Vite + TypeScript + Tailwind CSS v4 +
  shadcn/ui. Chosen by the product owner; not open for re-litigation in Phase 2.
- **v2.1 JSON only** — inherited from Newman, minim's eventual execution engine, which supports
  neither v3 YAML nor v1/v2.0 collections. Stated in `CLAUDE.md`.
- **Rust owns the domain model** — parsing, validation, and normalization live in the core process;
  TypeScript types are generated from the Rust definitions. `.claude/docs/postman-collection.ts` is
  the **specification being ported**, and remains the reference for the four normalizers and the
  polymorphic shapes they absorb.
- **No app-private fields in the collection tree** — the v2.1 file is the product's interchange
  format; extension is allowed only where the schema allows it (`variable`,
  `protocolProfileBehavior`).
- **Greenfield toolchain** — there is no `package.json`, `Cargo.toml`, test runner, or linter in the
  repo. Scaffolding them is in scope and is the first task.
- **Conventional Commits** — per `.claude/knowledges/conventional_commits.md`.
- **Thai comments** — code written in or ported from `postman-collection.ts` keeps Thai comments, per
  `CLAUDE.md`.
- **No design system to inherit** — `.claude/design/` does not exist in this repo (it is a
  `saas-factory` symlink that was never made), so Phase 3 defines the token set from scratch.

## Out of Scope

Explicitly excluded from v1.0 — several of these are the obvious next slices, listed here so nobody
assumes they are included:

- **Sending requests.** No HTTP client, no response pane, no variable resolution for execution.
- **Running collections through Newman.** No `newman` invocation, no run report, no `-d` iteration
  data file, no CSV import UI — even though `parseCsv` / `previewIterationData` already exist in the
  TypeScript reference file.
- **Editing or authoring.** The viewer never writes a collection file. No create, rename, reorder,
  delete, or save.
- **Environment files.** `PostmanEnvironment` exports are a separate JSON document; opening and
  merging them is a later slice.
- **Variable resolution.** `{{placeholders}}` are highlighted ([FR-035](#fr-035)) but never
  substituted — there is no environment, and no execution, to resolve them against.
- **Executing scripts.** `event[]` contents are displayed as text and never evaluated
  ([NFR-009](#nfr-009)).
- **Format conversion.** No v1 → v2.1 or v2.0 → v2.1 upgrade, no OpenAPI/Swagger/HAR/cURL import, no
  code generation.
- **Postman cloud.** No sign-in, no workspace sync, no API key, no team features.
- **Diff, history, or version control** of collections.
- **Auto-update and telemetry.** No updater endpoint, no crash reporting, no analytics.
- **Multiple collections open at once.** One collection at a time; tabs are a later slice.
