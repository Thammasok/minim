import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { open } from '@tauri-apps/plugin-dialog';
import { OpenButton } from './open-button';

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

const openDialog = open as unknown as Mock<(options?: unknown) => Promise<string | null>>;

describe('OpenButton', () => {
  beforeEach(() => {
    openDialog.mockReset();
  });

  // AC — "Open button invokes the native dialog filtered to .json" (FR-001).
  it('opens the native dialog filtered to a single .json file', async () => {
    openDialog.mockResolvedValue('/work/billing.json');
    const onPicked = vi.fn();

    render(<OpenButton onPicked={onPicked} />);
    await userEvent.click(screen.getByRole('button', { name: /open collection/i }));

    expect(openDialog).toHaveBeenCalledOnce();
    expect(openDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        multiple: false,
        directory: false,
        filters: [expect.objectContaining({ extensions: ['json'] })],
      })
    );
    // ADR-008 — a path comes back, nothing else; the webview never reads the file.
    expect(onPicked).toHaveBeenCalledExactlyOnceWith('/work/billing.json');
  });

  it('does nothing when the dialog is cancelled', async () => {
    openDialog.mockResolvedValue(null);
    const onPicked = vi.fn();

    render(<OpenButton onPicked={onPicked} />);
    await userEvent.click(screen.getByRole('button', { name: /open collection/i }));

    expect(onPicked).not.toHaveBeenCalled();
  });

  it('reports a dialog failure instead of swallowing it', async () => {
    openDialog.mockRejectedValue(new Error('no window'));
    const onDialogError = vi.fn();

    render(<OpenButton onPicked={vi.fn()} onDialogError={onDialogError} />);
    await userEvent.click(screen.getByRole('button', { name: /open collection/i }));

    expect(onDialogError).toHaveBeenCalledExactlyOnceWith('no window');
  });

  it('honours the disabled prop', async () => {
    render(<OpenButton onPicked={vi.fn()} disabled />);
    const button = screen.getByRole('button', { name: /open collection/i });

    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(openDialog).not.toHaveBeenCalled();
  });
});
