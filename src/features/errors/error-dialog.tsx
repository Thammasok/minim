import { useState } from 'react';
import { AlertDialog } from 'radix-ui';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/error-message';
import type { AppError } from '@/bindings';
import type { ErrorCopy } from '@/lib/error-message';

export interface ErrorDialogProps {
  /** The failure to report. `null` closes the dialog. */
  error: AppError | null;
  /** Closing the dialog — Escape, the Dismiss button, or an action that resolves it. */
  onDismiss: () => void;
  /** Re-opens the file picker. Omit where there is nothing to pick (e.g. a reload failure). */
  onTryAnotherFile?: () => void;
  /** Only meaningful when the failure came from a recents row (T-014). */
  onRemoveFromRecents?: () => void;
}

/**
 * S7 — the blocking failure dialog.
 *
 * Only `severity: 'fatal'` errors belong here; a `storeUnavailable` is handed to
 * `StoreUnavailableNotice` instead (ADR-013), so this component renders nothing for it rather
 * than quietly blocking a collection that is in fact open.
 */
export function ErrorDialog({
  error,
  onDismiss,
  onTryAnotherFile,
  onRemoveFromRecents,
}: ErrorDialogProps) {
  if (error === null) return null;

  const copy = errorMessage(error);
  if (copy.severity !== 'fatal') return null;

  // Keyed on the variant so a second failure re-captures the element to restore focus to.
  return (
    <FatalErrorDialog
      key={error.kind}
      copy={copy}
      onDismiss={onDismiss}
      onTryAnotherFile={onTryAnotherFile}
      onRemoveFromRecents={onRemoveFromRecents}
    />
  );
}

interface FatalErrorDialogProps extends Omit<ErrorDialogProps, 'error'> {
  copy: ErrorCopy;
}

function FatalErrorDialog({
  copy,
  onDismiss,
  onTryAnotherFile,
  onRemoveFromRecents,
}: FatalErrorDialogProps) {
  // Captured during the first render — before Radix's focus scope moves focus into the dialog —
  // so closing can hand focus back to whatever the user was on. Radix restores to its own
  // Trigger, and this dialog is opened from app state rather than a Trigger.
  const [restoreTarget] = useState<HTMLElement | null>(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  );

  return (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Content
          // The acceptance criterion asks for role="alert" on the dialog itself; it overrides
          // Radix's default "alertdialog" while keeping its focus trap and focus restore.
          role="alert"
          data-testid="error-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreTarget?.focus();
          }}
          className="fixed top-1/2 left-1/2 z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-5 text-card-foreground shadow-lg"
        >
          <div className="flex items-start gap-3">
            <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <AlertDialog.Title className="text-base font-semibold">
                {copy.title}
              </AlertDialog.Title>

              {copy.subject !== null && (
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                  {copy.subject}
                </p>
              )}

              <AlertDialog.Description className="mt-3 text-sm">
                {copy.summary}
              </AlertDialog.Description>

              {copy.detail !== null && (
                <p className="mt-1 text-sm text-muted-foreground">{copy.detail}</p>
              )}

              {copy.facts.length > 0 && (
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-muted/50 p-3 text-xs">
                  {copy.facts.map((fact) => (
                    <div key={fact.label} className="contents">
                      <dt className="text-muted-foreground">{fact.label}</dt>
                      <dd className="min-w-0 font-mono break-all">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {copy.fix !== null && <p className="mt-3 text-sm">{copy.fix}</p>}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {onRemoveFromRecents !== undefined && (
              <AlertDialog.Action asChild>
                <Button variant="outline" onClick={onRemoveFromRecents}>
                  Remove from recents
                </Button>
              </AlertDialog.Action>
            )}
            {onTryAnotherFile !== undefined && (
              <AlertDialog.Action asChild>
                <Button onClick={onTryAnotherFile}>Try another file</Button>
              </AlertDialog.Action>
            )}
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">Dismiss</Button>
            </AlertDialog.Cancel>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
