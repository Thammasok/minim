import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANCEL_VISIBLE_AFTER_MS, CollectionLoading } from './collection-loading';

describe('CollectionLoading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // TC-U-086
  it('withholds Cancel for the first 400 ms and shows it after', () => {
    render(<CollectionLoading sourcePath="/home/me/billing.json" onCancel={() => {}} />);

    // Skeleton is up immediately — the user never sees an empty pane.
    expect(screen.getByTestId('collection-loading-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('defaults the delay to 400 ms', () => {
    expect(CANCEL_VISIBLE_AFTER_MS).toBe(400);
  });

  it('names the file being read', () => {
    render(<CollectionLoading sourcePath="/home/me/billing.postman_collection.json" />);
    expect(screen.getByText('Reading billing.postman_collection.json…')).toBeInTheDocument();
  });

  it('never offers Cancel when the load cannot be cancelled', () => {
    render(<CollectionLoading sourcePath="/home/me/billing.json" />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('keeps the skeleton pulse behind motion-safe', () => {
    render(<CollectionLoading sourcePath="/home/me/billing.json" />);
    const rows = screen.getByTestId('collection-loading-skeleton').children;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of Array.from(rows)) {
      expect(row.className).toContain('motion-safe:animate-pulse');
      expect(row.className).not.toMatch(/(^|\s)animate-pulse/);
    }
  });
});
