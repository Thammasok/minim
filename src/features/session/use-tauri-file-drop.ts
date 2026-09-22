import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { classifyPaths, dropRejectionMessage } from './drop-payload';

export interface TauriFileDropState {
  /** A drag carrying something droppable is over the window — drive the S1 overlay from this. */
  dragging: boolean;
  /** Why the last drop was refused, in user vocabulary. `null` once acknowledged. */
  rejection: string | null;
  clearRejection: () => void;
}

/**
 * The drop path that actually fires in the desktop shell.
 *
 * `tauri.conf.json` sets `dragDropEnabled: true`, so the webview intercepts the OS drop and DOM
 * `drop` events never reach the document — `DropZone`'s listeners are live only under jsdom.
 * Turning the flag off is not the fix: Tauri v2 `File` objects carry no filesystem path, and
 * ADR-008 has the Rust core read the file, so a path is the one thing the webview must supply.
 * `onDragDropEvent` carries `paths: string[]`, which is exactly that.
 *
 * Classification is shared with the DOM path via `classifyPaths`, so both routes accept and
 * refuse the same drops.
 */
export function useTauriFileDrop(onFile: (path: string) => void): TauriFileDropState {
  const [dragging, setDragging] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);

  const onFileRef = useRef(onFile);
  useEffect(() => {
    onFileRef.current = onFile;
  }, [onFile]);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;

        if (payload.type === 'enter') {
          // Refuse early: the overlay says no before the pointer is released, rather than
          // accepting the drop and then explaining.
          setDragging(classifyPaths(payload.paths).kind !== 'none');
          return;
        }

        if (payload.type === 'leave') {
          setDragging(false);
          return;
        }

        if (payload.type === 'drop') {
          setDragging(false);
          const verdict = classifyPaths(payload.paths);
          if (verdict.kind === 'file') {
            setRejection(null);
            onFileRef.current(verdict.path);
          } else if (verdict.kind === 'rejected') {
            setRejection(dropRejectionMessage(verdict.reason));
          }
        }
      })
      .then((off) => {
        // The subscription resolves after an await, so the effect may already have been torn
        // down — drop it immediately in that case rather than leaking a listener.
        if (alive) unlisten = off;
        else off();
      })
      .catch(() => {
        // No Tauri runtime (browser dev server, jsdom). The DOM `DropZone` covers those.
      });

    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  const clearRejection = useCallback(() => setRejection(null), []);

  return { dragging, rejection, clearRejection };
}
