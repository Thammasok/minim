import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CollectionOverview, TreeNode, VariableView } from '@/bindings';
import { CollectionDetail } from './collection-detail';
import { NO_AUTH, requestNode, script } from './detail-fixtures';

const mocks = vi.hoisted(() => ({
  getNodeDetail: vi.fn(),
  getExample: vi.fn(),
  openCollection: vi.fn(),
  reloadCollection: vi.fn(),
  closeCollection: vi.fn(),
  listRecents: vi.fn(),
  forgetRecent: vi.fn(),
  getPreferences: vi.fn(),
  setPreferences: vi.fn(),
}));

vi.mock('@/bindings', () => ({ commands: mocks }));

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function variable(key: string, overrides: Partial<VariableView> = {}): VariableView {
  return { key, value: null, type: 'string', disabled: null, description: '', ...overrides };
}

function treeNode(id: string, kind: TreeNode['kind'], children: TreeNode[] = []): TreeNode {
  return {
    id,
    name: id,
    kind,
    folderPath: [],
    method: kind === 'request' ? 'GET' : null,
    urlPreview: kind === 'request' ? '{{baseUrl}}/x' : null,
    children,
    exampleCount: 0,
    hasScripts: false,
  };
}

function overview(overrides: Partial<CollectionOverview> = {}): CollectionOverview {
  return {
    name: 'Billing API',
    description: 'Everything billing.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    version: '2.4.0',
    sourcePath: '/tmp/billing.postman_collection.json',
    fileSizeBytes: 4096,
    requestCount: 4,
    folderCount: 1,
    variables: [],
    auth: null,
    events: [],
    tree: [],
    warnings: [],
    ...overrides,
  };
}

/** `noUncheckedIndexedAccess` is on: index through this rather than asserting non-null. */
function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no element at index ${index}`);
  return item;
}

/** `{{baseUrl}}` in three requests, `{{userEmail}}` in one, `{{legacyId}}` in none. */
const REFS: Record<string, string[]> = {
  r1: ['baseUrl'],
  r2: ['baseUrl', 'userEmail'],
  r3: ['baseUrl'],
  r4: [],
};

const TREE: TreeNode[] = [
  treeNode('r1', 'request'),
  treeNode('f1', 'folder', [treeNode('r2', 'request'), treeNode('r3', 'request')]),
  treeNode('r4', 'request'),
];

const VARIABLES: VariableView[] = [
  variable('baseUrl', { value: 'https://api.example.com' }),
  variable('userEmail'),
  variable('legacyId', { value: '42', disabled: true }),
];

function renderOverview(data: CollectionOverview) {
  return render(
    <QueryClientProvider client={newClient()}>
      <CollectionDetail overview={data} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getNodeDetail.mockImplementation((nodeId: string) =>
    Promise.resolve({
      status: 'ok',
      data: requestNode({
        id: nodeId,
        variableRefs: (REFS[nodeId] ?? []).map((name) => ({ name, defined: true })),
      }),
    })
  );
});

describe('CollectionDetail — info (FR-040)', () => {
  it('shows name, description, schema, version and the request/folder counts', async () => {
    // TC-COMP-023
    renderOverview(overview({ variables: VARIABLES, tree: TREE }));

    expect(screen.getByTestId('collection-name')).toHaveTextContent('Billing API');
    expect(screen.getByTestId('collection-schema')).toHaveTextContent('/v2.1.0/collection.json');
    expect(screen.getByTestId('collection-meta')).toHaveTextContent(
      'version 2.4.0 · 4 requests · 1 folders'
    );
    expect(screen.getByTestId('collection-description')).toHaveTextContent('Everything billing.');

    await userEvent.click(screen.getByTestId('collection-tab-info'));
    expect(screen.getByTestId('collection-info-version')).toHaveTextContent('2.4.0');
    expect(screen.getByTestId('collection-info-source')).toHaveTextContent('billing');
  });

  it('never asks get_node_detail for the collection itself (TC-CMD-019)', async () => {
    renderOverview(overview({ tree: [] }));

    await waitFor(() => expect(screen.getByTestId('collection-detail')).toBeInTheDocument());
    // The overview is the data source; the root id would answer UnknownNode.
    expect(mocks.getNodeDetail).not.toHaveBeenCalledWith('');
  });
});

describe('CollectionDetail — variables (FR-038)', () => {
  it('shows key, value, type and disabled state', async () => {
    // TC-COMP-023
    renderOverview(overview({ variables: VARIABLES, tree: TREE }));

    const rows = screen.getAllByTestId('variable-row');
    expect(rows).toHaveLength(3);
    expect(nth(rows, 0)).toHaveTextContent('baseUrl');
    expect(nth(rows, 0)).toHaveTextContent('https://api.example.com');
    expect(nth(rows, 0)).toHaveTextContent('string');
    // An empty value is an em dash, not an empty cell.
    expect(within(nth(rows, 1)).getAllByText('—').length).toBeGreaterThan(0);

    expect(nth(rows, 2)).toHaveAttribute('data-disabled', 'true');
    expect(nth(rows, 2).className).toContain('text-muted-foreground');
    expect(within(nth(rows, 2)).getByTestId('disabled-marker')).toHaveTextContent('disabled');
  });

  it('counts the requests that reference each variable', async () => {
    // TC-U-081 — baseUrl is used by 3 requests, legacyId by none.
    renderOverview(overview({ variables: VARIABLES, tree: TREE }));

    await waitFor(() => {
      const used = screen.getAllByTestId('variable-used');
      expect(nth(used, 0)).toHaveAttribute('data-used', '3');
    });

    const used = screen.getAllByTestId('variable-used');
    expect(nth(used, 1)).toHaveAttribute('data-used', '1');
    expect(nth(used, 2)).toHaveAttribute('data-used', '0');
    expect(nth(used, 2)).toHaveTextContent('0');

    // Folders hold no references of their own, so only the four leaves are looked up.
    expect(mocks.getNodeDetail).toHaveBeenCalledTimes(4);
  });

  it('states the absence when the collection declares no variables', () => {
    renderOverview(overview({ tree: TREE }));
    expect(screen.getByTestId('empty-section')).toHaveTextContent('(none)');
  });
});

describe('CollectionDetail — auth and scripts (FR-039)', () => {
  it('shows the collection auth with its type and masks credentials', async () => {
    renderOverview(
      overview({
        auth: {
          source: { kind: 'own' },
          authType: 'bearer',
          attributes: [{ key: 'token', value: 'ey.secret', sensitive: true }],
        },
      })
    );

    await userEvent.click(screen.getByTestId('collection-tab-auth'));
    expect(screen.getByTestId('auth-type')).toHaveTextContent('bearer');
    expect(screen.getByTestId('masked-value')).toBeInTheDocument();
    expect(screen.queryByText('ey.secret')).not.toBeInTheDocument();
  });

  it('shows the collection scripts with the "never runs them" notice', async () => {
    renderOverview(overview({ events: [script('prerequest', 'pm.environment.set("ts", 1)')] }));

    await userEvent.click(screen.getByTestId('collection-tab-scripts'));
    expect(screen.getByTestId('script-source')).toHaveTextContent('pm.environment.set');
    expect(screen.getByTestId('script-notice')).toHaveTextContent('minim never runs them');
  });

  it('states the absence of auth and of scripts', async () => {
    renderOverview(overview({ auth: NO_AUTH }));

    await userEvent.click(screen.getByTestId('collection-tab-auth'));
    expect(screen.getByTestId('empty-section')).toHaveTextContent('(none)');

    await userEvent.click(screen.getByTestId('collection-tab-scripts'));
    expect(screen.getByTestId('empty-section')).toHaveTextContent('(none)');
  });
});
