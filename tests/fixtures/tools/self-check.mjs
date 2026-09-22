#!/usr/bin/env node
/**
 * Fixture-corpus self-check — zero dependencies, plain `node`.
 *
 *   node tests/fixtures/tools/self-check.mjs
 *
 * This is a *stand-in* for the Rust tests. T-004/T-012 will re-assert TC-U-005,
 * TC-U-006 and TC-U-007 from `cargo test` against the same files; until the
 * crate exists, this script is what proves the corpus holds up. Exit code 0 =
 * every assertion passed.
 *
 * It deliberately checks the corpus *as data*, not minim's reader — nothing
 * here imports anything from src-tauri/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, assertSupportedKeywords } from './draft04.mjs';
import { generate, countLeaves } from './generate-large.mjs';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V21_SUFFIX = '/v2.1.0/collection.json';

let passed = 0;
const failures = [];

function check(label, fn) {
  let detail;
  try {
    detail = fn();
  } catch (err) {
    failures.push(`${label}\n      ${err.message}`);
    console.log(`  FAIL  ${label}`);
    return;
  }
  passed += 1;
  console.log(`  ok    ${label}${detail ? `  ${detail}` : ''}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const read = (rel) => fs.readFileSync(path.join(FIXTURES, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));
const listJson = (dir) =>
  fs
    .readdirSync(path.join(FIXTURES, dir))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => `${dir}/${f}`);

/** Every leaf in document order, with its folder path — the Rust `walkRequests`. */
function walkRequests(items, cb, folderPath = []) {
  for (const it of items ?? []) {
    if (Array.isArray(it?.item)) walkRequests(it.item, cb, [...folderPath, it.name ?? '']);
    else if (it?.request !== undefined) cb(it, folderPath);
  }
}

function maxFolderDepth(items, depth = 0) {
  let max = depth;
  for (const it of items ?? []) {
    if (Array.isArray(it?.item)) max = Math.max(max, maxFolderDepth(it.item, depth + 1));
  }
  return max;
}

/* ── the corpus, declared once ─────────────────────────────────────────── */

const SCHEMA = readJson('schema/collection.v2.1.0.schema.json');

/** Fixtures that claim v2.1 AND are expected to validate against the published schema. */
const V21_VALIDATING = ['torture.json', ...listJson('real'), ...listJson('edge')];

/** Claims v2.1, but is deliberately schema-invalid — must still open (FR-008/FR-009). */
const V21_NON_VALIDATING = listJson('warn');

/** reject/<file> -> the AppError variant the reader must produce. */
const REJECTIONS = {
  'empty.json': 'NotJson',
  'malformed.json': 'NotJson',
  'trailing-comma.json': 'NotJson',
  'not-a-collection.json': 'NotACollection',
  'not-json-object.json': 'NotACollection',
  'missing-info.json': 'NotACollection',
  'missing-item.json': 'NotACollection',
  'v1-collection.json': 'UnsupportedSchema',
  'v2.0-collection.json': 'UnsupportedSchema',
  'v2.0-with-broken-item.json': 'UnsupportedSchema',
};

/* ── checks ────────────────────────────────────────────────────────────── */

console.log('\nvalidator');

check('the vendored v2.1 schema uses only keywords draft04.mjs implements', () => {
  assertSupportedKeywords(SCHEMA);
});

check('negative control: a collection missing info.schema is reported INVALID', () => {
  const bad = readJson('torture.json');
  delete bad.info.schema;
  assert(validate(SCHEMA, bad).length > 0, 'validator accepted a collection with no info.schema');
});

check('negative control: a header with no value is reported INVALID', () => {
  const bad = readJson('torture.json');
  bad.item[1].item[0].request.header[0] = { key: 'X-No-Value' };
  assert(validate(SCHEMA, bad).length > 0, 'validator accepted a header missing "value"');
});

console.log('\nTC-U-005 — every v2.1 fixture declares info.schema ending in /v2.1.0/collection.json');

for (const rel of [...V21_VALIDATING, ...V21_NON_VALIDATING]) {
  check(rel, () => {
    const c = readJson(rel);
    assert(typeof c?.info?.schema === 'string', 'info.schema is missing or not a string');
    assert(
      c.info.schema.endsWith(V21_SUFFIX),
      `info.schema is ${JSON.stringify(c.info.schema)}`,
    );
    return `-> ${c.info.schema}`;
  });
}

console.log('\nAC — every fixture that claims v2.1 validates against the published v2.1 schema');

for (const rel of V21_VALIDATING) {
  check(rel, () => {
    const errs = validate(SCHEMA, readJson(rel));
    assert(errs.length === 0, `${errs.length} error(s):\n      ${errs.slice(0, 5).join('\n      ')}`);
  });
}

check('warn/ fixtures are schema-INVALID on purpose (they exercise LoadWarning)', () => {
  for (const rel of V21_NON_VALIDATING) {
    assert(validate(SCHEMA, readJson(rel)).length > 0, `${rel} unexpectedly validates`);
  }
  return `(${V21_NON_VALIDATING.length} file)`;
});

console.log('\nTC-U-006 — torture.json covers all five body modes');

check('distinct body.mode set == {raw, urlencoded, formdata, file, graphql}', () => {
  const modes = new Set();
  walkRequests(readJson('torture.json').item, (leaf) => {
    const mode = leaf.request?.body?.mode;
    if (mode) modes.add(mode);
  });
  const got = [...modes].sort().join(',');
  const want = ['file', 'formdata', 'graphql', 'raw', 'urlencoded'].join(',');
  assert(got === want, `got {${got}}`);
  return `{${got}}`;
});

console.log('\nAC — torture.json polymorphism, auth and structure coverage');

const torture = readJson('torture.json');
const leaves = [];
walkRequests(torture.item, (leaf, folderPath) => leaves.push({ leaf, folderPath }));

function anyLeaf(pred) {
  return leaves.some(({ leaf }) => {
    try {
      return pred(leaf);
    } catch {
      return false;
    }
  });
}

const COVERAGE = {
  'FR-010 url as a string': (l) => typeof l.request.url === 'string',
  'FR-010 url as an object WITH raw': (l) =>
    typeof l.request.url === 'object' && typeof l.request.url.raw === 'string',
  'FR-010 url as an object WITHOUT raw': (l) =>
    typeof l.request.url === 'object' && l.request.url !== null && l.request.url.raw === undefined,
  'FR-010 url host as an array': (l) => Array.isArray(l.request.url?.host),
  'FR-010 url host as a string': (l) => typeof l.request.url?.host === 'string',
  'FR-010 url path as an array of segments': (l) => Array.isArray(l.request.url?.path),
  'FR-010 url path as a string': (l) => typeof l.request.url?.path === 'string',
  'FR-010 url path segment as an OBJECT (path variable)': (l) =>
    Array.isArray(l.request.url?.path) && l.request.url.path.some((s) => typeof s === 'object'),
  'FR-010 url with an explicit port': (l) => typeof l.request.url?.port === 'string',
  'FR-011 header as an array': (l) => Array.isArray(l.request.header),
  'FR-011 header as a raw block string': (l) => typeof l.request.header === 'string',
  'FR-011 raw header block containing a line with no colon': (l) =>
    typeof l.request.header === 'string' &&
    l.request.header.split(/\r?\n/).some((line) => line.trim() && !line.includes(':')),
  'FR-011 raw header block containing a value with a colon in it': (l) =>
    typeof l.request.header === 'string' &&
    l.request.header.split(/\r?\n/).some((line) => line.split(':').length > 2),
  'FR-012 exec as an array of lines': (l) =>
    (l.event ?? []).some((e) => Array.isArray(e.script?.exec)),
  'FR-012 exec as a single string': (l) => (l.event ?? []).some((e) => typeof e.script?.exec === 'string'),
  'FR-012 script with src instead of exec (src as string)': (l) =>
    (l.event ?? []).some((e) => typeof e.script?.src === 'string'),
  'FR-012 script with src as a url OBJECT': (l) =>
    (l.event ?? []).some((e) => e.script?.src && typeof e.script.src === 'object'),
  'FR-013 item description as a string': (l) => typeof l.description === 'string' && l.description !== '',
  'FR-013 item description as an object': (l) => l.description && typeof l.description === 'object',
  'FR-013 item description as null': (l) => l.description === null,
  'FR-013 request description as a string': (l) => typeof l.request.description === 'string',
  'FR-013 request description as an object': (l) =>
    l.request.description && typeof l.request.description === 'object',
  'FR-013 header description as a string': (l) =>
    Array.isArray(l.request.header) && l.request.header.some((h) => typeof h.description === 'string'),
  'FR-013 header description as an object': (l) =>
    Array.isArray(l.request.header) &&
    l.request.header.some((h) => h.description && typeof h.description === 'object'),
  'FR-013 query-param description as an object': (l) =>
    (l.request.url?.query ?? []).some((q) => q.description && typeof q.description === 'object'),
  'FR-009 unknown field on an ItemRequest': (l) => l.x_minim_unknown_item !== undefined,
  'FR-009 unknown field on a Request': (l) => l.request.x_minim_unknown_request !== undefined,
  'FR-009 unknown field on a Url': (l) => l.request.url?.x_minim_unknown_url !== undefined,
  'FR-009 unknown field on a Header': (l) =>
    Array.isArray(l.request.header) && l.request.header.some((h) => h.x_minim_unknown_header !== undefined),
  'FR-009 unknown field on a Body': (l) => l.request.body?.x_minim_unknown_body !== undefined,
  'FR-009 unknown field on an Auth': (l) => l.request.auth?.x_minim_unknown_auth !== undefined,
  'auth explicitly null on a request': (l) => l.request.auth === null,
  'auth absent (inherits from the folder)': (l) => l.request.auth === undefined && (l.name ?? '').includes('inherits the folder'),
  'request expressed as a bare URL string': (l) => typeof l.request === 'string',
  'leaf with no name at all': (l) => l.name === undefined,
  'leaf with an empty-string name': (l) => l.name === '',
  'saved example whose header is a raw block string': (l) =>
    (l.response ?? []).some((r) => typeof r.header === 'string'),
};

for (const [label, pred] of Object.entries(COVERAGE)) {
  check(label, () => assert(anyLeaf(pred), 'no leaf in torture.json exhibits this shape'));
}

check('FR-009 unknown field at the collection root and on info', () => {
  assert(torture.x_minim_unknown_root !== undefined, 'no unknown field at the root');
  assert(torture.info.x_minim_unknown_info !== undefined, 'no unknown field on info');
});

check('FR-012 collection-level exec appears as both an array and a string', () => {
  const shapes = new Set((torture.event ?? []).map((e) => (Array.isArray(e.script?.exec) ? 'array' : typeof e.script?.exec)));
  assert(shapes.has('array') && shapes.has('string'), `saw ${[...shapes].join(',')}`);
});

check('every auth type in the published enum appears in torture.json', () => {
  const wanted = SCHEMA.definitions.auth.properties.type.enum;
  const seen = new Set();
  const collect = (a) => {
    if (a && typeof a === 'object' && typeof a.type === 'string') seen.add(a.type);
  };
  (function walk(items) {
    for (const it of items ?? []) {
      collect(it.auth);
      collect(it.request?.auth);
      if (Array.isArray(it.item)) walk(it.item);
    }
  })(torture.item);
  collect(torture.auth);
  const missing = wanted.filter((t) => !seen.has(t));
  assert(missing.length === 0, `missing: ${missing.join(', ')}`);
  return `(${wanted.length}: ${wanted.join(' ')})`;
});

check('FR-014 folders nest at least 5 deep', () => {
  const depth = maxFolderDepth(torture.item);
  assert(depth >= 5, `max folder depth is ${depth}`);
  return `max depth ${depth}`;
});

check('FR-014 an ItemGroup with no name exists', () => {
  let found = false;
  (function walk(items) {
    for (const it of items ?? []) {
      if (Array.isArray(it.item)) {
        if (it.name === undefined) found = true;
        walk(it.item);
      }
    }
  })(torture.item);
  assert(found, 'every folder in torture.json has a name');
});

check('FR-022 edge/empty-item.json is a valid v2.1 collection with zero items', () => {
  const c = readJson('edge/empty-item.json');
  assert(Array.isArray(c.item) && c.item.length === 0, 'item[] is not empty');
  assert(validate(SCHEMA, c).length === 0, 'does not validate');
});

console.log('\nAC — reject/ holds one file per AppError rejection variant');

for (const [file, variant] of Object.entries(REJECTIONS)) {
  check(`reject/${file} -> ${variant}`, () => {
    const text = read(`reject/${file}`);
    let parsed;
    let parseFailed = false;
    try {
      parsed = JSON.parse(text);
    } catch {
      parseFailed = true;
    }

    if (variant === 'NotJson') {
      assert(parseFailed, 'the file parsed as JSON, so it cannot exercise NotJson');
      return;
    }
    assert(!parseFailed, 'the file does not parse as JSON, so it cannot reach the gate');

    if (variant === 'NotACollection') {
      const isCollection =
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        typeof parsed.info === 'object' &&
        Array.isArray(parsed.item);
      assert(!isCollection, 'the file does look like a collection');
      return;
    }

    if (variant === 'UnsupportedSchema') {
      const declared = parsed?.info?.schema;
      assert(
        typeof declared !== 'string' || !declared.endsWith(V21_SUFFIX),
        `info.schema is ${JSON.stringify(declared)} — that is v2.1`,
      );
    }
  });
}

check('reject/v2.0-with-broken-item.json really does carry a structurally invalid item tree', () => {
  const c = readJson('reject/v2.0-with-broken-item.json');
  const bad = c.item.filter(
    (it) =>
      it === null ||
      typeof it !== 'object' ||
      (!Array.isArray(it.item) && (it.request === undefined || typeof it.request !== 'object')) ||
      (Array.isArray(it.item) && it.request !== undefined) ||
      (it.item !== undefined && !Array.isArray(it.item)),
  );
  assert(bad.length >= 5, `only ${bad.length} malformed nodes`);
  return `${bad.length} malformed nodes after a non-v2.1 info.schema`;
});

check('reject/trailing-comma.json fails at the documented line 5, column 3', () => {
  const text = read('reject/trailing-comma.json');
  let msg = null;
  try {
    JSON.parse(text);
  } catch (e) {
    msg = e.message;
  }
  assert(msg !== null, 'the file parsed');
  const m = /line (\d+) column (\d+)/.exec(msg);
  assert(m, `could not read a line/column out of: ${msg}`);
  assert(m[1] === '5' && m[2] === '3', `parser reported line ${m[1]} column ${m[2]}, README says 5:3`);
  assert(text.slice(132, 133) === '}', 'byte offset 132 is not the offending "}"');
  return 'line 5, column 3, byte offset 132';
});

check('reject/v3-collection.yaml is present and is not JSON', () => {
  const text = read('reject/v3-collection.yaml');
  let failed = false;
  try {
    JSON.parse(text);
  } catch {
    failed = true;
  }
  assert(failed, 'the v3 YAML fixture parsed as JSON');
});

console.log('\nTC-U-007 — the generated large fixture');

check('generate(seed=0, leaves=2000) yields exactly 2000 request leaves', () => {
  const c = generate({ seed: 0, leaves: 2000 });
  const n = countLeaves(c);
  assert(n === 2000, `counted ${n}`);
  return `${n} leaves`;
});

check('generate(seed=0, leaves=2000) is 4 MB < size < 6 MB', () => {
  const bytes = Buffer.byteLength(JSON.stringify(generate({ seed: 0, leaves: 2000 }), null, '\t'));
  assert(bytes > 4_000_000 && bytes < 6_000_000, `${bytes} bytes`);
  return `${bytes} bytes (${(bytes / 1e6).toFixed(2)} MB)`;
});

check('the generator is deterministic — same seed, byte-identical output', () => {
  const a = JSON.stringify(generate({ seed: 0, leaves: 200 }), null, '\t');
  const b = JSON.stringify(generate({ seed: 0, leaves: 200 }), null, '\t');
  const c = JSON.stringify(generate({ seed: 1, leaves: 200 }), null, '\t');
  assert(a === b, 'two runs at seed 0 differ');
  assert(a !== c, 'seed 0 and seed 1 produced identical output');
});

check('the generated collection validates against the published v2.1 schema', () => {
  const errs = validate(SCHEMA, generate({ seed: 0, leaves: 120 }));
  assert(errs.length === 0, errs.slice(0, 3).join(' ; '));
});

check('the generated collection is NOT committed (root .gitignore covers it)', () => {
  const ignore = path.resolve(FIXTURES, '../../.gitignore');
  assert(fs.existsSync(ignore), '.gitignore does not exist at the repo root');
  const lines = fs.readFileSync(ignore, 'utf8').split(/\r?\n/).map((l) => l.trim());
  assert(lines.includes('tests/fixtures/large/'), '.gitignore has no "tests/fixtures/large/" line');
});

/* ── summary ───────────────────────────────────────────────────────────── */

console.log(`\n${'─'.repeat(72)}`);
if (failures.length === 0) {
  console.log(`ALL PASSED — ${passed} assertions`);
  process.exit(0);
}
console.log(`${passed} passed, ${failures.length} FAILED\n`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(1);
