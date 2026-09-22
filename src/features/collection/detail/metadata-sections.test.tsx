import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BehaviorSection, VariablesTable } from './metadata-sections';

vi.mock('@/bindings', () => ({ commands: {} }));

describe('BehaviorSection (FR-034)', () => {
  it('renders protocolProfileBehavior when the file declares it', () => {
    render(
      <BehaviorSection
        behavior={[
          { key: 'strictSSL', value: 'false' },
          { key: 'followRedirects', value: 'true' },
        ]}
      />
    );

    const rows = screen.getAllByTestId('behavior-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('strictSSL');
    expect(rows[0]).toHaveTextContent('false');
  });

  it('renders nothing at all when there is none', () => {
    const { container } = render(<BehaviorSection behavior={[]} extra={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows schema-legal fields minim has no dedicated surface for', () => {
    render(<BehaviorSection behavior={[]} extra={[{ key: '_postman_id', value: 'abc' }]} />);
    expect(screen.getByTestId('behavior-row')).toHaveTextContent('_postman_id');
  });
});

describe('VariablesTable — USED column', () => {
  it('omits the column entirely when no counts are supplied', () => {
    render(
      <VariablesTable
        variables={[
          { key: 'baseUrl', value: 'x', type: 'string', disabled: null, description: '' },
        ]}
        caption="Folder variables"
        testId="t"
      />
    );

    expect(screen.queryByTestId('variable-used')).not.toBeInTheDocument();
  });

  it('shows "…" while the counts are still being collected, never a premature 0', () => {
    render(
      <VariablesTable
        variables={[
          { key: 'baseUrl', value: 'x', type: 'string', disabled: null, description: '' },
        ]}
        usage={null}
        caption="Collection variables"
        testId="t"
      />
    );

    expect(screen.getByTestId('variable-used')).toHaveTextContent('…');
  });
});
