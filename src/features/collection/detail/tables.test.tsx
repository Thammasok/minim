import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { HeadersTable } from './headers-table';
import { ParamsTable } from './params-table';
import { header, param } from './detail-fixtures';
import { buildVariableIndex, EMPTY_VARIABLE_INDEX } from './variables';

function rows(): HTMLElement[] {
  return screen.getAllByTestId('kv-row');
}

describe('ParamsTable — FR-024', () => {
  // TC-U-070 — a disabled param is marked, not hidden
  it('renders a disabled param as a present, marked row', () => {
    render(
      <ParamsTable
        params={[param('expand', 'customer'), param('dryRun', 'true', { disabled: true })]}
        caption="Query parameters"
        testId="query-params-table"
        variables={EMPTY_VARIABLE_INDEX}
      />
    );

    expect(rows()).toHaveLength(2);

    const disabled = rows()[1];
    expect(disabled).toBeDefined();
    if (disabled === undefined) throw new Error('expected a second row');

    expect(disabled).toHaveAttribute('data-disabled', 'true');
    expect(within(disabled).getByText('dryRun')).toBeInTheDocument();
    expect(within(disabled).getByText('true')).toBeInTheDocument();
    // TC-COMP-013 — three independent signals, not colour alone.
    expect(within(disabled).getByTestId('disabled-marker')).toHaveTextContent('disabled');
    expect(disabled.className).toContain('text-muted-foreground');
    expect(within(disabled).getByText('dryRun').closest('td')?.className).toContain('line-through');
  });

  it('leaves an enabled row unmarked', () => {
    render(
      <ParamsTable
        params={[param('expand', 'customer')]}
        caption="Query parameters"
        testId="query-params-table"
        variables={EMPTY_VARIABLE_INDEX}
      />
    );
    expect(rows()[0]).not.toHaveAttribute('data-disabled');
    expect(screen.queryByTestId('disabled-marker')).toBeNull();
  });

  it('shows each entry description', () => {
    render(
      <ParamsTable
        params={[param('expand', 'customer', { description: 'Sideloads the customer' })]}
        caption="Query parameters"
        testId="query-params-table"
        variables={EMPTY_VARIABLE_INDEX}
      />
    );
    expect(screen.getByText('Sideloads the customer')).toBeInTheDocument();
  });

  // FR-036 — an absent section says so.
  it('prints "(none)" instead of hiding an empty table', () => {
    render(
      <ParamsTable
        params={[]}
        caption="Path variables"
        testId="path-variables-table"
        variables={EMPTY_VARIABLE_INDEX}
      />
    );
    expect(screen.getByTestId('empty-section')).toHaveTextContent('(none)');
    expect(screen.queryByTestId('path-variables-table')).toBeNull();
  });

  it('renders a {{variable}} in a param value as a chip', () => {
    render(
      <ParamsTable
        params={[param('token', '{{authToken}}')]}
        caption="Query parameters"
        testId="query-params-table"
        variables={buildVariableIndex([{ name: 'authToken', defined: true }])}
      />
    );
    expect(screen.getByTestId('var-chip')).toHaveAttribute('data-defined', 'true');
  });
});

describe('HeadersTable — FR-025', () => {
  // TC-U-070 (headers half)
  it('marks a disabled header rather than dropping it', () => {
    render(
      <HeadersTable
        headers={[
          header('Accept', 'application/json'),
          header('X-Debug', '1', { disabled: true, description: 'local only' }),
        ]}
        variables={EMPTY_VARIABLE_INDEX}
      />
    );

    expect(rows()).toHaveLength(2);
    const disabled = rows()[1];
    if (disabled === undefined) throw new Error('expected a second row');
    expect(disabled).toHaveAttribute('data-disabled', 'true');
    expect(within(disabled).getByTestId('disabled-marker')).toBeInTheDocument();
    expect(within(disabled).getByText('local only')).toBeInTheDocument();
  });

  it('prints "(none)" for a request with no headers', () => {
    render(<HeadersTable headers={[]} variables={EMPTY_VARIABLE_INDEX} />);
    expect(screen.getByTestId('empty-section')).toHaveTextContent('(none)');
  });

  it('renders an empty header value as an em dash rather than a blank cell', () => {
    render(<HeadersTable headers={[header('X-Empty', '')]} variables={EMPTY_VARIABLE_INDEX} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
