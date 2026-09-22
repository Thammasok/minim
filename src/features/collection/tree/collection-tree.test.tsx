import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { TreeNode } from '@/bindings';
import { useCollectionStore } from '@/features/collection/store';
import { CollectionTree } from './collection-tree';
import { collectFolderIds } from './tree-model';
import { folder, request } from './tree-fixtures';

const ROW_HEIGHT = 28;

function renderTree(tree: readonly TreeNode[], overrides: { overscan?: number } = {}) {
  return render(
    <CollectionTree tree={tree} collectionName="Billing API" overscan={overrides.overscan ?? 8} />
  );
}

function expandEverything(tree: readonly TreeNode[]) {
  useCollectionStore.getState().expandAll(collectFolderIds(tree));
}

function rowFor(name: string): HTMLElement {
  const label = screen.getByText(name);
  const row = label.closest('[role="treeitem"]');
  if (!(row instanceof HTMLElement)) throw new Error(`no treeitem for ${name}`);
  return row;
}

/** Lookup by id — names carrying a highlight `<mark>` are split across text nodes. */
function rowById(id: string): HTMLElement {
  const row = document.querySelector(`[data-node-id="${id}"]`);
  if (!(row instanceof HTMLElement)) throw new Error(`no treeitem with id ${id}`);
  return row;
}

function treeEl(): HTMLElement {
  return screen.getByRole('tree');
}

function typeFilter(value: string) {
  fireEvent.change(screen.getByTestId('tree-filter'), { target: { value } });
}

/** jsdom has no layout, so drive the virtualizer's scroll offset directly. */
function scrollTo(offset: number) {
  const scroller = screen.getByTestId('tree-scroll');
  Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: offset });
  fireEvent.scroll(scroller);
}

beforeEach(() => {
  useCollectionStore.getState().reset();
});

describe('CollectionTree — structure', () => {
  // TC-COMP-001 — document order, depth as padding, flat DOM
  it('renders document order with depth as padding and no nested rows', () => {
    const tree = [
      request('r-zebra', 'zebra'),
      folder('f-alpha', 'alpha', [request('r-mango', 'Mango')]),
    ];
    expandEverything(tree);
    renderTree(tree);

    const rows = screen.getAllByRole('treeitem');
    expect(rows.map((row) => row.textContent)).toEqual(['GETzebra', 'alpha', 'GETMango']);

    expect(rowFor('zebra').style.paddingLeft).toBe('0.5rem');
    expect(rowFor('alpha').style.paddingLeft).toBe('0.5rem');
    expect(rowFor('Mango').style.paddingLeft).toBe('1.25rem');

    // flat list: every row is a direct child of the tree container, never of another row
    for (const row of rows) {
      expect(row.parentElement).toBe(treeEl());
      expect(within(row).queryByRole('treeitem')).toBeNull();
    }
  });

  // TC-COMP-002 — method chips carry both the colour token and the verb text
  it('maps every verb to its colour token and always prints the verb', () => {
    const verbs = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'PROPFIND', 'get'];
    const tree = verbs.map((verb, index) =>
      request(`r-${index}`, `Request ${index}`, { method: verb })
    );
    renderTree(tree);

    const chips = screen.getAllByTestId('method-chip');
    const expected = [
      'text-method-get',
      'text-method-post',
      'text-method-put',
      'text-method-patch',
      'text-method-delete',
      'text-method-other',
      'text-method-other',
      'text-method-other',
      'text-method-get',
    ];
    chips.forEach((chip, index) => {
      expect(chip.className).toContain(expected[index]);
      expect(chip.textContent).toBe(verbs[index]?.toUpperCase());
    });
  });

  // TC-U-067 — an empty collection shows a named empty state
  it('names the collection in the empty state', () => {
    renderTree([]);
    const empty = screen.getByTestId('tree-empty');
    expect(empty.textContent).toContain('Billing API');
    expect(empty.textContent).toContain('no requests');
    expect(screen.queryByRole('tree')).toBeNull();
  });
});

describe('CollectionTree — ARIA', () => {
  const tree = [
    folder('f1', 'Auth', [
      request('r1', 'Login', { method: 'POST' }),
      request('r2', 'Refresh', { method: 'POST' }),
    ]),
    request('r3', 'Health'),
  ];

  // TC-A11Y-002 — the APG tree pattern, one tab stop
  it('exposes tree/treeitem semantics and exactly one tab stop', () => {
    expandEverything(tree);
    const { container } = renderTree(tree);

    expect(treeEl()).toHaveAttribute('aria-multiselectable', 'false');

    expect(rowFor('Auth')).toHaveAttribute('aria-expanded', 'true');
    expect(rowFor('Auth')).toHaveAttribute('aria-level', '1');
    expect(rowFor('Login')).toHaveAttribute('aria-level', '2');
    // aria-expanded is for folders only, never for leaves
    expect(rowFor('Login')).not.toHaveAttribute('aria-expanded');
    expect(rowFor('Login')).toHaveAttribute('aria-selected', 'false');

    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);

    fireEvent.click(rowFor('Login'));
    expect(rowFor('Login')).toHaveAttribute('aria-selected', 'true');
    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  // TC-U-065 — positional attributes come from the full list, not the rendered window
  it('keeps aria-posinset/aria-setsize correct for a row rendered alone in the window', () => {
    const lead = Array.from({ length: 40 }, (_, i) => request(`lead-${i}`, `Lead ${i}`));
    const tail = Array.from({ length: 40 }, (_, i) => request(`tail-${i}`, `Tail ${i}`));
    const tree = [
      ...lead,
      folder('f3', 'Trio', [
        request('c1', 'Child 1'),
        request('c2', 'Child 2'),
        request('c3', 'Child 3'),
      ]),
      ...tail,
    ];
    expandEverything(tree);
    renderTree(tree, { overscan: 0 });

    // Child 3 sits at flat index 43; scroll so the window starts exactly there.
    scrollTo(43 * ROW_HEIGHT);

    expect(screen.queryByText('Child 1')).toBeNull();
    expect(screen.queryByText('Child 2')).toBeNull();
    const third = rowFor('Child 3');
    expect(third).toHaveAttribute('aria-posinset', '3');
    expect(third).toHaveAttribute('aria-setsize', '3');
    expect(third).toHaveAttribute('aria-level', '2');
  });
});

describe('CollectionTree — keyboard', () => {
  // TC-U-066 — ArrowRight expands, then descends
  it('expands a collapsed folder then moves into it', () => {
    const tree = [folder('f1', 'Auth', [request('r1', 'Login', { method: 'POST' })])];
    renderTree(tree);

    expect(rowFor('Auth')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Login')).toBeNull();

    fireEvent.keyDown(treeEl(), { key: 'ArrowRight' });
    expect(rowFor('Auth')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Login')).toBeInTheDocument();

    fireEvent.keyDown(treeEl(), { key: 'ArrowRight' });
    expect(rowFor('Login')).toHaveAttribute('tabindex', '0');
    expect(document.activeElement).toBe(rowFor('Login'));
  });

  // TC-COMP-005 — ArrowLeft ascends then collapses; Home/End jump
  it('walks up with ArrowLeft and jumps with Home/End', () => {
    const tree = [
      folder('f1', 'Auth', [request('r1', 'Login'), request('r2', 'Refresh')]),
      request('r3', 'Health'),
    ];
    expandEverything(tree);
    const { container } = renderTree(tree);

    fireEvent.click(rowFor('Login'));
    fireEvent.keyDown(treeEl(), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(rowFor('Auth'));

    fireEvent.keyDown(treeEl(), { key: 'ArrowLeft' });
    expect(rowFor('Auth')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Login')).toBeNull();

    fireEvent.keyDown(treeEl(), { key: 'End' });
    expect(document.activeElement).toBe(rowFor('Health'));
    fireEvent.keyDown(treeEl(), { key: 'Home' });
    expect(document.activeElement).toBe(rowFor('Auth'));

    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it('moves with ArrowDown/ArrowUp and selects with Enter and Space', () => {
    const tree = [request('r1', 'First'), request('r2', 'Second')];
    renderTree(tree);

    fireEvent.keyDown(treeEl(), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rowFor('Second'));
    fireEvent.keyDown(treeEl(), { key: 'Enter' });
    expect(useCollectionStore.getState().selectedNodeId).toBe('r2');

    fireEvent.keyDown(treeEl(), { key: 'ArrowUp' });
    fireEvent.keyDown(treeEl(), { key: ' ' });
    expect(useCollectionStore.getState().selectedNodeId).toBe('r1');
  });

  // TC-COMP-006 — typeahead cycles on a repeated letter and refines on a word
  it('jumps by typeahead without leaking into the filter input', () => {
    vi.useFakeTimers();
    try {
      const tree = [
        folder('f-auth', 'Auth', [request('r1', 'Login')]),
        folder('f-invoices', 'Invoices', [request('r2', 'List')]),
        folder('f-inbox', 'Inbox', [request('r3', 'Poll')]),
        folder('f-reports', 'Reports', [request('r4', 'Monthly')]),
      ];
      renderTree(tree);

      fireEvent.keyDown(treeEl(), { key: 'i' });
      expect(document.activeElement).toBe(rowFor('Invoices'));

      fireEvent.keyDown(treeEl(), { key: 'i' });
      expect(document.activeElement).toBe(rowFor('Inbox'));

      vi.advanceTimersByTime(600);
      fireEvent.keyDown(treeEl(), { key: 'i' });
      fireEvent.keyDown(treeEl(), { key: 'n' });
      expect(document.activeElement).toBe(rowFor('Inbox'));

      expect(screen.getByTestId('tree-filter')).toHaveValue('');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('CollectionTree — expand and collapse all', () => {
  // TC-COMP-003 / FR-020
  it('expands every folder and collapses back to the roots, keeping the selection', () => {
    const tree = [
      folder('f1', 'Level 1', [folder('f2', 'Level 2', [request('r1', 'Leaf')])]),
      request('r2', 'Top level'),
    ];
    renderTree(tree);
    useCollectionStore.getState().select('r1');

    fireEvent.click(screen.getByRole('button', { name: 'Expand all folders' }));
    expect(rowFor('Level 1')).toHaveAttribute('aria-expanded', 'true');
    expect(rowFor('Level 2')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Leaf')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all folders' }));
    expect(screen.getAllByRole('treeitem')).toHaveLength(2);
    expect(rowFor('Level 1')).toHaveAttribute('aria-expanded', 'false');
    expect(useCollectionStore.getState().selectedNodeId).toBe('r1');
  });
});

describe('CollectionTree — filtering', () => {
  const tree = [
    folder('f-invoices', 'Invoices', [
      folder('f-drafts', 'Drafts', [
        request('r-list', 'List invoices'),
        request('r-create', 'Create invoice'),
      ]),
    ]),
    folder('f-auth', 'Auth', [
      request('r-login', 'Login', { method: 'POST', urlPreview: '{{baseUrl}}/auth/token' }),
    ]),
    request('r-health', 'Health'),
  ];

  // TC-COMP-007 — the count, the no-results state and the clear affordance
  it('shows "n of m", a no-results message and a clear button only when filled', () => {
    renderTree(tree);
    expect(screen.getByTestId('tree-result-count').textContent).toBe('');
    expect(screen.queryByRole('button', { name: 'Clear filter' })).toBeNull();

    typeFilter('invoice');
    expect(screen.getByTestId('tree-result-count').textContent).toBe('2 of 4');
    expect(screen.getByRole('button', { name: 'Clear filter' })).toBeInTheDocument();

    typeFilter('zzz');
    expect(screen.getByTestId('tree-result-count').textContent).toBe('0 of 4');
    expect(screen.getByTestId('tree-no-results')).toBeInTheDocument();
    expect(screen.queryByRole('tree')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(screen.getByTestId('tree-result-count').textContent).toBe('');
    expect(screen.getAllByRole('treeitem').length).toBeGreaterThan(0);
  });

  // TC-U-062 (component level) — a URL-only match still surfaces the request
  it('matches the normalized URL and the method, not only the name', () => {
    renderTree(tree);
    typeFilter('token');
    expect(rowById('r-login')).toHaveAttribute('data-match', 'true');
    expect(screen.getByTestId('tree-result-count').textContent).toBe('1 of 4');

    typeFilter('POST');
    expect(rowById('r-login')).toHaveAttribute('data-match', 'true');
  });

  // TC-U-063 / TC-COMP-008 — ancestors are dimmed context, matches are highlighted
  it('dims retained ancestors and highlights the match in place', () => {
    renderTree(tree);
    typeFilter('voi');

    const drafts = rowById('f-drafts');
    expect(drafts).toHaveAttribute('data-match', 'false');
    expect(drafts).toHaveAttribute('data-context', 'true');
    expect(drafts.className).toContain('opacity-60');
    expect(drafts.querySelector('mark')).toBeNull();

    const leaf = rowById('r-create');
    expect(leaf).toHaveAttribute('data-match', 'true');
    expect(leaf).not.toHaveAttribute('data-context');
    expect(leaf.querySelector('mark')?.textContent).toBe('voi');

    // an ancestor is a real node and stays selectable
    fireEvent.click(drafts);
    expect(useCollectionStore.getState().selectedNodeId).toBe('f-drafts');
  });

  it('auto-expands while filtering and restores the prior expansion when cleared', () => {
    renderTree(tree);
    fireEvent.click(rowFor('Auth')); // expand just this one folder
    expect(rowFor('Auth')).toHaveAttribute('aria-expanded', 'true');
    expect(rowFor('Invoices')).toHaveAttribute('aria-expanded', 'false');

    typeFilter('invoice');
    expect(rowById('f-invoices')).toHaveAttribute('aria-expanded', 'true');
    expect(rowById('r-list')).toBeInTheDocument();

    typeFilter('');
    expect(rowById('f-auth')).toHaveAttribute('aria-expanded', 'true');
    expect(rowById('f-invoices')).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps document order under a filter', () => {
    renderTree(tree);
    typeFilter('invoice');
    expect(screen.getAllByRole('treeitem').map((row) => row.getAttribute('data-node-id'))).toEqual([
      'f-invoices',
      'f-drafts',
      'r-list',
      'r-create',
    ]);
  });
});

describe('CollectionTree — selection', () => {
  it('reports the selected node id to the shell', () => {
    const onSelect = vi.fn();
    const tree = [request('r1', 'Login', { method: 'POST' })];
    render(<CollectionTree tree={tree} collectionName="Billing API" onSelect={onSelect} />);

    fireEvent.click(rowFor('Login'));
    expect(onSelect).toHaveBeenCalledWith('r1');
    expect(useCollectionStore.getState().selectedNodeId).toBe('r1');
  });
});

afterEach(() => {
  vi.useRealTimers();
});
