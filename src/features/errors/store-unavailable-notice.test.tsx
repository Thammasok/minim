import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StoreUnavailableNotice } from './store-unavailable-notice';
import type { StoreUnavailableError } from './store-unavailable-notice';

const readFailure: StoreUnavailableError = {
  kind: 'storeUnavailable',
  detail: { operation: 'read', reason: 'config dir is read-only' },
};

describe('StoreUnavailableNotice', () => {
  // ADR-013 — non-fatal: the collection is open, only persistence is degraded.
  it('renders a dismissible, non-blocking notice rather than a dialog', async () => {
    render(<StoreUnavailableNotice error={readFailure} />);

    const notice = screen.getByTestId('store-unavailable-notice');
    expect(notice).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    const text = notice.textContent ?? '';
    expect(text).toContain('open and fully usable');
    expect(text).toContain('config dir is read-only');

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }));
    expect(screen.queryByTestId('store-unavailable-notice')).toBeNull();
  });

  it('distinguishes a failed write from a failed read', () => {
    render(
      <StoreUnavailableNotice
        error={{ kind: 'storeUnavailable', detail: { operation: 'write', reason: 'disk full' } }}
      />
    );

    const text = screen.getByTestId('store-unavailable-notice').textContent ?? '';
    expect(text).toContain("won't be remembered");
  });

  it('reports dismissal to its owner and honours a controlled flag', async () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <StoreUnavailableNotice error={readFailure} dismissed={false} onDismiss={onDismiss} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(screen.getByTestId('store-unavailable-notice')).toBeInTheDocument();

    rerender(<StoreUnavailableNotice error={readFailure} dismissed onDismiss={onDismiss} />);
    expect(screen.queryByTestId('store-unavailable-notice')).toBeNull();
  });

  it('renders nothing when the store is healthy', () => {
    render(<StoreUnavailableNotice error={null} />);
    expect(screen.queryByTestId('store-unavailable-notice')).toBeNull();
  });
});
