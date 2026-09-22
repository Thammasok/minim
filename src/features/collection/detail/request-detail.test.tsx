import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AppError, NodeDetail } from '@/bindings';
import { useCollectionStore } from '@/features/collection/store';
import { RequestDetail } from './request-detail';
import { example, header, param, requestNode, script, url } from './detail-fixtures';

// jsdom has no Tauri runtime; the generated bindings are the seam.
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

async function renderDetail(detail: NodeDetail) {
  mocks.getNodeDetail.mockResolvedValue({ status: 'ok', data: detail });
  const view = render(
    <QueryClientProvider client={newClient()}>
      <RequestDetail nodeId={detail.id} />
    </QueryClientProvider>
  );
  await screen.findByTestId('request-detail');
  return view;
}

function tab(name: RegExp): HTMLElement {
  return screen.getByRole('tab', { name });
}

beforeEach(() => {
  useCollectionStore.getState().reset();
  vi.clearAllMocks();
});

describe('RequestDetail — header (FR-023)', () => {
  it('shows breadcrumb, name, method, normalized URL and description', async () => {
    await renderDetail(
      requestNode({
        name: 'Login',
        folderPath: ['Billing API', 'Auth'],
        method: 'post',
        url: url('{{baseUrl}}/auth/login'),
        description: 'Authenticates a user and returns a JWT.',
        variableRefs: [{ name: 'baseUrl', defined: true }],
      })
    );

    const crumb = screen.getByTestId('detail-breadcrumb');
    expect(within(crumb).getByText('Billing API')).toBeInTheDocument();
    expect(within(crumb).getByText('Auth')).toBeInTheDocument();

    expect(screen.getByTestId('detail-name')).toHaveTextContent('Login');
    expect(screen.getByTestId('detail-method')).toHaveTextContent('POST');
    expect(screen.getByTestId('detail-url')).toHaveTextContent('{{baseUrl}}/auth/login');
    expect(screen.getByTestId('detail-description')).toHaveTextContent(
      'Authenticates a user and returns a JWT.'
    );
  });

  it('is sticky, and only the tab panel scrolls', async () => {
    await renderDetail(requestNode());
    // TC-COMP-012, asserted structurally — jsdom has no layout.
    expect(screen.getByTestId('detail-header').className).toContain('sticky top-0');
    expect(screen.getByTestId('detail-panel-scroll').className).toContain('overflow-auto');
  });

  it('omits the description when the collection has none', async () => {
    await renderDetail(requestNode({ description: '' }));
    expect(screen.queryByTestId('detail-description')).toBeNull();
  });

  it('falls back to the neutral method colour for an unknown verb', async () => {
    await renderDetail(requestNode({ method: 'PURGE' }));
    const chip = screen.getByTestId('detail-method');
    expect(chip).toHaveTextContent('PURGE');
    expect(chip.className).toContain('text-method-other');
  });
});

describe('RequestDetail — tab shell and badges (ux §S2)', () => {
  it('badges every section: counts, the body mode, and the auth marker', async () => {
    await renderDetail(
      requestNode({
        url: url('/invoices/:id', {
          query: [param('expand', 'customer'), param('dryRun', 'true', { disabled: true })],
          pathVariables: [param('id', '42')],
        }),
        headers: [header('Accept'), header('X-Trace'), header('X-Debug')],
        body: { mode: 'raw', language: 'json', text: '{}' },
        auth: {
          source: { kind: 'collection' },
          authType: 'bearer',
          attributes: [{ key: 'token', value: 'ey.secret', sensitive: true }],
        },
        events: [script('prerequest', 'noop()'), script('test', 'noop()')],
        examples: [example(0, 'Success'), example(1, 'Bad credentials')],
      })
    );

    expect(screen.getByTestId('tab-badge-params')).toHaveTextContent('3');
    expect(screen.getByTestId('tab-badge-headers')).toHaveTextContent('3');
    expect(screen.getByTestId('tab-badge-body')).toHaveTextContent('raw');
    expect(screen.getByTestId('tab-badge-auth')).toHaveTextContent('⊥');
    expect(screen.getByTestId('tab-badge-auth')).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/inherited from collection/i)
    );
    expect(screen.getByTestId('tab-badge-scripts')).toHaveTextContent('2');
    expect(screen.getByTestId('tab-badge-examples')).toHaveTextContent('2');
  });

  it('badges a request with no auth at all with the none marker', async () => {
    await renderDetail(requestNode());
    expect(screen.getByTestId('tab-badge-auth')).toHaveTextContent('—');
    expect(screen.getByTestId('tab-badge-body')).toHaveTextContent('—');
  });

  // TC-U-068 — the pane opens on the first non-empty tab
  it('opens on Headers when the request has no params but three headers', async () => {
    await renderDetail(
      requestNode({
        url: url('/me'),
        headers: [header('Accept'), header('X-Trace'), header('X-Debug')],
      })
    );

    expect(tab(/headers/i)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/params/i)).toHaveAttribute('aria-selected', 'false');
  });

  it('opens on Params when there are params', async () => {
    await renderDetail(
      requestNode({ url: url('/x', { query: [param('q', '1')] }), headers: [header('Accept')] })
    );
    expect(tab(/params/i)).toHaveAttribute('aria-selected', 'true');
  });

  it('re-runs the first-non-empty decision when another request is selected', async () => {
    const paramsOnly = requestNode({ id: 'a', url: url('/x', { query: [param('q', '1')] }) });
    const headersOnly = requestNode({ id: 'b', headers: [header('Accept')] });

    mocks.getNodeDetail.mockImplementation((nodeId: string) =>
      Promise.resolve({ status: 'ok', data: nodeId === 'a' ? paramsOnly : headersOnly })
    );

    const client = newClient();
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <RequestDetail nodeId="a" />
      </QueryClientProvider>
    );
    await screen.findByTestId('request-detail');
    expect(tab(/params/i)).toHaveAttribute('aria-selected', 'true');

    rerender(
      <QueryClientProvider client={client}>
        <RequestDetail nodeId="b" />
      </QueryClientProvider>
    );
    await waitFor(() => expect(tab(/headers/i)).toHaveAttribute('aria-selected', 'true'));
  });

  // Every renderer is now real — no panel is a placeholder (T-017, T-018).
  it('renders the real examples list, not a placeholder', async () => {
    await renderDetail(requestNode({ examples: [example(0, 'Success')] }));

    await userEvent.click(tab(/examples/i));
    const panel = await screen.findByTestId('panel-examples');
    expect(within(panel).queryByTestId('panel-placeholder')).not.toBeInTheDocument();
    expect(within(panel).getByText('Success')).toBeInTheDocument();
  });
});

describe('RequestDetail — empty sections (FR-036)', () => {
  // TC-U-069 — an empty section states its absence
  it('badges Headers 0 and prints "(none)" in its panel', async () => {
    await renderDetail(requestNode({ headers: [] }));

    expect(screen.getByTestId('tab-badge-headers')).toHaveTextContent('0');

    // Radix activates a tab on pointer-down/focus, not on a synthetic click.
    await userEvent.click(tab(/headers/i));
    const panel = await screen.findByTestId('panel-headers');
    expect(within(panel).getByTestId('empty-section')).toHaveTextContent('(none)');
  });

  it('prints "(none)" under both params headings when the URL is bare', async () => {
    await renderDetail(requestNode({ url: url('/ping') }));

    const panel = screen.getByTestId('panel-params');
    expect(within(panel).getByText('Query parameters')).toBeInTheDocument();
    expect(within(panel).getByText('Path variables')).toBeInTheDocument();
    expect(within(panel).getAllByTestId('empty-section')).toHaveLength(2);
  });
});

describe('RequestDetail — variable chips (FR-035)', () => {
  // TC-U-071 — an undefined variable chip is distinguished
  it('marks a {{ghost}} the collection never declared as undefined', async () => {
    await renderDetail(requestNode({ url: url('{{ghost}}/x'), variableRefs: [] }));

    const chip = screen.getByTestId('var-chip');
    expect(chip).toHaveAttribute('data-defined', 'false');
    expect(chip).toHaveTextContent('{{ghost}}');
    expect(chip).toHaveAttribute('title', 'not defined in this collection');
  });

  it('marks a declared variable as defined', async () => {
    await renderDetail(
      requestNode({
        url: url('{{baseUrl}}/x'),
        variableRefs: [{ name: 'baseUrl', defined: true }],
      })
    );
    expect(screen.getByTestId('var-chip')).toHaveAttribute('data-defined', 'true');
  });

  it('chips each occurrence and leaves the rest of the URL as text', async () => {
    await renderDetail(
      requestNode({
        url: url('{{baseUrl}}/v1/{{tenant}}/items'),
        variableRefs: [
          { name: 'baseUrl', defined: true },
          { name: 'tenant', defined: false },
        ],
      })
    );

    const chips = screen.getAllByTestId('var-chip');
    expect(chips.map((chip) => chip.getAttribute('data-var'))).toEqual(['baseUrl', 'tenant']);
    expect(screen.getByTestId('detail-url')).toHaveTextContent('{{baseUrl}}/v1/{{tenant}}/items');
  });
});

describe('RequestDetail — injection (NFR-010)', () => {
  const PAYLOAD = '<img src=x onerror=alert(1)>';

  // TC-U-072 — collection content is never rendered as markup
  it('renders a request name containing a tag as literal text', async () => {
    await renderDetail(
      requestNode({
        name: PAYLOAD,
        description: PAYLOAD,
        url: url(PAYLOAD),
        folderPath: [PAYLOAD],
      })
    );

    expect(screen.getByTestId('detail-name').textContent).toBe(PAYLOAD);
    expect(screen.getByTestId('detail-description').textContent).toBe(PAYLOAD);
    expect(screen.getByTestId('detail-url').textContent).toBe(PAYLOAD);
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(document.querySelectorAll('script')).toHaveLength(0);
  });

  it('renders a tag inside a header value and a param key as literal text', async () => {
    await renderDetail(
      requestNode({
        headers: [header(PAYLOAD, PAYLOAD)],
        url: url('/x', { query: [param(PAYLOAD, PAYLOAD)] }),
      })
    );

    expect(screen.getAllByText(PAYLOAD).length).toBeGreaterThan(0);
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });

  it('never reaches for dangerouslySetInnerHTML anywhere in this folder', async () => {
    const sources = import.meta.glob('./*.tsx', { query: '?raw', import: 'default', eager: true });
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith('.test.tsx'))
      // The prose above mentions the API by name; only a real use of it is an offence.
      .filter(([, source]) => /dangerouslySetInnerHTML\s*[=:]/.test(String(source)))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});

describe('RequestDetail — the three states', () => {
  it('invites a selection when nothing is selected', () => {
    render(
      <QueryClientProvider client={newClient()}>
        <RequestDetail nodeId={null} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('detail-nothing-selected')).toBeInTheDocument();
    expect(mocks.getNodeDetail).not.toHaveBeenCalled();
  });

  it('follows the store selection when no nodeId prop is given', async () => {
    mocks.getNodeDetail.mockResolvedValue({ status: 'ok', data: requestNode({ id: 'n9' }) });
    useCollectionStore.getState().select('n9');

    render(
      <QueryClientProvider client={newClient()}>
        <RequestDetail />
      </QueryClientProvider>
    );

    await screen.findByTestId('request-detail');
    expect(mocks.getNodeDetail).toHaveBeenCalledWith('n9');
  });

  it('shows the shared loading skeleton while the lookup is in flight', async () => {
    type Envelope = { status: 'ok'; data: NodeDetail };
    let settle: ((value: Envelope) => void) | undefined;
    mocks.getNodeDetail.mockReturnValue(
      new Promise<Envelope>((r) => {
        settle = r;
      })
    );

    render(
      <QueryClientProvider client={newClient()}>
        <RequestDetail nodeId="n1" />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('collection-loading')).toBeInTheDocument();

    settle?.({ status: 'ok', data: requestNode() });
    await screen.findByTestId('request-detail');
  });

  it('reports a failed lookup with the shared AppError copy', async () => {
    const error: AppError = { kind: 'unknownNode', detail: { nodeId: 'gone' } };
    mocks.getNodeDetail.mockResolvedValue({ status: 'error', error });

    render(
      <QueryClientProvider client={newClient()}>
        <RequestDetail nodeId="gone" />
      </QueryClientProvider>
    );

    const alert = await screen.findByTestId('detail-error');
    expect(alert).toHaveAttribute('data-error-kind', 'unknownNode');
    expect(alert).toHaveTextContent("That item isn't in this collection");
    expect(alert).toHaveTextContent('Reload the collection to rebuild the tree.');
  });

  it('hands a folder node to the folder view rather than the request tabs', async () => {
    mocks.getNodeDetail.mockResolvedValue({
      status: 'ok',
      data: {
        kind: 'folder',
        id: 'f1',
        name: 'Invoices',
        folderPath: [],
        description: '',
        auth: { source: { kind: 'none' }, authType: 'noauth', attributes: [] },
        events: [],
        variable: [],
        childCount: 2,
        descendantRequestCount: 5,
      } satisfies NodeDetail,
    });

    render(
      <QueryClientProvider client={newClient()}>
        <RequestDetail nodeId="f1" />
      </QueryClientProvider>
    );

    expect(await screen.findByTestId('folder-detail')).toHaveTextContent('Invoices');
    expect(screen.queryByTestId('detail-tablist')).not.toBeInTheDocument();
  });

  it('fetches a node once and serves a re-selection from cache (NFR-002)', async () => {
    mocks.getNodeDetail.mockResolvedValue({ status: 'ok', data: requestNode({ id: 'n1' }) });
    const client = newClient();

    const { rerender } = render(
      <QueryClientProvider client={client}>
        <RequestDetail nodeId="n1" />
      </QueryClientProvider>
    );
    await screen.findByTestId('request-detail');

    rerender(
      <QueryClientProvider client={client}>
        <RequestDetail nodeId="n1" />
      </QueryClientProvider>
    );
    await screen.findByTestId('request-detail');

    expect(mocks.getNodeDetail).toHaveBeenCalledTimes(1);
  });
});
