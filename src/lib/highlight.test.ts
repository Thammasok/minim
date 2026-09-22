import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HIGHLIGHT_GRAMMARS,
  PLAIN_TEXT,
  highlight,
  resolveGrammar,
  resetHighlighterForTests,
  type Grammar,
} from './highlight';

/**
 * ADR-011 — the fine-grained, lazily loaded bundle.
 *
 * `shiki/core` is mocked here for one reason: the plain-text path must be provably *un*taken.
 * A spy on the module the highlighter is built from is the only assertion that can tell "we
 * highlighted nothing" apart from "we loaded a 400 kB highlighter and then highlighted nothing".
 */

const shiki = vi.hoisted(() => ({
  createHighlighterCore: vi.fn(),
  codeToTokens: vi.fn(),
  loadLanguage: vi.fn(),
}));

vi.mock('shiki/core', () => ({
  createHighlighterCore: shiki.createHighlighterCore,
}));

vi.mock('shiki/engine/javascript', () => ({
  createJavaScriptRegexEngine: vi.fn(() => ({ engine: 'js' })),
}));

beforeEach(() => {
  resetHighlighterForTests();
  vi.clearAllMocks();
  shiki.loadLanguage.mockResolvedValue(undefined);
  shiki.codeToTokens.mockReturnValue({
    tokens: [[{ content: 'hello', color: '#111111', fontStyle: 0, offset: 0 }]],
  });
  shiki.createHighlighterCore.mockResolvedValue({
    codeToTokens: shiki.codeToTokens,
    loadLanguage: shiki.loadLanguage,
  });
});

afterEach(() => {
  resetHighlighterForTests();
});

describe('resolveGrammar (FR-027)', () => {
  it('maps every declared language Postman writes onto one of the six', () => {
    const cases: [string, Grammar][] = [
      ['json', 'json'],
      ['javascript', 'js'],
      ['js', 'js'],
      ['xml', 'xml'],
      ['html', 'html'],
      ['graphql', 'graphql'],
      ['text', 'text'],
    ];
    for (const [declared, expected] of cases) {
      expect(resolveGrammar(declared)).toBe(expected);
    }
  });

  it('normalizes case, padding, media types and structured suffixes', () => {
    expect(resolveGrammar('  JSON ')).toBe('json');
    expect(resolveGrammar('application/json; charset=utf-8')).toBe('json');
    expect(resolveGrammar('application/vnd.api+json')).toBe('json');
    expect(resolveGrammar('text/html')).toBe('html');
    expect(resolveGrammar('image/svg+xml')).toBe('xml');
  });

  // TC-U-074 — an undeclared language falls back to plain text.
  it('falls back to plain text for absent, empty and unrecognized declarations', () => {
    expect(resolveGrammar(null)).toBe(PLAIN_TEXT);
    expect(resolveGrammar(undefined)).toBe(PLAIN_TEXT);
    expect(resolveGrammar('')).toBe(PLAIN_TEXT);
    expect(resolveGrammar('   ')).toBe(PLAIN_TEXT);
    expect(resolveGrammar('rust')).toBe(PLAIN_TEXT);
    expect(resolveGrammar('yaml')).toBe(PLAIN_TEXT);
  });

  it('only ever returns one of the six grammars ADR-011 allows', () => {
    const declared = ['json', 'lolcode', '', 'text/xml', 'GraphQL', 'application/x-thing'];
    for (const value of declared) {
      expect(HIGHLIGHT_GRAMMARS).toContain(resolveGrammar(value));
    }
  });
});

describe('highlight (ADR-011, NFR-003)', () => {
  // TC-U-074 — the plain-text grammar is used and no fetch is attempted.
  it('returns null for plain text without constructing a highlighter at all', async () => {
    const grammar = resolveGrammar('text');
    expect(grammar).toBe('text');

    await expect(highlight('hello', grammar, 'light')).resolves.toBeNull();

    expect(shiki.createHighlighterCore).not.toHaveBeenCalled();
    expect(shiki.loadLanguage).not.toHaveBeenCalled();
    expect(shiki.codeToTokens).not.toHaveBeenCalled();
  });

  it('loads the highlighter and the grammar for a declared language', async () => {
    const lines = await highlight('{"a":1}', 'json', 'light');

    expect(shiki.createHighlighterCore).toHaveBeenCalledTimes(1);
    expect(shiki.loadLanguage).toHaveBeenCalledTimes(1);
    expect(shiki.codeToTokens).toHaveBeenCalledWith('{"a":1}', {
      lang: 'json',
      theme: 'github-light-default',
    });
    expect(lines).toEqual([[{ content: 'hello', color: '#111111', fontStyle: 0 }]]);
  });

  it('builds the highlighter once and each grammar once, however many blocks ask', async () => {
    await Promise.all([
      highlight('a', 'json', 'light'),
      highlight('b', 'json', 'light'),
      highlight('c', 'js', 'light'),
    ]);

    expect(shiki.createHighlighterCore).toHaveBeenCalledTimes(1);
    // json + js — not one per call, which is what NFR-003 is protecting.
    expect(shiki.loadLanguage).toHaveBeenCalledTimes(2);
  });

  // "Only the six needed Shiki grammars are bundled" — the loader table is the bundle contract.
  it('has a loader for exactly the five real grammars, and none for plain text', async () => {
    for (const grammar of HIGHLIGHT_GRAMMARS) {
      await highlight('x', grammar, 'light');
    }

    expect(shiki.loadLanguage).toHaveBeenCalledTimes(HIGHLIGHT_GRAMMARS.length - 1);
    const langs = shiki.codeToTokens.mock.calls.map((call) => (call[1] as { lang: string }).lang);
    expect(new Set(langs)).toEqual(new Set(['javascript', 'json', 'xml', 'html', 'graphql']));
  });

  it('asks Shiki for the dark theme when the app is dark', async () => {
    await highlight('{"a":1}', 'json', 'dark');
    expect(shiki.codeToTokens).toHaveBeenCalledWith('{"a":1}', {
      lang: 'json',
      theme: 'github-dark-default',
    });
  });
});
