import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExampleDetail, ExampleSummary } from '@/bindings';
import { buildTabs } from './detail-model';
import { example, requestDetail } from './detail-fixtures';
import { ExamplesPanel } from './examples-panel';

// jsdom has no Tauri runtime; the generated bindings are the seam (same mock shape as the
// other detail tests).
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

function newClient(gcTime = 0): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime } } });
}

function exampleDetail(overrides: Partial<ExampleDetail> = {}): ExampleDetail {
  return {
    name: 'Success',
    status: 'OK',
    code: 200,
    headers: [],
    cookies: [],
    body: null,
    previewLanguage: null,
    ...overrides,
  };
}

function renderPanel(examples: readonly ExampleSummary[], nodeId = 'n1', gcTime = 0) {
  return render(
    <QueryClientProvider client={newClient(gcTime)}>
      <ExamplesPanel nodeId={nodeId} examples={examples} />
    </QueryClientProvider>
  );
}

/** `noUncheckedIndexedAccess` is on: index through this rather than asserting non-null. */
function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no element at index ${index}`);
  return item;
}

const TWO_EXAMPLES: ExampleSummary[] = [
  example(0, 'Success'),
  { index: 1, name: 'Bad credentials', status: 'Unauthorized', code: 401 },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ExamplesPanel — list (FR-037)', () => {
  it('lists every saved response with its status and code, and fetches none of them', () => {
    // TC-U-079 — opening the tab costs zero IPC; bodies are megabytes and rarely all read.
    renderPanel(TWO_EXAMPLES);

    const options = screen.getAllByTestId('example-option');
    expect(options).toHaveLength(2);
    expect(nth(options, 0)).toHaveTextContent('200 OK');
    expect(nth(options, 0)).toHaveTextContent('Success');
    expect(nth(options, 1)).toHaveTextContent('401 Unauthorized');
    expect(nth(options, 1)).toHaveTextContent('Bad credentials');

    expect(mocks.getExample).not.toHaveBeenCalled();
    expect(screen.getByTestId('example-prompt')).toBeInTheDocument();
  });

  it('states the absence when a request has no examples', async () => {
    // TC-U-082 — the badge reads 0 and the panel says "(none)" rather than rendering nothing.
    const tabs = buildTabs(requestDetail({ examples: [] }));
    expect(tabs.find((tab) => tab.id === 'examples')?.badge).toBe('0');

    renderPanel([]);

    expect(screen.getByTestId('empty-section')).toHaveTextContent('(none)');
    expect(screen.queryByTestId('example-list')).not.toBeInTheDocument();
    expect(mocks.getExample).not.toHaveBeenCalled();
  });
});

describe('ExamplesPanel — selection (FR-037)', () => {
  it('loads the selected example on demand and renders headers, cookies and body', async () => {
    // TC-U-080
    mocks.getExample.mockResolvedValue({
      status: 'ok',
      data: exampleDetail({
        name: 'Bad credentials',
        status: 'Unauthorized',
        code: 401,
        previewLanguage: 'json',
        headers: [
          { key: 'Content-Type', value: 'application/json', disabled: null, description: '' },
        ],
        cookies: [{ name: 'session', value: 'abc', domain: 'api.example.com', path: '/' }],
        body: '{ "error": "invalid_grant" }',
      }),
    });

    renderPanel(TWO_EXAMPLES);
    await userEvent.click(nth(screen.getAllByTestId('example-option'), 1));

    expect(mocks.getExample).toHaveBeenCalledTimes(1);
    expect(mocks.getExample).toHaveBeenCalledWith('n1', 1);

    expect(await screen.findByTestId('example-body')).toHaveTextContent('"error": "invalid_grant"');
    expect(screen.getByTestId('example-meta')).toHaveTextContent('401 · Unauthorized · json');
    expect(screen.getByTestId('headers-table')).toHaveTextContent('Content-Type');
    expect(screen.getByTestId('example-cookies-table')).toHaveTextContent('session');
    expect(screen.getByTestId('example-cookies-table')).toHaveTextContent('api.example.com');
  });

  it('caches a fetched example and re-fetches nothing when it is reselected', async () => {
    mocks.getExample.mockResolvedValue({ status: 'ok', data: exampleDetail({ body: 'ok' }) });

    // A real client keeps an unmounted query around; `gcTime: 0` elsewhere keeps tests isolated.
    renderPanel(TWO_EXAMPLES, 'n1', Infinity);
    const options = screen.getAllByTestId('example-option');

    await userEvent.click(nth(options, 0));
    await screen.findByTestId('example-detail');
    await userEvent.click(nth(options, 1));
    await userEvent.click(nth(options, 0));
    await screen.findByTestId('example-detail');

    // One call per distinct index — `staleTime: Infinity` makes reselection a cache read.
    expect(mocks.getExample).toHaveBeenCalledTimes(2);
  });

  it('states an empty body and empty cookies rather than rendering nothing (FR-036)', async () => {
    mocks.getExample.mockResolvedValue({ status: 'ok', data: exampleDetail({ body: null }) });

    renderPanel(TWO_EXAMPLES);
    await userEvent.click(nth(screen.getAllByTestId('example-option'), 0));

    await screen.findByTestId('example-detail');
    const empties = screen.getAllByTestId('empty-section');
    // Headers, cookies and body are all absent — three stated absences, no silent gaps.
    expect(empties).toHaveLength(3);
  });

  it('reports a failed get_example with the shared copy', async () => {
    mocks.getExample.mockResolvedValue({
      status: 'error',
      error: { kind: 'unknownExample', detail: { nodeId: 'n1', index: 1 } },
    });

    renderPanel(TWO_EXAMPLES);
    await userEvent.click(nth(screen.getAllByTestId('example-option'), 1));

    const alert = await screen.findByTestId('example-error');
    expect(alert).toHaveAttribute('data-error-kind', 'unknownExample');
  });

  it('renders a body as text, never as markup (NFR-010)', async () => {
    mocks.getExample.mockResolvedValue({
      status: 'ok',
      data: exampleDetail({ body: '<img src=x onerror="alert(1)">' }),
    });

    renderPanel(TWO_EXAMPLES);
    await userEvent.click(nth(screen.getAllByTestId('example-option'), 0));

    const body = await screen.findByTestId('example-body');
    expect(body).toHaveTextContent('<img src=x onerror="alert(1)">');
    expect(body.querySelector('img')).toBeNull();
  });
});
