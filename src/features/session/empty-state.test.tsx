import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { open } from '@tauri-apps/plugin-dialog';
import { commands } from '@/bindings';
import type { CollectionOverview, RecentEntry } from '@/bindings';
import { EmptyState } from './empty-state';

// No Tauri runtime under jsdom: the dialog plugin and the generated bindings are the boundary.
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('@/bindings', () => ({
  commands: {
    openCollection: vi.fn(),
    listRecents: vi.fn(),
    forgetRecent: vi.fn(),
  },
}));

const openDialog = open as unknown as Mock<(options?: unknown) => Promise<string | null>>;
const openCollection = vi.mocked(commands.openCollection);
const listRecents = vi.mocked(commands.listRecents);
const forgetRecent = vi.mocked(commands.forgetRecent);

const overview: CollectionOverview = {
  name: 'Billing API',
  description: '',
  schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  version: null,
  sourcePath: '/a/b.json',
  fileSizeBytes: 2048,
  requestCount: 214,
  folderCount: 18,
  variables: [],
  auth: null,
  events: [],
  tree: [],
  warnings: [],
};

const gone: RecentEntry = {
  path: '/gone.json',
  name: 'Partner Webhooks',
  openedAt: 1_700_000_000,
  requestCount: 12,
};

function fileAt(path: string, type = 'application/json'): File {
  const name = path.split('/').pop() ?? path;
  const file = new File(['{}'], name, { type });
  Object.defineProperty(file, 'path', { value: path });
  return file;
}

function transfer(files: File[]) {
  return {
    files,
    items: files.map((file) => ({ kind: 'file', type: file.type })),
    types: ['Files'],
  };
}

function drop(files: File[]) {
  const event = createEvent.drop(document.body, { dataTransfer: transfer(files) });
  fireEvent(document.body, event);
  return event;
}

async function renderShell(onOpened = vi.fn()) {
  render(<EmptyState onOpened={onOpened} />);
  await waitFor(() => expect(listRecents).toHaveBeenCalled());
  return onOpened;
}

describe('EmptyState', () => {
  beforeEach(() => {
    openDialog.mockReset();
    openCollection.mockReset();
    listRecents.mockReset();
    forgetRecent.mockReset();
    listRecents.mockResolvedValue({ status: 'ok', data: [] });
    forgetRecent.mockResolvedValue({ status: 'ok', data: null });
    openCollection.mockResolvedValue({ status: 'ok', data: overview });
  });

  // TC-U-058 — a single .json dropped anywhere on the window opens it.
  it('opens a single .json dropped anywhere on the window', async () => {
    const onOpened = await renderShell();

    drop([fileAt('/a/b.json')]);

    await waitFor(() => expect(openCollection).toHaveBeenCalledExactlyOnceWith('/a/b.json'));
    await waitFor(() => expect(onOpened).toHaveBeenCalledExactlyOnceWith(overview));
    expect(screen.queryByTestId('drop-rejection')).toBeNull();
  });

  // TC-U-059 — a multi-file drop is rejected before anything is read.
  it('rejects a multi-file drop without invoking a command', async () => {
    await renderShell();

    drop([fileAt('/a.json'), fileAt('/b.json')]);

    expect(await screen.findByTestId('drop-rejection')).toHaveTextContent(
      /one collection at a time/i
    );
    expect(openCollection).not.toHaveBeenCalled();
  });

  it('rejects a folder drop the same way', async () => {
    await renderShell();

    const folder = fileAt('/collections', '');
    const event = createEvent.drop(document.body, {
      dataTransfer: {
        files: [folder],
        items: [{ kind: 'file', type: '', webkitGetAsEntry: () => ({ isDirectory: true }) }],
        types: ['Files'],
      },
    });
    fireEvent(document.body, event);

    expect(await screen.findByTestId('drop-rejection')).toHaveTextContent(/folder/i);
    expect(openCollection).not.toHaveBeenCalled();
  });

  // FR-001 — the dialog returns a path, which is handed straight to open_collection.
  it('opens the path the native dialog returns', async () => {
    openDialog.mockResolvedValue('/work/billing.json');
    const onOpened = await renderShell();

    await userEvent.click(screen.getByRole('button', { name: /open collection/i }));

    await waitFor(() =>
      expect(openCollection).toHaveBeenCalledExactlyOnceWith('/work/billing.json')
    );
    expect(onOpened).toHaveBeenCalledExactlyOnceWith(overview);
  });

  it('lists recents and opens the row that is clicked', async () => {
    listRecents.mockResolvedValue({ status: 'ok', data: [gone] });
    await renderShell();

    await userEvent.click(await screen.findByRole('button', { name: 'Partner Webhooks' }));
    expect(openCollection).toHaveBeenCalledExactlyOnceWith('/gone.json');
  });

  // TC-U-060 — a recents entry whose file is gone reports it and offers removal (FR-042).
  it('reports a missing recent on its row and forgets it on request', async () => {
    listRecents.mockResolvedValue({ status: 'ok', data: [gone] });
    openCollection.mockResolvedValue({
      status: 'error',
      error: { kind: 'fileNotFound', detail: { path: '/gone.json' } },
    });
    await renderShell();

    await userEvent.click(await screen.findByRole('button', { name: 'Partner Webhooks' }));

    const notice = await screen.findByTestId('recents-missing');
    expect(notice).toHaveTextContent('gone.json no longer exists');
    // Reported on the row, not behind a blocking dialog.
    expect(screen.queryByTestId('error-dialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Remove from recents' }));

    expect(forgetRecent).toHaveBeenCalledExactlyOnceWith('/gone.json');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Partner Webhooks' })).toBeNull()
    );
  });

  it('forgets a recent from the row control', async () => {
    listRecents.mockResolvedValue({ status: 'ok', data: [gone] });
    await renderShell();

    await userEvent.click(await screen.findByRole('button', { name: 'Forget Partner Webhooks' }));

    expect(forgetRecent).toHaveBeenCalledExactlyOnceWith('/gone.json');
    expect(openCollection).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Partner Webhooks' })).toBeNull()
    );
  });

  // Any other failure is blocking, so it belongs in the S7 dialog rather than on a row.
  it('routes a non-recents failure through the error dialog', async () => {
    openCollection.mockResolvedValue({
      status: 'error',
      error: { kind: 'unsupportedSchema', detail: { found: 'v2.0.0', expected: 'v2.1.0' } },
    });
    await renderShell();

    drop([fileAt('/a/old.json')]);

    expect(await screen.findByTestId('error-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('recents-missing')).toBeNull();
  });

  // ADR-013 — a broken store degrades persistence only; the shell stays usable.
  it('keeps the shell usable when the store cannot be read', async () => {
    listRecents.mockResolvedValue({
      status: 'error',
      error: {
        kind: 'storeUnavailable',
        detail: { operation: 'read', reason: 'permission denied' },
      },
    });
    await renderShell();

    expect(await screen.findByTestId('store-unavailable-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('recents')).toBeNull();
    expect(screen.getByRole('button', { name: /open collection/i })).toBeEnabled();
  });
});
