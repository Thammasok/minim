import { useState } from 'react';
import { CircleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/error-message';
import type { AppError } from '@/bindings';

export type StoreUnavailableError = Extract<AppError, { kind: 'storeUnavailable' }>;

export interface StoreUnavailableNoticeProps {
  /** `null` renders nothing — the store is fine. */
  error: StoreUnavailableError | null;
  /** Controlled dismissal; omit to let the notice keep the flag itself. */
  dismissed?: boolean;
  onDismiss?: () => void;
}

/**
 * ADR-013 — a store failure is reported, never fatal.
 *
 * `open_collection` succeeds even when the store is broken, so this is an inline, dismissible
 * notice rather than a dialog: the collection is open and fully readable; only recents and
 * preferences are degraded.
 */
export function StoreUnavailableNotice({
  error,
  dismissed,
  onDismiss,
}: StoreUnavailableNoticeProps) {
  const [selfDismissed, setSelfDismissed] = useState(false);

  const isDismissed = dismissed ?? selfDismissed;
  if (error === null || isDismissed) return null;

  const copy = errorMessage(error);

  return (
    <aside
      data-testid="store-unavailable-notice"
      role="status"
      aria-live="polite"
      className="flex items-start gap-2 border-b border-warning/40 bg-warning/10 px-3 py-2 text-sm"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{copy.title}</p>
        <p className="text-xs text-muted-foreground">{copy.summary}</p>
        {copy.detail !== null && <p className="text-xs text-muted-foreground">{copy.detail}</p>}
        <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
          {error.detail.reason}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Dismiss notice"
        onClick={() => {
          setSelfDismissed(true);
          onDismiss?.();
        }}
      >
        <X aria-hidden />
      </Button>
    </aside>
  );
}
