import type { TreeNode } from '@/bindings';

/**
 * Client-side filtering over the already-loaded `CollectionOverview.tree` (ADR-009).
 *
 * Everything here is a pure function over the summary DTO — no IPC, no re-parse — which is
 * what lets the 2,000-leaf fixture stay inside the 150 ms budget of NFR-002.
 */

/**
 * The needle a query reduces to. A whitespace-only query is **not** a query
 * (the pin TC-UNIT-046 asks for): it clears the filter rather than matching every
 * name that happens to contain a space, so the tree is never left half-filtered.
 */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function isFilterActive(query: string): boolean {
  return normalizeQuery(query) !== '';
}

/**
 * Does this node itself match? Name, HTTP method and the normalized URL preview,
 * case-insensitive **substring** — never prefix, never fuzzy, never regex, so
 * `.*`, `(` and `[a-` are matched as the literal characters a user typed (FR-021).
 */
export function nodeMatches(node: TreeNode, needle: string): boolean {
  if (needle === '') return false;
  if (node.name.toLowerCase().includes(needle)) return true;
  if (node.method !== null && node.method.toLowerCase().includes(needle)) return true;
  if (node.urlPreview !== null && node.urlPreview.toLowerCase().includes(needle)) return true;
  return false;
}

export type FilterResult = {
  /** false when the query is empty or whitespace-only */
  active: boolean;
  /** nodes that matched on their own account — everything else in `visibleIds` is context */
  matchIds: ReadonlySet<string>;
  /** matches plus their ancestors; `null` means "no filter, show the whole tree" */
  visibleIds: ReadonlySet<string> | null;
  /** matching request leaves — the numerator of "6 of 214"; ancestors are not counted */
  matchCount: number;
};

const INACTIVE: FilterResult = {
  active: false,
  matchIds: new Set<string>(),
  visibleIds: null,
  matchCount: 0,
};

/**
 * A node survives the filter when it matches, or when any descendant does. Surviving
 * ancestors are kept in `visibleIds` but stay out of `matchIds`, which is what lets the
 * row render as dimmed context rather than as a hit (ux §S6).
 */
export function computeFilter(nodes: readonly TreeNode[], query: string): FilterResult {
  const needle = normalizeQuery(query);
  if (needle === '') return INACTIVE;

  const matchIds = new Set<string>();
  const visibleIds = new Set<string>();
  let matchCount = 0;

  const visit = (node: TreeNode): boolean => {
    const self = nodeMatches(node, needle);
    if (self) {
      matchIds.add(node.id);
      if (node.kind === 'request') matchCount += 1;
    }
    let keepForChild = false;
    for (const child of node.children) {
      if (visit(child)) keepForChild = true;
    }
    const keep = self || keepForChild;
    if (keep) visibleIds.add(node.id);
    return keep;
  };

  for (const node of nodes) visit(node);

  return { active: true, matchIds, visibleIds, matchCount };
}

export type MatchRange = { start: number; end: number };

/**
 * Every literal occurrence of `needle` inside `text`, for in-place highlighting.
 * `indexOf` rather than a `RegExp` — a user's `(` must not blow up the sidebar.
 */
export function matchRanges(text: string, needle: string): MatchRange[] {
  if (needle === '') return [];
  const haystack = text.toLowerCase();
  const ranges: MatchRange[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    ranges.push({ start: at, end: at + needle.length });
    from = at + needle.length;
  }
  return ranges;
}
