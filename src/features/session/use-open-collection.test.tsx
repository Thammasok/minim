import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commands } from '@/bindings';
import type { CollectionOverview } from '@/bindings';
import { useOpenCollection } from './use-open-collection';

vi.mock('@/bindings', () => ({
  commands: { openCollection: vi.fn(), listRecents: vi.fn(), forgetRecent: vi.fn() },
}));

const openCollection = vi.mocked(commands.openCollection);

const overview = {
  name: 'Billing API',
  description: '',
  schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  version: null,
  sourcePath: '/a/b.json',
  fileSizeBytes: 10,
  requestCount: 1,
  folderCount: 0,
  variables: [],
  auth: null,
  events: [],
  tree: [],
  warnings: [],
} satisfies CollectionOverview;

describe('useOpenCollection', () => {
  beforeEach(() => {
    openCollection.mockReset();
  });

  it('hands the path to the core and reports the overview', async () => {
    openCollection.mockResolvedValue({ status: 'ok', data: overview });
    const onOpened = vi.fn();
    const { result } = renderHook(() => useOpenCollection(onOpened));

    await act(() => result.current.openPath('/a/b.json'));

    expect(openCollection).toHaveBeenCalledExactlyOnceWith('/a/b.json');
    expect(onOpened).toHaveBeenCalledExactlyOnceWith(overview);
    expect(result.current.openingPath).toBeNull();
    expect(result.current.failure).toBeNull();
  });

  it('keeps the failure with the path it was about, and clears it on request', async () => {
    openCollection.mockResolvedValue({
      status: 'error',
      error: { kind: 'fileNotFound', detail: { path: '/gone.json' } },
    });
    const { result } = renderHook(() => useOpenCollection(vi.fn()));

    await act(() => result.current.openPath('/gone.json'));
    expect(result.current.failure).toEqual({
      path: '/gone.json',
      error: { kind: 'fileNotFound', detail: { path: '/gone.json' } },
    });

    act(() => result.current.clearFailure());
    expect(result.current.failure).toBeNull();
  });

  // `typedError` rethrows a real Error — an IPC failure, not an AppError. It is still reported.
  it('reports a thrown IPC failure instead of losing it', async () => {
    openCollection.mockRejectedValue(new Error('ipc closed'));
    const { result } = renderHook(() => useOpenCollection(vi.fn()));

    await act(() => result.current.openPath('/a/b.json'));

    expect(result.current.failure?.error).toEqual({
      kind: 'fileUnreadable',
      detail: { path: '/a/b.json', reason: 'ipc closed' },
    });
  });

  it('allows one open at a time', async () => {
    let release: (() => void) | undefined;
    openCollection.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ status: 'ok', data: overview });
        })
    );
    const { result } = renderHook(() => useOpenCollection(vi.fn()));

    let first: Promise<void> | undefined;
    act(() => {
      first = result.current.openPath('/a/b.json');
      void result.current.openPath('/a/second.json');
    });

    await waitFor(() => expect(result.current.openingPath).toBe('/a/b.json'));
    expect(openCollection).toHaveBeenCalledExactlyOnceWith('/a/b.json');

    await act(async () => {
      release?.();
      await first;
    });
    expect(result.current.openingPath).toBeNull();
  });
});
