# `tests/fixtures/` — the collection corpus

Every later task in the Collection Viewer slice reads from here. Nothing in this directory
imports anything from `src-tauri/` or `src/`; it is data plus two `node` scripts, so it works
before the Cargo crate exists.

```
tests/fixtures/
├── README.md                       ← you are here
├── torture.json                    polymorphism torture file (FR-009..FR-014, all body modes, all auth types)
├── schema/
│   └── collection.v2.1.0.schema.json   vendored published v2.1 JSON Schema (draft-04)
├── real/                           stand-ins for exports from 3 Postman versions — see real/README.md
│   ├── README.md
│   ├── postman-8.12.5-export.json
│   ├── postman-10.24.16-export.json
│   └── postman-11.34.2-export.json
├── edge/                           valid v2.1, structurally degenerate — these MUST load
│   ├── empty-item.json                 zero items (FR-022)
│   └── only-empty-folders.json         folders but no request leaves
├── warn/                           MUST load, MUST warn — deliberately schema-invalid
│   └── load-warnings.json              one case per LoadWarning variant in design.md
├── reject/                         MUST NOT load — one file per AppError rejection variant
│   ├── empty.json
│   ├── malformed.json
│   ├── trailing-comma.json
│   ├── not-a-collection.json
│   ├── not-json-object.json
│   ├── missing-info.json
│   ├── missing-item.json
│   ├── v1-collection.json
│   ├── v2.0-collection.json
│   ├── v2.0-with-broken-item.json
│   └── v3-collection.yaml
├── tools/
│   ├── draft04.mjs                 minimal zero-dependency JSON-Schema draft-04 validator
│   ├── generate-large.mjs          deterministic 2,000-leaf / ~5.4 MB generator
│   └── self-check.mjs              asserts TC-U-005, TC-U-006, TC-U-007 and the ACs
└── large/                          GITIGNORED — generator output, never committed
```

## Running it

```bash
# verify the whole corpus (79 assertions) — exit 0 means green
node tests/fixtures/tools/self-check.mjs

# produce the performance fixture at tests/fixtures/large/collection-2000-seed0.json
node tests/fixtures/tools/generate-large.mjs

# other sizes / seeds / destinations
node tests/fixtures/tools/generate-large.mjs --seed 1 --leaves 50 --out /tmp/small.json
node tests/fixtures/tools/generate-large.mjs --leaves 2000 --stdout | wc -c
```

No `npm install`, no `package.json`, no Cargo. A bare `node` binary is the only requirement
(developed on Node 26; nothing newer than ES2021 + `node:` builtins is used).

## The contract each group encodes

### `torture.json` — must load, must lose nothing

Hand-authored. The one file that exercises every legal shape at once. Its twelve top-level
folders map onto the requirements:

| Folder | Covers |
|---|---|
| `01 URL shapes` | **FR-010** — `url` as a bare string; as an object **with** `raw`; as an object **without** `raw` (so the reader must reassemble from `protocol`/`host`/`port`/`path`); `host` as an array **and** as a string; `path` as an array **and** as a string; `path` segments as **objects** (`{type, value}`) alongside `:name` strings; an explicit `port`; a `hash`; `query` entries with a `null` value and with `disabled: true`; a url with nothing but a `host`. |
| `02 Header shapes` | **FR-011** — `header` as an array; as a **raw block string** containing CRLF *and* LF line endings, a value that itself contains `:` (`X-Time: 12:34:56` — proves the split is on the **first** colon), a key with an empty value, a line with **no colon at all**, and a line with leading/trailing whitespace; an empty array; the key omitted entirely. |
| `03 Script shapes` | **FR-012** — `exec` as an array of lines; as a single string; as an **empty** array; a `script` with no `exec`; a script sourced from `src` where `src` is a **string** and where `src` is a **url object**; a `disabled` event. |
| `04 Description shapes` | **FR-013** — `description` as a string and as an object at *every* site it can appear (item, request, header, query param, urlencoded param, variable); `description: null`; a description object with no `content`. |
| `05 Body modes` | All five `body.mode` values — `raw` (json **and** xml, with and without `options.raw.language`), `urlencoded` (incl. `disabled` and a key with no value), `formdata` (text, single-`src` file, **array**-`src` file, `src: null`, `disabled`, with description), `file` (with a path and with `src: null`), `graphql` (query + `variables` as a JSON **string**). Also a `disabled` body and a request with no `body` key. |
| `06 Auth types` | All **eleven** types in the published enum — `apikey`, `awsv4`, `basic`, `bearer`, `digest`, `edgegrid`, `hawk`, `ntlm`, `oauth1`, `oauth2`, `noauth` — plus `noauth` with a `null` payload, `auth: null` (falls back to the folder), auth **absent** (inherits the folder bearer), a folder-level bearer, and a collection-level basic. `oauth2` carries attribute values that are an **array** and a nested **object**, not just strings. |
| `07 Deep nesting` | **FR-014** — folders nested **seven** deep (requirement is ≥ 5), with leaves at two different depths and an empty folder at the bottom. |
| `08 Unnamed nodes` | A folder with **no `name` key**, containing a request with **no `name` key**; and a request whose `name` is the empty string. **FR-016**'s positional `NodeId` is the only thing that can identify these. |
| `09 Saved examples` | Two `response[]` entries — one with a header **array**, cookies and a numeric `responseTime`; one with a header **raw block**, `body: null`, `timings: null` and a **string** `responseTime`. `originalRequest` carries both url shapes. |
| `10 Unknown fields` | **FR-009** — `x_minim_unknown_*` on item, request, url, header, body, auth, auth-attribute, event, script, variable and `protocolProfileBehavior`. Also `proxy` and `certificate`, which the TS model declares and the UI ignores. |
| `11 Exotic methods` | `PROPFIND`, `PURGE`, a **lowercase** `get`, a request with **no `method`**, and a `request` that is a **bare URL string** rather than an object (the published schema's `request` is `oneOf[object, string]`). |
| `12 Empty folder` | An empty `item: []` folder at the root. |

Unknown fields also sit on the collection root (`x_minim_unknown_root`) and on `info`
(`x_minim_unknown_info`).

### `real/` — must load, evidences NFR-006

**These are hand-authored stand-ins, not genuine exports.** See
[`real/README.md`](real/README.md) for why, what each one imitates, and what to do when real
exports turn up. NFR-006 is therefore **only partially evidenced** by this corpus today.

### `edge/` — must load, and must not be mistaken for a rejection

`empty-item.json` is a valid v2.1 collection with `item: []`. Per
[FR-022](../../docs/collection-viewer/v1.0/requirements.md#fr-022) it **must open** and render an
explicit empty state naming the collection — it is **not** an error.

> **Deviation from the task brief, stated openly.** The T-003 brief lists "an empty-item
> collection" under the rejection group. That contradicts FR-022, which requires zero-item
> collections to load. The file therefore lives in `edge/`, not `reject/`, so that no one writing
> the Rust tests asserts a rejection the requirements forbid. The rejection that the brief was
> probably reaching for — a collection with **no `item` key at all** — is
> `reject/missing-item.json`.

### `warn/` — must load, must warn

`load-warnings.json` is deliberately **invalid against the published schema** and is excluded from
the schema check for that reason. It must still parse (FR-008) and open (FR-009), producing
exactly the five `LoadWarning` variants from design.md:

| Node | Warning |
|---|---|
| `UnknownAuthType` | `auth.type: "jwtBearer"` — a real Postman auth type that post-dates the published schema |
| `UnknownBodyMode` | `body.mode: "binaryStream"` |
| `MalformedRawHeaderLine` | a raw header block with a colon-less line and two blank lines |
| `ItemNeitherGroupNorRequest` | three sibling nodes: no `request`/`item`; `request: 7`; `item` as an object |
| `DuplicateVariableKey` | `dup` declared twice, plus `type: "default"` (see `real/README.md`) |

### `reject/` — must not load

One file per `AppError` rejection variant from
[design.md § `AppError` wire shape](../../docs/collection-viewer/v1.0/design.md#apperror-wire-shape).

| File | `AppError` kind | What makes it fail |
|---|---|---|
| `empty.json` | `NotJson` | zero bytes. serde_json: `EOF while parsing a value at line 1 column 0` |
| `malformed.json` | `NotJson` | unterminated `item` array. serde_json: `EOF while parsing a list at line 8 column 0` |
| `trailing-comma.json` | `NotJson` | **trailing comma at line 5, column 3** (0-based byte offset **132**, the `}` closing `info`). Verified against `serde_json 1` — `trailing comma at line 5 column 3` — and against V8, which agrees: `line 5 column 3`, `position 132`. This is the fixture for [FR-007](../../docs/collection-viewer/v1.0/requirements.md#fr-007) (report the line/column of a syntax error). **Do not reformat this file** — the assertion is positional. |
| `not-a-collection.json` | `NotACollection` | valid JSON, but it is an OpenAPI 3.0.3 document: it *has* an `info`, so a naive check passes, yet there is no `item` |
| `not-json-object.json` | `NotACollection` | valid JSON whose root is an **array** wrapping a perfectly good collection |
| `missing-info.json` | `NotACollection` | has `item`, no `info` |
| `missing-item.json` | `NotACollection` | has `info` (declaring v2.1), no `item` |
| `v2.0-collection.json` | `UnsupportedSchema` | `info.schema` ends `/v2.0.0/collection.json` |
| `v2.0-with-broken-item.json` | `UnsupportedSchema` | v2.0 `info.schema`, **and** an `item[]` of seven structurally invalid nodes (`42`, `null`, a string, a node with neither `request` nor `item`, a node with *both*, `request: 7`, `item` as an object). **This fixture exists to prove the schema gate short-circuits.** If the reader returns `UnsupportedSchema`, the gate ran before the tree walk ([FR-004](../../docs/collection-viewer/v1.0/requirements.md#fr-004)). If it returns anything about a bad item — or panics — the gate ran too late. |
| `v1-collection.json` | `UnsupportedSchema` | genuine Collection Format **v1** shape: top-level `id`/`name`/`order`/`requests`, **no `info` block and no `schema` field at all**. To name "v1" in the message per [FR-005](../../docs/collection-viewer/v1.0/requirements.md#fr-005), the detector must sniff `order` + `requests` rather than read `info.schema`; without that sniff this degrades to `NotACollection`, which is a weaker message than FR-005 asks for. |
| `v3-collection.yaml` | `NotJson` | Collection Format v3 is YAML. FR-005 names v3 as a version to reject; because it is not JSON, it is caught one step earlier, by the parser. Newman is v2.1-JSON-only (CLAUDE.md), so this is correct — but the message should say "v3 is YAML, minim supports v2.1 JSON", not just "invalid JSON". |

**Three `AppError` variants have no committed fixture, because they are properties of the *path*,
not of the file's bytes:**

| Variant | How to exercise it |
|---|---|
| `FileNotFound` | pass `tests/fixtures/reject/does-not-exist.json` — that path is guaranteed never to exist |
| `FileUnreadable` | `chmod 000` a temp file in the test's own tempdir (skip the test when running as root) |
| `FileTooLarge` | the 64 MB cap of [ADR-015](../../docs/collection-viewer/v1.0/design.md#key-decisions): `node tests/fixtures/tools/generate-large.mjs --leaves 30000 --out $TMPDIR/huge.json` clears it comfortably. Never commit the output. |

## `tools/generate-large.mjs` — the performance fixture

```
node tests/fixtures/tools/generate-large.mjs
  -> tests/fixtures/large/collection-2000-seed0.json
     leaves=2000  bytes=5367280 (5.37 MB)
```

- **Deterministic.** The only entropy is a `mulberry32` PRNG seeded from `--seed`. No clock, no
  UUID, no hostname, no directory order. Same seed + same leaf count ⇒ byte-identical output,
  asserted by the self-check.
- **Shape.** 2,000 leaves in 10-leaf folders, folded into four folder levels; every leaf cycles
  through the five body modes and the eleven auth types, so the generated file is also a
  reasonable breadth test, not just a size test.
- **Tab-indented**, which is what Postman itself emits — and half the bytes of two-space indent,
  which is what puts 2,000 leaves at 5.37 MB rather than 10 MB.
- **Gitignored** via `tests/fixtures/large/` in the root `.gitignore`. Regenerate it; never
  commit it.

## `tools/draft04.mjs` — why not `ajv`

There is no `package.json` and no Cargo crate in this repo yet (T-001 and T-002 own those), so the
corpus has to be verifiable with a bare `node`. `draft04.mjs` implements exactly the ten keywords
the published v2.1 schema uses (`$ref type enum required properties items oneOf anyOf maxLength
minimum`) and **refuses to run** if the schema ever grows a keyword it does not implement, rather
than silently passing an unchecked constraint. Its verdicts on every fixture here were
cross-checked against `ajv-draft-04` 8.x during authoring, and the self-check carries two negative
controls to catch a validator that has gone blind.

## Where the Rust tests come in

`self-check.mjs` is a stand-in. **T-004** and **T-012** re-assert TC-U-005, TC-U-006 and TC-U-007
from `cargo test` against these same files, through minim's own reader — which is the assertion
that actually matters, since the point is that *minim* parses them, not that Node can.
