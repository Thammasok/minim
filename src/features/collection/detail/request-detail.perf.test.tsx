import { describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { RequestDetailView } from './request-detail';
import { example, header, param, requestDetail, script, url } from './detail-fixtures';

/**
 * NFR-002 — selecting a request must render its detail inside 100 ms p95.
 *
 * The IPC half of that budget is already spent by the time this runs: `get_node_detail` is an
 * O(1) arena lookup and `queries.ts` caches it forever by `NodeId`, so re-selection costs one
 * cache read. What is left, and what is measured here, is the render itself — against a request
 * far heavier than any real one, with a variable in every value so the tokenizer runs on every
 * cell rather than on a token-free fast path.
 */

const HEAVY = requestDetail({
  id: 'heavy',
  name: 'Heaviest request in the collection',
  folderPath: ['Billing API', 'Invoices', 'Drafts', 'Bulk', 'Legacy'],
  url: url('{{baseUrl}}/v1/{{tenant}}/invoices/:id', {
    query: Array.from({ length: 200 }, (_, index) =>
      param(`filter${index}`, `{{value${index}}}`, {
        description: `Filter number ${index}`,
        disabled: index % 7 === 0,
      })
    ),
    pathVariables: Array.from({ length: 20 }, (_, index) => param(`p${index}`, `{{v${index}}}`)),
  }),
  headers: Array.from({ length: 200 }, (_, index) =>
    header(`X-Header-${index}`, `{{header${index}}}`, { disabled: index % 5 === 0 })
  ),
  body: { mode: 'raw', language: 'json', text: '{}' },
  events: [script('prerequest', 'noop()'), script('test', 'noop()')],
  examples: Array.from({ length: 50 }, (_, index) => example(index, `Example ${index}`)),
  variableRefs: Array.from({ length: 200 }, (_, index) => ({
    name: `value${index}`,
    defined: index % 2 === 0,
  })),
});

function measureRender(): number {
  const started = performance.now();
  render(<RequestDetailView detail={HEAVY} />);
  const elapsed = performance.now() - started;
  cleanup();
  return elapsed;
}

describe('detail render performance', () => {
  it('renders a 420-row request well inside 100 ms p95', () => {
    // Warm-up: the first render pays for module init and jsdom's first style pass.
    measureRender();

    const samples = Array.from({ length: 12 }, measureRender).sort((a, b) => a - b);
    const p95 = samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)] ?? 0;

    expect(p95).toBeLessThan(100);
  });
});
