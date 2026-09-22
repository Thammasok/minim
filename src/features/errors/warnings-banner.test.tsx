import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WarningsBanner, WarningsStatus } from './warnings-banner';
import type { LoadWarningView } from '@/bindings';

const warnings: LoadWarningView[] = [
  { kind: 'unknownAuthType', detail: { node_id: 'n-7', detail: 'hawk' } },
  {
    kind: 'malformedRawHeaderLine',
    detail: { node_id: 'n-9', detail: 'X-Trace missing colon' },
  },
];

const paths: Record<string, string> = {
  'n-7': 'Auth › Login',
  'n-9': 'Reports › CSV',
};

function Harness() {
  return (
    <div>
      <WarningsBanner warnings={warnings} resolvePath={(id) => paths[id]} defaultExpanded />
      <footer data-testid="status-bar">
        <WarningsStatus warnings={warnings} />
      </footer>
    </div>
  );
}

describe('WarningsBanner', () => {
  // TC-U-088
  it('keeps the status-bar count after the banner is dismissed', async () => {
    render(<Harness />);

    expect(screen.getByTestId('warnings-banner')).toBeInTheDocument();
    expect(screen.getByTestId('status-bar').textContent).toContain('2');

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notes' }));

    expect(screen.queryByTestId('warnings-banner')).toBeNull();
    expect(screen.getByTestId('status-bar').textContent).toContain('2');
    expect(screen.getByTestId('status-bar').textContent).toContain('2 notes');
  });

  it('lists each warning with its node path and its reason', () => {
    render(<Harness />);

    const list = screen.getByTestId('warnings-list');
    expect(list.children).toHaveLength(2);

    const text = list.textContent ?? '';
    expect(text).toContain('Unknown auth type');
    expect(text).toContain('hawk');
    expect(text).toContain('Auth › Login');
    expect(text).toContain('Shown as raw values.');
    expect(text).toContain('Header line without ":"');
    expect(text).toContain('Reports › CSV');
    expect(text).toContain('That line was skipped.');
  });

  it('falls back to the node id, then to the collection, when no path resolves', () => {
    render(
      <WarningsBanner
        warnings={[
          { kind: 'unknownBodyMode', detail: { node_id: 'n-13', detail: 'binary' } },
          { kind: 'duplicateVariableKey', detail: { node_id: null, detail: 'baseUrl' } },
        ]}
        defaultExpanded
      />
    );

    const text = screen.getByTestId('warnings-list').textContent ?? '';
    expect(text).toContain('n-13');
    expect(text).toContain('Collection');
  });

  it('starts collapsed and expands on demand', async () => {
    render(<WarningsBanner warnings={warnings} />);

    expect(screen.queryByTestId('warnings-list')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /View/ }));
    expect(screen.getByTestId('warnings-list')).toBeInTheDocument();
  });

  it('reports dismissal to its owner and honours a controlled flag', async () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <WarningsBanner warnings={warnings} dismissed={false} onDismiss={onDismiss} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notes' }));
    expect(onDismiss).toHaveBeenCalledOnce();
    // Controlled: the owner, not the banner, decides when it goes away.
    expect(screen.getByTestId('warnings-banner')).toBeInTheDocument();

    rerender(<WarningsBanner warnings={warnings} dismissed onDismiss={onDismiss} />);
    expect(screen.queryByTestId('warnings-banner')).toBeNull();
  });

  it('renders nothing when the collection loaded cleanly', () => {
    render(
      <div>
        <WarningsBanner warnings={[]} />
        <WarningsStatus warnings={[]} />
      </div>
    );
    expect(screen.queryByTestId('warnings-banner')).toBeNull();
    expect(screen.queryByTestId('warnings-status')).toBeNull();
  });

  it('re-shows the banner from the status bar when wired', async () => {
    const onShow = vi.fn();
    render(<WarningsStatus warnings={warnings} onShow={onShow} />);

    await userEvent.click(screen.getByTestId('warnings-status'));
    expect(onShow).toHaveBeenCalledOnce();
  });
});
