import { describe, expect, it } from 'vitest';
import { computeFilter } from './filter';
import { collectFolderIds, countRequests, flattenTree, indentRem } from './tree-model';
import { folder, request } from './tree-fixtures';

const tree = [
  request('r-zebra', 'zebra'),
  folder('f-alpha', 'alpha', [request('r-mango', 'Mango')]),
  folder('f-invoices', 'Invoices', [
    folder('f-drafts', 'Drafts', [
      request('r-a', 'Alpha invoice'),
      request('r-b', 'Beta invoice'),
      request('r-c', 'Gamma invoice'),
    ]),
  ]),
];

const all = new Set(collectFolderIds(tree));
const none = new Set<string>();

function noFilter(expandedIds: ReadonlySet<string>) {
  return { expandedIds, visibleIds: null, matchIds: null };
}

describe('flattenTree', () => {
  // FR-018 — document order, never re-sorted
  it('preserves document order and never sorts', () => {
    const rows = flattenTree(tree, noFilter(all));
    expect(rows.map((row) => row.id)).toEqual([
      'r-zebra',
      'f-alpha',
      'r-mango',
      'f-invoices',
      'f-drafts',
      'r-a',
      'r-b',
      'r-c',
    ]);
  });

  it('hides the children of a collapsed folder', () => {
    const rows = flattenTree(tree, noFilter(none));
    expect(rows.map((row) => row.id)).toEqual(['r-zebra', 'f-alpha', 'f-invoices']);
    expect(rows.every((row) => row.depth === 0)).toBe(true);
  });

  it('computes depth, parentage and the positional attributes from the full list', () => {
    const rows = flattenTree(tree, noFilter(all));
    const mango = rows.find((row) => row.id === 'r-mango');
    expect(mango).toMatchObject({ depth: 1, parentId: 'f-alpha', posInSet: 1, setSize: 1 });

    const gamma = rows.find((row) => row.id === 'r-c');
    // TC-U-065 (unit half) — third of three, regardless of what the window renders
    expect(gamma).toMatchObject({ depth: 2, posInSet: 3, setSize: 3 });

    const topLevel = rows.filter((row) => row.depth === 0);
    expect(topLevel.map((row) => row.posInSet)).toEqual([1, 2, 3]);
    expect(topLevel.every((row) => row.setSize === 3)).toBe(true);
  });

  it('marks folders and their expansion state; leaves are never folders', () => {
    const rows = flattenTree(tree, noFilter(all));
    expect(rows.find((row) => row.id === 'f-alpha')).toMatchObject({
      isFolder: true,
      isExpanded: true,
      hasChildren: true,
    });
    expect(rows.find((row) => row.id === 'r-zebra')).toMatchObject({
      isFolder: false,
      isExpanded: false,
    });
  });

  it('treats every row as a match when no filter is active', () => {
    expect(flattenTree(tree, noFilter(all)).every((row) => row.isMatch)).toBe(true);
  });

  // TC-U-063 — ancestors are retained but flagged as context, in order
  it('keeps ancestors of a match as non-matching context rows', () => {
    const result = computeFilter(tree, 'invoice');
    const rows = flattenTree(tree, {
      expandedIds: all,
      visibleIds: result.visibleIds,
      matchIds: result.matchIds,
    });
    expect(
      rows.map((row) => ({ kind: row.node.kind, name: row.node.name, isMatch: row.isMatch }))
    ).toEqual([
      { kind: 'folder', name: 'Invoices', isMatch: true },
      { kind: 'folder', name: 'Drafts', isMatch: false },
      { kind: 'request', name: 'Alpha invoice', isMatch: true },
      { kind: 'request', name: 'Beta invoice', isMatch: true },
      { kind: 'request', name: 'Gamma invoice', isMatch: true },
    ]);
  });

  it('renumbers posInSet over the filtered siblings, not the original ones', () => {
    const result = computeFilter(tree, 'Beta');
    const rows = flattenTree(tree, {
      expandedIds: all,
      visibleIds: result.visibleIds,
      matchIds: result.matchIds,
    });
    const beta = rows.find((row) => row.id === 'r-b');
    expect(beta).toMatchObject({ posInSet: 1, setSize: 1, isMatch: true });
    expect(rows.find((row) => row.id === 'f-drafts')?.isMatch).toBe(false);
  });
});

describe('collectFolderIds / countRequests', () => {
  it('collects every folder id in document order', () => {
    expect(collectFolderIds(tree)).toEqual(['f-alpha', 'f-invoices', 'f-drafts']);
  });

  it('counts every request leaf in the whole tree', () => {
    expect(countRequests(tree)).toBe(5);
  });
});

describe('indentRem', () => {
  it('is depth * 0.75rem + 0.5rem', () => {
    expect(indentRem(0)).toBe('0.5rem');
    expect(indentRem(1)).toBe('1.25rem');
    expect(indentRem(3)).toBe('2.75rem');
  });
});
