import type { VarRef } from '@/bindings';

/**
 * The `{{variable}}` tokenizer behind FR-035.
 *
 * Collection strings are a stranger's data, so this file never produces markup — only a list
 * of segments the renderer turns into React text children and chips. Two properties are load
 * bearing and asserted in `variables.test.ts`:
 *
 * 1. **Reassembly.** Concatenating every segment's source text reproduces the input exactly.
 *    That is why a token carries both `name` (trimmed, for the defined-ness lookup) and `raw`
 *    (the verbatim slice, which is what the chip displays) — `{{ baseUrl }}` must not silently
 *    become `{{baseUrl}}` on screen.
 * 2. **No throw, ever.** `{{unclosed`, `}}{{`, `{{}}` and `{{{x}}}` all have a defined answer.
 */

export type VariableSegment =
  { kind: 'text'; text: string } | { kind: 'variable'; name: string; raw: string };

const OPEN = '{{';
const CLOSE = '}}';

export function tokenizeVariables(source: string): VariableSegment[] {
  const segments: VariableSegment[] = [];
  let cursor = 0;
  let literalStart = 0;

  const flushLiteral = (end: number) => {
    if (end > literalStart) segments.push({ kind: 'text', text: source.slice(literalStart, end) });
  };

  while (cursor < source.length) {
    const opened = source.indexOf(OPEN, cursor);
    if (opened === -1) break;
    const closed = source.indexOf(CLOSE, opened + OPEN.length);
    // Unclosed: the rest of the string is literal. Postman itself leaves it alone too.
    if (closed === -1) break;

    // `{{{x}}}` must yield the token `x` between two literal braces, not the token `{x`, so the
    // opener that counts is the innermost one before this closer.
    const innermost = source.lastIndexOf(OPEN, closed - OPEN.length);
    const start = innermost > opened ? innermost : opened;
    const name = source.slice(start + OPEN.length, closed).trim();

    if (name === '') {
      // `{{}}` names nothing; it stays literal text and we step past it.
      cursor = closed + CLOSE.length;
      continue;
    }

    flushLiteral(start);
    segments.push({ kind: 'variable', name, raw: source.slice(start, closed + CLOSE.length) });
    cursor = closed + CLOSE.length;
    literalStart = cursor;
  }

  flushLiteral(source.length);
  return segments;
}

/** True when a string contains at least one renderable `{{variable}}`. */
export function hasVariables(source: string): boolean {
  return tokenizeVariables(source).some((segment) => segment.kind === 'variable');
}

/**
 * Which `{{names}}` this request mentions, and whether the collection declares them.
 *
 * Defined-ness is the Rust core's answer (`RequestDetail.variableRefs`), not a guess: a
 * *disabled* collection variable still counts as defined — it exists, it is merely off
 * (TC-UNIT-042) — and that judgement belongs on the side that read the file.
 */
export type VariableIndex = ReadonlyMap<string, boolean>;

export const EMPTY_VARIABLE_INDEX: VariableIndex = new Map<string, boolean>();

export function buildVariableIndex(refs: readonly VarRef[]): VariableIndex {
  const index = new Map<string, boolean>();
  for (const ref of refs) {
    index.set(ref.name, (index.get(ref.name) ?? false) || ref.defined);
  }
  return index;
}

/** Unknown to the index means undefined — the honest answer, and the visible one. */
export function isVariableDefined(index: VariableIndex, name: string): boolean {
  return index.get(name) ?? false;
}
