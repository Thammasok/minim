import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronsDownUp, ChevronsUpDown, Search, X } from 'lucide-react';
import type { TreeNode } from '@/bindings';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCollectionStore } from '@/features/collection/store';
import { computeFilter, normalizeQuery } from './filter';
import { TreeRow } from './tree-row';
import { collectFolderIds, countRequests, flattenTree, type FlatNode } from './tree-model';

/** `h-7` — kept in sync with the row class so the virtualizer never has to measure. */
const ROW_HEIGHT = 28;
const OVERSCAN = 8;
/** APG typeahead: the buffer dies after a pause, so `i` `n` is a word, `i` … `i` is a cycle. */
const TYPEAHEAD_RESET_MS = 500;

export type CollectionTreeProps = {
  /** `CollectionOverview.tree` — document order, collection root excluded */
  tree: readonly TreeNode[];
  /** `CollectionOverview.name` — used by the empty state and the tree's accessible name */
  collectionName: string;
  /** fired on every selection change, after the store is updated */
  onSelect?: (nodeId: string) => void;
  className?: string;
  /** rows rendered beyond the visible window; lowered in tests to pin the a11y contract */
  overscan?: number;
};

/**
 * The virtualized collection sidebar (ux §S2 / §S6).
 *
 * Virtualization is over a **flat** list of visible nodes — depth is padding, not nesting —
 * so `aria-posinset` / `aria-setsize` are computed in `flattenTree` from the whole list
 * rather than from the handful of rows the DOM happens to hold (NFR-011, TC-U-065).
 */
export function CollectionTree({
  tree,
  collectionName,
  onSelect,
  className,
  overscan = OVERSCAN,
}: CollectionTreeProps) {
  const filter = useCollectionStore((s) => s.filter);
  const expandedIds = useCollectionStore((s) => s.expandedIds);
  const selectedNodeId = useCollectionStore((s) => s.selectedNodeId);
  const select = useCollectionStore((s) => s.select);
  const setExpanded = useCollectionStore((s) => s.setExpanded);
  const toggleExpanded = useCollectionStore((s) => s.toggleExpanded);
  const expandAll = useCollectionStore((s) => s.expandAll);
  const collapseAll = useCollectionStore((s) => s.collapseAll);
  const setFilter = useCollectionStore((s) => s.setFilter);

  const folderIds = useMemo(() => collectFolderIds(tree), [tree]);
  const totalRequests = useMemo(() => countRequests(tree), [tree]);
  const filterResult = useMemo(() => computeFilter(tree, filter), [tree, filter]);
  const rows = useMemo(
    () =>
      flattenTree(tree, {
        expandedIds,
        visibleIds: filterResult.visibleIds,
        matchIds: filterResult.active ? filterResult.matchIds : null,
      }),
    [tree, expandedIds, filterResult]
  );

  const needle = normalizeQuery(filter);
  const filterActive = filterResult.active;

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const focusIntentRef = useRef(false);
  const typeaheadRef = useRef({ buffer: '', at: 0 });

  const [focusedId, setFocusedId] = useState<string | null>(null);

  // The focused row must always be one that exists: collapsing or filtering can take it away.
  const effectiveFocusedId = useMemo(() => {
    const candidates = [focusedId, selectedNodeId];
    for (const candidate of candidates) {
      if (candidate !== null && rows.some((row) => row.id === candidate)) return candidate;
    }
    return rows[0]?.id ?? null;
  }, [focusedId, selectedNodeId, rows]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan,
    getItemKey: (index) => rows[index]?.id ?? index,
  });

  const registerRef = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element === null) rowRefs.current.delete(id);
    else rowRefs.current.set(id, element);
  }, []);

  // Runs after every commit, on purpose: a keyboard move may scroll the virtual window,
  // and the target row only mounts on the render that follows.
  useLayoutEffect(() => {
    if (!focusIntentRef.current || effectiveFocusedId === null) return;
    const element = rowRefs.current.get(effectiveFocusedId);
    if (element && document.activeElement !== element) element.focus();
  });

  const moveFocusTo = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return;
      focusIntentRef.current = true;
      virtualizer.scrollToIndex(index);
      setFocusedId(row.id);
    },
    [rows, virtualizer]
  );

  const activate = useCallback(
    (row: FlatNode) => {
      focusIntentRef.current = true;
      setFocusedId(row.id);
      select(row.id);
      onSelect?.(row.id);
      // Clicking a folder is also how a pointer user opens it; the keyboard has → / ←.
      if (row.isFolder) toggleExpanded(row.id);
    },
    [select, onSelect, toggleExpanded]
  );

  const runTypeahead = useCallback(
    (char: string, fromIndex: number) => {
      if (rows.length === 0) return;
      const now = Date.now();
      const state = typeaheadRef.current;
      const buffer = now - state.at > TYPEAHEAD_RESET_MS ? char : state.buffer + char;
      state.buffer = buffer;
      state.at = now;

      const first = buffer[0] ?? '';
      const repeated = buffer.length > 1 && [...buffer].every((c) => c === first);
      // A repeated character cycles to the *next* match; anything else refines the
      // current one, so typing "i" then "n" stays on a row already starting with "in".
      const term = repeated ? first : buffer;
      const start = repeated ? fromIndex + 1 : fromIndex;

      for (let offset = 0; offset < rows.length; offset += 1) {
        const index = (start + offset + rows.length) % rows.length;
        const row = rows[index];
        if (row && row.node.name.toLowerCase().startsWith(term)) {
          moveFocusTo(index);
          return;
        }
      }
    },
    [rows, moveFocusTo]
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const index = rows.findIndex((row) => row.id === effectiveFocusedId);
      const current = index >= 0 ? rows[index] : undefined;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          moveFocusTo(index + 1);
          return;
        case 'ArrowUp':
          event.preventDefault();
          moveFocusTo(index - 1);
          return;
        case 'ArrowRight':
          event.preventDefault();
          if (!current) return;
          if (current.isFolder && !current.isExpanded) setExpanded(current.id, true);
          else if (current.isFolder && current.hasChildren) moveFocusTo(index + 1);
          return;
        case 'ArrowLeft':
          event.preventDefault();
          if (!current) return;
          if (current.isFolder && current.isExpanded) {
            setExpanded(current.id, false);
            return;
          }
          if (current.parentId !== null) {
            const parentIndex = rows.findIndex((row) => row.id === current.parentId);
            if (parentIndex >= 0) moveFocusTo(parentIndex);
          }
          return;
        case 'Home':
          event.preventDefault();
          moveFocusTo(0);
          return;
        case 'End':
          event.preventDefault();
          moveFocusTo(rows.length - 1);
          return;
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (current) activate(current);
          return;
        default:
          if (event.key.length === 1 && event.key !== ' ') {
            event.preventDefault();
            runTypeahead(event.key.toLowerCase(), index < 0 ? 0 : index);
          }
      }
    },
    [rows, effectiveFocusedId, moveFocusTo, setExpanded, activate, runTypeahead]
  );

  const virtualItems = virtualizer.getVirtualItems();
  const focusedIndex = rows.findIndex((row) => row.id === effectiveFocusedId);
  const focusedIsRendered = virtualItems.some((item) => item.index === focusedIndex);

  const onFilterChange = (value: string) => {
    setFilter(value, folderIds);
    // A new query renders a different list; the old focus target may be gone.
    setFocusedId(null);
  };

  return (
    <div
      data-testid="collection-tree"
      className={cn('flex min-h-0 flex-1 flex-col', className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) focusIntentRef.current = false;
      }}
    >
      <div className="flex shrink-0 items-center gap-1 border-b p-2">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            data-testid="tree-filter"
            aria-label="Filter requests"
            placeholder="Filter requests…"
            spellCheck={false}
            autoComplete="off"
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && filter !== '') {
                event.stopPropagation();
                onFilterChange('');
              }
            }}
            className={cn(
              'h-8 w-full rounded-md border bg-transparent pr-7 pl-8 text-sm',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
            )}
          />
          {filter !== '' && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Clear filter"
              className="absolute top-1/2 right-1 -translate-y-1/2"
              onClick={() => onFilterChange('')}
            >
              <X />
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Expand all folders"
          title="Expand all"
          onClick={() => expandAll(folderIds)}
        >
          <ChevronsUpDown />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Collapse all folders"
          title="Collapse all"
          onClick={() => collapseAll()}
        >
          <ChevronsDownUp />
        </Button>
      </div>

      <div
        data-testid="tree-result-count"
        aria-live="polite"
        className="shrink-0 px-3 py-1 text-xs text-muted-foreground empty:hidden"
      >
        {filterActive ? `${filterResult.matchCount} of ${totalRequests}` : ''}
      </div>

      {tree.length === 0 ? (
        <div
          data-testid="tree-empty"
          className="px-6 py-8 text-center text-sm text-muted-foreground"
        >
          {`${collectionName} has no requests to show.`}
        </div>
      ) : rows.length === 0 ? (
        <div
          data-testid="tree-no-results"
          className="px-6 py-8 text-center text-sm text-muted-foreground"
        >
          {`No requests match "${filter.trim()}".`}
        </div>
      ) : (
        <div ref={scrollRef} data-testid="tree-scroll" className="min-h-0 flex-1 overflow-auto">
          <div
            role="tree"
            aria-label={`${collectionName} requests`}
            aria-multiselectable="false"
            // Falls back to being the tab stop only while the focused row is scrolled
            // out of the virtual window, so the tree is always exactly one tab stop.
            tabIndex={focusedIsRendered ? -1 : 0}
            onFocus={(event) => {
              if (event.target !== event.currentTarget) return;
              if (focusedIndex >= 0) moveFocusTo(focusedIndex);
            }}
            onKeyDown={onKeyDown}
            style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}
          >
            {virtualItems.map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              return (
                <TreeRow
                  key={item.key}
                  row={row}
                  isSelected={row.id === selectedNodeId}
                  isFocused={row.id === effectiveFocusedId}
                  needle={needle}
                  filterActive={filterActive}
                  onActivate={activate}
                  registerRef={registerRef}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${item.size}px`,
                    transform: `translateY(${item.start}px)`,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
