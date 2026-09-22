import { useEffect, useRef, useState } from 'react';
import { FileJson2 } from 'lucide-react';
import { carriesFiles, classifyDrop, dropRejectionMessage } from './drop-payload';
import type { DropRejection } from './drop-payload';

export interface DropZoneProps {
  /** A single `.json` was dropped; the path goes to `open_collection` (ADR-008). */
  onPath: (path: string) => void;
  /** Ignore drops (e.g. while a collection is already being read). */
  disabled?: boolean;
  className?: string;
}

/**
 * FR-002 — the whole window is the drop target.
 *
 * The listeners live on `window`, not on a bordered rectangle: a bordered zone tells the user
 * the rest of the window rejects the drop, which is false (ux-design §S1). The overlay it
 * renders is `fixed inset-0` for the same reason — it confirms the window-wide target rather
 * than defining it.
 */
export function DropZone({ onPath, disabled = false, className }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [rejection, setRejection] = useState<DropRejection | null>(null);

  const onPathRef = useRef(onPath);
  const disabledRef = useRef(disabled);
  // Written in an effect, never during render: the window listeners are subscribed once, so
  // they read the latest handler through these refs instead of re-subscribing every render.
  useEffect(() => {
    onPathRef.current = onPath;
    disabledRef.current = disabled;
  }, [onPath, disabled]);

  // dragenter/dragleave fire per element under the pointer; a depth counter keeps the overlay
  // from flickering as the drag crosses children.
  const depth = useRef(0);

  useEffect(() => {
    function reset() {
      depth.current = 0;
      setDragging(false);
    }

    function handleEnter(event: DragEvent) {
      if (!carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      depth.current += 1;
      setRejection(null);
      setDragging(true);
    }

    function handleOver(event: DragEvent) {
      if (!carriesFiles(event.dataTransfer)) return;
      // Without preventDefault on dragover the browser never fires a drop.
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy';
    }

    function handleLeave(event: DragEvent) {
      if (!carriesFiles(event.dataTransfer)) return;
      depth.current -= 1;
      if (depth.current <= 0) reset();
    }

    function handleDrop(event: DragEvent) {
      // Always prevent the default, even when disabled — otherwise the webview navigates to
      // the dropped file, which would replace the app with a JSON document.
      event.preventDefault();
      reset();
      if (disabledRef.current) return;

      const payload = classifyDrop(event.dataTransfer);
      if (payload.kind === 'none') return;
      if (payload.kind === 'rejected') {
        // Nothing is read and no command is invoked — the refusal happens here.
        setRejection(payload.reason);
        return;
      }
      setRejection(null);
      onPathRef.current(payload.path);
    }

    window.addEventListener('dragenter', handleEnter);
    window.addEventListener('dragover', handleOver);
    window.addEventListener('dragleave', handleLeave);
    window.addEventListener('dragend', reset);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragenter', handleEnter);
      window.removeEventListener('dragover', handleOver);
      window.removeEventListener('dragleave', handleLeave);
      window.removeEventListener('dragend', reset);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  return (
    <div data-testid="drop-zone" className={className}>
      {dragging && (
        <div
          data-testid="drop-overlay"
          aria-hidden
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-[1px]"
        >
          <div className="flex items-center gap-2 rounded-xl border-2 border-dashed border-primary/60 px-6 py-4 text-sm font-medium">
            <FileJson2 className="size-4" />
            Drop a .json collection to open it
          </div>
        </div>
      )}

      {rejection !== null && (
        <p
          data-testid="drop-rejection"
          role="status"
          aria-live="polite"
          className="text-sm text-destructive"
        >
          {dropRejectionMessage(rejection)}
        </p>
      )}
    </div>
  );
}
