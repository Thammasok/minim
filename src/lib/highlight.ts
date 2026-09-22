import type { HighlighterCore, LanguageInput } from 'shiki/core';

/**
 * ADR-011 — Shiki, fine-grained bundle, lazily loaded per language.
 *
 * Nothing here is imported at module scope except *types*, which erase. `shiki/core`, the regex
 * engine, the two themes and every grammar arrive through dynamic `import()` the first time a
 * highlightable body is actually shown, so the entry chunk pays nothing for a viewer that only
 * ever opens the Params tab (NFR-003), and only the six grammars named below can ever reach the
 * bundle at all (NFR-013).
 *
 * The engine is the JavaScript RegExp engine rather than Oniguruma: it drops the ~500 kB wasm
 * binary from the distribution, and all five real grammars tokenize correctly under it. It is
 * built `forgiving`, so a grammar pattern the JS engine cannot emulate is skipped rather than
 * thrown — the worst case degrades a few tokens, never the panel.
 */

/** The only grammars ADR-011 lets into the bundle. `text` is the floor, not a grammar. */
export const HIGHLIGHT_GRAMMARS = ['js', 'json', 'xml', 'html', 'graphql', 'text'] as const;

export type Grammar = (typeof HIGHLIGHT_GRAMMARS)[number];

/** FR-027 — an absent or unrecognized declaration lands here. */
export const PLAIN_TEXT = 'text' satisfies Grammar;

export type HighlightTheme = 'light' | 'dark';

/** One token of one line. A deliberately narrower shape than Shiki's `ThemedToken`. */
export interface HighlightToken {
  content: string;
  color?: string;
  /** vscode-textmate bitmask: 1 italic · 2 bold · 4 underline · 8 strikethrough. */
  fontStyle?: number;
}

export type HighlightLine = readonly HighlightToken[];

export const FONT_STYLE_ITALIC = 1;
export const FONT_STYLE_BOLD = 2;
export const FONT_STYLE_UNDERLINE = 4;
export const FONT_STYLE_STRIKETHROUGH = 8;

/**
 * What `body.options.raw.language` and `_postman_previewlanguage` are allowed to say.
 *
 * Postman writes bare names; hand-edited collections and some exporters write media types. Both
 * are normalized before the lookup, so `application/vnd.api+json` and `JSON ` both find `json`.
 * Anything not on this table is plain text — the table *is* the allow-list.
 */
const GRAMMAR_ALIASES: Readonly<Record<string, Grammar>> = {
  js: 'js',
  jsx: 'js',
  javascript: 'js',
  ecmascript: 'js',
  node: 'js',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  xml: 'xml',
  svg: 'xml',
  soap: 'xml',
  rss: 'xml',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  graphql: 'graphql',
  gql: 'graphql',
  text: 'text',
  txt: 'text',
  plain: 'text',
  plaintext: 'text',
};

/** Grammar → Shiki's own language id. `text` is absent: it never reaches Shiki. */
const SHIKI_LANG_ID: Readonly<Record<Exclude<Grammar, 'text'>, string>> = {
  js: 'javascript',
  json: 'json',
  xml: 'xml',
  html: 'html',
  graphql: 'graphql',
};

/**
 * The six-entry import table ADR-011 is really about.
 *
 * `text` has no entry *by construction*: asking for plain text cannot reach a dynamic import,
 * which is what TC-U-074 asserts. Adding a seventh grammar means adding a line here, which is
 * exactly the review moment NFR-013 wants.
 */
const GRAMMAR_LOADERS: Readonly<Record<Exclude<Grammar, 'text'>, () => LanguageInput>> = {
  js: () => import('@shikijs/langs/javascript'),
  json: () => import('@shikijs/langs/json'),
  xml: () => import('@shikijs/langs/xml'),
  html: () => import('@shikijs/langs/html'),
  graphql: () => import('@shikijs/langs/graphql'),
};

const SHIKI_THEME_ID: Readonly<Record<HighlightTheme, string>> = {
  light: 'github-light-default',
  dark: 'github-dark-default',
};

/**
 * FR-027 — the declared language, normalized onto the six.
 *
 * Total by construction: there is no input for which this throws or returns something the
 * loader table cannot serve.
 */
export function resolveGrammar(declared: string | null | undefined): Grammar {
  if (declared === null || declared === undefined) return PLAIN_TEXT;

  let key = declared.trim().toLowerCase();
  if (key === '') return PLAIN_TEXT;

  // "application/json; charset=utf-8" → "application/json"
  const semicolon = key.indexOf(';');
  if (semicolon !== -1) key = key.slice(0, semicolon).trim();
  // "application/json" → "json"
  const slash = key.lastIndexOf('/');
  if (slash !== -1) key = key.slice(slash + 1);
  // "vnd.api+json" → "json"
  const plus = key.lastIndexOf('+');
  if (plus !== -1) key = key.slice(plus + 1);

  return GRAMMAR_ALIASES[key] ?? PLAIN_TEXT;
}

let highlighterPromise: Promise<HighlighterCore> | null = null;
const grammarPromises = new Map<Grammar, Promise<void>>();

async function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
    ]);

    return createHighlighterCore({
      // Both themes up front: switching theme must not re-download anything, and they are
      // small JSON next to a grammar.
      themes: [
        import('@shikijs/themes/github-light-default'),
        import('@shikijs/themes/github-dark-default'),
      ],
      langs: [],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  })();

  return highlighterPromise;
}

async function ensureGrammar(highlighter: HighlighterCore, grammar: Grammar): Promise<void> {
  if (grammar === PLAIN_TEXT) return;

  // Memoized on the promise, not on a "loaded" flag — two panels mounting in the same tick
  // must not both pay for the grammar.
  let pending = grammarPromises.get(grammar);
  if (pending === undefined) {
    pending = highlighter.loadLanguage(GRAMMAR_LOADERS[grammar]()).then(() => undefined);
    grammarPromises.set(grammar, pending);
  }
  await pending;
}

/**
 * Tokenize `code` for display.
 *
 * Returns `null` for plain text — and returns it *before touching any import*, so the plain-text
 * path costs nothing and downloads nothing (TC-U-074). The caller renders the source verbatim in
 * that case, which is also the fallback when a grammar fails to load.
 *
 * Tokens are data, never markup: the caller turns them into React text nodes.
 */
export async function highlight(
  code: string,
  grammar: Grammar,
  theme: HighlightTheme
): Promise<readonly HighlightLine[] | null> {
  if (grammar === PLAIN_TEXT) return null;

  const highlighter = await getHighlighter();
  await ensureGrammar(highlighter, grammar);

  const { tokens } = highlighter.codeToTokens(code, {
    lang: SHIKI_LANG_ID[grammar],
    theme: SHIKI_THEME_ID[theme],
  });

  return tokens.map((line) =>
    line.map(({ content, color, fontStyle }) => ({ content, color, fontStyle }))
  );
}

/** Test seam — drops the memoized highlighter so a suite can observe a cold start. */
export function resetHighlighterForTests(): void {
  highlighterPromise = null;
  grammarPromises.clear();
}
