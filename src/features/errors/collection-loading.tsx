import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { fileName } from '@/lib/error-message';

/**
 * How long a load may run before minim admits it might be slow.
 *
 * Below this the Cancel button would flash on every ordinary open — visual noise that makes the
 * app feel unreliable — so the skeleton goes up immediately and Cancel joins it only once the
 * load has actually outstayed its welcome (design review heuristic #1).
 */
export const CANCEL_VISIBLE_AFTER_MS = 400;

const SKELETON_WIDTHS = ['w-4/5', 'w-3/5', 'w-11/12', 'w-2/3', 'w-3/4', 'w-1/2'] as const;

export interface CollectionLoadingProps {
  /** Path or file name being read; shown so the user knows *what* is slow. */
  sourcePath?: string | null;
  /** Omit to render an uncancellable load — no Cancel button will ever appear. */
  onCancel?: () => void;
  /** Test seam; defaults to `CANCEL_VISIBLE_AFTER_MS`. */
  cancelAfterMs?: number;
}

/** S8 — skeleton rows immediately, Cancel only after the load proves slow. */
export function CollectionLoading({
  sourcePath,
  onCancel,
  cancelAfterMs = CANCEL_VISIBLE_AFTER_MS,
}: CollectionLoadingProps) {
  const [cancelVisible, setCancelVisible] = useState(false);

  // Mounted for the duration of one load, so the timer is started once on mount. Callers that
  // keep the component mounted across two loads should give it a `key` per load.
  useEffect(() => {
    const timer = window.setTimeout(() => setCancelVisible(true), cancelAfterMs);
    return () => window.clearTimeout(timer);
  }, [cancelAfterMs]);

  const label =
    sourcePath === undefined || sourcePath === null || sourcePath === ''
      ? 'Reading collection…'
      : `Reading ${fileName(sourcePath)}…`;

  return (
    <div data-testid="collection-loading" className="flex h-full min-h-0">
      {/* Decorative: the live region below is what assistive tech should read, not six bars. */}
      <div
        data-testid="collection-loading-skeleton"
        aria-hidden
        className="flex w-1/3 min-w-40 flex-col gap-2 border-r p-3"
      >
        {SKELETON_WIDTHS.map((width, index) => (
          <div
            key={index}
            // motion-safe keeps the pulse off under prefers-reduced-motion: reduce.
            className={`h-4 rounded bg-muted motion-safe:animate-pulse ${width}`}
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-3">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {label}
        </p>
        {cancelVisible && onCancel !== undefined && (
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
