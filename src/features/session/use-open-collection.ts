import { useCallback, useEffect, useRef, useState } from 'react';
import { commands } from '@/bindings';
import type { AppError, CollectionOverview } from '@/bindings';

/** A failed attempt, remembered with the path it was about so a recents row can own it. */
export interface OpenFailure {
  path: string;
  error: AppError;
}

export interface OpenCollectionState {
  /** ADR-008 — the webview hands a *path* to the core; it never reads the file itself. */
  openPath: (path: string) => Promise<void>;
  /** The path currently being opened, for the row/button busy state. `null` when idle. */
  openingPath: string | null;
  failure: OpenFailure | null;
  clearFailure: () => void;
}

/**
 * The single place an open is attempted, whatever started it — the dialog, a drop, or a
 * recents row. One in-flight open at a time: a second trigger while the core is reading would
 * race two `open_collection` calls onto the same session state.
 */
export function useOpenCollection(
  onOpened: (overview: CollectionOverview) => void
): OpenCollectionState {
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [failure, setFailure] = useState<OpenFailure | null>(null);
  const inFlight = useRef(false);

  // `openPath` stays referentially stable across renders — a caller passing an inline
  // `onOpened` must not re-create every consumer's effect. The ref is written in an effect,
  // never during render.
  const onOpenedRef = useRef(onOpened);
  useEffect(() => {
    onOpenedRef.current = onOpened;
  }, [onOpened]);

  const openPath = useCallback(async (path: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setOpeningPath(path);
    setFailure(null);

    try {
      const result = await commands.openCollection(path);
      if (result.status === 'ok') {
        onOpenedRef.current(result.data);
      } else {
        setFailure({ path, error: result.error });
      }
    } catch (cause) {
      // `typedError` rethrows a real `Error` — an IPC/transport failure rather than an
      // `AppError`. Report it as the unreadable file it effectively is, with the verbatim reason.
      setFailure({
        path,
        error: {
          kind: 'fileUnreadable',
          detail: { path, reason: cause instanceof Error ? cause.message : String(cause) },
        },
      });
    } finally {
      inFlight.current = false;
      setOpeningPath(null);
    }
  }, []);

  const clearFailure = useCallback(() => setFailure(null), []);

  return { openPath, openingPath, failure, clearFailure };
}
