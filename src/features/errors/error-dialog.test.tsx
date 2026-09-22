import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorDialog } from './error-dialog';
import type { AppError } from '@/bindings';

function renderError(error: AppError, props: { onTryAnotherFile?: () => void } = {}) {
  return render(<ErrorDialog error={error} onDismiss={() => {}} {...props} />);
}

function dialogText(): string {
  return screen.getByTestId('error-dialog').textContent ?? '';
}

describe('ErrorDialog', () => {
  // TC-U-083
  it('names the detected version and the export fix for a v2.0 collection', () => {
    renderError({
      kind: 'unsupportedSchema',
      detail: {
        found: 'https://schema.getpostman.com/json/collection/v2.0.0/collection.json',
        expected: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
    });

    const text = dialogText();
    expect(text).toContain('v2.0');
    expect(text).toContain('v2.1');
    expect(text).toContain('Export');
    expect(text).toContain('In Postman: Export → Collection v2.1');
  });

  // TC-U-084
  it('shows the reported line and column for a JSON syntax error', () => {
    renderError({
      kind: 'notJson',
      detail: { line: 418, column: 12, message: 'expected value at line 418 column 12' },
    });

    const text = dialogText();
    expect(text).toContain('418');
    expect(text).toContain('12');
    expect(text).toContain("isn't valid JSON");
  });

  // TC-U-085
  it('reads differently from bad JSON when the file is not a collection', () => {
    renderError({ kind: 'notACollection', detail: { missingField: 'item' } });

    const text = dialogText();
    expect(text).toContain('valid JSON, but not a Postman collection');
    expect(text).toContain('item');
  });

  it('names the missing file and offers removal from recents', async () => {
    const onRemove = vi.fn();
    render(
      <ErrorDialog
        error={{ kind: 'fileNotFound', detail: { path: '/home/me/billing.json' } }}
        onDismiss={() => {}}
        onRemoveFromRecents={onRemove}
      />
    );

    expect(dialogText()).toContain('billing.json');
    expect(dialogText()).toContain('no longer exists');

    await userEvent.click(screen.getByRole('button', { name: 'Remove from recents' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('renders nothing when there is no error', () => {
    render(<ErrorDialog error={null} onDismiss={() => {}} />);
    expect(screen.queryByTestId('error-dialog')).toBeNull();
  });

  // ADR-013 — a store failure must never reach this blocking surface.
  it('refuses to render a storeUnavailable failure as a dialog', () => {
    renderError({
      kind: 'storeUnavailable',
      detail: { operation: 'write', reason: 'disk full' },
    });
    expect(screen.queryByTestId('error-dialog')).toBeNull();
  });

  it('carries role="alert"', () => {
    renderError({ kind: 'noCollectionOpen' });
    expect(screen.getByRole('alert')).toBe(screen.getByTestId('error-dialog'));
  });

  it('traps focus inside the dialog', async () => {
    render(
      <div>
        <button type="button">outside</button>
        <ErrorDialog error={{ kind: 'noCollectionOpen' }} onDismiss={() => {}} />
      </div>
    );

    const dialog = screen.getByTestId('error-dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    // The rest of the document is aria-hidden while the dialog is open, hence `hidden: true`.
    screen.getByRole('button', { name: 'outside', hidden: true }).focus();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it('restores focus to the previously focused element on close', async () => {
    function Harness() {
      const [error, setError] = useState<AppError | null>(null);
      return (
        <div>
          <button type="button" onClick={() => setError({ kind: 'noCollectionOpen' })}>
            open
          </button>
          <ErrorDialog error={error} onDismiss={() => setError(null)} />
        </div>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'open' });
    await userEvent.click(trigger);

    await screen.findByTestId('error-dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(screen.queryByTestId('error-dialog')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
