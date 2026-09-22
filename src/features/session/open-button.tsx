import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface OpenButtonProps {
  /** Called with the picked path. Cancelling the dialog calls nothing. */
  onPicked: (path: string) => void;
  /** The dialog itself failed to open — rare, but never swallowed. */
  onDialogError?: (reason: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

/** The filter the native dialog is opened with — `.json` only (FR-001). */
const COLLECTION_FILTER = { name: 'Postman collection', extensions: ['json'] };

/**
 * S1 — "Open collection…".
 *
 * The plugin returns a *path* and nothing else; that path goes straight to `open_collection`
 * (ADR-008). The webview has no `fs:` capability and never reads the file.
 */
export function OpenButton({
  onPicked,
  onDialogError,
  disabled = false,
  label = 'Open collection…',
  className,
}: OpenButtonProps) {
  const [picking, setPicking] = useState(false);

  async function pick() {
    setPicking(true);
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        title: 'Open a Postman collection',
        filters: [COLLECTION_FILTER],
      });
      if (typeof picked === 'string' && picked.length > 0) onPicked(picked);
    } catch (cause) {
      onDialogError?.(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPicking(false);
    }
  }

  return (
    <Button
      type="button"
      data-testid="open-collection-button"
      className={className}
      disabled={disabled || picking}
      onClick={() => {
        void pick();
      }}
    >
      <FolderOpen aria-hidden />
      {label}
    </Button>
  );
}
