import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fileNotFoundMessage } from '@/lib/error-message';
import type { RecentEntry } from '@/bindings';
import { middleTruncatePath, requestCountLabel } from './format';

export interface RecentsListProps {
  entries: readonly RecentEntry[];
  /** The row was activated — its path goes to `open_collection`. */
  onOpen: (entry: RecentEntry) => void;
  /** `forget_recent` for that path (FR-042). */
  onForget: (path: string) => void;
  /** The path currently being opened, if any. */
  openingPath?: string | null;
  /** Paths whose last open reported `fileNotFound` — they offer removal inline. */
  missingPaths?: readonly string[];
  className?: string;
}

/**
 * S1 — the recents list.
 *
 * Presentational by design: it owns no command call, so the empty shell decides what an open
 * or a forget means. Rows show name, request count and a middle-truncated path; the path is
 * the only thing narrow windows drop, because the name and the count are what identify a row.
 */
export function RecentsList({
  entries,
  onOpen,
  onForget,
  openingPath = null,
  missingPaths = [],
  className,
}: RecentsListProps) {
  if (entries.length === 0) return null;

  return (
    <section data-testid="recents" aria-labelledby="recents-heading" className={className}>
      <h2
        id="recents-heading"
        className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        Recent
      </h2>

      <ul className="flex flex-col">
        {entries.map((entry) => {
          const missing = missingPaths.includes(entry.path);
          const opening = openingPath === entry.path;

          return (
            <li key={entry.path} data-testid="recents-row" className="group">
              <div className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted focus-within:bg-muted">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate rounded-sm text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-describedby={missing ? `recents-missing-${entry.path}` : undefined}
                  onClick={() => onOpen(entry)}
                >
                  {entry.name}
                </button>

                <span
                  data-testid="recents-count"
                  className="shrink-0 text-xs tabular-nums text-muted-foreground"
                >
                  {opening ? 'Opening…' : requestCountLabel(entry.requestCount)}
                </span>

                {/* Below 1000 px the path is the first thing to go — never the name or count. */}
                <span
                  data-testid="recents-path"
                  title={entry.path}
                  className="hidden max-w-[22rem] shrink-0 font-mono text-xs text-muted-foreground min-[1000px]:block"
                >
                  {middleTruncatePath(entry.path)}
                </span>

                {/*
                  The forget control is hover-revealed *and* focus-revealed. Dropping either
                  focus variant hides it from keyboard users entirely (TC-U-061); it stays in
                  the DOM and in the tab order regardless of opacity.
                */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  data-testid="recents-forget"
                  aria-label={`Forget ${entry.name}`}
                  title={`Forget ${entry.name}`}
                  className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                  onClick={() => onForget(entry.path)}
                >
                  <X aria-hidden />
                </Button>
              </div>

              {missing && (
                <div
                  data-testid="recents-missing"
                  role="status"
                  className="flex flex-wrap items-center gap-2 px-2 pb-1.5 text-xs text-destructive"
                >
                  {/* Same sentence as the S7 dialog — `fileNotFoundMessage` is its source. */}
                  <span id={`recents-missing-${entry.path}`}>
                    {fileNotFoundMessage(entry.path)}
                  </span>
                  <Button variant="outline" size="xs" onClick={() => onForget(entry.path)}>
                    Remove from recents
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
