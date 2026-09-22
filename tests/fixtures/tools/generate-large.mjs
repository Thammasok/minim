#!/usr/bin/env node
/**
 * Deterministic large-collection generator — zero dependencies, plain `node`.
 *
 *   node tests/fixtures/tools/generate-large.mjs [--seed 0] [--leaves 2000] [--out PATH]
 *
 * Produces a valid Postman Collection v2.1 JSON file with exactly `--leaves`
 * request leaves, sized to land between 4 MB and 6 MB for the default
 * (seed 0, 2000 leaves) — the performance baseline TC-U-007 asserts and the
 * input NFR-001/NFR-004 are measured against.
 *
 * Determinism: the only source of variation is a 32-bit `mulberry32` PRNG
 * seeded from `--seed`. Same seed + same leaf count => byte-identical output.
 * There is no clock, no UUID, no hostname and no filesystem order in the data.
 *
 * The output is NOT committed (see the root .gitignore) — regenerate it.
 */

import fs from 'node:fs';
import path from 'node:path';

/* ── args ──────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const out = { seed: 0, leaves: 2000, out: null, stdout: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') out.seed = Number(argv[++i]);
    else if (a === '--leaves') out.leaves = Number(argv[++i]);
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--stdout') out.stdout = true;
    else if (a === '--help' || a === '-h') {
      console.log('usage: generate-large.mjs [--seed N] [--leaves N] [--out PATH | --stdout]');
      process.exit(0);
    } else throw new Error(`unknown argument: ${a}`);
  }
  if (!Number.isInteger(out.seed) || out.seed < 0) throw new Error('--seed must be a non-negative integer');
  if (!Number.isInteger(out.leaves) || out.leaves < 1) throw new Error('--leaves must be a positive integer');
  return out;
}

/* ── deterministic PRNG ────────────────────────────────────────────────── */

/** mulberry32 — 32-bit, seedable, no dependencies, identical on every platform. */
function mulberry32(seed) {
  let a = (seed >>> 0) + 0x6d2b79f5;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── vocabulary (fixed — never derived from the environment) ───────────── */

const RESOURCES = [
  'accounts', 'invoices', 'shipments', 'products', 'orders', 'customers',
  'payments', 'refunds', 'webhooks', 'subscriptions', 'tickets', 'devices',
  'sessions', 'reports', 'audits', 'messages',
];
const VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const AUTH_TYPES = ['apikey', 'awsv4', 'basic', 'bearer', 'digest', 'edgegrid', 'hawk', 'ntlm', 'oauth1', 'oauth2', 'noauth'];
const BODY_MODES = ['raw', 'urlencoded', 'formdata', 'file', 'graphql'];
const LOREM = (
  'the quick brown fox jumps over the lazy dog while the idempotent gateway ' +
  'retries a throttled upstream and the ledger reconciles every pending entry '
).split(' ').filter(Boolean);

function filler(rnd, words) {
  const out = [];
  for (let i = 0; i < words; i++) out.push(LOREM[Math.floor(rnd() * LOREM.length)]);
  return out.join(' ');
}

function pick(rnd, arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

/* ── leaf construction ─────────────────────────────────────────────────── */

/**
 * One request leaf. Weighs roughly 2.7 KB of tab-indented JSON, which puts
 * 2,000 leaves at ~5.4 MB — inside the 4–6 MB window TC-U-007 requires.
 */
function makeLeaf(rnd, n) {
  const resource = pick(rnd, RESOURCES);
  const method = pick(rnd, VERBS);
  const mode = BODY_MODES[n % BODY_MODES.length];
  const authType = AUTH_TYPES[n % AUTH_TYPES.length];

  const body = { raw: null, urlencoded: null, formdata: null, file: null, graphql: null };
  if (mode === 'raw') {
    body.mode = 'raw';
    body.raw = JSON.stringify(
      { id: n, resource, note: filler(rnd, 10), tags: [filler(rnd, 2)] },
      null,
      2,
    );
    body.options = { raw: { language: 'json' } };
  } else if (mode === 'urlencoded') {
    body.mode = 'urlencoded';
    body.urlencoded = Array.from({ length: 3 }, (_, i) => ({
      key: `field_${i}`,
      value: filler(rnd, 3),
      description: filler(rnd, 2),
    }));
  } else if (mode === 'formdata') {
    body.mode = 'formdata';
    body.formdata = Array.from({ length: 3 }, (_, i) =>
      i % 3 === 2
        ? { key: `file_${i}`, type: 'file', src: `/tmp/fixture_${n}_${i}.bin` }
        : { key: `text_${i}`, type: 'text', value: filler(rnd, 3) },
    );
  } else if (mode === 'file') {
    body.mode = 'file';
    body.file = { src: `/tmp/payload_${n}.bin` };
  } else {
    body.mode = 'graphql';
    body.graphql = {
      query: `query Q${n}($id: ID!) {\n  ${resource}(id: $id) {\n    id\n    name\n    ${filler(rnd, 2).split(' ').join('\n    ')}\n  }\n}`,
      variables: JSON.stringify({ id: String(n) }, null, 2),
    };
  }
  for (const k of Object.keys(body)) if (body[k] === null) delete body[k];

  return {
    name: `${method} ${resource} #${n}`,
    description: filler(rnd, 4),
    request: {
      method,
      header: [
        { key: 'Accept', value: 'application/json' },
        { key: 'Content-Type', value: 'application/json' },
        { key: 'X-Request-Id', value: `req-${n}` },
        { key: 'X-Trace', value: filler(rnd, 3) },
      ],
      body,
      auth:
        authType === 'noauth'
          ? { type: 'noauth' }
          : { type: authType, [authType]: [{ key: 'token', value: `{{token_${n % 7}}}`, type: 'string' }] },
      url: {
        raw: `https://api.generated.test/v1/${resource}/${n}?page=1&limit=25`,
        protocol: 'https',
        host: ['api', 'generated', 'test'],
        path: ['v1', resource, String(n)],
        query: [
          { key: 'page', value: '1' },
          { key: 'filter', value: filler(rnd, 2) },
        ],
      },
      description: filler(rnd, 3),
    },
    event: [
      {
        listen: 'prerequest',
        script: {
          type: 'text/javascript',
          exec: [
            `// generated pre-request for leaf ${n}`,
            `pm.collectionVariables.set('leaf', '${n}');`,
            `// ${filler(rnd, 2)}`,
          ],
        },
      },
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            `pm.test('leaf ${n} responds', function () {`,
            '    pm.expect(pm.response.code).to.be.below(500);',
            '});',
            `// ${filler(rnd, 2)}`,
          ],
        },
      },
    ],
    response: [],
  };
}

/* ── tree construction ─────────────────────────────────────────────────── */

const LEAVES_PER_FOLDER = 10; // 2000 leaves -> 200 leaf folders
const FOLDERS_PER_GROUP = 5; //             -> 40 mid folders -> 8 top folders

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function generate({ seed = 0, leaves = 2000 } = {}) {
  const rnd = mulberry32(seed);

  const flat = Array.from({ length: leaves }, (_, n) => makeLeaf(rnd, n));

  // level 3: folders of leaves
  let level = chunk(flat, LEAVES_PER_FOLDER).map((group, i) => ({
    name: `Group ${i}`,
    description: filler(rnd, 4),
    item: group,
  }));
  // levels 2 and 1: fold upward until few enough roots remain (>= 4 folder levels)
  let depth = 0;
  while (level.length > FOLDERS_PER_GROUP && depth < 3) {
    depth += 1;
    level = chunk(level, FOLDERS_PER_GROUP).map((group, i) => ({
      name: `Section ${depth}.${i}`,
      item: group,
    }));
  }

  return {
    info: {
      _postman_id: `00000000-0000-4000-8000-${String(seed).padStart(12, '0')}`,
      name: `Generated Perf Collection (seed ${seed}, ${leaves} leaves)`,
      description: {
        content:
          'Deterministically generated by tests/fixtures/tools/generate-large.mjs. ' +
          'Do not commit: this file is gitignored and is meant to be regenerated.',
        type: 'text/markdown',
      },
      version: { major: 1, minor: 0, patch: 0 },
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token_0}}', type: 'string' }] },
    event: [
      {
        listen: 'prerequest',
        script: { type: 'text/javascript', exec: ["pm.collectionVariables.set('run', '1');"] },
      },
    ],
    protocolProfileBehavior: { disableBodyPruning: true },
    item: level,
    variable: Array.from({ length: 7 }, (_, i) => ({
      key: `token_${i}`,
      value: '',
      type: 'string',
    })),
  };
}

export function countLeaves(collection) {
  let n = 0;
  (function walk(items) {
    for (const it of items) {
      if (Array.isArray(it?.item)) walk(it.item);
      else if (it?.request !== undefined) n += 1;
    }
  })(collection.item ?? []);
  return n;
}

/* ── cli ───────────────────────────────────────────────────────────────── */

const isMain = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const collection = generate({ seed: args.seed, leaves: args.leaves });
  const json = JSON.stringify(collection, null, '\t'); // tabs: what Postman itself emits, and half the bytes of 2 spaces

  if (args.stdout) {
    process.stdout.write(json);
  } else {
    const dest =
      args.out ??
      path.resolve(
        new URL('../large', import.meta.url).pathname,
        `collection-${args.leaves}-seed${args.seed}.json`,
      );
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, json);
    const bytes = Buffer.byteLength(json);
    console.log(
      `wrote ${dest}\n  leaves=${countLeaves(collection)} bytes=${bytes} (${(bytes / 1e6).toFixed(2)} MB) seed=${args.seed}`,
    );
  }
}
