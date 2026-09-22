import { beforeEach, describe, expect, it } from 'vitest';
import { useCollectionStore } from './store';

const FOLDERS = ['A', 'B', 'C'];

function state() {
  return useCollectionStore.getState();
}

function expanded(): string[] {
  return [...state().expandedIds].sort();
}

describe('collection store', () => {
  beforeEach(() => {
    state().reset();
  });

  it('starts with nothing selected, nothing expanded and no filter', () => {
    expect(state().selectedNodeId).toBeNull();
    expect(expanded()).toEqual([]);
    expect(state().filter).toBe('');
  });

  it('toggles and sets expansion idempotently', () => {
    state().toggleExpanded('A');
    expect(expanded()).toEqual(['A']);
    state().toggleExpanded('A');
    expect(expanded()).toEqual([]);

    state().setExpanded('B', true);
    state().setExpanded('B', true);
    expect(expanded()).toEqual(['B']);
    state().setExpanded('B', false);
    expect(expanded()).toEqual([]);
  });

  // FR-020 / TC-COMP-003 — expand-all and collapse-all, selection retained
  it('expands and collapses everything while keeping the selection', () => {
    state().select('node-7');
    state().expandAll(FOLDERS);
    expect(expanded()).toEqual(['A', 'B', 'C']);
    state().collapseAll();
    expect(expanded()).toEqual([]);
    expect(state().selectedNodeId).toBe('node-7');
  });

  // TC-U-064 — clearing the filter restores the prior expansion state
  it('restores the pre-filter expansion state when the filter is cleared', () => {
    state().setExpanded('A', true);
    expect(expanded()).toEqual(['A']);

    state().setFilter('x', FOLDERS);
    expect(expanded()).toEqual(['A', 'B', 'C']); // a filter auto-expands everything

    state().clearFilter();
    expect(expanded()).toEqual(['A']);
    expect(state().filter).toBe('');
    expect(state().preFilterExpandedIds).toBeNull();
  });

  it('restores expansion when the query is emptied through setFilter too', () => {
    state().setExpanded('A', true);
    state().setFilter('inv', FOLDERS);
    state().setFilter('invo', FOLDERS); // refining keeps the snapshot untouched
    const snapshot = state().preFilterExpandedIds;
    expect(snapshot === null ? null : [...snapshot]).toEqual(['A']);
    state().setFilter('', FOLDERS);
    expect(expanded()).toEqual(['A']);
  });

  // TC-UNIT-046 (pin) — whitespace-only is not a filter, so it must not snapshot
  it('does not treat a whitespace-only query as an active filter', () => {
    state().setExpanded('A', true);
    state().setFilter('   ', FOLDERS);
    expect(expanded()).toEqual(['A']);
    expect(state().preFilterExpandedIds).toBeNull();
    expect(state().filter).toBe('   ');
  });

  it('keeps manual expansion changes made while filtering, then still restores', () => {
    state().setExpanded('A', true);
    state().setFilter('x', FOLDERS);
    state().setExpanded('B', false);
    expect(expanded()).toEqual(['A', 'C']);
    state().clearFilter();
    expect(expanded()).toEqual(['A']);
  });
});
