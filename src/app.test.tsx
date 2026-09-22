import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { open } from '@tauri-apps/plugin-dialog';
import App from '@/app';
import { commands } from '@/bindings';
import type { CollectionOverview, TreeNode } from '@/bindings';
import { useCollectionStore } from '@/features/collection/store';
import { ThemeProvider } from '@/features/theme/theme-provider';

// No Tauri runtime under jsdom — the generated bindings, the dialog plugin and the webview
// drag-drop subscription are the three boundaries the shell talks to.
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: () => Promise.resolve(() => {}) }),
}));
vi.mock('@/bindings', () => ({
  commands: {
    openCollection: vi.fn(),
    reloadCollection: vi.fn(),
    closeCollection: vi.fn(),
    getNodeDetail: vi.fn(),
    getExample: vi.fn(),
    listRecents: vi.fn(),
    forgetRecent: vi.fn(),
  },
}));

const openDialog = open as unknown as Mock<(options?: unknown) => Promise<string | null>>;
const openCollection = vi.mocked(commands.openCollection);
const listRecents = vi.mocked(commands.listRecents);
const closeCollection = vi.mocked(commands.closeCollection);

function requestNode(id: string, name: string): TreeNode {
  return {
    id,
    name,
    kind: 'request',
    folderPath: [],
    method: 'GET',
    urlPreview: '{{baseUrl}}/ping',
    children: [],
    exampleCount: 0,
    hasScripts: false,
  };
}

function overview(patch: Partial<CollectionOverview> = {}): CollectionOverview {
  return {
    name: 'Billing API',
    description: '',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    version: null,
    sourcePath: '/a/billing.json',
    fileSizeBytes: 2048,
    requestCount: 1,
    folderCount: 0,
    variables: [],
    auth: null,
    events: [],
    tree: [requestNode('r1', 'Ping')],
    warnings: [],
    ...patch,
  };
}

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/** Drives the shell from S1 to the viewer the way a user does: pick a file, get an overview. */
async function openCollectionViaDialog(value: CollectionOverview) {
  openDialog.mockResolvedValue('/a/billing.json');
  openCollection.mockResolvedValue({ status: 'ok', data: value });
  await userEvent.click(screen.getByRole('button', { name: /open collection/i }));
  await screen.findByRole('tree');
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    document.documentElement.className = '';
    useCollectionStore.getState().reset();
    listRecents.mockResolvedValue({ status: 'ok', data: [] });
    closeCollection.mockResolvedValue({ status: 'ok', data: null });
  });

  // TC-U-001 — the app shell renders without crashing
  it('renders the shell root', () => {
    renderShell();
    expect(screen.getByTestId('app-root')).toBeInTheDocument();
  });

  it('renders the topbar and status bar in every state', () => {
    renderShell();
    expect(screen.getByTestId('app-topbar')).toBeInTheDocument();
    expect(screen.getByTestId('app-statusbar')).toBeInTheDocument();
  });

  it('boots to the system theme by default', () => {
    renderShell();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(screen.getByRole('button', { name: /Theme: system/ })).toBeInTheDocument();
  });

  // ux §S1 — with nothing open the shell is the empty state, not an empty two-pane viewer.
  it('shows the empty shell and disables the collection actions when nothing is open', () => {
    renderShell();
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open collection/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload collection/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /close collection/i })).toBeDisabled();
  });

  // The integration seam the four feature tasks were built against: opening swaps S1 for the
  // two-pane viewer, names the collection, and arms the topbar actions.
  it('swaps the empty shell for the tree and detail panes once a collection opens', async () => {
    renderShell();
    await openCollectionViaDialog(overview());

    expect(screen.getByRole('treeitem', { name: /Ping/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload collection/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /close collection/i })).toBeEnabled();
    expect(screen.getByTestId('app-statusbar')).toHaveTextContent('1 requests');
  });

  // FR-022 — a valid collection with no items is a success, and must read as one.
  it('names the collection in the empty-collection state rather than showing a blank pane', async () => {
    renderShell();
    openDialog.mockResolvedValue('/a/billing.json');
    openCollection.mockResolvedValue({
      status: 'ok',
      data: overview({ tree: [], requestCount: 0 }),
    });
    await userEvent.click(screen.getByRole('button', { name: /open collection/i }));

    const empty = await screen.findByTestId('empty-collection');
    expect(empty).toHaveTextContent('Billing API');
    expect(empty).toHaveTextContent(/has no requests/i);
  });

  // §S4 — the tree has no collection-root row, so "nothing selected" is how the collection
  // view is reached, and the topbar name is the way back to it.
  it('shows the collection view when nothing is selected, and returns to it from the topbar', async () => {
    renderShell();
    await openCollectionViaDialog(overview());

    expect(screen.getByTestId('collection-detail')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('treeitem', { name: /Ping/ }));
    await waitFor(() => expect(screen.queryByTestId('collection-detail')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Billing API' }));
    expect(await screen.findByTestId('collection-detail')).toBeInTheDocument();
  });

  it('closes back to the empty shell and clears the selection', async () => {
    renderShell();
    await openCollectionViaDialog(overview());
    useCollectionStore.getState().select('r1');

    await userEvent.click(screen.getByRole('button', { name: /close collection/i }));

    await waitFor(() => expect(screen.queryByRole('tree')).not.toBeInTheDocument());
    expect(closeCollection).toHaveBeenCalledOnce();
    expect(useCollectionStore.getState().selectedNodeId).toBeNull();
    expect(screen.getByRole('button', { name: /open collection/i })).toBeInTheDocument();
  });
});
