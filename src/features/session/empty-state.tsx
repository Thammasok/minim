import { useCallback, useEffect, useState } from 'react';
import { FileJson2 } from 'lucide-react';
import { commands } from '@/bindings';
import type { CollectionOverview, RecentEntry } from '@/bindings';
import { ErrorDialog, StoreUnavailableNotice } from '@/features/errors';
import type { StoreUnavailableError } from '@/features/errors';
import { DropZone } from './drop-zone';
import { OpenButton } from './open-button';
import { RecentsList } from './recents-list';
import { useOpenCollection } from './use-open-collection';

export interface EmptyStateProps {
  /** A collection opened successfully — the shell swaps S1 for the viewer (S2). */
  onOpened: (overview: CollectionOverview) => void;
  className?: string;
}

/**
 * S1 — the empty shell.
 *
 * Owns the three ways in (dialog, drop, recents row) and the one way out (`onOpened`). It keeps
 * its state local on purpose: the collection store belongs to `features/collection`, and this
 * surface is gone the moment a collection is open.
 */
export function EmptyState({ onOpened, className }: EmptyStateProps) {
  const [recents, setRecents] = useState<readonly RecentEntry[]>([]);
  const [storeError, setStoreError] = useState<StoreUnavailableError | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const { openPath, openingPath, failure, clearFailure } = useOpenCollection(onOpened);

  useEffect(() => {
    let alive = true;

    async function loadRecents() {
      try {
        const result = await commands.listRecents();
        if (!alive) return;
        if (result.status === 'ok') {
          setRecents(result.data);
        } else if (result.error.kind === 'storeUnavailable') {
          // ADR-013 — a broken store degrades persistence only. Empty list plus a notice.
          setStoreError(result.error);
        }
      } catch {
        // The store is optional to this screen; the shell stays usable without recents.
      }
    }

    void loadRecents();
    return () => {
      alive = false;
    };
  }, []);

  const forget = useCallback(
    (path: string) => {
      setRecents((entries) => entries.filter((entry) => entry.path !== path));
      clearFailure();

      void (async () => {
        try {
          const result = await commands.forgetRecent(path);
          if (result.status === 'error' && result.error.kind === 'storeUnavailable') {
            setStoreError(result.error);
          }
        } catch {
          // Forgetting is persistence, never fatal — the row is already gone from the list.
        }
      })();
    },
    [clearFailure]
  );

  const start = useCallback(
    (path: string) => {
      setDialogError(null);
      void openPath(path);
    },
    [openPath]
  );

  // A missing file the user reached *from* a recents row is reported on that row, beside its own
  // removal action; anything else is a blocking failure and belongs in the S7 dialog.
  const missingRecent =
    failure !== null &&
    failure.error.kind === 'fileNotFound' &&
    recents.some((entry) => entry.path === failure.path)
      ? failure.path
      : null;

  const busy = openingPath !== null;

  return (
    <div data-testid="empty-state" className={className}>
      <StoreUnavailableNotice error={storeError} />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12">
        <div className="flex flex-col items-center gap-3 text-center">
          <FileJson2 aria-hidden className="size-10 text-muted-foreground" />
          <h1 className="text-lg font-semibold">No collection open</h1>
          <p className="text-sm text-muted-foreground">
            Open a Postman v2.1 collection to inspect it.
          </p>

          <OpenButton
            className="mt-2"
            onPicked={start}
            onDialogError={setDialogError}
            disabled={busy}
          />

          <p className="text-xs text-muted-foreground">or drop a .json file anywhere</p>

          <DropZone onPath={start} disabled={busy} />

          {dialogError !== null && (
            <p role="status" className="text-sm text-destructive">
              minim couldn’t open the file picker. {dialogError}
            </p>
          )}
        </div>

        <RecentsList
          entries={recents}
          onOpen={(entry) => start(entry.path)}
          onForget={forget}
          openingPath={openingPath}
          missingPaths={missingRecent === null ? [] : [missingRecent]}
        />
      </div>

      <ErrorDialog
        error={missingRecent === null && failure !== null ? failure.error : null}
        onDismiss={clearFailure}
        onRemoveFromRecents={
          failure !== null &&
          failure.error.kind === 'fileNotFound' &&
          recents.some((entry) => entry.path === failure.path)
            ? () => forget(failure.path)
            : undefined
        }
      />
    </div>
  );
}
