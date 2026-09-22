import type { ReactNode } from 'react';
import { matchRanges } from './filter';

/**
 * Wrap every literal occurrence of `needle` in a `<mark>`.
 *
 * Collection strings come from a stranger's file, so they are only ever React text
 * children — never `dangerouslySetInnerHTML` (NFR-009).
 */
export function highlight(text: string, needle: string): ReactNode {
  const ranges = matchRanges(text, needle);
  if (ranges.length === 0) return text;

  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    parts.push(
      <mark
        key={`${range.start}-${index}`}
        className="rounded-[2px] bg-amber-200/60 text-inherit dark:bg-amber-400/25"
      >
        {text.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
