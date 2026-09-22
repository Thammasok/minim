import { describe, expect, it } from 'vitest';
import {
  buildVariableIndex,
  isVariableDefined,
  hasVariables,
  tokenizeVariables,
  type VariableSegment,
} from './variables';

function names(segments: readonly VariableSegment[]): string[] {
  return segments.flatMap((segment) => (segment.kind === 'variable' ? [segment.name] : []));
}

function reassemble(segments: readonly VariableSegment[]): string {
  return segments
    .map((segment) => (segment.kind === 'variable' ? segment.raw : segment.text))
    .join('');
}

describe('tokenizeVariables — TC-UNIT-041, adversarial inputs', () => {
  const cases: Array<[input: string, expected: string[]]> = [
    ['{{a}}{{b}}', ['a', 'b']],
    ['{{ a }}', ['a']],
    ['{{unclosed', []],
    ['}}{{', []],
    ['{{{x}}}', ['x']],
    ['{{}}', []],
    ['no vars', []],
    ['', []],
    ['{{baseUrl}}/v1/items?q={{term}}', ['baseUrl', 'term']],
    ['{{a}} and {{unclosed', ['a']],
  ];

  it.each(cases)('tokenizes %j', (input, expected) => {
    expect(names(tokenizeVariables(input))).toEqual(expected);
  });

  // The property that makes the chip renderer safe: nothing is lost or invented on screen.
  it.each(cases)('reassembles %j byte-for-byte', (input) => {
    expect(reassemble(tokenizeVariables(input))).toBe(input);
  });

  it('keeps the verbatim slice so a padded name is displayed as written', () => {
    expect(tokenizeVariables('{{ a }}')).toEqual([{ kind: 'variable', name: 'a', raw: '{{ a }}' }]);
  });

  it('surrounds an over-braced token with the literal braces', () => {
    expect(tokenizeVariables('{{{x}}}')).toEqual([
      { kind: 'text', text: '{' },
      { kind: 'variable', name: 'x', raw: '{{x}}' },
      { kind: 'text', text: '}' },
    ]);
  });

  it('reports whether a string has any renderable variable', () => {
    expect(hasVariables('{{a}}')).toBe(true);
    expect(hasVariables('{{}}')).toBe(false);
    expect(hasVariables('plain')).toBe(false);
  });
});

describe('buildVariableIndex — TC-UNIT-042, defined-ness', () => {
  // A disabled collection variable is still *defined*; it exists, it is merely switched off.
  const index = buildVariableIndex([
    { name: 'baseUrl', defined: true },
    { name: 'legacyId', defined: true },
    { name: 'userId', defined: false },
  ]);

  it('reads defined for a declared variable', () => {
    expect(isVariableDefined(index, 'baseUrl')).toBe(true);
    expect(isVariableDefined(index, 'legacyId')).toBe(true);
  });

  it('reads undefined for an undeclared one', () => {
    expect(isVariableDefined(index, 'userId')).toBe(false);
  });

  it('treats a name the request never mentioned as undefined rather than throwing', () => {
    expect(isVariableDefined(index, 'ghost')).toBe(false);
  });

  it('never demotes a name that any reference reported as defined', () => {
    const merged = buildVariableIndex([
      { name: 'baseUrl', defined: false },
      { name: 'baseUrl', defined: true },
    ]);
    expect(isVariableDefined(merged, 'baseUrl')).toBe(true);
  });
});
