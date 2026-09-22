import { Fragment, useContext, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ThemeContext } from '@/features/theme/theme-context';
import {
  FONT_STYLE_BOLD,
  FONT_STYLE_ITALIC,
  FONT_STYLE_STRIKETHROUGH,
  FONT_STYLE_UNDERLINE,
  highlight,
  PLAIN_TEXT,
  resolveGrammar,
  type Grammar,
  type HighlightLine,
  type HighlightTheme,
  type HighlightToken,
} from '@/lib/highlight';
import { cn } from '@/lib/utils';

/**
 * The read-only code frame behind every raw body, GraphQL block and script (ux §S2b).
 *
 * **NFR-010 / NFR-009.** Collection text reaches the DOM as React children and nothing else.
 * There is no `dangerouslySetInnerHTML` anywhere in this file, and there is none downstream
 * either: `highlight()` hands back *tokens* — `{content, color, fontStyle}` — and the content of
 * each one becomes a text node under a `<span>` whose only attribute is an inline colour. A
 * collection cannot inject markup through this path even if Shiki's own output were hostile,
 * and nothing on this path evaluates the string it is displaying.
 *
 * Highlighting is an enhancement layered onto a correct first paint: the plain source renders
 * synchronously, then the tokens replace it when the grammar has loaded. A grammar that fails to
 * load leaves the plain source standing rather than an empty frame.
 */

export interface CodeBlockProps {
  /** Verbatim source out of the collection file. */
  code: string;
  /** Declared language, e.g. `body.options.raw.language`; anything unknown becomes plain text. */
  language: string | null;
  /** Accessible name for the scrollable region — "Request body", "Test script". */
  label: string;
  testId?: string;
  className?: string;
}

/**
 * The resolved theme, without requiring a provider.
 *
 * `useTheme()` throws outside `<ThemeProvider>`, which would make a code block impossible to
 * render in isolation. Syntax colours are not worth that coupling — light is a safe floor.
 */
function useCodeTheme(): HighlightTheme {
  return useContext(ThemeContext)?.theme ?? 'light';
}

function tokenStyle(token: HighlightToken): CSSProperties | undefined {
  const style: CSSProperties = {};
  if (token.color !== undefined) style.color = token.color;

  const fontStyle = token.fontStyle ?? 0;
  if (fontStyle > 0) {
    if ((fontStyle & FONT_STYLE_ITALIC) !== 0) style.fontStyle = 'italic';
    if ((fontStyle & FONT_STYLE_BOLD) !== 0) style.fontWeight = 'bold';
    const decorations: string[] = [];
    if ((fontStyle & FONT_STYLE_UNDERLINE) !== 0) decorations.push('underline');
    if ((fontStyle & FONT_STYLE_STRIKETHROUGH) !== 0) decorations.push('line-through');
    if (decorations.length > 0) style.textDecoration = decorations.join(' ');
  }

  return Object.keys(style).length === 0 ? undefined : style;
}

/** A highlight result, tagged with the inputs it was produced from. */
interface HighlightResult {
  code: string;
  grammar: Grammar;
  theme: HighlightTheme;
  lines: readonly HighlightLine[];
}

export function CodeBlock({ code, language, label, testId, className }: CodeBlockProps) {
  const grammar = resolveGrammar(language);
  const theme = useCodeTheme();
  const [result, setResult] = useState<HighlightResult | null>(null);

  // Staleness is decided during render rather than cleared by an effect: a result is used only
  // if it was produced from exactly these inputs, so switching request, language or theme falls
  // back to the plain source in the same commit that changed them, with no flash of the previous
  // request's colours. (`code` is the same string instance the DTO holds, so this is a pointer
  // comparison in practice.)
  const lines =
    result !== null && result.code === code && result.grammar === grammar && result.theme === theme
      ? result.lines
      : null;

  useEffect(() => {
    // The plain-text floor short-circuits here, so no import is even attempted (TC-U-074).
    if (grammar === PLAIN_TEXT) return;

    let cancelled = false;
    void highlight(code, grammar, theme).then(
      (next) => {
        if (!cancelled && next !== null) setResult({ code, grammar, theme, lines: next });
      },
      () => {
        // A grammar that will not load is a cosmetic failure, not a user-facing one: the
        // plain source is already on screen and stays there.
      }
    );

    return () => {
      cancelled = true;
    };
  }, [code, grammar, theme]);

  const plainLineCount = useMemo(() => code.split('\n').length, [code]);
  const lineCount = lines?.length ?? plainLineCount;
  const gutter = useMemo(
    () => Array.from({ length: lineCount }, (_, index) => String(index + 1)).join('\n'),
    [lineCount]
  );

  return (
    <div
      data-testid={testId}
      data-grammar={grammar}
      data-highlighted={lines === null ? 'false' : 'true'}
      className={cn('flex overflow-hidden rounded-md border bg-muted/30 text-xs', className)}
    >
      {/* Numbers live outside <code> so the code element's text is exactly the file's text —
          selecting or asserting on the source never picks up the gutter. */}
      <pre
        aria-hidden="true"
        className="shrink-0 border-r bg-muted/40 px-2 py-2 text-right font-mono text-muted-foreground tabular-nums select-none"
      >
        {gutter}
      </pre>
      <pre
        // Scrollable regions need to be keyboard reachable; wrapping instead would desync the
        // gutter, so the frame scrolls sideways.
        tabIndex={0}
        aria-label={label}
        className="min-w-0 flex-1 overflow-auto px-3 py-2 font-mono whitespace-pre focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <code data-testid={testId === undefined ? undefined : `${testId}-source`}>
          {lines === null
            ? code
            : lines.map((line, lineIndex) => (
                <Fragment key={lineIndex}>
                  {line.map((token, tokenIndex) => (
                    <span key={tokenIndex} style={tokenStyle(token)}>
                      {token.content}
                    </span>
                  ))}
                  {lineIndex < lines.length - 1 ? '\n' : null}
                </Fragment>
              ))}
        </code>
      </pre>
    </div>
  );
}
