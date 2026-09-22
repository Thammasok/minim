---
version: 1.0
status: draft
date: 2026-09-21
task: T-020
requires: requirements.md, design.md, ux-design.md, dev-plan.md
---

# Test Design: Collection Viewer

Phase 3 output. Structured TC cases for `software-tester-automation` (T-021).

**Relationship to `dev-plan.md`.** The per-task TDD contracts `TC-U-001 … TC-U-088` are the
*developer's* red-green contract: one or two cases per acceptance criterion, written to drive the
implementation. This document is the *tester's* suite: boundaries, adversarial inputs, every error
path, every polymorphic shape, and the cross-cutting levels (fidelity, robustness, performance,
security, accessibility) that no single task owns. Where a `TC-U-*` case already covers a
behaviour, the case here says so and pushes past it rather than restating it.

**ID allocation — no collision with `TC-U-001 … TC-U-088`.** Every id in this document uses a
distinct family prefix:

| Family | Range | Level | Runner |
|---|---|---|---|
| `TC-UNIT-nnn` | 001–052 | Unit (Rust pure fns + frontend pure logic) | `cargo test` / Vitest |
| `TC-CMD-nnn` | 001–035 | Command contract (the "API" level for this SUT) | `cargo test` + `tauri::test` mock app |
| `TC-COMP-nnn` | 001–032 | Frontend component | Vitest + React Testing Library |
| `TC-E2E-nnn` | 001–017 | End-to-end | `tauri-driver` + WebdriverIO ([ADR-012](design.md#key-decisions)) |
| `TC-FID-nnn` | 001–006 | Fidelity corpus | `cargo test` over `tests/fixtures/` |
| `TC-ROB-nnn` | 001–006 | Robustness / fuzz | `cargo-fuzz` / `proptest` |
| `TC-PERF-nnn` | 001–006 | Performance | Criterion + a scripted WDIO timing run |
| `TC-SEC-nnn` | 001–008 | Security | mixed (config assertion, component, E2E) |
| `TC-A11Y-nnn` | 001–008 | Accessibility | Vitest + `axe-core` / WDIO |

**Priority** — P1 smoke (must pass before any other test is trusted), P2 regression, P3 edge.

---

## 1. SUT Definition

### 1.1 Boundary

The SUT is the whole Tauri v2 application: the Rust core (`postman::*`, `commands::*`, `AppState`,
`error::AppError`) **and** the React webview, joined by the generated `bindings.ts`. Everything
outside the process is a test double or a real OS facility driven by the harness:

| Outside the SUT | Treated as |
|---|---|
| The collection `.json` file on disk | Input data — fixtures under `tests/fixtures/` |
| Native file dialog (`tauri-plugin-dialog`) | Returns a path and nothing more; stubbed below the E2E level |
| `tauri-plugin-store` (recents, prefs) | Real store rooted at a temp config dir in tests |
| OS light/dark preference | `matchMedia` mock (component) / OS setting (E2E) |
| The network | **Must never be touched** — its absence is an assertion, not a dependency ([NFR-007](requirements.md#nfr-007)) |

### 1.2 Inputs

| Input | Domain / boundaries |
|---|---|
| File path | existing · missing · unreadable · a directory · a symlink · a FIFO/device node |
| File size | 0 B · 1 B · typical (1–5 MB) · **67 108 864 B (64 MiB, accepted)** · 67 108 865 B (rejected) · 812 MB |
| File bytes | valid UTF-8 JSON · invalid UTF-8 · UTF-8 BOM · UTF-16 · truncated · YAML · non-JSON binary |
| `info.schema` | v2.1.0 (accept) · v2.0.0 · v1 · v3/YAML · absent · non-string · v2.1.0 with query suffix |
| Collection tree | 0 items · 1 leaf · 2 000 leaves · nesting depth 1 · 5 · 10 000 |
| `Request.url` | `string` · `Url{raw}` · `Url{}` no `raw` · `host` string or array · `path` string, array of string, array of `{value}` · `raw: ""` · absent ([FR-010](requirements.md#fr-010)) |
| `Request.header` | `Header[]` · raw block `string` · `""` · line with no `:` · value containing `:` · CRLF · blank lines ([FR-011](requirements.md#fr-011)) |
| `Script.exec` | `string[]` · `string` · `[]` · absent · `script` absent ([FR-012](requirements.md#fr-012)) |
| `description` (any level) | `Description{content}` · `Description{}` · `string` · `null` · absent ([FR-013](requirements.md#fr-013)) |
| `body.mode` | `raw` · `urlencoded` · `formdata` · `file` · `graphql` · unknown · absent |
| `auth.type` | 11 schema types (`apikey`, `awsv4`, `basic`, `bearer`, `digest`, `edgegrid`, `hawk`, `ntlm`, `oauth1`, `oauth2`, `noauth`) · unknown · `null` · absent |
| Command args | `path: String` · `node_id: String` (`""`, `"abc"`, `"-1"`, `"0."`, `"2.0.5"`, out-of-range) · `index: u32` (0, count-1, count, u32::MAX) · `prefs.theme` (`system`/`light`/`dark`/invalid) |
| UI input | click · keyboard (`↑↓←→ Home End Enter Space`, typeahead, `⌘O ⌘F ⌘R ⌘W Esc`) · drag-drop (1 json, 2 files, a folder, a non-json) · filter text (empty, no-match, regex metacharacters, 1 000 chars) |
| Environment | OS theme light/dark · window ≥ 800×600, < 900 px, < 1 000 px · 200 % zoom · `prefers-reduced-motion` |

### 1.3 Outputs

`CollectionOverview` · `NodeDetail::{Folder,Request}` · `ExampleDetail` · `Vec<RecentEntry>` ·
`Preferences` · `Vec<LoadWarning>` · `AppError{kind, detail}` · the rendered DOM · writes to
`store.json`. **Nothing else** — in particular, no write to the collection file and no socket.

### 1.4 `AppError` variants (the negative-path checklist)

Nine variants are declared across [design.md §API Contracts](design.md#api-contracts). Every one
has at least one case here:

| Variant | Wire `kind` | Cases |
|---|---|---|
| `FileNotFound` | `fileNotFound` | TC-CMD-003, TC-CMD-028, TC-COMP-026, TC-E2E-008 |
| `FileUnreadable` | `fileUnreadable` | TC-CMD-004, TC-SEC-008 |
| `FileTooLarge` | `fileTooLarge` | TC-CMD-005, TC-CMD-006, TC-COMP-025, TC-E2E-006 |
| `NotJson` | `notJson` | TC-CMD-007, TC-CMD-012, TC-UNIT-051, TC-E2E-004 |
| `NotACollection` | `notACollection` | TC-CMD-008, TC-CMD-009, TC-E2E-005 |
| `UnsupportedSchema` | `unsupportedSchema` | TC-CMD-010, TC-CMD-011, TC-CMD-013, TC-E2E-003 |
| `NoCollectionOpen` | `noCollectionOpen` | TC-CMD-021, TC-CMD-026, TC-CMD-029 |
| `UnknownNode` | `unknownNode` | TC-CMD-020, TC-CMD-025 |
| `UnknownExample` | `unknownExample` | TC-CMD-024 |

Plus TC-CMD-014, which asserts the `{kind, detail}` envelope for **all nine** in one table-driven
serialization test.

### 1.5 Invariants (asserted repeatedly, never assumed)

1. **Never panics, never hangs** for any input ([FR-008](requirements.md#fr-008), [NFR-005](requirements.md#nfr-005)) — TC-ROB-*.
2. **The collection file is never written** ([FR-017](requirements.md#fr-017)) — TC-CMD-035.
3. **No outbound network, ever** ([NFR-007](requirements.md#nfr-007)) — TC-SEC-004.
4. **Collection strings are text, never markup or code** ([NFR-009](requirements.md#nfr-009), [NFR-010](requirements.md#nfr-010)) — TC-SEC-003, TC-SEC-005.
5. **`NodeId` is total, unique, and stable across reload of an unchanged file** ([FR-016](requirements.md#fr-016)) — TC-UNIT-024, TC-CMD-027.
6. **Document order is preserved at every level** ([FR-018](requirements.md#fr-018)) — TC-UNIT-026.
7. **A field that cannot be understood produces a `LoadWarning`, not a dropped field or a failed load** ([FR-009](requirements.md#fr-009)) — TC-UNIT-020/030/040, TC-FID-003.

---

## 2. Business Flow Map

### 2.1 Happy path

```
launch → S1 empty shell (recents listed)
      → Open… / drop / recent click
      → S8 loading (skeleton; Cancel after 400 ms)
      → open_collection: size guard → read → JSON → schema gate → normalize → index → AppState → recents
      → S2 viewer: tree in document order, first interactive paint
      → select leaf → get_node_detail (O(1) arena) → detail header + tab badges → first non-empty tab
      → Examples tab → get_example(index) → example body
      → ⟳ reload / ✕ close → S2' or S1
```

### 2.2 Alternate flows

- Open by drag-and-drop ([FR-002](requirements.md#fr-002)) instead of the dialog.
- Open from a recents row ([FR-041](requirements.md#fr-041)).
- Filter the tree, select a filtered result, clear the filter ([FR-021](requirements.md#fr-021), S6).
- Select a **folder** node (S3) or the **collection root** (S4) instead of a request leaf.
- Collection opens **with warnings** (S10) — unknown auth type, unknown body mode, malformed raw header line, duplicate variable key, item that is neither group nor request.
- Theme: follow OS, or manual override, persisted ([FR-043](requirements.md#fr-043)).

### 2.3 Exception flows

| Trigger | Expected |
|---|---|
| Path missing | `FileNotFound` → S7 dialog; from a recents row, the dialog offers **Remove from recents** ([FR-042](requirements.md#fr-042)) |
| No read permission / path is a directory | `FileUnreadable` → S7 |
| > 64 MiB | `FileTooLarge` → S7, naming both sizes ([ADR-015](design.md#key-decisions)) |
| Not JSON (incl. YAML, binary, empty file) | `NotJson` with line/column when available ([FR-007](requirements.md#fr-007)) |
| JSON but missing `info` or `item` | `NotACollection` naming the missing field ([FR-006](requirements.md#fr-006)) |
| `info.schema` is v1 / v2.0 / v3 | `UnsupportedSchema{found, expected}` + the `Export → Collection v2.1` fix copy ([FR-005](requirements.md#fr-005)) |
| Command invoked with no collection open | `NoCollectionOpen` |
| Unknown `node_id` / example index | `UnknownNode` / `UnknownExample` |
| File vanished between open and reload | `FileNotFound` from `reload_collection` |

### 2.4 Edge cases

Empty collection (S9) · a folder with `item: []` · an item with neither `item` nor `request` · an
unnamed folder or request · duplicate names at one level · duplicate variable keys · a request with
every tab empty · 10 000-deep nesting · a 2 000-leaf collection · a file mutated mid-read · two
`open_collection` calls in flight.

### 2.5 Shell state model (state-transition basis for TC-E2E-*)

```
S1 empty ──open/drop/recent──► S8 loading ──ok──► S2 viewer ──select folder──► S3
   ▲                              │                  │ ──select root────────► S4
   │                              │                  │ ──Examples tab───────► S5
   │                              └──error───► S7 dialog ──Try another──► (dialog)
   │                                             └──Dismiss──► back to S1 or S2
   └──────────────── ✕ close / ⌘W ───────────────────┘
S2 ──zero items──► S9      S2 ──warnings>0──► S10 banner over S2
S2 ──⟳ reload──► S8 ──ok──► S2 (same NodeIds)  ──FileNotFound──► S7, S2 retained
```

Invalid transitions to prove: `get_node_detail` in S1 → `NoCollectionOpen`; reload in S1 →
`NoCollectionOpen`; close twice → second is a no-op `Ok(())`.

---

## 3. Decision tables

### 3.1 Effective auth resolution ([FR-030](requirements.md#fr-030)) — drives TC-UNIT-027/028, TC-COMP-016

| # | Request `auth` | Nearest folder `auth` | Collection `auth` | `AuthView.source` | Displayed type |
|---|---|---|---|---|---|
| 1 | `bearer` | any | any | `Own` | `bearer` |
| 2 | absent | `basic` (folder "Auth") | any | `Folder("Auth")` | `basic` |
| 3 | absent | absent | `apikey` | `Collection` | `apikey` |
| 4 | absent | absent | absent | `None` | `(none)` |
| 5 | `{"type":"noauth"}` | `basic` | `apikey` | `Own` | `noauth` — explicit suppression, **not** inheritance |
| 6 | `null` | `basic` | `apikey` | `Folder("Auth")` | `basic` — explicit null is "not specified" |
| 7 | absent | absent (2 levels up has `hawk`) | absent | `Folder("Outer")` | `hawk` — nearest **ancestor** folder, not just the parent |

Rows 5 and 6 are the pair a naive implementation gets wrong; both are tested.

### 3.2 Tab badge content ([ux-design.md §S2](ux-design.md)) — drives TC-COMP-009

| Tab | Content present | Badge |
|---|---|---|
| Params | n query + path params | `n` |
| Params | none | `—` |
| Headers | n headers (incl. disabled) | `n` |
| Body | mode `raw` | `raw` |
| Body | absent or `mode` missing | `—` |
| Auth | own auth | type name |
| Auth | inherited | `⊥` |
| Auth | none | `—` |
| Scripts | n events | `n` |
| Examples | n responses | `n` |

Default-open tab = the **first non-empty** tab; if all are empty, Params opens showing `(none)`.

### 3.3 Sensitive-attribute masking ([FR-032](requirements.md#fr-032)) — drives TC-UNIT-038

| Attribute key | `sensitive` | Why |
|---|---|---|
| `password`, `token`, `accessToken`, `refresh_token`, `secret`, `clientSecret`, `apikey`, `key`, `privateKey`, `passphrase` | `true` | substring match, case-insensitive |
| `username`, `realm`, `nonce`, `in`, `algorithm`, `addTokenTo`, `grant_type` | `false` | not credential-bearing |
| `publicKey` | `true` | accepted false positive — masking a public value is harmless; the reverse is not |

---

## 4. Test data

Fixture paths follow [T-003](dev-plan.md#t-003). Every case below names a concrete fixture.

| Fixture | Contents |
|---|---|
| `tests/fixtures/real/*.json` | ≥ 3 collections from different Postman versions (or documented stand-ins) |
| `tests/fixtures/real/small.json` | 12 requests in 3 folders — the counting fixture |
| `tests/fixtures/torture.json` | every polymorphic shape of [FR-010](requirements.md#fr-010)–[FR-013](requirements.md#fr-013), all 5 body modes, all 11 auth types + 1 unknown, 5-deep nesting, unknown fields at every level, an unnamed folder and request |
| `tests/fixtures/empty-items.json` | valid v2.1, `item: []` |
| `tests/fixtures/reject/trailing-comma.json` | JSON syntax error at line 418, column 12 |
| `tests/fixtures/reject/not-a-collection.json` | valid JSON, no `item` |
| `tests/fixtures/reject/no-info.json` | valid JSON, no `info` |
| `tests/fixtures/reject/v2.0.json`, `v1.json`, `v3.yaml` | version rejections |
| `tests/fixtures/reject/v2.0-with-broken-item.json` | proves gate-before-walk |
| `tests/fixtures/reject/hostile.json` | `<img src=x onerror=alert(1)>`, `</script>`, `{{__proto__}}`, `\u0000`, RTL override in every string-bearing field |
| `tests/fixtures/reject/empty.json` | 0 bytes |
| `generate(seed=0, leaves=2000)` | deterministic 4–6 MB performance fixture, gitignored |
| `tests/fixtures/edge/exactly-64mib.json` | 67 108 864 B, valid v2.1 (generated) |
| `tests/fixtures/edge/over-64mib.json` | 67 108 865 B (generated, sparse) |

Canonical hostile string, reused everywhere a collection string is rendered:

```
<img src=x onerror="window.__pwned=1"></script><b>bold</b>{{notAVar
```

---

## 5. Unit cases — `TC-UNIT-*`

Pure functions. **Mock needed: none** unless stated. Rust cases run under `cargo test`;
frontend cases (TC-UNIT-041 … 052) under Vitest.

### TC-UNIT-001 — url string form is returned byte-for-byte
- **Level / Technique / Priority** — Rust unit · EP · P1
- **Traces** — [FR-010](requirements.md#fr-010)
- **Preconditions** — none
- **Input** — `url = "{{baseUrl}}/v1/items?q=a%20b#frag"`
- **Expected** — `"{{baseUrl}}/v1/items?q=a%20b#frag"`; no trimming, no re-encoding, `{{baseUrl}}` untouched
- **Mock** — none

### TC-UNIT-002 — object form with `host` as an array joins on `.`
- **Level / Technique / Priority** — Rust unit · EP · P2
- **Traces** — [FR-010](requirements.md#fr-010)
- **Preconditions** — none
- **Input** — `{ "protocol":"https", "host":["api","example","com"], "path":["v1","items"] }`
- **Expected** — `"https://api.example.com/v1/items"`
- **Mock** — none

### TC-UNIT-003 — object form with `path` as segment objects uses each `value`
- **Level / Technique / Priority** — Rust unit · EP · P2
- **Traces** — [FR-010](requirements.md#fr-010)
- **Preconditions** — none
- **Input** — `{ "host":"api.example.com", "path":[ "v1", {"type":"variable","value":":id"} ] }`
- **Expected** — `"api.example.com/v1/:id"`; a segment object with no `value` contributes an empty segment, not a panic
- **Mock** — none

### TC-UNIT-004 — port without protocol
- **Level / Technique / Priority** — Rust unit · BVA · P2
- **Traces** — [FR-010](requirements.md#fr-010)
- **Preconditions** — none
- **Input** — `{ "host":"localhost", "port":"8080", "path":"health" }`
- **Expected** — `"localhost:8080/health"` — no leading `://`
- **Mock** — none

### TC-UNIT-005 — reassembly drops `query` and `hash` (documented loss)
- **Level / Technique / Priority** — Rust unit · Error guessing · P2
- **Traces** — [FR-010](requirements.md#fr-010), [NFR-006](requirements.md#nfr-006)
- **Preconditions** — none
- **Input** — `{ "host":"api.example.com", "path":["items"], "query":[{"key":"q","value":"1"}], "hash":"top" }`
- **Expected** — the normalized display string is `"api.example.com/items"`, **and** the `query` entries still appear in `UrlView.query` so nothing is silently lost. If the implementation instead appends `?q=1`, that is also acceptable — but the assertion must be explicit either way, and `UrlView.query` must be populated regardless.
- **Mock** — none
- **Note / risk** — the TS reference drops query on reassembly. This case pins the decision rather than leaving it accidental.

### TC-UNIT-006 — `raw: ""` falls back to reassembly
- **Level / Technique / Priority** — Rust unit · BVA · P2
- **Traces** — [FR-010](requirements.md#fr-010)
- **Preconditions** — none
- **Input** — `{ "raw":"", "host":"api.example.com", "path":["ping"] }`
- **Expected** — `"api.example.com/ping"`, not `""`
- **Mock** — none

### TC-UNIT-007 — absent / null url
- **Level / Technique / Priority** — Rust unit · BVA · P2
- **Traces** — [FR-010](requirements.md#fr-010), [FR-008](requirements.md#fr-008)
- **Preconditions** — none
- **Input** — `request` with no `url`; and `"url": null`
- **Expected** — `""` in both cases; `RequestDetail` still builds; no panic
- **Mock** — none

### TC-UNIT-008 — raw header block with CRLF and blank lines
- **Level / Technique / Priority** — Rust unit · EP · P1
- **Traces** — [FR-011](requirements.md#fr-011)
- **Preconditions** — none
- **Input** — `"Accept: application/json\r\n\r\nX-Trace: abc\r\n"`
- **Expected** — exactly 2 headers: `Accept=application/json`, `X-Trace=abc`; empty lines produce no entries
- **Mock** — none

### TC-UNIT-009 — key and value are trimmed, inner whitespace is not
- **Level / Technique / Priority** — Rust unit · BVA · P2
- **Traces** — [FR-011](requirements.md#fr-011)
- **Preconditions** — none
- **Input** — `"  X-Note :  hello   world  "`
- **Expected** — `{ key: "X-Note", value: "hello   world" }`
- **Mock** — none

### TC-UNIT-010 — raw line whose first character is `:`
- **Level / Technique / Priority** — Rust unit · BVA · P3
- **Traces** — [FR-011](requirements.md#fr-011)
- **Preconditions** — none
- **Input** — `": orphan-value"`
- **Expected** — `{ key: "", value: "orphan-value" }` plus a `MalformedRawHeaderLine` warning; the entry is not dropped
- **Mock** — none

### TC-UNIT-011 — array form passes through with `disabled` and `description` intact
- **Level / Technique / Priority** — Rust unit · EP · P1
- **Traces** — [FR-011](requirements.md#fr-011), [FR-025](requirements.md#fr-025)
- **Preconditions** — none
- **Input** — `[{"key":"A","value":"1","disabled":true,"description":{"content":"why"}}]`
- **Expected** — one `HeaderView{ key:"A", value:"1", disabled:true, description:"why" }`
- **Mock** — none

### TC-UNIT-012 — empty and absent header forms
- **Level / Technique / Priority** — Rust unit · BVA · P2
- **Traces** — [FR-011](requirements.md#fr-011)
- **Preconditions** — none
- **Input** — `""`, `[]`, absent, `null`
- **Expected** — `[]` in all four cases; no warning for `""`/`[]`/absent
- **Mock** — none

### TC-UNIT-013 — `exec` as a single string keeps its own newlines
- **Level / Technique / Priority** — Rust unit · EP · P1
- **Traces** — [FR-012](requirements.md#fr-012)
- **Preconditions** — none
- **Input** — `{"exec":"const a = 1;\nconsole.log(a);"}`
- **Expected** — `"const a = 1;\nconsole.log(a);"` unchanged
- **Mock** — none

### TC-UNIT-014 — `exec: []` and `exec: [""]`
- **Level / Technique / Priority** — Rust unit · BVA · P2
- **Traces** — [FR-012](requirements.md#fr-012), [FR-036](requirements.md#fr-036)
- **Preconditions** — none
- **Input** — `{"exec":[]}` and `{"exec":[""]}`
- **Expected** — `""` for both; the event is still listed with an explicit empty-source state, not hidden
- **Mock** — none

### TC-UNIT-015 — `event` present but `script` absent
- **Level / Technique / Priority** — Rust unit · Error guessing · P3
- **Traces** — [FR-012](requirements.md#fr-012), [FR-008](requirements.md#fr-008)
- **Preconditions** — none
- **Input** — `[{"listen":"test"}]`
- **Expected** — one `ScriptView{ listen:"test", source:"" }`; no panic, no dropped event
- **Mock** — none

### TC-UNIT-016 — description object with no `content`
- **Level / Technique / Priority** — Rust unit · BVA · P2
- **Traces** — [FR-013](requirements.md#fr-013)
- **Preconditions** — none
- **Input** — `{"type":"text/markdown"}`
- **Expected** — `""`
- **Mock** — none

### TC-UNIT-017 — explicit JSON `null` description on a query param
- **Level / Technique / Priority** — Rust unit · BVA · P2
- **Traces** — [FR-013](requirements.md#fr-013), [FR-024](requirements.md#fr-024)
- **Preconditions** — none
- **Input** — `{"key":"q","value":"1","description":null}`
- **Expected** — `ParamView.description == ""`; deserialization succeeds
- **Mock** — none

### TC-UNIT-018 — description markdown and HTML survive as literal text
- **Level / Technique / Priority** — Rust unit · Error guessing · P2
- **Traces** — [FR-013](requirements.md#fr-013), [NFR-010](requirements.md#nfr-010)
- **Preconditions** — none
- **Input** — `{"content":"# Title <b>x</b> <script>alert(1)</script>"}`
- **Expected** — the string is returned verbatim; no unescaping, no sanitizing at this layer (the render layer is responsible — see TC-SEC-003)
- **Mock** — none

### TC-UNIT-019 — description normalizes identically at all five levels
- **Level / Technique / Priority** — Rust unit · EP · P2
- **Traces** — [FR-013](requirements.md#fr-013)
- **Preconditions** — `torture.json` has a description at each level, half object, half string
- **Input** — collection `info.description`, folder, request, header, query param
- **Expected** — all five reach the DTO as plain `String` with the same normalizer; none is `Option<Description>` in the DTO
- **Mock** — none

### TC-UNIT-020 — an item that is neither group nor request is warned about, not fatal
- **Level / Technique / Priority** — Rust unit · Error guessing · P1
- **Traces** — [FR-009](requirements.md#fr-009), [FR-014](requirements.md#fr-014)
- **Preconditions** — none
- **Input** — `item: [ {"name":"ok","request":{}}, {"name":"weird","foo":1}, {"name":"ok2","request":{}} ]`
- **Expected** — 2 request leaves indexed, 1 `ItemNeitherGroupNorRequest` warning carrying `node_id` and `"weird"`; load succeeds
- **Mock** — none

### TC-UNIT-021 — a folder with `item: []` is a folder
- **Level / Technique / Priority** — Rust unit · BVA · P2
- **Traces** — [FR-014](requirements.md#fr-014)
- **Preconditions** — none
- **Input** — `{"name":"Empty","item":[]}`
- **Expected** — `kind == Folder`, `children == []`, `folder_count` incremented, `request_count` unchanged
- **Mock** — none

### TC-UNIT-022 — an item with both `item` and `request` is a folder
- **Level / Technique / Priority** — Rust unit · Decision table · P3
- **Traces** — [FR-014](requirements.md#fr-014)
- **Preconditions** — none
- **Input** — `{"name":"both","item":[],"request":{"method":"GET"}}`
- **Expected** — discriminated as `Folder` (matching `isItemGroup` checking `item` first); the stray `request` lands in `extra`, not dropped
- **Mock** — none

### TC-UNIT-023 — unnamed folders and requests still index
- **Level / Technique / Priority** — Rust unit · BVA · P2
- **Traces** — [FR-015](requirements.md#fr-015), [FR-016](requirements.md#fr-016)
- **Preconditions** — none
- **Input** — a folder with no `name` containing a request with no `name`
- **Expected** — both get a `NodeId`; `name` is an empty string (the UI supplies the placeholder); `folder_path` for the leaf is `[""]`, length 1 — position is preserved even without a name
- **Mock** — none

### TC-UNIT-024 — duplicate names at one level get distinct, order-derived NodeIds
- **Level / Technique / Priority** — Rust unit · EP · P1
- **Traces** — [FR-016](requirements.md#fr-016)
- **Preconditions** — none
- **Input** — three sibling requests all named `"Login"`
- **Expected** — ids `"0.0"`, `"0.1"`, `"0.2"`; all unique; the third's detail is the third request's
- **Mock** — none

### TC-UNIT-025 — folder path is root-first and excludes self
- **Level / Technique / Priority** — Rust unit · EP · P1
- **Traces** — [FR-015](requirements.md#fr-015)
- **Preconditions** — 5-deep nesting in `torture.json`
- **Input** — the deepest leaf
- **Expected** — `folder_path == ["L1","L2","L3","L4","L5"]`; the leaf's own name is absent; `folder_path` of a *folder* node likewise excludes itself
- **Mock** — none

### TC-UNIT-026 — document order is never re-sorted
- **Level / Technique / Priority** — Rust unit · EP · P1
- **Traces** — [FR-018](requirements.md#fr-018)
- **Preconditions** — none
- **Input** — a level ordered `["zebra"(request), "alpha"(folder), "Mango"(request)]`
- **Expected** — `tree` preserves that exact order; folders are **not** hoisted above requests; no alphabetical or case-folded sort
- **Mock** — none

### TC-UNIT-027 — explicit `noauth` suppresses inheritance
- **Level / Technique / Priority** — Rust unit · Decision table (§3.1 row 5) · P1
- **Traces** — [FR-030](requirements.md#fr-030)
- **Preconditions** — collection auth `apikey`, folder auth `basic`
- **Input** — request `auth = {"type":"noauth"}`
- **Expected** — `AuthView{ source: Own, auth_type: "noauth" }` — not `basic`, not `apikey`
- **Mock** — none

### TC-UNIT-028 — `auth: null` on a request still inherits
- **Level / Technique / Priority** — Rust unit · Decision table (§3.1 row 6) · P2
- **Traces** — [FR-030](requirements.md#fr-030)
- **Preconditions** — folder "Auth" has `basic`
- **Input** — request `auth = null`
- **Expected** — `AuthView{ source: Folder("Auth"), auth_type: "basic" }`
- **Mock** — none

### TC-UNIT-029 — auth resolves to the nearest *ancestor* folder, not just the parent
- **Level / Technique / Priority** — Rust unit · Decision table (§3.1 row 7) · P2
- **Traces** — [FR-030](requirements.md#fr-030)
- **Preconditions** — `Outer` has `hawk`; `Inner` (child of Outer) has none
- **Input** — a request inside `Inner`
- **Expected** — `source == Folder("Outer")`, `auth_type == "hawk"`
- **Mock** — none

### TC-UNIT-030 — duplicate variable keys both survive, with a warning
- **Level / Technique / Priority** — Rust unit · Error guessing · P2
- **Traces** — [FR-038](requirements.md#fr-038), [FR-009](requirements.md#fr-009)
- **Preconditions** — none
- **Input** — `variable: [{"key":"baseUrl","value":"a"},{"key":"baseUrl","value":"b"}]`
- **Expected** — two `VariableView` rows in document order **and** one `DuplicateVariableKey` warning naming `baseUrl`; neither row is collapsed away
- **Mock** — none

### TC-UNIT-031 — unknown `body.mode` warns and preserves the payload
- **Level / Technique / Priority** — Rust unit · Error guessing · P1
- **Traces** — [FR-026](requirements.md#fr-026), [FR-009](requirements.md#fr-009)
- **Preconditions** — none
- **Input** — `body = {"mode":"msgpack","msgpack":"AQID"}`
- **Expected** — one `UnknownBodyMode` warning with `node_id`; `RequestDetail.body` is `None` or a passthrough variant, and the raw payload is reachable via `extra`; the request still opens
- **Mock** — none

### TC-UNIT-032 — `body` present with no `mode`
- **Level / Technique / Priority** — Rust unit · BVA · P2
- **Traces** — [FR-026](requirements.md#fr-026)
- **Preconditions** — none
- **Input** — `body = {"raw":"{\"a\":1}"}`
- **Expected** — treated as `Raw` with `language` defaulting to `text` (the single populated key disambiguates), **or** `None` + `UnknownBodyMode`. Pin whichever the implementation chooses; it must not panic and must not show a blank Body tab with badge `raw`.
- **Mock** — none

### TC-UNIT-033 — `body.disabled: true` is still shown, flagged
- **Level / Technique / Priority** — Rust unit · Decision table · P3
- **Traces** — [FR-026](requirements.md#fr-026), [FR-036](requirements.md#fr-036)
- **Preconditions** — none
- **Input** — `body = {"mode":"raw","raw":"x","disabled":true}`
- **Expected** — the body reaches `BodyView` with a disabled marker; it is not silently omitted (a reader must see what is in the file)
- **Mock** — none

### TC-UNIT-034 — formdata `src` as an array of paths
- **Level / Technique / Priority** — Rust unit · EP · P2
- **Traces** — [FR-029](requirements.md#fr-029)
- **Preconditions** — none
- **Input** — `{"key":"files","type":"file","src":["./a.pdf","./b.pdf"]}`
- **Expected** — one `FormFieldView{ kind: File }` listing both paths; `src: null` yields `kind: File` with no path and no panic
- **Mock** — none

### TC-UNIT-035 — formdata field with no `type` defaults to text
- **Level / Technique / Priority** — Rust unit · BVA · P2
- **Traces** — [FR-029](requirements.md#fr-029)
- **Preconditions** — none
- **Input** — `{"key":"note","value":"urgent"}`
- **Expected** — `kind: Text`, `value: "urgent"`
- **Mock** — none

### TC-UNIT-036 — graphql query and variables split
- **Level / Technique / Priority** — Rust unit · EP · P1
- **Traces** — [FR-028](requirements.md#fr-028)
- **Preconditions** — none
- **Input** — `{"mode":"graphql","graphql":{"query":"query Me { me { id } }","variables":"{\"id\":\"{{userId}}\"}"}}`
- **Expected** — `BodyView::Graphql{ query, variables }` as two separate strings; `variables` stays a string (it is a string in the schema) and is not parsed into an object
- **Mock** — none

### TC-UNIT-037 — graphql with only a query
- **Level / Technique / Priority** — Rust unit · BVA · P3
- **Traces** — [FR-028](requirements.md#fr-028), [FR-036](requirements.md#fr-036)
- **Preconditions** — none
- **Input** — `{"mode":"graphql","graphql":{"query":"{ me }"}}`
- **Expected** — `variables == ""`; the Variables sub-section renders `(none)`, not an empty box
- **Mock** — none

### TC-UNIT-038 — the sensitive predicate, by §3.3
- **Level / Technique / Priority** — Rust unit · Decision table + EP · P1
- **Traces** — [FR-032](requirements.md#fr-032)
- **Preconditions** — none
- **Input** — every key in §3.3
- **Expected** — the `sensitive` flag matches the table exactly; matching is case-insensitive and substring-based (`accessToken` → true, `ACCESS_TOKEN` → true, `username` → false)
- **Mock** — none

### TC-UNIT-039 — all eleven schema auth types map to attribute lists
- **Level / Technique / Priority** — Rust unit · EP (table-driven) · P1
- **Traces** — [FR-031](requirements.md#fr-031)
- **Preconditions** — `torture.json` contains one request per auth type
- **Input** — `apikey`, `awsv4`, `basic`, `bearer`, `digest`, `edgegrid`, `hawk`, `ntlm`, `oauth1`, `oauth2`, `noauth`
- **Expected** — each yields `AuthView.auth_type` equal to the type name and `attributes` equal to the file's attribute array (for `noauth`, an empty list, including when the value is JSON `null`); no type produces a warning
- **Mock** — none

### TC-UNIT-040 — unrecognized auth type passes through with a warning
- **Level / Technique / Priority** — Rust unit · Error guessing · P1
- **Traces** — [FR-031](requirements.md#fr-031), [FR-009](requirements.md#fr-009)
- **Preconditions** — none
- **Input** — `{"type":"quantum","quantum":[{"key":"qubits","value":"7"}]}`
- **Expected** — `auth_type == "quantum"`, attributes listed raw, one `UnknownAuthType` warning naming the node; the collection opens
- **Mock** — none

### TC-UNIT-041 — `{{variable}}` tokenizer, adversarial inputs
- **Level / Technique / Priority** — Frontend unit · BVA + error guessing · P1
- **Traces** — [FR-035](requirements.md#fr-035)
- **Preconditions** — none
- **Input** — `"{{a}}{{b}}"`, `"{{ a }}"`, `"{{unclosed"`, `"}}{{"`, `"{{{x}}}"`, `"{{}}"`, `"no vars"`, `""`
- **Expected** — 2 tokens; 1 token keyed `a` (trimmed) or 1 literal — pin the choice; 0 tokens for `"{{unclosed"` with the text preserved; 0 tokens and no crash for `"}}{{ "`; `{{{x}}}` yields one token `x` plus literal braces; `{{}}` yields no token. Total output text always reassembles to the input string.
- **Mock** — none

### TC-UNIT-042 — defined-ness of a variable reference
- **Level / Technique / Priority** — Frontend unit · Decision table · P2
- **Traces** — [FR-035](requirements.md#fr-035)
- **Preconditions** — collection variables `[baseUrl (enabled), legacyId (disabled)]`
- **Input** — refs `baseUrl`, `legacyId`, `userId`
- **Expected** — `baseUrl → defined`, `legacyId → defined` (it exists, it is merely disabled — the chip may carry a secondary "disabled" hint), `userId → undefined` (dashed chip + tooltip)
- **Mock** — none

### TC-UNIT-043 — variable USED count counts references, not occurrences per request
- **Level / Technique / Priority** — Frontend unit · BVA · P3
- **Traces** — [FR-038](requirements.md#fr-038) (ux extension)
- **Preconditions** — `{{baseUrl}}` appears twice in one request's URL and once in another's header
- **Input** — the reference index
- **Expected** — pin the definition: USED = number of *requests* referencing it = 2 (not 3 occurrences). A variable referenced nowhere shows `0`.
- **Mock** — none

### TC-UNIT-044 — filter predicate matches name, URL and method, case-insensitively
- **Level / Technique / Priority** — Frontend unit · EP · P1
- **Traces** — [FR-021](requirements.md#fr-021)
- **Preconditions** — leaf `{ name:"Get invoice", method:"GET", urlPreview:"{{baseUrl}}/invoices/:id" }`
- **Input** — `"INVOICE"`, `"get"`, `"{{base"`, `"/invoices/"`, `"zzz"`
- **Expected** — first four match, `"zzz"` does not; matching is substring, not prefix, not fuzzy
- **Mock** — none

### TC-UNIT-045 — filter treats regex metacharacters literally
- **Level / Technique / Priority** — Frontend unit · Error guessing · P2
- **Traces** — [FR-021](requirements.md#fr-021), [FR-008](requirements.md#fr-008)
- **Preconditions** — one leaf named `"a.b"` and one named `"axb"`
- **Input** — `".*"`, `"a.b"`, `"("`, `"[a-"`
- **Expected** — `".*"` matches nothing (no leaf contains a literal `.*`); `"a.b"` matches only `"a.b"`, never `"axb"`; unbalanced `"("` and `"[a-"` do not throw
- **Mock** — none

### TC-UNIT-046 — filter with 1 000 characters and with whitespace only
- **Level / Technique / Priority** — Frontend unit · BVA · P3
- **Traces** — [FR-021](requirements.md#fr-021)
- **Preconditions** — the 2 000-leaf fixture summary
- **Input** — `"x".repeat(1000)`; `"   "`
- **Expected** — 0 results and the `0 of 2000` count for the long string; whitespace-only is treated as a real query (matches names containing a space) or as empty — pin the choice, and the tree must not be left in a half-filtered state
- **Mock** — none

### TC-UNIT-047 — `AppError` → user copy mapping is total
- **Level / Technique / Priority** — Frontend unit · EP (table-driven) · P1
- **Traces** — [FR-005](requirements.md#fr-005)–[FR-007](requirements.md#fr-007)
- **Preconditions** — none
- **Input** — all nine `{kind, detail}` envelopes from §1.4, plus an unknown `kind: "somethingNew"`
- **Expected** — each known kind maps to distinct, non-empty title and body copy matching [ux-design.md §S7](ux-design.md); `unsupportedSchema` copy contains both version strings and the `Export → Collection v2.1` remedy; `notJson` contains line and column; `notACollection` names the missing field; the unknown kind falls back to a generic message instead of rendering `undefined`
- **Mock** — none

### TC-UNIT-048 — `info.version` in both forms
- **Level / Technique / Priority** — Rust unit · EP · P2
- **Traces** — [FR-040](requirements.md#fr-040)
- **Preconditions** — none
- **Input** — `"version":"2.4.0"` and `"version":{"major":2,"minor":4,"patch":0,"identifier":"beta"}`
- **Expected** — both reach `CollectionOverview.version` as a display string (`"2.4.0"`, `"2.4.0-beta"`); absent version yields `None`, and S4 renders no version line rather than `undefined`
- **Mock** — none

### TC-UNIT-049 — example `header` in raw-block form
- **Level / Technique / Priority** — Rust unit · EP · P2
- **Traces** — [FR-037](requirements.md#fr-037), [FR-011](requirements.md#fr-011)
- **Preconditions** — none
- **Input** — `response[0].header = "Content-Type: application/json\r\nX-Req-Id: 7"`
- **Expected** — the **same** header normalizer is applied; `ExampleDetail.headers` has 2 entries. `header: null` yields `[]`.
- **Mock** — none

### TC-UNIT-050 — example with missing `status`, `code` or `body`
- **Level / Technique / Priority** — Rust unit · BVA · P2
- **Traces** — [FR-037](requirements.md#fr-037), [FR-036](requirements.md#fr-036)
- **Preconditions** — none
- **Input** — `{"name":"No body","code":204}`; `{"name":"Odd","status":"Teapot"}`; `{"name":"Nulled","body":null}`
- **Expected** — each is listed in `examples[]` with whatever it has; missing `code` renders no code chip rather than `0`; `body: null` renders an explicit empty-body state
- **Mock** — none

### TC-UNIT-051 — schema gate string boundaries
- **Level / Technique / Priority** — Rust unit · BVA (table-driven) · P1
- **Traces** — [FR-004](requirements.md#fr-004), [FR-005](requirements.md#fr-005)
- **Preconditions** — none
- **Input** —
  1. `".../v2.1.0/collection.json"` → accept
  2. `"http://schema.getpostman.com/json/collection/v2.1.0/collection.json"` (http, not https) → accept (suffix match)
  3. `".../v2.1.0/collection.json "` (trailing space) → accept after trim; pin the choice
  4. `".../v2.1.0/collection.json?x=1"` → reject as `UnsupportedSchema`, `found` echoed verbatim
  5. `".../v2.0.0/collection.json"` → `UnsupportedSchema{found: v2.0}`
  6. `".../v1.0.0/collection.json"` → `UnsupportedSchema{found: v1}`
  7. `"v2.1.0/collection.json"` (no host) → accept
  8. `""` → `UnsupportedSchema` or `NotACollection` — pin one
  9. `21` (non-string) → `NotACollection{ missing_field: "info.schema" }`, never a deserialize panic
  10. absent → `NotACollection{ missing_field: "info.schema" }`
- **Expected** — as listed; every rejection carries the detected value in `found` and the canonical v2.1 URL in `expected`
- **Mock** — none

### TC-UNIT-052 — UTF-8 BOM is stripped before parsing
- **Level / Technique / Priority** — Rust unit · Error guessing · P2
- **Traces** — [FR-006](requirements.md#fr-006), [FR-008](requirements.md#fr-008)
- **Preconditions** — none
- **Input** — `real/small.json` prefixed with `EF BB BF`
- **Expected** — parses successfully (a BOM is common in Windows/Excel-touched exports); it does **not** produce `NotJson` at line 1 column 1
- **Mock** — none

---

## 6. Command-contract cases — `TC-CMD-*`

This SUT has **no HTTP API**. The Tauri command surface in
[design.md §API Contracts](design.md#api-contracts) *is* the API layer, so the skill's "API test"
level is realised as command-contract tests: invoke the command function against a real `AppState`
and real fixture files, assert the returned DTO or `AppError` exactly.

**Standing mock/harness for this section** — `tauri::test::mock_builder()` with the commands
registered; `AppState` constructed per test (no shared state between cases); `tauri-plugin-store`
rooted at a fresh `tempfile::TempDir`; fixture files copied into a `TempDir` when the case mutates
or deletes them. No network, no real dialog.

### TC-CMD-001 — `open_collection` happy path returns a complete overview
- **Level / Technique / Priority** — Command contract · Use case · P1
- **Traces** — [FR-003](requirements.md#fr-003), [FR-018](requirements.md#fr-018), [FR-040](requirements.md#fr-040), [UC-001](requirements.md#uc-001)
- **Preconditions** — `AppState` empty
- **Input** — `open_collection("tests/fixtures/real/small.json")`
- **Expected** — `Ok(CollectionOverview)` with `name`, `schema` (the v2.1 URL), `source_path` equal to the input, `file_size_bytes > 0`, `request_count == 12`, `folder_count == 3`, `tree` non-empty and in document order, `warnings == []`, `variables` matching the file
- **Mock** — temp store dir

### TC-CMD-002 — the IPC payload is camelCase and matches `bindings.ts`
- **Level / Technique / Priority** — Command contract · Contract · P1
- **Traces** — [NFR-015](requirements.md#nfr-015)
- **Preconditions** — bindings generated from the current command signatures
- **Input** — serialize `CollectionOverview`, `NodeDetail::Request`, `ExampleDetail`, `AppError` to JSON
- **Expected** — keys are `sourcePath`, `fileSizeBytes`, `requestCount`, `folderCount`, `urlPreview`, `folderPath`, `exampleCount`, `hasScripts`, `pathVariables`, `authType`; the tagged unions carry `kind` (`NodeDetail`, `AppError`) and `mode` (`BodyView`); regenerating `bindings.ts` produces **no diff** (CI drift gate)
- **Mock** — none

### TC-CMD-003 — `FileNotFound`
- **Level / Technique / Priority** — Command contract · Error path · P1
- **Traces** — [FR-008](requirements.md#fr-008)
- **Preconditions** — `/tmp/<uuid>/nope.json` does not exist
- **Input** — `open_collection("/tmp/<uuid>/nope.json")`
- **Expected** — `Err(AppError::FileNotFound{ path })`; `AppState` unchanged (a prior collection stays open); nothing pushed to recents
- **Mock** — temp store dir

### TC-CMD-004 — `FileUnreadable` for a permission-denied file and for a directory
- **Level / Technique / Priority** — Command contract · Error path · P2
- **Traces** — [FR-008](requirements.md#fr-008), [NFR-008](requirements.md#nfr-008)
- **Preconditions** — a file with mode `000` (skipped when running as root or on Windows, where the case uses a locked file instead); a directory path
- **Input** — `open_collection(unreadable)`; `open_collection("/tmp/somedir")`
- **Expected** — `Err(AppError::FileUnreadable{ path, reason })` for both; **not** `FileNotFound`, **not** a panic
- **Mock** — `TempDir`

### TC-CMD-005 — `FileTooLarge` is decided from metadata, before any read
- **Level / Technique / Priority** — Command contract · BVA · P1
- **Traces** — [ADR-015](design.md#key-decisions), [NFR-004](requirements.md#nfr-004)
- **Preconditions** — `edge/over-64mib.json` is a **sparse** 67 108 865-byte file
- **Input** — `open_collection(path)`
- **Expected** — `Err(AppError::FileTooLarge{ size_bytes: 67108865, limit_bytes: 67108864 })`, returned in < 50 ms, with peak RSS delta < 10 MB — proving `metadata()` was used rather than a read-then-check
- **Mock** — sparse-file helper

### TC-CMD-006 — exactly 64 MiB is accepted (the other side of the boundary)
- **Level / Technique / Priority** — Command contract · BVA · P2
- **Traces** — [ADR-015](design.md#key-decisions)
- **Preconditions** — `edge/exactly-64mib.json`, a valid v2.1 collection padded to 67 108 864 bytes
- **Input** — `open_collection(path)`
- **Expected** — `Ok(CollectionOverview)` — `>` not `>=` in the guard
- **Mock** — generated fixture

### TC-CMD-007 — `NotJson` carries line and column
- **Level / Technique / Priority** — Command contract · Error path · P1
- **Traces** — [FR-006](requirements.md#fr-006), [FR-007](requirements.md#fr-007)
- **Preconditions** — none
- **Input** — `open_collection("tests/fixtures/reject/trailing-comma.json")`
- **Expected** — `Err(AppError::NotJson{ line: 418, column: 12, message })`; `message` is serde's text, and `line`/`column` are separate numeric fields so the UI never parses prose
- **Mock** — none

### TC-CMD-008 — `NotACollection` when `info` is missing
- **Level / Technique / Priority** — Command contract · Error path · P1
- **Traces** — [FR-006](requirements.md#fr-006)
- **Preconditions** — none
- **Input** — `open_collection("tests/fixtures/reject/no-info.json")` (valid JSON, has `item`)
- **Expected** — `Err(AppError::NotACollection{ missing_field: "info" })`
- **Mock** — none

### TC-CMD-009 — `NotACollection` when `item` is missing
- **Level / Technique / Priority** — Command contract · Error path · P1
- **Traces** — [FR-006](requirements.md#fr-006)
- **Preconditions** — none
- **Input** — `{"info":{"name":"x","schema":".../v2.1.0/collection.json"}}`
- **Expected** — `Err(AppError::NotACollection{ missing_field: "item" })` — distinct from TC-CMD-008 so [ux-design.md §S7](ux-design.md) can name the field
- **Mock** — none

### TC-CMD-010 — `UnsupportedSchema` for v2.0
- **Level / Technique / Priority** — Command contract · Error path · P1
- **Traces** — [FR-005](requirements.md#fr-005)
- **Preconditions** — none
- **Input** — `open_collection("tests/fixtures/reject/v2.0.json")`
- **Expected** — `Err(AppError::UnsupportedSchema{ found: ".../v2.0.0/collection.json", expected: ".../v2.1.0/collection.json" })`
- **Mock** — none

### TC-CMD-011 — `UnsupportedSchema` for a v1 collection, which has no `schema` field at all
- **Level / Technique / Priority** — Command contract · Error guessing · P2
- **Traces** — [FR-005](requirements.md#fr-005)
- **Preconditions** — `reject/v1.json` is a genuine v1 export: top-level `id`, `name`, `order`, `requests[]`, no `info`, no `schema`
- **Input** — `open_collection(path)`
- **Expected** — the version is *detected* from the shape and reported — `UnsupportedSchema{ found: "v1" }` — rather than the generic `NotACollection{ missing_field: "info" }`. This is the single most likely real-world rejection after v2.0 and the user must be told to re-export, not told their file is not a collection.
- **Mock** — none
- **Note / risk** — if the implementation cannot distinguish v1 from junk, `NotACollection` is acceptable **only** if its copy mentions v1; raise it to the owner rather than silently accepting.

### TC-CMD-012 — a v3 YAML collection
- **Level / Technique / Priority** — Command contract · Error path · P2
- **Traces** — [FR-005](requirements.md#fr-005), [FR-006](requirements.md#fr-006)
- **Preconditions** — `reject/v3.yaml`
- **Input** — `open_collection(path)`
- **Expected** — `Err(AppError::NotJson{ line: 1, .. })` (YAML is not JSON), and the S7 copy for a `.yaml`/`.yml` path adds "minim reads v2.1 JSON only; Newman does not run v3 YAML". Assert the error, and assert the UI-side branch in TC-COMP-027.
- **Mock** — none

### TC-CMD-013 — the schema gate runs before the item tree is deserialized
- **Level / Technique / Priority** — Command contract · Error guessing · P1
- **Traces** — [FR-004](requirements.md#fr-004)
- **Preconditions** — `reject/v2.0-with-broken-item.json`: v2.0 schema **and** an `item[]` entry that cannot deserialize under any variant
- **Input** — `open_collection(path)`
- **Expected** — `UnsupportedSchema`, not a tree deserialization error. Complements TC-U-015 by also asserting the *timing*: with a 64 MiB v2.0 file, the call returns in < 200 ms — it did not walk 64 MiB before rejecting.
- **Mock** — generated large v2.0 fixture

### TC-CMD-014 — every `AppError` variant serializes to `{kind, detail}`
- **Level / Technique / Priority** — Command contract · EP (table-driven) · P1
- **Traces** — [design.md §AppError wire shape](design.md#apperror-wire-shape), [FR-005](requirements.md#fr-005)–[FR-007](requirements.md#fr-007)
- **Preconditions** — none
- **Input** — construct all nine variants from §1.4
- **Expected** — each serializes to exactly two top-level keys, `kind` (camelCase name) and `detail` (an object, possibly empty); no variant serializes to a bare string; every field the UI copy needs is present (`found`/`expected`, `line`/`column`, `missing_field`, `size_bytes`/`limit_bytes`, `path`, `node_id`, `index`); a `specta` export of `AppError` lists all nine in `bindings.ts`
- **Mock** — none

### TC-CMD-015 — a successful open pushes to recents; a failed open does not
- **Level / Technique / Priority** — Command contract · Decision table · P2
- **Traces** — [FR-041](requirements.md#fr-041)
- **Preconditions** — empty store
- **Input** — `open_collection(good)` then `open_collection(reject/v2.0.json)`
- **Expected** — recents holds exactly one entry, the good one; a rejected file is never recorded (the user must not accumulate a recents list of files that cannot open)
- **Mock** — temp store dir

### TC-CMD-016 — two `open_collection` calls in flight leave consistent state
- **Level / Technique / Priority** — Command contract · Concurrency · P2
- **Traces** — [FR-008](requirements.md#fr-008), [design.md §Components](design.md#components)
- **Preconditions** — collections A and B
- **Input** — spawn `open_collection(A)` and `open_collection(B)` concurrently; await both
- **Expected** — both return `Ok`; `AppState` holds exactly one of them, consistently (tree, arena and `source_path` all from the same file — never A's tree with B's path); no deadlock on the `Mutex`; the test completes within 5 s
- **Mock** — temp store dir

### TC-CMD-017 — `get_node_detail` on a request leaf returns the full `RequestDetail`
- **Level / Technique / Priority** — Command contract · Use case · P1
- **Traces** — [FR-023](requirements.md#fr-023)–[FR-034](requirements.md#fr-034), [UC-003](requirements.md#uc-003)
- **Preconditions** — `torture.json` open
- **Input** — `get_node_detail("<id of a fully populated request>")`
- **Expected** — `Ok(NodeDetail::Request)` with `kind == "request"` and every field populated: `folder_path`, `description`, `method`, `url.raw` plus `url.query` and `url.path_variables`, `headers`, `body`, `auth` (with `source`), `events`, `behavior`, `examples` (summaries only, **no bodies**), `variable_refs`, `extra`
- **Mock** — none

### TC-CMD-018 — `get_node_detail` on a folder returns `FolderDetail`
- **Level / Technique / Priority** — Command contract · EP · P2
- **Traces** — [FR-039](requirements.md#fr-039), ux S3
- **Preconditions** — `torture.json` open
- **Input** — `get_node_detail("<folder id>")`
- **Expected** — `Ok(NodeDetail::Folder)` with `kind == "folder"`, its own `auth`, `events`, `variable` and `description`, and its child counts; the serde tag lets the frontend switch exhaustively
- **Mock** — none

### TC-CMD-019 — the collection root is addressable as a node
- **Level / Technique / Priority** — Command contract · Use case · P2
- **Traces** — [FR-038](requirements.md#fr-038), [FR-040](requirements.md#fr-040), ux S4
- **Preconditions** — `real/small.json` open
- **Input** — the root node id used by the tree's top row (`""`, `"root"` or whatever the arena assigns — pin it)
- **Expected** — S4's data is reachable: `info` metadata, `variable[]`, collection auth, collection events. If the root is *not* an arena node, `CollectionOverview` must already carry all of it and the tree's root row must render from the overview — assert whichever design is chosen, and that S4 has a data source at all.
- **Mock** — none

### TC-CMD-020 — malformed and out-of-range `node_id` values
- **Level / Technique / Priority** — Command contract · BVA + error guessing · P1
- **Traces** — [FR-008](requirements.md#fr-008)
- **Preconditions** — `real/small.json` open
- **Input** — `""`, `"abc"`, `"-1"`, `"0."`, `".0"`, `"0..1"`, `"99.99"`, `"0.0.0.0.0.0"`, a 10 000-character id, `"0\u0000"`
- **Expected** — `Err(AppError::UnknownNode{ node_id })` for every one; no panic, no index-out-of-bounds, no unbounded allocation; the echoed `node_id` is the input verbatim
- **Mock** — none

### TC-CMD-021 — `get_node_detail` with no collection open
- **Level / Technique / Priority** — Command contract · State precondition · P1
- **Traces** — [FR-008](requirements.md#fr-008)
- **Preconditions** — `AppState` holds `None` (fresh, or after `close_collection`)
- **Input** — `get_node_detail("0")`
- **Expected** — `Err(AppError::NoCollectionOpen)` — distinct from `UnknownNode`, so the UI can return to S1 rather than showing a node error
- **Mock** — none

### TC-CMD-022 — `get_node_detail` performs no file I/O
- **Level / Technique / Priority** — Command contract · Error guessing · P1
- **Traces** — [ADR-005](design.md#key-decisions), [NFR-002](requirements.md#nfr-002)
- **Preconditions** — a collection opened from a `TempDir` copy
- **Input** — delete the source file, then `get_node_detail` on three different ids
- **Expected** — all three still return `Ok` with identical content to before the deletion — the arena is authoritative and the command never re-reads or re-parses
- **Mock** — `TempDir`

### TC-CMD-023 — `get_example` happy path
- **Level / Technique / Priority** — Command contract · Use case · P1
- **Traces** — [FR-037](requirements.md#fr-037), [UC-004](requirements.md#uc-004)
- **Preconditions** — a request with 2 examples is open
- **Input** — `get_example(node_id, 0)`
- **Expected** — `Ok(ExampleDetail)` with `name`, `status`, `code`, normalized `headers`, `cookies`, `body` and the preview language; the same call for index 1 returns the second example, proving index-to-example mapping follows document order
- **Mock** — none

### TC-CMD-024 — `get_example` index boundaries
- **Level / Technique / Priority** — Command contract · BVA · P1
- **Traces** — [FR-037](requirements.md#fr-037)
- **Preconditions** — a request with exactly 2 examples
- **Input** — index `0` (ok), `1` (ok), `2` (first invalid), `u32::MAX`
- **Expected** — `Ok` for 0 and 1; `Err(AppError::UnknownExample{ node_id, index })` for 2 and `u32::MAX`; a request with **zero** examples returns `UnknownExample` for index 0
- **Mock** — none

### TC-CMD-025 — `get_example` on a folder node or an unknown node
- **Level / Technique / Priority** — Command contract · Error path · P2
- **Traces** — [FR-008](requirements.md#fr-008)
- **Preconditions** — `torture.json` open
- **Input** — `get_example("<folder id>", 0)`; `get_example("99.99", 0)`
- **Expected** — `Err(AppError::UnknownNode{ .. })` for both — a folder has no examples, and the error names the node rather than the example
- **Mock** — none

### TC-CMD-026 — `get_example` with no collection open
- **Level / Technique / Priority** — Command contract · State precondition · P2
- **Traces** — [FR-008](requirements.md#fr-008)
- **Preconditions** — `AppState` holds `None`
- **Input** — `get_example("0.0", 0)`
- **Expected** — `Err(AppError::NoCollectionOpen)`
- **Mock** — none

### TC-CMD-027 — `reload_collection` picks up on-disk changes and keeps ids for unchanged nodes
- **Level / Technique / Priority** — Command contract · State transition · P1
- **Traces** — [FR-045](requirements.md#fr-045), [FR-016](requirements.md#fr-016)
- **Preconditions** — a collection opened from a `TempDir` copy; one request renamed and one request **appended at the end** on disk
- **Input** — `reload_collection()`
- **Expected** — `Ok(CollectionOverview)` reflecting the rename and the new leaf; ids of all pre-existing nodes are unchanged (positional ids are stable when nothing is *inserted* before them); the new leaf gets the next positional id; `request_count` incremented by 1. A request **inserted at the front** legitimately shifts ids — assert that too, so the frontend's selection-restore logic is written knowing it.
- **Mock** — `TempDir`

### TC-CMD-028 — `reload_collection` when the file has vanished
- **Level / Technique / Priority** — Command contract · Error path · P1
- **Traces** — [FR-045](requirements.md#fr-045), [FR-042](requirements.md#fr-042)
- **Preconditions** — a collection open; its source file deleted
- **Input** — `reload_collection()`
- **Expected** — `Err(AppError::FileNotFound{ path })` **and** `AppState` still holds the previously loaded collection — a failed reload must not blank the user's view. A subsequent `get_node_detail` still returns `Ok`.
- **Mock** — `TempDir`
- **Note / risk** — design.md says only "`FileNotFound` if it vanished"; the state-retention half is this suite's reading of [FR-045](requirements.md#fr-045) ("replacing the in-memory model" happens only on success). Confirm with the owner.

### TC-CMD-029 — `reload_collection` with nothing open
- **Level / Technique / Priority** — Command contract · State precondition · P2
- **Traces** — [FR-008](requirements.md#fr-008)
- **Preconditions** — `AppState` holds `None`
- **Input** — `reload_collection()`
- **Expected** — `Err(AppError::NoCollectionOpen)`; no file access
- **Mock** — none

### TC-CMD-030 — `close_collection` is idempotent
- **Level / Technique / Priority** — Command contract · State transition · P2
- **Traces** — [FR-044](requirements.md#fr-044)
- **Preconditions** — a collection open
- **Input** — `close_collection()` twice, then `get_node_detail("0")`
- **Expected** — `Ok(())` both times (the second is a no-op, not an error); `get_node_detail` then returns `NoCollectionOpen`; recents are **not** cleared by closing
- **Mock** — temp store dir

### TC-CMD-031 — `list_recents` returns MRU order and holds at least 10
- **Level / Technique / Priority** — Command contract · BVA · P2
- **Traces** — [FR-041](requirements.md#fr-041)
- **Preconditions** — 12 distinct collections opened in a known order
- **Input** — `list_recents()`
- **Expected** — 12 entries, newest first, each with `path`, `name`, `opened_at`, `request_count`; ≥ 10 is satisfied and the cap of 20 has not yet engaged (the cap itself is TC-U-044)
- **Mock** — temp store dir

### TC-CMD-032 — `forget_recent` for a path that is not in the list
- **Level / Technique / Priority** — Command contract · Error guessing · P3
- **Traces** — [FR-042](requirements.md#fr-042)
- **Preconditions** — recents `[A, B]`
- **Input** — `forget_recent("/not/in/list.json")`
- **Expected** — `Ok(())`, list unchanged — removal is idempotent, because the UI calls it from a row that may already have been removed in another window state
- **Mock** — temp store dir

### TC-CMD-033 — preferences reject an out-of-domain theme
- **Level / Technique / Priority** — Command contract · EP · P2
- **Traces** — [FR-043](requirements.md#fr-043), [NFR-015](requirements.md#nfr-015)
- **Preconditions** — fresh store
- **Input** — `set_preferences({theme: "solarized"})` invoked as raw IPC (bypassing the generated types)
- **Expected** — a typed deserialization rejection, and `get_preferences()` still returns the previous valid value; the store is never left holding an unparseable theme. In TypeScript the same call is a compile error — assert with `expect-type`/`tsd`.
- **Mock** — temp store dir

### TC-CMD-034 — a store failure surfaces as a typed error, not a panic
- **Level / Technique / Priority** — Command contract · Error guessing · P2
- **Traces** — [FR-008](requirements.md#fr-008)
- **Preconditions** — the store directory is made read-only after the app starts
- **Input** — `open_collection(good)` (which pushes to recents) and `set_preferences({theme:"dark"})`
- **Expected** — neither panics. `open_collection` still returns `Ok` with the collection (failing to record a recent must not fail the open); `set_preferences` returns a typed `Err`. See §10 gap G-1: no `AppError` variant is declared for store failure.
- **Mock** — read-only `TempDir`

### TC-CMD-035 — opening a collection never writes to the collection file
- **Level / Technique / Priority** — Command contract · Invariant · P1
- **Traces** — [FR-017](requirements.md#fr-017), [NFR-008](requirements.md#nfr-008)
- **Preconditions** — `torture.json` copied into a `TempDir`; SHA-256 and mtime recorded
- **Input** — `open_collection` → `get_node_detail` on every node → `get_example` on every example → `reload_collection` → `close_collection`
- **Expected** — the file's SHA-256 and mtime are unchanged; no sibling file was created in that directory; `store.json` contains no collection content beyond `path`, `name`, `opened_at`, `request_count`
- **Mock** — `TempDir`, hash helper

---

## 7. Component cases — `TC-COMP-*`

Vitest + React Testing Library + jsdom.

**Standing mock/harness for this section** — the generated command layer is mocked
(`vi.mock('@/bindings')`) and fed fixture DTOs derived from `torture.json` and `real/small.json`;
`window.matchMedia` is stubbed; Shiki is stubbed to a synchronous identity highlighter unless the
case is about highlighting; `@tanstack/react-virtual` runs with a forced container height so a
deterministic window of rows is rendered. No Tauri runtime, no filesystem.

### TC-COMP-001 — the tree renders document order and depth
- **Level / Technique / Priority** — Component · EP · P1
- **Traces** — [FR-018](requirements.md#fr-018)
- **Preconditions** — overview DTO with order `[request "zebra", folder "alpha", request "Mango"]`, all folders expanded
- **Input** — render `<CollectionTree/>`
- **Expected** — rows appear in that exact order; each row's left padding equals `depth * 0.75rem + 0.5rem` and rows are **not** nested DOM elements (a flat list, for virtualization)
- **Mock** — mocked bindings

### TC-COMP-002 — method chips: all six color classes and the verb text
- **Level / Technique / Priority** — Component · EP · P1
- **Traces** — [FR-019](requirements.md#fr-019), [NFR-011](requirements.md#nfr-011)
- **Preconditions** — leaves with `GET POST PUT PATCH DELETE HEAD OPTIONS PROPFIND` and lowercase `"get"`
- **Input** — render the tree
- **Expected** — classes `text-method-get/post/put/patch/delete` for the first five; `text-method-other` for `HEAD`, `OPTIONS`, `PROPFIND`; lowercase `"get"` is displayed uppercased and mapped to the `get` token; **every** chip also contains the verb as text, so color is never the sole signal
- **Mock** — mocked bindings

### TC-COMP-003 — expand-all and collapse-all
- **Level / Technique / Priority** — Component · State transition · P2
- **Traces** — [FR-020](requirements.md#fr-020)
- **Preconditions** — 3-level tree, all collapsed
- **Input** — click `⊞ all`, then `⊟ none`
- **Expected** — after expand-all every folder row has `aria-expanded="true"` and every leaf is rendered; after collapse-all only the root-level rows remain and selection is retained (the selected node's row may be hidden, but the store still holds its id)
- **Mock** — mocked bindings

### TC-COMP-004 — selecting a leaf fetches its detail once and re-uses the cache
- **Level / Technique / Priority** — Component · State transition · P1
- **Traces** — [FR-015](requirements.md#fr-015), [ADR-005](design.md#key-decisions)
- **Preconditions** — TanStack Query with a fresh client
- **Input** — click leaf A, click leaf B, click leaf A again
- **Expected** — `get_node_detail` called exactly twice (A, B) — the third click is served from the cache keyed by `NodeId`; the detail pane shows A's breadcrumb, method and URL each time
- **Mock** — mocked bindings with a call counter

### TC-COMP-005 — keyboard: `←` collapses then ascends, `Home`/`End` jump
- **Level / Technique / Priority** — Component · State transition · P1
- **Traces** — [NFR-011](requirements.md#nfr-011)
- **Preconditions** — focus on a leaf inside an expanded folder
- **Input** — `←`, `←`, `Home`, `End`
- **Expected** — first `←` moves focus to the parent folder (the leaf has no children to collapse); second `←` collapses that folder; `Home` focuses the first visible row, `End` the last; the tree keeps exactly **one** tab stop throughout (roving `tabindex`)
- **Mock** — mocked bindings

### TC-COMP-006 — typeahead jumps to the next row starting with the typed letters
- **Level / Technique / Priority** — Component · Error guessing · P2
- **Traces** — [NFR-011](requirements.md#nfr-011)
- **Preconditions** — visible rows `Auth`, `Invoices`, `Inbox`, `Reports`
- **Input** — type `i`, then `i` again quickly, then `in` after a pause
- **Expected** — first `i` focuses `Invoices`; the quick second `i` cycles to `Inbox`; after the typeahead buffer times out, `in` focuses `Inbox`; typing never leaks into the filter input
- **Mock** — fake timers

### TC-COMP-007 — filter result count and the no-results state
- **Level / Technique / Priority** — Component · BVA · P1
- **Traces** — [FR-021](requirements.md#fr-021), ux S6
- **Preconditions** — 214-leaf overview, 6 matching `invoice`
- **Input** — type `invoice`; then `zzz`; then clear
- **Expected** — `6 of 214` shown while filtering; `0 of 214` plus an explicit no-results message (not a blank sidebar) for `zzz`; the count disappears entirely when the filter is cleared; the `×` clear affordance appears only when the input is non-empty
- **Mock** — mocked bindings

### TC-COMP-008 — matches are highlighted in place; ancestors are dimmed
- **Level / Technique / Priority** — Component · EP · P2
- **Traces** — [FR-021](requirements.md#fr-021), ux S6
- **Preconditions** — leaf `"Get invoice"` under `Invoices/Drafts`
- **Input** — filter `voi`
- **Expected** — the substring `voi` inside the leaf name is wrapped in a highlight element; the two ancestor folder rows carry the dimmed class and no highlight; the ancestor rows are still selectable (they are real nodes) but are not counted in `6 of 214`
- **Mock** — mocked bindings

### TC-COMP-009 — tab badges follow the §3.2 decision table
- **Level / Technique / Priority** — Component · Decision table · P1
- **Traces** — [FR-036](requirements.md#fr-036), ux S2
- **Preconditions** — six fixture `RequestDetail`s, one per table row
- **Input** — render the tab shell for each
- **Expected** — badges read `2`, `—`, `3`, `raw`, `⊥`, `bearer`, `—` exactly as tabulated; a disabled header still counts toward the Headers badge (it exists in the file); the badge row is present even when every badge is `—`
- **Mock** — fixture DTOs

### TC-COMP-010 — a request with every section empty opens on Params showing `(none)`
- **Level / Technique / Priority** — Component · BVA · P2
- **Traces** — [FR-036](requirements.md#fr-036)
- **Preconditions** — `RequestDetail` with no params, headers, body, auth, scripts, examples
- **Input** — render the detail pane
- **Expected** — the Params tab is active (the "first non-empty" rule degrades to "first") and its panel renders the literal `(none)`; no tab is hidden and no panel is blank
- **Mock** — fixture DTO

### TC-COMP-011 — the breadcrumb truncates the middle past four levels
- **Level / Technique / Priority** — Component · BVA · P3
- **Traces** — [FR-023](requirements.md#fr-023)
- **Preconditions** — `folder_path = ["L1","L2","L3","L4","L5"]`
- **Input** — render the detail header
- **Expected** — first and last segments are visible with an ellipsis between; the full path is available via `title`/tooltip; with ≤ 4 levels nothing is truncated
- **Mock** — fixture DTO

### TC-COMP-012 — the detail header is sticky and only the panel scrolls
- **Level / Technique / Priority** — Component · Layout · P3
- **Traces** — ux S2
- **Preconditions** — a long body
- **Input** — render the detail pane
- **Expected** — the header element carries `sticky top-0` and the panel container carries the scroll container class; asserted structurally in jsdom, and visually in TC-E2E-001
- **Mock** — fixture DTO

### TC-COMP-013 — a disabled row carries three independent signals
- **Level / Technique / Priority** — Component · EP · P1
- **Traces** — [FR-024](requirements.md#fr-024), [FR-025](requirements.md#fr-025), [NFR-011](requirements.md#nfr-011)
- **Preconditions** — one disabled query param, one disabled header, one disabled formdata field, one disabled variable
- **Input** — render each table
- **Expected** — every disabled row has line-through **and** muted color **and** an accessible text label `disabled` (readable by a screen reader, not conveyed by styling alone); the row is never hidden
- **Mock** — fixture DTO

### TC-COMP-014 — each body mode renders its own structure
- **Level / Technique / Priority** — Component · EP · P1
- **Traces** — [FR-026](requirements.md#fr-026), [FR-028](requirements.md#fr-028), [FR-029](requirements.md#fr-029)
- **Preconditions** — one `BodyView` fixture per mode
- **Input** — render `<BodyView/>` five times
- **Expected** — `Raw` → a code block with the language label; `Urlencoded` → a key/value table including disabled rows; `Formdata` → a table with a TYPE column distinguishing `text` from `file` and showing the file path (`./inv.pdf`); `File` → the `src` path, and an explicit "no path recorded" when `src` is null; `Graphql` → two separately labelled regions, Query and Variables
- **Mock** — fixture DTOs

### TC-COMP-015 — raw body language mapping and the pre-highlight state
- **Level / Technique / Priority** — Component · EP · P2
- **Traces** — [FR-027](requirements.md#fr-027), [ADR-011](design.md#key-decisions)
- **Preconditions** — real (unstubbed) lazy Shiki loader
- **Input** — bodies declaring `json`, `xml`, `html`, `javascript`, `graphql`, `text`, and `brainfuck`
- **Expected** — the first six request the matching grammar; `brainfuck` falls back to plain text without attempting a network or dynamic import failure; before the grammar resolves, the body is rendered as **plain text** (never blank, never a spinner over the content)
- **Mock** — lazy-import spy

### TC-COMP-016 — the inherited-auth chip names its source, including "none"
- **Level / Technique / Priority** — Component · Decision table (§3.1) · P1
- **Traces** — [FR-030](requirements.md#fr-030)
- **Preconditions** — four `AuthView` fixtures: `Own`, `Folder("Auth")`, `Collection`, `None`
- **Input** — render `<AuthView/>` for each
- **Expected** — `Own` → no inheritance chip; `Folder("Auth")` → `from folder "Auth"`; `Collection` → `from collection`; `None` → the Auth panel renders `(none)` with no chip. An `Own` auth of type `noauth` renders the type `noauth` explicitly — not `(none)`, because the file *does* say something.
- **Mock** — fixture DTOs

### TC-COMP-017 — masking is per value and only for flagged attributes
- **Level / Technique / Priority** — Component · State transition · P1
- **Traces** — [FR-032](requirements.md#fr-032), [ADR-016](design.md#key-decisions)
- **Preconditions** — an `awsv4` auth with `accessKey` (sensitive), `secretKey` (sensitive), `region` (not sensitive)
- **Input** — render; click reveal on `secretKey`
- **Expected** — `region` is shown in clear with no reveal button; both keys start masked (the literal characters are absent from the DOM text, not merely CSS-hidden); revealing `secretKey` does **not** reveal `accessKey`; switching tabs and returning re-masks (complements TC-U-077, which covers switching *request*)
- **Mock** — fixture DTO

### TC-COMP-018 — scripts are labelled, read-only, and carry the trust notice
- **Level / Technique / Priority** — Component · EP · P1
- **Traces** — [FR-033](requirements.md#fr-033), [NFR-009](requirements.md#nfr-009)
- **Preconditions** — `events = [{listen:"prerequest"},{listen:"test"},{listen:"weirdEvent"}]`
- **Input** — render `<ScriptsView/>`
- **Expected** — three labelled sections (`Pre-request`, `Test`, and the unknown listener shown verbatim); no `<textarea>`, no `contenteditable`, no input of any kind; the notice "Scripts are displayed only. minim never runs them." is present and is not dismissible
- **Mock** — fixture DTO

### TC-COMP-019 — `protocolProfileBehavior` is displayed when present
- **Level / Technique / Priority** — Component · EP · P3
- **Traces** — [FR-034](requirements.md#fr-034)
- **Preconditions** — `behavior = [{key:"followRedirects",value:"false"},{key:"strictSSL",value:"true"}]`
- **Input** — render the detail pane
- **Expected** — both entries render as key/value rows; a request with no behavior shows the section's `(none)` state rather than omitting it
- **Mock** — fixture DTO

### TC-COMP-020 — unknown fields are surfaced, not swallowed
- **Level / Technique / Priority** — Component · EP · P2
- **Traces** — [FR-009](requirements.md#fr-009), [ADR-004](design.md#key-decisions)
- **Preconditions** — `extra = [{key:"_postman_isSubFolder",value:"true"},{key:"futureField",value:"{…}"}]`
- **Input** — render the detail pane
- **Expected** — both are visible (a dedicated section or the Info panel); their values are rendered as text; the section is absent or `(none)` when `extra` is empty
- **Mock** — fixture DTO

### TC-COMP-021 — the examples panel: selection, and a failing `get_example`
- **Level / Technique / Priority** — Component · State transition + error path · P2
- **Traces** — [FR-037](requirements.md#fr-037), [FR-008](requirements.md#fr-008)
- **Preconditions** — 2 example summaries; `get_example` mocked to resolve for index 0 and reject with `UnknownExample` for index 1
- **Input** — open the Examples tab, select example 0, then example 1
- **Expected** — the list shows both with status text and code in document order; selecting 0 renders status, headers, cookies and body; selecting 1 renders an inline error inside the panel (not a modal, not a crashed pane) and the list stays usable
- **Mock** — mocked bindings

### TC-COMP-022 — variable chips render in every value surface
- **Level / Technique / Priority** — Component · EP · P2
- **Traces** — [FR-035](requirements.md#fr-035)
- **Preconditions** — `{{baseUrl}}` (defined) in the URL, `{{apiKey}}` (undefined) in a header value, `{{userId}}` (defined) in a raw body and in a graphql variables block
- **Input** — render the detail pane across tabs
- **Expected** — every occurrence is a chip, not plain text; the undefined one is visually distinguished (dashed border) with the tooltip "not defined in this collection"; chips inside a Shiki-highlighted code block either render as chips or, if that conflicts with highlighting, the code block is exempt **by an explicit decision** asserted here rather than by accident
- **Mock** — fixture DTO

### TC-COMP-023 — collection detail (S4) renders info, variables and USED
- **Level / Technique / Priority** — Component · Use case · P2
- **Traces** — [FR-038](requirements.md#fr-038), [FR-040](requirements.md#fr-040), [UC-006](requirements.md#uc-006)
- **Preconditions** — overview with 3 variables, one disabled, USED counts `118 / 3 / 0`
- **Input** — select the root node
- **Expected** — name, schema URL, version, request and folder counts; the variables table shows KEY, VALUE, TYPE, USED and the disabled row struck through; a variable with an empty value renders `—`, not an empty cell
- **Mock** — fixture DTO

### TC-COMP-024 — folder detail (S3)
- **Level / Technique / Priority** — Component · Use case · P2
- **Traces** — [FR-039](requirements.md#fr-039)
- **Preconditions** — `FolderDetail` with one pre-request script, folder auth `basic`, one folder variable
- **Input** — select the folder node
- **Expected** — the folder's own scripts, auth and variables are shown, labelled as the folder's; a folder with none of them shows `(none)` per section; the pane never shows a request's tabs (Params/Body/Examples) for a folder
- **Mock** — fixture DTO

### TC-COMP-025 — `FileTooLarge` dialog copy
- **Level / Technique / Priority** — Component · Error path · P2
- **Traces** — [ADR-015](design.md#key-decisions), ux S7
- **Preconditions** — error `{kind:"fileTooLarge", detail:{sizeBytes:851443712, limitBytes:67108864}}`
- **Input** — render the error dialog
- **Expected** — body reads "This file is 812 MB. minim reads collections up to 64 MB." — both numbers humanised from the payload, not hardcoded; the filename is shown in monospace
- **Mock** — none

### TC-COMP-026 — `FileNotFound` from a recents row offers removal
- **Level / Technique / Priority** — Component · Error path · P1
- **Traces** — [FR-042](requirements.md#fr-042), ux S1/S7
- **Preconditions** — recents list rendered; row B's file is missing; `open_collection` mocked to reject with `fileNotFound`
- **Input** — click row B
- **Expected** — the dialog says the file no longer exists **and** offers `Remove from recents`; clicking it calls `forget_recent("/path/B.json")` exactly once and the row disappears without a reload; dismissing instead leaves the row in place (complements TC-U-060, which covers the offer, by asserting the wiring and the dismiss branch)
- **Mock** — mocked bindings

### TC-COMP-027 — a `.yaml` path gets v3-specific copy
- **Level / Technique / Priority** — Component · Decision table · P3
- **Traces** — [FR-005](requirements.md#fr-005)
- **Preconditions** — error `notJson` with `path` ending `.yaml`
- **Input** — render the error dialog
- **Expected** — the copy mentions that v3 YAML is not supported and points at v2.1 JSON, instead of only "this file isn't valid JSON"; for a `.json` path the generic copy is used
- **Mock** — none

### TC-COMP-028 — loading state and the completion announcement
- **Level / Technique / Priority** — Component · State transition · P2
- **Traces** — ux S8, [NFR-011](requirements.md#nfr-011)
- **Preconditions** — `open_collection` mocked with a controllable deferred promise; fake timers
- **Input** — start the open; advance 399 ms; advance to 401 ms; resolve
- **Expected** — skeleton rows render immediately (no spinner); `Cancel` is absent at 399 ms and present at 401 ms (complements TC-U-086 by also asserting the skeleton is there from t=0); on resolve an `aria-live="polite"` region announces `Billing API opened, 214 requests`
- **Mock** — deferred promise, fake timers

### TC-COMP-029 — the warnings banner lists every warning kind with its node
- **Level / Technique / Priority** — Component · EP · P2
- **Traces** — [FR-009](requirements.md#fr-009), ux S10
- **Preconditions** — one warning of each kind: `UnknownAuthType`, `UnknownBodyMode`, `MalformedRawHeaderLine`, `ItemNeitherGroupNorRequest`, `DuplicateVariableKey`
- **Input** — render the banner and expand it
- **Expected** — the collapsed banner reads `Opened with 5 notes`; expanding lists five entries, each with human-readable copy (folder/request wording, not `ItemGroup`/`NodeId`) and the node's folder path; a warning with no `node_id` still renders
- **Mock** — fixture DTO

### TC-COMP-030 — the status bar summarises the collection and its warnings
- **Level / Technique / Priority** — Component · EP · P3
- **Traces** — ux S2/S10, [FR-040](requirements.md#fr-040)
- **Preconditions** — overview with 214 requests, 18 folders, 1.2 MB, 2 warnings
- **Input** — render the shell
- **Expected** — `214 requests · 18 folders · 1.2 MB · v2.1` and a warning count in the amber class; the warning count **persists after the banner is dismissed** (complements TC-U-088 by asserting the status-bar rendering itself)
- **Mock** — fixture DTO

### TC-COMP-031 — drop-target rules
- **Level / Technique / Priority** — Component · Decision table · P1
- **Traces** — [FR-002](requirements.md#fr-002), ux heuristic 5
- **Preconditions** — the shell rendered
- **Input** — drag with (a) one `.json`, (b) two `.json`, (c) a directory entry, (d) one `.txt`, (e) a drag with no files (text selection)
- **Expected** — the overlay appears for (a)–(d) but **not** (e); dropping (a) calls `open_collection` once; (b), (c) and (d) show an inline message and call nothing — the rejection happens before any read (complements TC-U-058/059 by adding the folder, non-json and no-files branches); the overlay covers the whole window, not a bordered sub-region
- **Mock** — synthetic `DataTransfer`

### TC-COMP-032 — the theme toggle is three-way and follows the system live
- **Level / Technique / Priority** — Component · State transition · P2
- **Traces** — [FR-043](requirements.md#fr-043), [UC-009](requirements.md#uc-009)
- **Preconditions** — `matchMedia` stub that can fire a change event; stored pref `system`
- **Input** — fire a system change to dark; choose `light`; fire another system change to light→dark
- **Expected** — with `system` the root class follows the media query both times; after choosing `light` the root stays light and later system changes are ignored; the menu shows the checked state of the *chosen* mode, not the resolved one (complements TC-U-056/057 by covering the live change and the checked-state rendering)
- **Mock** — `matchMedia` stub, mocked store

---

## 8. End-to-end cases — `TC-E2E-*`

**Harness — `tauri-driver` + WebdriverIO, not Playwright** ([ADR-012](design.md#key-decisions)).
Playwright cannot attach to WKWebView/WebView2. Every case below is written to be expressible in
WebdriverIO: it drives the real window through `$`/`$$` selectors, real keystrokes and real
`tauri-driver` sessions, and it never stubs a command.

**Standing harness** — a debug build launched by `tauri-driver`; `HOME`/`APPDATA` pointed at a
fresh temp dir so the store starts empty; fixture files copied into a temp dir per spec; the native
file dialog is **not** driven through the OS — the spec calls `open_collection` through the app's
own IPC (or a `--open <path>` debug argument) for path delivery, because WebDriver cannot script a
native dialog. The dialog itself is verified manually once per release and noted in the test report.

### TC-E2E-001 — smoke: open → tree → select → detail
- **Level / Technique / Priority** — E2E · Use case · P1
- **Traces** — [UC-001](requirements.md#uc-001)–[UC-003](requirements.md#uc-003), [FR-023](requirements.md#fr-023)
- **Preconditions** — app at S1; `real/small.json` in the temp dir
- **Input** — open the file; click the folder `Auth`; click the leaf `Login`
- **Expected** — the tree shows 3 folders; the detail header shows breadcrumb `Auth › Login`, a `POST` chip, the URL, and a badge row; scrolling the panel leaves the header pinned; the status bar reads the right counts
- **Mock** — none

### TC-E2E-002 — open by drag-and-drop
- **Level / Technique / Priority** — E2E · Use case · P2
- **Traces** — [FR-002](requirements.md#fr-002)
- **Preconditions** — app at S1
- **Input** — dispatch a real `drop` event carrying one `.json` file path onto the window
- **Expected** — the same S2 state as TC-E2E-001; the drop path goes through the identical validation (drop a `v2.0` file and the S7 dialog appears)
- **Mock** — none

### TC-E2E-003 — v2.0 rejection, and "Try another file"
- **Level / Technique / Priority** — E2E · Error path · P1
- **Traces** — [FR-005](requirements.md#fr-005), [UC-007](requirements.md#uc-007), ux S7
- **Preconditions** — app at S1
- **Input** — open `reject/v2.0.json`; read the dialog; click `Try another file`; then open a good file
- **Expected** — the dialog names v2.0 and v2.1 in the `found`/`expected` rows and shows the `Export → Collection v2.1` remedy; `Try another file` reopens the picker; the subsequent good open reaches S2; the rejected file is **not** in recents
- **Mock** — none

### TC-E2E-004 — malformed JSON rejection shows the position
- **Level / Technique / Priority** — E2E · Error path · P1
- **Traces** — [FR-006](requirements.md#fr-006), [FR-007](requirements.md#fr-007)
- **Preconditions** — app at S1
- **Input** — open `reject/trailing-comma.json`; then `Dismiss`
- **Expected** — "This file isn't valid JSON." plus `line 418, column 12`; `Dismiss` returns to S1 with the app fully usable
- **Mock** — none

### TC-E2E-005 — not-a-collection rejection reads differently from bad JSON
- **Level / Technique / Priority** — E2E · Error path · P2
- **Traces** — [FR-006](requirements.md#fr-006)
- **Preconditions** — app at S1
- **Input** — open `reject/not-a-collection.json`
- **Expected** — "This is valid JSON, but not a Postman collection." with `Missing required field: item`; the copy differs from TC-E2E-004's
- **Mock** — none

### TC-E2E-006 — oversized file rejection
- **Level / Technique / Priority** — E2E · BVA · P2
- **Traces** — [ADR-015](design.md#key-decisions)
- **Preconditions** — `edge/over-64mib.json` present
- **Input** — open it
- **Expected** — the size dialog appears in under 1 s and the process RSS does not spike by more than ~10 MB during the attempt
- **Mock** — none

### TC-E2E-007 — recents survive a restart and reopen
- **Level / Technique / Priority** — E2E · State transition · P1
- **Traces** — [FR-041](requirements.md#fr-041), [UC-008](requirements.md#uc-008)
- **Preconditions** — temp config dir; three collections opened in a known order
- **Input** — quit the app; relaunch; read the recents list; click the second row
- **Expected** — three rows, MRU order preserved across the restart, each with its request count; clicking opens that collection into S2
- **Mock** — none

### TC-E2E-008 — a recents entry whose file is gone
- **Level / Technique / Priority** — E2E · Error path · P1
- **Traces** — [FR-042](requirements.md#fr-042)
- **Preconditions** — a collection in recents; its file deleted while the app is closed
- **Input** — relaunch; click that row; click `Remove from recents`
- **Expected** — the app says the file is gone (it does not silently do nothing and does not crash); the row is removed and stays removed after another restart
- **Mock** — none

### TC-E2E-009 — theme override persists across restart
- **Level / Technique / Priority** — E2E · State transition · P2
- **Traces** — [FR-043](requirements.md#fr-043), [UC-009](requirements.md#uc-009)
- **Preconditions** — OS in light mode
- **Input** — launch (expect light); choose `dark`; quit; relaunch
- **Expected** — the app launches in dark with the `dark` option checked, while the OS is still light; switching back to `system` restores light immediately
- **Mock** — none

### TC-E2E-010 — filter, select a result, breadcrumb matches the real folder path
- **Level / Technique / Priority** — E2E · Use case · P1
- **Traces** — [FR-021](requirements.md#fr-021), [FR-015](requirements.md#fr-015), [UC-005](requirements.md#uc-005)
- **Preconditions** — the 2 000-leaf generated fixture open
- **Input** — `⌘F`; type `invoice`; press `↓` then `Enter` on a deep result; clear the filter with `Esc`
- **Expected** — the count line appears, the result's breadcrumb names its true ancestors, and clearing the filter restores the pre-filter expansion state with the selected node still selected and scrolled into view
- **Mock** — none

### TC-E2E-011 — reload picks up an on-disk edit and keeps the selection
- **Level / Technique / Priority** — E2E · State transition · P1
- **Traces** — [FR-045](requirements.md#fr-045)
- **Preconditions** — a collection open from the temp dir, a leaf selected
- **Input** — rewrite the file on disk (rename another request, append a new one); press `⌘R`
- **Expected** — the tree shows the rename and the new leaf; the previously selected node is still selected and its detail matches the new file content; no S1 flash
- **Mock** — none

### TC-E2E-012 — close returns to the empty shell
- **Level / Technique / Priority** — E2E · State transition · P2
- **Traces** — [FR-044](requirements.md#fr-044)
- **Preconditions** — a collection open
- **Input** — `⌘W` (and, in a second run, the `✕` button)
- **Expected** — S1 with the open action and a recents list that now contains the just-closed collection at the top; the window does **not** close
- **Mock** — none

### TC-E2E-013 — examples journey
- **Level / Technique / Priority** — E2E · Use case · P2
- **Traces** — [FR-037](requirements.md#fr-037), [UC-004](requirements.md#uc-004)
- **Preconditions** — `torture.json` open
- **Input** — select a request with 2 examples; open the Examples tab; select each example
- **Expected** — status text and code for each; headers, cookies and body render; switching between examples does not leak the previous body
- **Mock** — none

### TC-E2E-014 — collection-level context
- **Level / Technique / Priority** — E2E · Use case · P2
- **Traces** — [FR-038](requirements.md#fr-038)–[FR-040](requirements.md#fr-040), [UC-006](requirements.md#uc-006)
- **Preconditions** — `real/small.json` open
- **Input** — select the root row; read Variables, Auth, Scripts, Info; then select a request that inherits the collection auth
- **Expected** — the root pane shows `info` metadata and variables; the request pane's auth chip reads `from collection` and shows the same type — the inheritance story is consistent between the two screens
- **Mock** — none

### TC-E2E-015 — keyboard-only journey
- **Level / Technique / Priority** — E2E · Use case · P1
- **Traces** — [NFR-011](requirements.md#nfr-011)
- **Preconditions** — app at S1, a collection in recents
- **Input** — with no mouse events at all: `Tab` to the recents row, `Enter`; `⌘F`, type, `Esc`; `Tab` to the tree, `↓ → ↓ Enter`; `Tab` to the tabs, `→ →`; `Tab` into the panel
- **Expected** — every step is reachable and the focus ring is visible at every stop; the tree is a single tab stop; nothing is reachable only by hover (the recents `×` is focusable); the journey ends with a request detail visible
- **Mock** — none

### TC-E2E-016 — warnings banner lifecycle
- **Level / Technique / Priority** — E2E · State transition · P2
- **Traces** — [FR-009](requirements.md#fr-009), ux S10
- **Preconditions** — `torture.json` (contains an unknown auth type and a malformed raw header line)
- **Input** — open it; expand the banner; dismiss it; select another node; reload
- **Expected** — the collection **opens** despite the odd nodes; the banner lists them; after dismissal the status-bar count remains and the banner does not reappear on node change; reload brings it back (a fresh load is a fresh set of notes)
- **Mock** — none

### TC-E2E-017 — open a second collection while one is open
- **Level / Technique / Priority** — E2E · State transition · P2
- **Traces** — [requirements.md Out of Scope](requirements.md#out-of-scope) (one collection at a time)
- **Preconditions** — collection A open with a node selected
- **Input** — open collection B
- **Expected** — the tree, detail pane, filter and selection are fully replaced by B's; no A rows remain; both A and B are in recents with B first; there is no tab bar (multi-collection is out of scope and must not appear)
- **Mock** — none

---

## 9. Cross-cutting cases

### 9.1 Fidelity — `TC-FID-*` ([NFR-006](requirements.md#nfr-006))

The slice's real acceptance gate. Runner: `cargo test` over `tests/fixtures/`.

#### TC-FID-001 — every real export opens and loses nothing
- **Level / Technique / Priority** — Rust integration · Use case · P1
- **Traces** — [NFR-006](requirements.md#nfr-006), [FR-009](requirements.md#fr-009)
- **Preconditions** — ≥ 3 collections in `tests/fixtures/real/` from different Postman versions
- **Input** — for each: load, then walk the retained `raw: serde_json::Value` and the built DTOs in parallel
- **Expected** — every scalar leaf present in `raw` is reachable in the DTO tree or in an `extra` entry; the diff report is empty; zero `LoadWarning`s of kinds that indicate misparsing (`ItemNeitherGroupNorRequest`, `MalformedRawHeaderLine`) for a well-formed real export
- **Mock** — none

#### TC-FID-002 — the polymorphism matrix
- **Level / Technique / Priority** — Rust integration · EP (matrix) · P1
- **Traces** — [FR-010](requirements.md#fr-010)–[FR-013](requirements.md#fr-013), [NFR-006](requirements.md#nfr-006)
- **Preconditions** — `torture.json`
- **Input** — load it and assert against an expected-value table
- **Expected** — all 12 shape cells resolve to the right normalized value: url **string** / url **object with `raw`** / url **object without `raw`**; header **array** / header **raw block**; exec **array** / exec **string**; description **object** / description **string**; plus the three degenerate cells (url `{}`, header `""`, exec `[]`). Each cell names the node id it came from, so a failure points at a fixture node.
- **Mock** — none

#### TC-FID-003 — unknown fields survive at every level
- **Level / Technique / Priority** — Rust integration · EP · P1
- **Traces** — [FR-009](requirements.md#fr-009), [ADR-004](design.md#key-decisions)
- **Preconditions** — `torture.json` carries `"_minimUnknown_<level>": true` at collection, info, folder, request, url, header, body, auth, event and response level
- **Input** — load and search the DTOs for each marker
- **Expected** — all ten markers are reachable; none triggers an error; none is silently dropped
- **Mock** — none

#### TC-FID-004 — all five body modes are represented in the DTO output
- **Level / Technique / Priority** — Rust integration · EP · P1
- **Traces** — [FR-026](requirements.md#fr-026)
- **Preconditions** — `torture.json`
- **Input** — collect the set of `BodyView` variants produced
- **Expected** — `{Raw, Urlencoded, Formdata, File, Graphql}` exactly — this is the DTO-side twin of TC-U-006, which only checks the fixture's input side
- **Mock** — none

#### TC-FID-005 — all eleven auth types plus one unknown
- **Level / Technique / Priority** — Rust integration · EP · P1
- **Traces** — [FR-031](requirements.md#fr-031)
- **Preconditions** — `torture.json`
- **Input** — collect the set of `AuthView.auth_type` values
- **Expected** — the eleven schema types plus `"quantum"`, with exactly one `UnknownAuthType` warning
- **Mock** — none

#### TC-FID-006 — counts agree with an independent raw-JSON walk
- **Level / Technique / Priority** — Rust integration · EP · P2
- **Traces** — [FR-014](requirements.md#fr-014), [FR-040](requirements.md#fr-040)
- **Preconditions** — every fixture in `real/` and `torture.json`
- **Input** — compare `request_count`/`folder_count` against a naive `serde_json::Value` recursion written independently of the indexer
- **Expected** — identical counts for every fixture; a mismatch means the arena is skipping or double-counting nodes
- **Mock** — none

### 9.2 Robustness — `TC-ROB-*` ([NFR-005](requirements.md#nfr-005), [FR-008](requirements.md#fr-008))

#### TC-ROB-001 — the fuzz corpus produces no panic and no hang
- **Level / Technique / Priority** — Fuzz · Error guessing · P1
- **Traces** — [NFR-005](requirements.md#nfr-005)
- **Preconditions** — `cargo-fuzz` (or `proptest` + `arbitrary`) over the full load path, seeded from all fixtures
- **Input** — ≥ 1 000 mutants
- **Expected** — every input yields `Ok(CollectionOverview)` or `Err(AppError)`; zero panics, zero aborts, zero unwraps hit; each input completes within a 5 s watchdog; any crash is minimised and committed as a regression fixture
- **Mock** — none

#### TC-ROB-002 — systematic truncation
- **Level / Technique / Priority** — Property · BVA · P2
- **Traces** — [NFR-005](requirements.md#nfr-005), [FR-006](requirements.md#fr-006)
- **Preconditions** — `torture.json`
- **Input** — truncate at 200 evenly spaced byte offsets, including 0 and `len-1`
- **Expected** — every truncation returns `NotJson` (or `NotACollection` when the truncation still parses); never a panic; the 0-byte case is `NotJson`, not a success with an empty tree
- **Mock** — none

#### TC-ROB-003 — pathological structure
- **Level / Technique / Priority** — Rust unit · Error guessing · P2
- **Traces** — [NFR-005](requirements.md#nfr-005), [NFR-004](requirements.md#nfr-004)
- **Preconditions** — generated inputs
- **Input** — (a) `item` nested 10 000 deep; (b) one folder with 200 000 empty children; (c) a 10 MB single string value; (d) 100 000 headers on one request; (e) duplicate JSON keys in one object; (f) `"port": 1e999`
- **Expected** — each returns `Ok` or a typed `Err` within the watchdog; no stack overflow (complements TC-U-031/048 by combining depth **and** breadth); memory stays bounded; duplicate JSON keys resolve last-wins without error
- **Mock** — none

#### TC-ROB-004 — encoding hostility
- **Level / Technique / Priority** — Rust unit · Error guessing · P2
- **Traces** — [FR-008](requirements.md#fr-008)
- **Preconditions** — generated files
- **Input** — UTF-16LE with BOM; Latin-1 bytes in a name; a lone surrogate escape `"\ud800"`; an embedded `\u0000`; an unpaired combining mark; an RTL override in a request name
- **Expected** — UTF-16 and Latin-1 yield a typed error naming the encoding problem; `\ud800` yields `NotJson`; `\u0000` parses and is rendered as text (TC-SEC-003 covers the render); the RTL override does not reorder surrounding UI chrome (the name is isolated)
- **Mock** — none

#### TC-ROB-005 — the file changes while it is being read
- **Level / Technique / Priority** — Command contract · Concurrency · P3
- **Traces** — [FR-008](requirements.md#fr-008)
- **Preconditions** — a 20 MB valid collection in a temp dir
- **Input** — truncate the file to 1 KB from another thread while `open_collection` is reading it
- **Expected** — `Ok` (the read completed first) or a typed `Err`; never a panic and never a partially built arena served as if complete
- **Mock** — background thread

#### TC-ROB-006 — reopening after every kind of failure
- **Level / Technique / Priority** — Command contract · State transition · P2
- **Traces** — [FR-008](requirements.md#fr-008)
- **Preconditions** — one `AppState` reused across the case
- **Input** — attempt every rejection fixture in sequence, then open a good collection
- **Expected** — the good open succeeds with a correct overview — no failure leaves poisoned state, a locked `Mutex`, or stale warnings from a previous attempt
- **Mock** — temp store dir

### 9.3 Performance — `TC-PERF-*`

#### TC-PERF-001 — 5 MB / 2 000 leaves to first interactive tree ≤ 1.5 s p95
- **Level / Technique / Priority** — Performance · Load · P1
- **Traces** — [NFR-001](requirements.md#nfr-001)
- **Preconditions** — Apple M1 / 16 GB baseline; release build; `generate(seed=0, leaves=2000)`
- **Input** — 20 runs of open → first row painted (measured in the WDIO harness, plus a Criterion benchmark for the Rust half)
- **Expected** — p95 ≤ 1 500 ms end to end; the Rust parse+index half is reported separately so a regression can be attributed to a side of the seam
- **Mock** — none

#### TC-PERF-002 — request selection ≤ 100 ms p95
- **Level / Technique / Priority** — Performance · Interaction · P1
- **Traces** — [NFR-002](requirements.md#nfr-002)
- **Preconditions** — the 2 000-leaf collection open, cold query cache
- **Input** — select 50 distinct leaves, measuring click → detail header painted
- **Expected** — p95 ≤ 100 ms; `get_node_detail` itself is O(1) — asserted separately in Criterion as flat across node depth and collection size (complements TC-U-052)
- **Mock** — none

#### TC-PERF-003 — filter keystroke ≤ 150 ms p95
- **Level / Technique / Priority** — Performance · Interaction · P1
- **Traces** — [NFR-002](requirements.md#nfr-002), [ADR-009](design.md#key-decisions)
- **Preconditions** — the 2 000-leaf collection open
- **Input** — type `invoices` one character at a time, measuring each keystroke → updated list
- **Expected** — p95 ≤ 150 ms per keystroke; no IPC call is issued during filtering (client-side per ADR-009 — assert zero `invoke` calls)
- **Mock** — IPC spy in the debug build

#### TC-PERF-004 — cold launch to S1 ≤ 2 s p95
- **Level / Technique / Priority** — Performance · Startup · P2
- **Traces** — [NFR-003](requirements.md#nfr-003)
- **Preconditions** — release build, warm OS cache, 10 runs
- **Input** — launch → the Open button is interactive
- **Expected** — p95 ≤ 2 000 ms; Shiki grammars are not loaded at startup (lazy per ADR-011)
- **Mock** — none

#### TC-PERF-005 — RSS < 400 MB with a 5 MB collection open
- **Level / Technique / Priority** — Performance · Resource · P2
- **Traces** — [NFR-004](requirements.md#nfr-004)
- **Preconditions** — the 2 000-leaf collection open; every node visited once
- **Input** — sample RSS after load and after the visit sweep
- **Expected** — both samples < 400 MB; the sweep does not grow RSS monotonically (no per-selection leak); note that `raw: serde_json::Value` is retained for TC-FID-001 and is part of this budget
- **Mock** — none

#### TC-PERF-006 — installed size < 50 MB per platform
- **Level / Technique / Priority** — Performance · Distribution · P3
- **Traces** — [NFR-013](requirements.md#nfr-013)
- **Preconditions** — release bundles for macOS, Windows, Ubuntu
- **Input** — measure the installed footprint
- **Expected** — each < 50 MB; the check runs in CI so a new dependency that blows the budget fails the build

### 9.4 Security — `TC-SEC-*`

#### TC-SEC-001 — the webview cannot invoke anything it was not granted
- **Level / Technique / Priority** — E2E · Security · P1
- **Traces** — [NFR-007](requirements.md#nfr-007), [NFR-008](requirements.md#nfr-008), [ADR-008](design.md#key-decisions)
- **Preconditions** — the running app
- **Input** — from the webview console, invoke `plugin:fs|read_text_file`, `plugin:http|fetch`, `plugin:shell|execute`
- **Expected** — all three are denied by the capability set (complements TC-U-003, which only reads the manifest, by proving the runtime enforcement); `dialog:allow-open` and `store:default` still work
- **Mock** — none

#### TC-SEC-002 — the CSP blocks remote script and remote connections
- **Level / Technique / Priority** — E2E · Security · P1
- **Traces** — [NFR-009](requirements.md#nfr-009)
- **Preconditions** — a local HTTP listener on 127.0.0.1 that records any hit
- **Input** — inject `<script src="http://127.0.0.1:PORT/x.js">` and run `fetch("http://127.0.0.1:PORT/y")` from the webview
- **Expected** — both are refused by CSP; the listener records zero requests; a CSP violation is observable
- **Mock** — local listener

#### TC-SEC-003 — every collection string renders as text, on every surface
- **Level / Technique / Priority** — Component · Security · P1
- **Traces** — [NFR-010](requirements.md#nfr-010)
- **Preconditions** — `reject/hostile.json` — the canonical hostile string in the collection name, folder name, request name, URL, query param key and value, header key and value, raw body, script source, variable key and value, example name and body, and a warning detail
- **Input** — render the shell, the tree, the detail pane on every tab, S4, and the warnings banner
- **Expected** — the literal text appears everywhere; `document.querySelectorAll('img,script,b')` finds no element originating from collection content; `window.__pwned` is undefined; no `dangerouslySetInnerHTML` outside Shiki (asserted by a grep-style source test as well). Complements TC-U-072, which covers one surface.
- **Mock** — fixture DTO

#### TC-SEC-004 — no outbound network for a whole session
- **Level / Technique / Priority** — E2E · Security · P1
- **Traces** — [NFR-007](requirements.md#nfr-007), [NFR-014](requirements.md#nfr-014)
- **Preconditions** — the app run with networking disabled (or behind a recording proxy that fails closed)
- **Input** — a full journey: launch, open, browse the tree, every tab, examples, reload, theme change, quit
- **Expected** — every feature works; the proxy records zero connection attempts, including for fonts and Shiki grammars (both must be bundled)
- **Mock** — recording proxy

#### TC-SEC-005 — scripts in `event[]` are never evaluated
- **Level / Technique / Priority** — E2E · Security · P1
- **Traces** — [NFR-009](requirements.md#nfr-009), [FR-033](requirements.md#fr-033)
- **Preconditions** — a fixture whose pre-request and test scripts contain `window.__pwned = 1; fetch('http://127.0.0.1:PORT')`, and whose script source also appears in a variable value and a description
- **Input** — open the collection, select the request, open the Scripts tab, and leave it open for 5 s
- **Expected** — the source is visible as text; `window.__pwned` is undefined; the listener records nothing; no `eval`/`Function` call is made (spy on both in the debug build)
- **Mock** — local listener, `eval` spy

#### TC-SEC-006 — reading is confined to the chosen path
- **Level / Technique / Priority** — Command contract · Security · P2
- **Traces** — [NFR-008](requirements.md#nfr-008)
- **Preconditions** — a temp dir containing the target collection plus `secret.json` and a subdirectory
- **Input** — `open_collection(target)` while tracing filesystem syscalls (`strace`/`dtruss`/Process Monitor, or an injected reader trait in a unit-level variant)
- **Expected** — exactly one file is opened — the target; no directory enumeration, no sibling read, no access to the parent
- **Mock** — syscall trace or an injected reader

#### TC-SEC-007 — the store holds no collection content
- **Level / Technique / Priority** — Command contract · Security/privacy · P3
- **Traces** — [FR-017](requirements.md#fr-017), [FR-041](requirements.md#fr-041)
- **Preconditions** — open the hostile fixture and a credential-bearing collection
- **Input** — read `store.json` afterwards
- **Expected** — only `path`, `name`, `opened_at`, `request_count` per entry plus `prefs`; no auth attribute, no body, no script source is persisted anywhere outside the original file
- **Mock** — temp store dir

#### TC-SEC-008 — hostile paths
- **Level / Technique / Priority** — Command contract · Security · P2
- **Traces** — [FR-008](requirements.md#fr-008), [NFR-008](requirements.md#nfr-008)
- **Preconditions** — a FIFO, a symlink to `/dev/zero`, a symlink loop, a path with `../../`, a 4 096-character path, and (on Windows) `CON`
- **Input** — `open_collection` for each
- **Expected** — each returns a typed error (`FileUnreadable`, `FileTooLarge` or `NotJson`) within the 5 s watchdog; `/dev/zero` must not be read unboundedly — the size guard or a read cap stops it; no path is followed outside what the user selected
- **Mock** — `TempDir` with special files

### 9.5 Accessibility — `TC-A11Y-*` ([NFR-011](requirements.md#nfr-011))

#### TC-A11Y-001 — contrast for the non-shadcn tokens, both themes
- **Level / Technique / Priority** — Component · A11y · P1
- **Traces** — [NFR-011](requirements.md#nfr-011), ux accessibility audit
- **Preconditions** — the token set from `index.css`
- **Input** — compute contrast for `--token-var` on `--token-var-bg`, warning amber on background, muted foreground on background, highlight background with its text, and the selected-row foreground on `bg-accent`, in light and dark
- **Expected** — ≥ 4.5:1 for text, ≥ 3:1 for non-text UI; machine-computed, not eyeballed (complements TC-U-054, which covers only the method tokens)
- **Mock** — none

#### TC-A11Y-002 — the tree exposes the full APG pattern
- **Level / Technique / Priority** — Component · A11y · P1
- **Traces** — [NFR-011](requirements.md#nfr-011)
- **Preconditions** — a 3-level tree rendered virtualized
- **Input** — inspect roles and attributes
- **Expected** — container `role="tree"` with `aria-multiselectable="false"`; every row `role="treeitem"` with `aria-level`, `aria-selected`, and `aria-expanded` on folders only (never on leaves); exactly one element with `tabindex="0"`; `axe-core` reports zero violations (complements TC-U-065, which covers `aria-setsize`/`aria-posinset`)
- **Mock** — none

#### TC-A11Y-003 — every interactive element has a visible focus indicator
- **Level / Technique / Priority** — Component · A11y · P2
- **Traces** — [NFR-011](requirements.md#nfr-011)
- **Preconditions** — S1 and S2 rendered
- **Input** — walk every focusable element and inspect its computed focus-visible styles; grep the stylesheet for `outline-none`
- **Expected** — each has a ring or outline; no `outline-none` appears without a replacement indicator on the same selector
- **Mock** — none

#### TC-A11Y-004 — reduced motion disables both animations
- **Level / Technique / Priority** — Component · A11y · P3
- **Traces** — [NFR-011](requirements.md#nfr-011)
- **Preconditions** — `prefers-reduced-motion: reduce`
- **Input** — expand a folder; switch tabs
- **Expected** — the caret rotation and the tab indicator transition are disabled; the state change still happens instantly and correctly
- **Mock** — media-query stub

#### TC-A11Y-005 — 200 % zoom holds
- **Level / Technique / Priority** — E2E · A11y · P2
- **Traces** — [NFR-011](requirements.md#nfr-011)
- **Preconditions** — the app at 800×600, browser zoom 200 %
- **Input** — S1, S2 with a long URL, the S7 dialog
- **Expected** — no text is clipped, no fixed-height container cuts content, the page does not scroll horizontally, and every control remains reachable
- **Mock** — none

#### TC-A11Y-006 — live-region announcements
- **Level / Technique / Priority** — Component · A11y · P2
- **Traces** — [NFR-011](requirements.md#nfr-011)
- **Preconditions** — the shell rendered
- **Input** — complete a load; type in the filter; trigger an error
- **Expected** — the load announcement and the filter count sit in `aria-live="polite"` regions that exist in the DOM *before* the update (so the change is announced); the error dialog carries `role="alertdialog"`; announcements are not duplicated on every keystroke (debounced)
- **Mock** — fake timers

#### TC-A11Y-007 — dialog focus trap and restore
- **Level / Technique / Priority** — Component · A11y · P2
- **Traces** — [NFR-011](requirements.md#nfr-011)
- **Preconditions** — S1 with the Open button focused
- **Input** — trigger the error dialog; `Tab` around it; `Esc`
- **Expected** — focus is trapped inside the dialog; `Esc` closes it and focus returns to the Open button — not to `document.body`
- **Mock** — mocked bindings

#### TC-A11Y-008 — no meaning is carried by color alone
- **Level / Technique / Priority** — Component · A11y · P1
- **Traces** — [NFR-011](requirements.md#nfr-011), ux design review
- **Preconditions** — a request with a disabled param, an undefined variable chip, a warning, and every method verb
- **Input** — render with all color declarations stripped (a stylesheet-disabled render or a grayscale snapshot)
- **Expected** — the verb text, the `disabled` label and strikethrough, the dashed border on the undefined chip, and the warning icon all remain distinguishable; nothing becomes ambiguous
- **Mock** — none

---

## 10. Coverage

### 10.1 Coverage matrix

| Test area | Unit | Command contract | Component | E2E | Covered? |
|---|---|---|---|---|---|
| Happy path (open → tree → detail) | — | ✓ | ✓ | ✓ | ✓ |
| Polymorphic normalization ([FR-010](requirements.md#fr-010)–[FR-013](requirements.md#fr-013)) | ✓ | ✓ | — | — | ✓ (+ TC-FID-002) |
| Schema gating and version rejection | ✓ | ✓ | ✓ | ✓ | ✓ |
| Every `AppError` variant | ✓ | ✓ | ✓ | ✓ | ✓ |
| State preconditions (no collection open, after close) | — | ✓ | — | ✓ | ✓ |
| Boundary values (64 MiB, index, depth, counts) | ✓ | ✓ | ✓ | — | ✓ |
| Business rules (auth inheritance, tab badges, masking) | ✓ | — | ✓ | ✓ | ✓ |
| Tree behaviour (order, filter, keyboard, virtualization) | ✓ | — | ✓ | ✓ | ✓ |
| Detail rendering (all body modes, all auth types, scripts, examples) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Session (recents, prefs, reload, close) | — | ✓ | ✓ | ✓ | ✓ |
| Fidelity / no field lost | — | — | — | — | ✓ (TC-FID-*) |
| Robustness / never panic | ✓ | ✓ | — | — | ✓ (TC-ROB-*) |
| Performance | — | — | — | ✓ | ✓ (TC-PERF-*) |
| Security (CSP, capabilities, injection, no network) | — | ✓ | ✓ | ✓ | ✓ (TC-SEC-*) |
| Accessibility | — | — | ✓ | ✓ | ✓ (TC-A11Y-*) |
| Authentication / authorization | n/a | n/a | n/a | n/a | n/a — single-user local app, no identity |
| Native file dialog ([FR-001](requirements.md#fr-001)) | — | — | — | partial | **manual** — see gap G-2 |
| Cross-platform path handling ([NFR-012](requirements.md#nfr-012)) | — | — | — | — | **gap G-5** |

### 10.2 Requirement → case traceability

| Req | Cases (this document) | Also covered by dev-plan TDD contracts |
|---|---|---|
| [FR-001](requirements.md#fr-001) | TC-E2E-001 (partial — see G-2) | — |
| [FR-002](requirements.md#fr-002) | TC-COMP-031, TC-E2E-002 | TC-U-058, TC-U-059 |
| [FR-003](requirements.md#fr-003) | TC-CMD-001, TC-SEC-006 | — |
| [FR-004](requirements.md#fr-004) | TC-UNIT-051, TC-CMD-013 | TC-U-013, TC-U-015 |
| [FR-005](requirements.md#fr-005) | TC-CMD-010, TC-CMD-011, TC-CMD-012, TC-UNIT-047, TC-COMP-027, TC-E2E-003 | TC-U-014, TC-U-083 |
| [FR-006](requirements.md#fr-006) | TC-CMD-007, TC-CMD-008, TC-CMD-009, TC-UNIT-052, TC-ROB-002, TC-E2E-004, TC-E2E-005 | TC-U-017, TC-U-085 |
| [FR-007](requirements.md#fr-007) | TC-CMD-007, TC-UNIT-047, TC-E2E-004 | TC-U-016, TC-U-084 |
| [FR-008](requirements.md#fr-008) | TC-UNIT-007, TC-UNIT-015, TC-UNIT-045, TC-CMD-020, TC-CMD-021, TC-CMD-034, TC-ROB-001…006, TC-SEC-008 | TC-U-039, TC-U-040, TC-U-047…050 |
| [FR-009](requirements.md#fr-009) | TC-UNIT-020, TC-UNIT-031, TC-UNIT-040, TC-COMP-020, TC-COMP-029, TC-FID-001, TC-FID-003, TC-E2E-016 | TC-U-010, TC-U-036 |
| [FR-010](requirements.md#fr-010) | TC-UNIT-001…007, TC-FID-002 | TC-U-008, TC-U-009, TC-U-018…020 |
| [FR-011](requirements.md#fr-011) | TC-UNIT-008…012, TC-UNIT-049, TC-FID-002 | TC-U-021, TC-U-022 |
| [FR-012](requirements.md#fr-012) | TC-UNIT-013…015, TC-FID-002 | TC-U-023 |
| [FR-013](requirements.md#fr-013) | TC-UNIT-016…019, TC-FID-002 | TC-U-024 |
| [FR-014](requirements.md#fr-014) | TC-UNIT-020, TC-UNIT-021, TC-UNIT-022, TC-FID-006 | TC-U-011, TC-U-031 |
| [FR-015](requirements.md#fr-015) | TC-UNIT-023, TC-UNIT-025, TC-COMP-004, TC-E2E-010 | TC-U-026 |
| [FR-016](requirements.md#fr-016) | TC-UNIT-023, TC-UNIT-024, TC-CMD-027 | TC-U-025, TC-U-030, TC-U-041 |
| [FR-017](requirements.md#fr-017) | TC-CMD-035, TC-SEC-007 | — |
| [FR-018](requirements.md#fr-018) | TC-UNIT-026, TC-CMD-001, TC-COMP-001 | — |
| [FR-019](requirements.md#fr-019) | TC-COMP-002 | TC-U-055 |
| [FR-020](requirements.md#fr-020) | TC-COMP-003 | — |
| [FR-021](requirements.md#fr-021) | TC-UNIT-044, TC-UNIT-045, TC-UNIT-046, TC-COMP-007, TC-COMP-008, TC-E2E-010 | TC-U-062, TC-U-063, TC-U-064 |
| [FR-022](requirements.md#fr-022) | — | TC-U-067, TC-U-087 |
| [FR-023](requirements.md#fr-023) | TC-CMD-017, TC-COMP-011, TC-E2E-001 | — |
| [FR-024](requirements.md#fr-024) | TC-UNIT-017, TC-CMD-017, TC-COMP-013 | TC-U-070 |
| [FR-025](requirements.md#fr-025) | TC-UNIT-011, TC-COMP-013 | TC-U-070 |
| [FR-026](requirements.md#fr-026) | TC-UNIT-031, TC-UNIT-032, TC-UNIT-033, TC-COMP-014, TC-FID-004 | TC-U-006, TC-U-032, TC-U-073 |
| [FR-027](requirements.md#fr-027) | TC-COMP-015 | TC-U-033, TC-U-074 |
| [FR-028](requirements.md#fr-028) | TC-UNIT-036, TC-UNIT-037, TC-COMP-014 | TC-U-073 |
| [FR-029](requirements.md#fr-029) | TC-UNIT-034, TC-UNIT-035, TC-COMP-014 | TC-U-034 |
| [FR-030](requirements.md#fr-030) | TC-UNIT-027, TC-UNIT-028, TC-UNIT-029, TC-COMP-016, TC-E2E-014 | TC-U-027…029, TC-U-075 |
| [FR-031](requirements.md#fr-031) | TC-UNIT-039, TC-UNIT-040, TC-FID-005 | TC-U-036 |
| [FR-032](requirements.md#fr-032) | TC-UNIT-038, TC-COMP-017 | TC-U-035, TC-U-076, TC-U-077 |
| [FR-033](requirements.md#fr-033) | TC-COMP-018, TC-SEC-005 | TC-U-078 |
| [FR-034](requirements.md#fr-034) | TC-COMP-019 | — |
| [FR-035](requirements.md#fr-035) | TC-UNIT-041, TC-UNIT-042, TC-COMP-022 | TC-U-071 |
| [FR-036](requirements.md#fr-036) | TC-UNIT-014, TC-UNIT-037, TC-UNIT-050, TC-COMP-009, TC-COMP-010, TC-COMP-013 | TC-U-069, TC-U-082 |
| [FR-037](requirements.md#fr-037) | TC-UNIT-049, TC-UNIT-050, TC-CMD-023, TC-CMD-024, TC-COMP-021, TC-E2E-013 | TC-U-079, TC-U-080 |
| [FR-038](requirements.md#fr-038) | TC-UNIT-030, TC-UNIT-043, TC-COMP-023, TC-E2E-014 | TC-U-081 |
| [FR-039](requirements.md#fr-039) | TC-CMD-018, TC-COMP-024 | — |
| [FR-040](requirements.md#fr-040) | TC-UNIT-048, TC-CMD-001, TC-CMD-019, TC-COMP-023, TC-COMP-030 | — |
| [FR-041](requirements.md#fr-041) | TC-CMD-015, TC-CMD-031, TC-E2E-007 | TC-U-043, TC-U-044 |
| [FR-042](requirements.md#fr-042) | TC-CMD-032, TC-COMP-026, TC-E2E-008 | TC-U-045, TC-U-060 |
| [FR-043](requirements.md#fr-043) | TC-CMD-033, TC-COMP-032, TC-E2E-009 | TC-U-046, TC-U-056, TC-U-057 |
| [FR-044](requirements.md#fr-044) | TC-CMD-030, TC-E2E-012 | — |
| [FR-045](requirements.md#fr-045) | TC-CMD-027, TC-CMD-028, TC-E2E-011 | TC-U-041 |
| [NFR-001](requirements.md#nfr-001) | TC-PERF-001 | TC-U-051 |
| [NFR-002](requirements.md#nfr-002) | TC-PERF-002, TC-PERF-003, TC-CMD-022 | TC-U-052 |
| [NFR-003](requirements.md#nfr-003) | TC-PERF-004 | — |
| [NFR-004](requirements.md#nfr-004) | TC-PERF-005, TC-CMD-005, TC-ROB-003 | TC-U-053 |
| [NFR-005](requirements.md#nfr-005) | TC-ROB-001…006 | TC-U-047…050 |
| [NFR-006](requirements.md#nfr-006) | TC-FID-001…006, TC-UNIT-005 | TC-U-005, TC-U-006 |
| [NFR-007](requirements.md#nfr-007) | TC-SEC-001, TC-SEC-002, TC-SEC-004 | TC-U-003 |
| [NFR-008](requirements.md#nfr-008) | TC-SEC-001, TC-SEC-006, TC-SEC-008, TC-CMD-004, TC-CMD-035 | TC-U-003 |
| [NFR-009](requirements.md#nfr-009) | TC-SEC-002, TC-SEC-005, TC-COMP-018 | TC-U-004, TC-U-078 |
| [NFR-010](requirements.md#nfr-010) | TC-SEC-003, TC-UNIT-018 | TC-U-072 |
| [NFR-011](requirements.md#nfr-011) | TC-A11Y-001…008, TC-COMP-005, TC-COMP-006, TC-COMP-013, TC-E2E-015 | TC-U-054, TC-U-061, TC-U-065, TC-U-066 |
| [NFR-012](requirements.md#nfr-012) | TC-PERF-006 (per platform) — see gap G-5 | T-002 CI matrix |
| [NFR-013](requirements.md#nfr-013) | TC-PERF-006 | — |
| [NFR-014](requirements.md#nfr-014) | TC-SEC-004 | — |
| [NFR-015](requirements.md#nfr-015) | TC-CMD-002, TC-CMD-033 | — |
| [NFR-016](requirements.md#nfr-016) | coverage gate in [T-021](dev-plan.md#t-021) acceptance criteria | — |

Every FR and NFR has at least one case. `FR-022` is the only requirement covered **solely** by
dev-plan contracts (TC-U-067 / TC-U-087) — deliberately, because those two already assert both
halves of it (named empty state in the tree and in the detail pane) and nothing in this suite would
add signal.

---

## 11. Gaps, risks, and decisions the owner must pin

### Gaps

- **G-1 — no `AppError` variant for store failure.** [design.md §API Contracts](design.md#api-contracts) declares error sets for the collection commands but none for `list_recents` / `forget_recent` / `get_preferences` / `set_preferences`, which can all fail when the config directory is unwritable. TC-CMD-034 asserts only "typed error, no panic, the open still succeeds". Recommend adding a `StoreUnavailable { detail }` variant; if it is added, TC-CMD-034 tightens to name it.
- **G-2 — the native file dialog is not scriptable.** WebDriver cannot drive a native OS dialog, so [FR-001](requirements.md#fr-001) is exercised end-to-end only for the *path-delivery* half. The dialog's `.json` filter and its cancel path need one manual check per release, recorded in the test report. An alternative is a debug-only `--open <path>` argument, which is what the E2E harness assumes.
- **G-3 — TC-FID-001 is only as strong as `tests/fixtures/real/`.** If [T-003](dev-plan.md#t-003) ends up with hand-authored stand-ins, the fidelity suite tests our assumptions about Postman's output rather than Postman's output. That is the slice's central quality gate; it should be flagged in the test report, not quietly passed.
- **G-4 — `tauri-driver` on macOS** ([design.md Open Risks](design.md#open-risks)). If the E2E layer cannot run on macOS, TC-E2E-* run on Linux CI only. The compensating coverage is TC-COMP-* plus a manual smoke of TC-E2E-001, -003, -007 and -015 on macOS. That is a real reduction and belongs in an owner decision, not in a silent skip.
- **G-5 — cross-platform path handling has no functional case.** [NFR-012](requirements.md#nfr-012) is covered by the CI build matrix and TC-PERF-006 only. Windows backslashes, UNC paths, case-insensitive filesystems, and long paths are untested behaviour in `open_collection` / recents. Recommend one command-contract case per platform once a Windows runner exists.
- **G-6 — no concurrency beyond TC-CMD-016 and TC-ROB-005.** Single window, one collection: the surface is genuinely small, so this is accepted rather than closed.

### Decisions this suite asks the implementation to pin

Each of these has a case whose expected result says "pin the choice". They are places where the
spec is silent and either behaviour is defensible — the test exists so the answer is deliberate and
stays stable, not so one answer is forced:

| Case | Open question |
|---|---|
| TC-UNIT-005 | Does URL reassembly append `query`/`hash`, or drop them while keeping `UrlView.query` populated? |
| TC-UNIT-032 | `body` present with no `mode` — infer from the populated key, or `UnknownBodyMode`? |
| TC-UNIT-041 | `{{ a }}` with inner spaces — a token keyed `a`, or literal text? |
| TC-UNIT-043 | USED counts referencing *requests* or total *occurrences*? |
| TC-UNIT-046 | A whitespace-only filter — a real query or an empty one? |
| TC-UNIT-051 (3, 8) | Trailing whitespace in `info.schema` — trim or reject? Empty schema — `UnsupportedSchema` or `NotACollection`? |
| TC-CMD-011 | Is a v1 collection detected as v1, or reported as `NotACollection`? |
| TC-CMD-019 | Is the collection root an arena node, or is S4 rendered from `CollectionOverview`? |
| TC-CMD-028 | Does a failed `reload_collection` retain the previously loaded collection? (This suite says yes.) |
| TC-COMP-022 | Are `{{var}}` chips rendered inside Shiki-highlighted code blocks, or is the code block exempt? |

---

## 12. Hand-off to `software-tester-automation` (T-021)

| Family | Count | Runner it maps to |
|---|---|---|
| `TC-UNIT-001…052` | 52 | `cargo test` (001–040, 048–052) · Vitest (041–047) |
| `TC-CMD-001…035` | 35 | `cargo test` + `tauri::test::mock_builder`, `tempfile`, `insta` snapshots for DTO shapes |
| `TC-COMP-001…032` | 32 | Vitest + React Testing Library + jsdom, mocked `bindings` |
| `TC-E2E-001…017` | 17 | **`tauri-driver` + WebdriverIO** ([ADR-012](design.md#key-decisions)) — not Playwright |
| `TC-FID-001…006` | 6 | `cargo test` over `tests/fixtures/` |
| `TC-ROB-001…006` | 6 | `cargo-fuzz` / `proptest` + `arbitrary` |
| `TC-PERF-001…006` | 6 | Criterion (Rust) + a timed WDIO run; CI budget check for size |
| `TC-SEC-001…008` | 8 | mixed: capability/CSP assertions, component render, WDIO with a recording proxy |
| `TC-A11Y-001…008` | 8 | Vitest + `axe-core`, contrast computation, WDIO for zoom |
| **Total** | **170** | |

Notes for the automation task:

1. **Do not re-implement `TC-U-001…088`.** They are the developers' TDD contracts and are written
   into [dev-plan.md](dev-plan.md) per task. This suite complements them; the traceability table in
   §10.2 shows which requirement each side carries.
2. **Build the fixtures first.** Almost every case names a file under `tests/fixtures/`.
   `torture.json`, `reject/hostile.json` and the size-boundary files are prerequisites, not
   incidental data — see [T-003](dev-plan.md#t-003) and the additions listed in §4.
3. **Test titles must cite the TC id** so `test-report.md#tc-cmd-014` resolves and
   `software-tester-execution` can report pass/fail per id.
4. **Every "pin the choice" case in §11 must be reported, not silently resolved** — pick the
   behaviour the implementation has, assert it, and list it in the test report so the owner sees
   what was pinned.
5. **P1 first.** The P1 subset is the smoke suite: nothing else is trustworthy until the
   normalizers, the schema gate, the error envelope, the arena lookup and the injection guards pass.
