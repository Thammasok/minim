# `tests/fixtures/real/` — Postman-version exports

[NFR-006](../../../docs/collection-viewer/v1.0/requirements.md#nfr-006) asks for
"a corpus of **real** collections exported by at least three different Postman versions".

## ⚠️ These are stand-ins, not real exports

**The owner confirmed they have no real Postman exports to supply.** Every file in this
directory was hand-authored to *imitate* a given Postman vintage. They were never produced by
Postman.

**Consequence: NFR-006 is only partially evidenced.** These files test what we *believe* about
Postman's output. They cannot test Postman's actual output — the whole point of the requirement
is that the export format drifts in ways we have not predicted. Treat a green run of this
directory as necessary, not sufficient.

**Action for whoever gets hold of real exports:** drop the `.json` straight into this directory,
name it `postman-<version>-export.json`, add a row to the table below, delete this warning if the
directory becomes all-real, and re-run `node tests/fixtures/tools/self-check.mjs`. No code change
is needed — the corpus tooling globs this directory.

## The stand-ins

| File | Imitates | The differences it carries |
|---|---|---|
| `postman-8.12.5-export.json` | Postman **8.12.5** | `info.description` is a **plain string**. `_postman_id` present, **no** `_exporter_id`. Every `request.url` is a **bare string**. No `protocolProfileBehavior` anywhere. `script.exec` as an array. No collection-level `auth` or `event`. |
| `postman-10.24.16-export.json` | Postman **10.24.16** | `info.description` is a **structured object** (`content` + `type`). `_postman_id` **and** `_exporter_id`. Every `url` is a **structured object with `raw`**, `host` as an array, `path` as segments, `query`, and `variable` for `:path` params. `protocolProfileBehavior` at the **item** level. Collection-level `auth` (bearer) and `event` (prerequest + test). One saved `response` example. |
| `postman-11.34.2-export.json` | Postman **11.34.2** | Everything in the v10 shape, plus `info._collection_link`, a structured `info.version`, `protocolProfileBehavior` at the **collection** level, `script.packages: {}` (a field the published schema does not know about — an FR-009 case straight from a real export), a folder-level `auth: { type: noauth }` override, `disabled` headers and query params, a `null` query value, `formdata` with a file part, and a `graphql` body. |

### Known divergence between real Postman and the published schema

Postman 11 writes `"type": "default"` on collection variables. The published v2.1 schema's
`variable.type` enum is `["string", "boolean", "any", "number"]` — `"default"` is **not** in it.
Because the acceptance criterion requires every v2.1 fixture here to validate against the
published schema, these stand-ins use `"string"`. The `"default"` case lives in
[`../warn/load-warnings.json`](../warn/load-warnings.json) instead, which is exempt from schema
validation by design. **The reader must not reject a variable whose `type` is unrecognised.**
