import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RecentEntry } from '@/bindings';
import { RecentsList } from './recents-list';

const billing: RecentEntry = {
  path: '/Users/someone/work/collections/billing.postman_collection.json',
  name: 'Billing API',
  openedAt: 1_700_000_000,
  requestCount: 214,
};

const tools: RecentEntry = {
  path: '/Users/someone/dev/tools.json',
  name: 'Internal Tools',
  openedAt: 1_699_000_000,
  requestCount: 1,
};

describe('RecentsList', () => {
  // AC — rows show name, count and path.
  it('shows the name, the request count and a middle-truncated path', () => {
    render(<RecentsList entries={[billing, tools]} onOpen={vi.fn()} onForget={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Billing API' })).toBeInTheDocument();
    expect(screen.getByText('214 requests')).toBeInTheDocument();
    expect(screen.getByText('1 request')).toBeInTheDocument();

    const [path] = screen.getAllByTestId('recents-path');
    expect(path).toHaveAttribute('title', billing.path);
    expect(path?.textContent).toContain('…');
    // Never head-truncated — the file name is what identifies the row.
    expect(path?.textContent?.endsWith('billing.postman_collection.json')).toBe(true);
  });

  // AC — the path is hidden below 1000 px; the name and the count never are.
  it('hides only the path on a narrow window', () => {
    render(<RecentsList entries={[billing]} onOpen={vi.fn()} onForget={vi.fn()} />);

    const path = screen.getByTestId('recents-path');
    expect(path.className).toContain('hidden');
    expect(path.className).toContain('min-[1000px]:block');

    const name = screen.getByRole('button', { name: 'Billing API' });
    const count = screen.getByTestId('recents-count');
    expect(name.className).not.toMatch(/(^|[\s:])hidden\b/);
    expect(count.className).not.toMatch(/(^|[\s:])hidden\b/);
  });

  // TC-U-061 — `opacity-0 group-hover:opacity-100` without a focus counterpart hides the
  // control from keyboard users entirely. Both the reveal rule and the tab order are asserted.
  it('keeps the forget control reachable by keyboard, not hover-only', async () => {
    render(<RecentsList entries={[billing]} onOpen={vi.fn()} onForget={vi.fn()} />);

    const forget = screen.getByRole('button', { name: 'Forget Billing API' });
    expect(forget).toBeVisible();
    expect(forget).not.toHaveAttribute('tabindex', '-1');

    expect(forget.className).toContain('group-hover:opacity-100');
    expect(forget.className).toContain('group-focus-within:opacity-100');
    expect(forget.className).toContain('focus-visible:opacity-100');

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Billing API' })).toHaveFocus();

    await userEvent.tab();
    expect(forget).toHaveFocus();
    expect(forget).toBeVisible();
  });

  it('reports activation and forgetting to its owner', async () => {
    const onOpen = vi.fn();
    const onForget = vi.fn();
    render(<RecentsList entries={[billing]} onOpen={onOpen} onForget={onForget} />);

    await userEvent.click(screen.getByRole('button', { name: 'Billing API' }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(billing);

    await userEvent.click(screen.getByRole('button', { name: 'Forget Billing API' }));
    expect(onForget).toHaveBeenCalledExactlyOnceWith(billing.path);
  });

  // FR-042 — a row whose file is gone says so, in the same words as the S7 dialog.
  it('reports a missing file on its own row and offers removal', async () => {
    const onForget = vi.fn();
    render(
      <RecentsList
        entries={[billing, tools]}
        onOpen={vi.fn()}
        onForget={onForget}
        missingPaths={[billing.path]}
      />
    );

    const notice = screen.getByTestId('recents-missing');
    expect(notice).toHaveTextContent('billing.postman_collection.json no longer exists');
    expect(screen.getAllByTestId('recents-missing')).toHaveLength(1);

    await userEvent.click(within(notice).getByRole('button', { name: 'Remove from recents' }));
    expect(onForget).toHaveBeenCalledExactlyOnceWith(billing.path);
  });

  it('shows the busy state on the row being opened', () => {
    render(
      <RecentsList
        entries={[billing]}
        onOpen={vi.fn()}
        onForget={vi.fn()}
        openingPath={billing.path}
      />
    );

    expect(screen.getByTestId('recents-count')).toHaveTextContent('Opening…');
  });

  it('renders nothing when there are no recents', () => {
    render(<RecentsList entries={[]} onOpen={vi.fn()} onForget={vi.fn()} />);
    expect(screen.queryByTestId('recents')).toBeNull();
  });

  // Collection names come out of an untrusted file — they are text nodes, never markup.
  it('renders an untrusted name as text', () => {
    const hostile: RecentEntry = { ...billing, name: '<img src=x onerror="alert(1)">' };
    render(<RecentsList entries={[hostile]} onOpen={vi.fn()} onForget={vi.fn()} />);

    expect(screen.getByRole('button', { name: hostile.name })).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});
