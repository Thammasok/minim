import { useState } from 'react';
import type { CookieView, ExampleDetail, ExampleSummary } from '@/bindings';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/error-message';
import { asAppError, useExample } from '@/features/collection/queries';
import { EmptySection } from './empty-section';
import { HeadersTable } from './headers-table';
import { KeyValueTable, type KeyValueRow } from './kv-table';
import { EMPTY_VARIABLE_INDEX } from './variables';

export interface ExamplesPanelProps {
  nodeId: string;
  examples: readonly ExampleSummary[];
}

/**
 * ux-design.md §S2b — the saved responses of FR-037.
 *
 * The list arrives with the request (status, code, name — `ExampleSummary`); the response itself
 * does not. Bodies are the largest thing in a collection and a reader opens at most one of them,
 * so nothing is fetched until a row is actually selected (ADR-005 / TC-U-079): mounting this
 * panel must cost zero IPC. `useExample` defaults to `enabled: false` for exactly that reason,
 * and the selection state below is what flips it on.
 *
 * The panel is remounted per node (`DetailTabs` is keyed by node id), so the selection resets
 * with the request rather than pointing at index 1 of a different request's examples.
 */
export function ExamplesPanel({ nodeId, examples }: ExamplesPanelProps) {
  const [selected, setSelected] = useState<number | null>(null);

  // FR-036 — the absence is stated, not implied by a panel that renders nothing.
  if (examples.length === 0) return <EmptySection what="Saved responses" />;

  return (
    <div data-testid="examples-panel" className="flex flex-col gap-4">
      <ul
        data-testid="example-list"
        aria-label="Saved responses"
        className="flex flex-col rounded-md border"
      >
        {examples.map((example) => (
          <li key={example.index} className="border-b last:border-0">
            <button
              type="button"
              data-testid="example-option"
              data-index={example.index}
              aria-pressed={selected === example.index}
              onClick={() => setSelected(example.index)}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm',
                'hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                selected === example.index && 'bg-muted/60'
              )}
            >
              <span aria-hidden="true" className="text-xs text-muted-foreground">
                {selected === example.index ? '●' : '○'}
              </span>
              <StatusLabel code={example.code} status={example.status} />
              <span className="min-w-0 flex-1 truncate">{example.name}</span>
            </button>
          </li>
        ))}
      </ul>

      {selected === null ? (
        <p data-testid="example-prompt" className="text-sm text-muted-foreground">
          Select a saved response to load it.
        </p>
      ) : (
        <SelectedExample nodeId={nodeId} index={selected} />
      )}
    </div>
  );
}

function StatusLabel({ code, status }: { code: number | null; status: string | null }) {
  const label = [code === null ? null : String(code), status].filter((part) => part !== null);
  return (
    <span data-testid="example-status" className="shrink-0 font-mono text-xs">
      {label.length === 0 ? '—' : label.join(' ')}
    </span>
  );
}

function SelectedExample({ nodeId, index }: { nodeId: string; index: number }) {
  const query = useExample(nodeId, index, { enabled: true });

  if (query.isPending) {
    return (
      <p data-testid="example-loading" className="text-sm text-muted-foreground">
        Loading saved response…
      </p>
    );
  }
  if (query.isError) return <ExampleError error={query.error} />;

  return <ExampleView example={query.data} />;
}

function ExampleView({ example }: { example: ExampleDetail }) {
  const meta = [
    example.code === null ? null : String(example.code),
    example.status,
    example.previewLanguage,
  ].filter((part) => part !== null && part !== '');

  return (
    <section data-testid="example-detail" className="flex flex-col gap-4 border-t pt-4">
      <div>
        <h3 data-testid="example-name" className="text-sm font-semibold break-words">
          {example.name}
        </h3>
        {meta.length > 0 && (
          <p data-testid="example-meta" className="font-mono text-xs text-muted-foreground">
            {meta.join(' · ')}
          </p>
        )}
      </div>

      <section>
        <h4 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Headers ({example.headers.length})
        </h4>
        {/* Response headers are literal — a `{{token}}` in one is text, not a collection
            variable, so the index stays empty rather than claiming the name is undefined. */}
        <HeadersTable headers={example.headers} variables={EMPTY_VARIABLE_INDEX} />
      </section>

      <section>
        <h4 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Cookies ({example.cookies.length})
        </h4>
        {example.cookies.length === 0 ? (
          <EmptySection what="Cookies" />
        ) : (
          <KeyValueTable
            rows={example.cookies.map(toCookieRow)}
            caption="Cookies"
            testId="example-cookies-table"
            variables={EMPTY_VARIABLE_INDEX}
          />
        )}
      </section>

      <section>
        <h4 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Body
        </h4>
        {example.body === null || example.body === '' ? (
          <EmptySection what="Body" />
        ) : (
          // Plain preformatted text on purpose: this is a *saved* response, not the request
          // body S2 renders per mode. It can adopt T-017's raw-body renderer (syntax highlight
          // keyed off `previewLanguage`, copy button) once that lands, with no shape change.
          <pre
            data-testid="example-body"
            className="overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs"
          >
            {example.body}
          </pre>
        )}
      </section>
    </section>
  );
}

function toCookieRow(cookie: CookieView): KeyValueRow {
  return {
    key: cookie.name ?? '',
    value: cookie.value,
    disabled: false,
    // Domain and path are what distinguish two cookies of the same name; keep them visible.
    description: [cookie.domain, cookie.path].filter((part) => part !== '').join(' '),
  };
}

/**
 * A failed `get_example`, laid out inline — the request is still on screen and its other tabs
 * still work, so this is a section that failed rather than a pane that did. The copy is the
 * shared `errorMessage` map; only the transport fallback is written here.
 */
function ExampleError({ error }: { error: unknown }) {
  const appError = asAppError(error);

  if (appError === null) {
    return (
      <p data-testid="example-error" role="alert" className="text-sm text-muted-foreground">
        minim couldn’t load this saved response.
      </p>
    );
  }

  const copy = errorMessage(appError);

  return (
    <div
      data-testid="example-error"
      data-error-kind={appError.kind}
      role="alert"
      className="flex flex-col gap-1"
    >
      <p className="text-sm font-semibold">{copy.title}</p>
      <p className="text-sm text-muted-foreground">{copy.summary}</p>
      {copy.detail !== null && <p className="text-xs text-muted-foreground">{copy.detail}</p>}
    </div>
  );
}
