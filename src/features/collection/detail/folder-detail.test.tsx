import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { FolderDetail } from '@/bindings';
import { FolderDetailView } from './folder-detail';
import { script } from './detail-fixtures';

vi.mock('@/bindings', () => ({ commands: {} }));

function folderDetail(overrides: Partial<FolderDetail> = {}): FolderDetail {
  return {
    id: 'f1',
    name: 'Invoices',
    folderPath: ['Billing API'],
    description: 'Everything invoice-shaped.',
    auth: { source: { kind: 'none' }, authType: 'noauth', attributes: [] },
    events: [],
    variable: [],
    childCount: 0,
    descendantRequestCount: 0,
    ...overrides,
  };
}

describe('FolderDetailView (S3 / FR-039)', () => {
  it('shows the folder’s own scripts, auth and variables, labelled as the folder’s', () => {
    // TC-COMP-024
    render(
      <FolderDetailView
        detail={folderDetail({
          auth: {
            source: { kind: 'own' },
            authType: 'basic',
            attributes: [
              { key: 'username', value: 'ops', sensitive: false },
              { key: 'password', value: 'hunter2', sensitive: true },
            ],
          },
          events: [script('prerequest', 'pm.variables.set("run", 1)')],
          variable: [
            { key: 'invoiceId', value: 'inv_1', type: 'string', disabled: null, description: '' },
          ],
          childCount: 3,
          descendantRequestCount: 12,
        })}
      />
    );

    expect(screen.getByTestId('folder-name')).toHaveTextContent('Invoices');
    expect(screen.getByTestId('folder-meta')).toHaveTextContent('12 requests · 3 direct children');
    expect(within(screen.getByTestId('folder-breadcrumb')).getByText('Billing API')).toBeVisible();

    expect(screen.getByTestId('folder-variables')).toHaveTextContent('Folder variables');
    expect(screen.getByTestId('folder-variables-table')).toHaveTextContent('invoiceId');

    expect(screen.getByTestId('auth-type')).toHaveTextContent('basic');
    expect(screen.getByTestId('masked-value')).toBeInTheDocument();
    expect(screen.queryByText('hunter2')).not.toBeInTheDocument();

    expect(screen.getByTestId('script-source')).toHaveTextContent('pm.variables.set');
    expect(screen.getByTestId('script-notice')).toHaveTextContent('minim never runs them');
  });

  it('shows "(none)" per section for a folder that declares none of them', () => {
    render(<FolderDetailView detail={folderDetail()} />);

    // Variables, auth and scripts each state their absence (FR-036).
    expect(screen.getAllByTestId('empty-section')).toHaveLength(3);
  });

  it('never shows a request’s tabs', () => {
    render(<FolderDetailView detail={folderDetail()} />);

    expect(screen.queryByTestId('detail-tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('names the inheritance source when the folder inherits its auth', () => {
    render(
      <FolderDetailView
        detail={folderDetail({
          auth: { source: { kind: 'collection' }, authType: 'bearer', attributes: [] },
        })}
      />
    );

    expect(screen.getByTestId('auth-inherited')).toHaveTextContent('Inherited from collection');
  });
});
