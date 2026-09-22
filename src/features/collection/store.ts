import { create } from 'zustand';
import { isFilterActive } from '@/features/collection/tree/filter';

/**
 * Client state for the collection viewer — selection, expansion and the filter query
 * (design.md §Frontend Structure). Server state (the collection itself, node details)
 * belongs to TanStack Query in `queries.ts`, never here.
 *
 * Expansion is stored as ids rather than as a flag on the tree so the tree DTO stays
 * exactly what the Rust side sent, and so a reload that preserves `NodeId` (FR-045)
 * preserves the open folders for free.
 */
export type CollectionState = {
  selectedNodeId: string | null;
  expandedIds: ReadonlySet<string>;
  filter: string;
  /**
   * Expansion as it was the moment the filter went active. A filter auto-expands every
   * folder so matches are reachable; clearing it must put the user back where they were
   * (ux §S6 / TC-U-064), which is only possible if the previous set was kept.
   */
  preFilterExpandedIds: ReadonlySet<string> | null;

  select: (nodeId: string | null) => void;
  setExpanded: (nodeId: string, expanded: boolean) => void;
  toggleExpanded: (nodeId: string) => void;
  expandAll: (folderIds: readonly string[]) => void;
  collapseAll: () => void;
  /** `folderIds` is what "expand everything" means for the tree currently on screen. */
  setFilter: (query: string, folderIds: readonly string[]) => void;
  clearFilter: () => void;
  reset: () => void;
};

const EMPTY: ReadonlySet<string> = new Set<string>();

const initialState = {
  selectedNodeId: null,
  expandedIds: EMPTY,
  filter: '',
  preFilterExpandedIds: null,
} satisfies Pick<
  CollectionState,
  'selectedNodeId' | 'expandedIds' | 'filter' | 'preFilterExpandedIds'
>;

export const useCollectionStore = create<CollectionState>()((set) => ({
  ...initialState,

  select: (nodeId) => set({ selectedNodeId: nodeId }),

  setExpanded: (nodeId, expanded) =>
    set((state) => {
      if (state.expandedIds.has(nodeId) === expanded) return {};
      const next = new Set(state.expandedIds);
      if (expanded) next.add(nodeId);
      else next.delete(nodeId);
      return { expandedIds: next };
    }),

  toggleExpanded: (nodeId) =>
    set((state) => {
      const next = new Set(state.expandedIds);
      if (!next.delete(nodeId)) next.add(nodeId);
      return { expandedIds: next };
    }),

  // Selection survives expand/collapse — the row may be hidden, the id stays (TC-COMP-003).
  expandAll: (folderIds) => set({ expandedIds: new Set(folderIds) }),
  collapseAll: () => set({ expandedIds: EMPTY }),

  setFilter: (query, folderIds) =>
    set((state) => {
      const wasActive = isFilterActive(state.filter);
      const nowActive = isFilterActive(query);

      if (!wasActive && nowActive) {
        return {
          filter: query,
          preFilterExpandedIds: state.expandedIds,
          expandedIds: new Set(folderIds),
        };
      }
      if (wasActive && !nowActive) {
        return {
          filter: query,
          expandedIds: state.preFilterExpandedIds ?? state.expandedIds,
          preFilterExpandedIds: null,
        };
      }
      return { filter: query };
    }),

  clearFilter: () => set((state) => ({ ...restoreExpansion(state), filter: '' })),

  reset: () => set({ ...initialState }),
}));

function restoreExpansion(state: CollectionState): Partial<CollectionState> {
  if (state.preFilterExpandedIds === null) return {};
  return { expandedIds: state.preFilterExpandedIds, preFilterExpandedIds: null };
}
