import { useState } from 'react';
import { ChevronDown, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { warningCountLabel, warningMessage } from '@/lib/error-message';
import type { LoadWarningView } from '@/bindings';

export interface WarningsBannerProps {
  warnings: LoadWarningView[];
  /** Turns a `NodeId` into the folder path the user sees in the tree (T-014 owns the index). */
  resolvePath?: (nodeId: string) => string | null | undefined;
  /** Controlled dismissal; omit to let the banner keep the flag itself. */
  dismissed?: boolean;
  onDismiss?: () => void;
  defaultExpanded?: boolean;
}

function pathLabel(nodeId: string | null, resolvePath: WarningsBannerProps['resolvePath']): string {
  if (nodeId === null) return 'Collection';
  const resolved = resolvePath?.(nodeId);
  return resolved === null || resolved === undefined || resolved === '' ? nodeId : resolved;
}

/**
 * S10 — the load-warnings banner.
 *
 * Dismissible on purpose: warnings are notes about the file, not failures, so they must not be
 * modal. The count stays in the status bar (`WarningsStatus`) after dismissal, which is what
 * keeps them discoverable later (FR-009).
 */
export function WarningsBanner({
  warnings,
  resolvePath,
  dismissed,
  onDismiss,
  defaultExpanded = false,
}: WarningsBannerProps) {
  const [selfDismissed, setSelfDismissed] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const isDismissed = dismissed ?? selfDismissed;
  if (warnings.length === 0 || isDismissed) return null;

  return (
    <aside
      data-testid="warnings-banner"
      aria-label="Collection load notes"
      className="border-b border-warning/40 bg-warning/10 px-3 py-2 text-sm"
    >
      <div className="flex items-center gap-2">
        <TriangleAlert aria-hidden className="size-4 shrink-0 text-warning" />
        <span className="flex-1 truncate">Opened with {warningCountLabel(warnings.length)}</span>

        <Button
          variant="ghost"
          size="xs"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown
            aria-hidden
            // Only the caret rotates, and only when motion is welcome.
            className={`motion-safe:transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
          {expanded ? 'Hide' : 'View'}
        </Button>

        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss notes"
          onClick={() => {
            setSelfDismissed(true);
            onDismiss?.();
          }}
        >
          <X aria-hidden />
        </Button>
      </div>

      {expanded && (
        <ul data-testid="warnings-list" className="mt-2 flex flex-col gap-2">
          {warnings.map((warning, index) => {
            const copy = warningMessage(warning);
            return (
              <li key={`${warning.kind}-${index}`} className="border-l-2 border-warning/50 pl-2">
                <p className="text-xs font-medium">{copy.title}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono break-all">{copy.detail}</span>
                  {' · '}
                  <span className="font-mono break-all">{pathLabel(copy.nodeId, resolvePath)}</span>
                </p>
                <p className="text-xs text-muted-foreground">{copy.consequence}</p>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

export interface WarningsStatusProps {
  warnings: LoadWarningView[];
  /** Wire to re-show the banner; without it the count is plain text. */
  onShow?: () => void;
}

/**
 * The status-bar count. Independent of the banner's dismissed flag by design — dismissing the
 * banner must not lose the fact that the file had notes.
 */
export function WarningsStatus({ warnings, onShow }: WarningsStatusProps) {
  if (warnings.length === 0) return null;

  const label = warningCountLabel(warnings.length);

  if (onShow === undefined) {
    return (
      <span data-testid="warnings-status" className="text-warning">
        {label}
      </span>
    );
  }

  return (
    <Button
      data-testid="warnings-status"
      variant="ghost"
      size="xs"
      className="text-warning"
      onClick={onShow}
    >
      {label}
    </Button>
  );
}
