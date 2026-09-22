/**
 * Minimal JSON Schema **draft-04** validator — zero dependencies.
 *
 * Scope is deliberately tiny: it implements exactly the keyword set that the
 * published Postman Collection v2.1 schema actually uses, which is
 *
 *     $ref  type  enum  required  properties  items  oneOf  anyOf
 *     maxLength  minimum
 *
 * (verified against tests/fixtures/schema/collection.v2.1.0.schema.json — that
 * file contains no `additionalProperties`, `allOf`, `not`, `pattern`,
 * `dependencies`, `format`, `minItems`, `multipleOf` or `$ref` target outside
 * `#/definitions/*`). If a future schema revision adds a keyword, this file
 * must grow with it — `assertSupportedKeywords()` below fails loudly rather
 * than silently passing an unchecked constraint.
 *
 * Why not ajv: there is no Cargo crate and no package.json in this repo yet
 * (T-001/T-002 own those), so the fixture corpus must be verifiable with a bare
 * `node` binary and nothing else.
 */

const SUPPORTED = new Set([
  // structural / annotation keywords we intentionally ignore
  '$schema', 'id', 'title', 'description', 'default', 'definitions',
  // assertion keywords we implement
  '$ref', 'type', 'enum', 'required', 'properties', 'items',
  'oneOf', 'anyOf', 'maxLength', 'minimum',
]);

/** Walk the whole schema and refuse to run if it uses a keyword we do not implement. */
export function assertSupportedKeywords(schema) {
  const unsupported = new Set();
  const seen = new Set();
  (function walk(node) {
    if (node === null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach(walk); return; }
    for (const [k, v] of Object.entries(node)) {
      if (!SUPPORTED.has(k)) unsupported.add(k);
      if (k === 'properties' || k === 'definitions') Object.values(v).forEach(walk);
      else if (k === 'items' || k === 'oneOf' || k === 'anyOf') walk(v);
      else if (k === '$ref' || k === 'type' || k === 'enum' || k === 'required') continue;
      else if (v && typeof v === 'object') walk(v);
    }
  })(schema);
  if (unsupported.size > 0) {
    throw new Error(
      `draft04.mjs does not implement these schema keywords: ${[...unsupported].sort().join(', ')}`,
    );
  }
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v; // object | string | number | boolean
}

function typeMatches(want, v) {
  const actual = typeOf(v);
  if (want === 'number') return actual === 'number' || actual === 'integer';
  return want === actual;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeOf(a) !== typeOf(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (a && typeof a === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

function resolveRef(ref, root) {
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref form: ${ref}`);
  let node = root;
  for (const rawSeg of ref.slice(2).split('/')) {
    const seg = decodeURIComponent(rawSeg.replace(/~1/g, '/').replace(/~0/g, '~'));
    node = node[seg];
    if (node === undefined) throw new Error(`unresolvable $ref: ${ref}`);
  }
  return node;
}

/**
 * @returns {string[]} list of human-readable errors; empty means valid.
 */
function check(schema, data, path, root) {
  if (schema === true) return [];
  if (schema === false) return [`${path}: schema is false`];
  if (!schema || typeof schema !== 'object') return [];

  const errors = [];

  if (schema.$ref !== undefined) {
    // draft-04: $ref replaces every sibling keyword.
    return check(resolveRef(schema.$ref, root), data, path, root);
  }

  if (schema.type !== undefined) {
    const wanted = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!wanted.some((t) => typeMatches(t, data))) {
      errors.push(`${path}: expected type ${wanted.join('|')}, got ${typeOf(data)}`);
      return errors; // further keywords would only produce noise
    }
  }

  if (schema.enum !== undefined && !schema.enum.some((e) => deepEqual(e, data))) {
    errors.push(`${path}: value ${JSON.stringify(data)} not in enum ${JSON.stringify(schema.enum)}`);
  }

  if (schema.maxLength !== undefined && typeof data === 'string' && data.length > schema.maxLength) {
    errors.push(`${path}: string longer than maxLength ${schema.maxLength}`);
  }

  if (schema.minimum !== undefined && typeof data === 'number' && data < schema.minimum) {
    errors.push(`${path}: ${data} below minimum ${schema.minimum}`);
  }

  if (typeOf(data) === 'object') {
    for (const req of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(data, req)) {
        errors.push(`${path}: missing required property "${req}"`);
      }
    }
    if (schema.properties) {
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          errors.push(...check(sub, data[key], `${path}/${key}`, root));
        }
      }
    }
    // no additionalProperties in this schema — unknown members pass by design (FR-009)
  }

  if (typeOf(data) === 'array' && schema.items) {
    if (Array.isArray(schema.items)) {
      data.forEach((v, i) => {
        if (schema.items[i]) errors.push(...check(schema.items[i], v, `${path}/${i}`, root));
      });
    } else {
      data.forEach((v, i) => errors.push(...check(schema.items, v, `${path}/${i}`, root)));
    }
  }

  if (schema.anyOf) {
    const branch = schema.anyOf.map((s) => check(s, data, path, root));
    if (!branch.some((e) => e.length === 0)) {
      errors.push(`${path}: matched none of ${schema.anyOf.length} anyOf branches -> ${branch.map((e, i) => `[${i}] ${e[0]}`).join(' ; ')}`);
    }
  }

  if (schema.oneOf) {
    const branch = schema.oneOf.map((s) => check(s, data, path, root));
    const ok = branch.filter((e) => e.length === 0).length;
    if (ok === 0) {
      errors.push(`${path}: matched none of ${schema.oneOf.length} oneOf branches -> ${branch.map((e, i) => `[${i}] ${e[0]}`).join(' ; ')}`);
    } else if (ok > 1) {
      errors.push(`${path}: matched ${ok} oneOf branches, expected exactly 1`);
    }
  }

  return errors;
}

export function validate(schema, data) {
  return check(schema, data, '', schema);
}
