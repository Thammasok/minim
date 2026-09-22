import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { commands } from '@/bindings';
import type { AppError, NodeDetail, TreeNode, VarRef } from '@/bindings';
import { collectionKeys } from '@/features/collection/queries';

/**
 * The USED column of ux-design.md §S4 — the reverse of FR-035.
 *
 * FR-035 answers "which variables does this request mention"; USED answers "how many requests
 * mention this variable", and a `0` is the fastest way to spot a variable nothing uses any more.
 *
 * **What the count means** is pinned by TC-UNIT-043: USED is the number of *requests* that
 * reference the key, not the number of occurrences. `{{baseUrl}}` twice in one URL and once in
 * another request's header is `2`, not `3`.
 *
 * **Where the references come from** is the awkward part, and worth being explicit about. The
 * Rust core already holds a per-request reference list, but `CollectionOverview` does not carry
 * it and `VariableView` has no usage field, so the only complete source on this side of the wire
 * is `get_node_detail` per request. That is an O(requests) fan-out of arena lookups — no file
 * IO, no re-parse — run only when the Variables tab is actually looked at, and it warms exactly
 * the cache entries `useNodeDetail` reads later, so nothing is fetched twice. It is still the
 * wrong shape at collection scale: the honest fix is a `usage` count computed in one arena pass
 * on the Rust side and shipped with the overview.
 */

export interface RequestRefs {
  variableRefs: readonly VarRef[];
}

/**
 * USED counts for every referenced name.
 *
 * A name is counted once per request however often it occurs there, which is what makes the
 * column readable: it is a count of *places that would break* if the variable went away.
 */
export function countVariableUsage(requests: Iterable<RequestRefs>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const request of requests) {
    const seen = new Set<string>();
    for (const ref of request.variableRefs) {
      if (seen.has(ref.name)) continue;
      seen.add(ref.name);
      counts.set(ref.name, (counts.get(ref.name) ?? 0) + 1);
    }
  }
  return counts;
}

/** Every request leaf in document order; folders contribute their children, not themselves. */
export function collectRequestIds(tree: readonly TreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (nodes: readonly TreeNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'request') ids.push(node.id);
      walk(node.children);
    }
  };
  walk(tree);
  return ids;
}

export interface VariableUsage {
  /** Counts so far. Trust them only once `complete` is true. */
  counts: ReadonlyMap<string, number>;
  /** How many requests the collection has. */
  total: number;
  /** How many of them have answered. */
  scanned: number;
  /** True once every request has answered (or failed) — until then the column shows "…". */
  complete: boolean;
}

const IDLE: VariableUsage = { counts: new Map(), total: 0, scanned: 0, complete: false };

type CommandResult<T> = { status: 'ok'; data: T } | { status: 'error'; error: AppError };

async function unwrap<T>(call: Promise<CommandResult<T>>): Promise<T> {
  const result = await call;
  if (result.status === 'error') throw result.error;
  return result.data;
}

/**
 * Collect the USED counts for the open collection.
 *
 * `enabled` is the whole cost control: the fan-out starts when the Variables table is on screen
 * and never on a collection the user only glanced at. The query keys are `collectionKeys.detail`,
 * so every answer is the same cache entry the detail pane would have fetched anyway.
 */
export function useVariableUsage(
  tree: readonly TreeNode[],
  options: { enabled?: boolean } = {}
): VariableUsage {
  const enabled = options.enabled ?? false;
  const ids = useMemo(() => collectRequestIds(tree), [tree]);

  return useQueries({
    queries: ids.map((id) => ({
      queryKey: collectionKeys.detail(id),
      queryFn: () => unwrap(commands.getNodeDetail(id)),
      enabled,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    })),
    combine: (results): VariableUsage => {
      if (!enabled) return { ...IDLE, total: ids.length };

      const requests: RequestRefs[] = [];
      let scanned = 0;
      for (const result of results) {
        if (result.isPending) continue;
        scanned += 1;
        const detail: NodeDetail | undefined = result.data;
        // A folder id cannot appear here, but an errored lookup can — it simply contributes
        // nothing, which is why `complete` counts answers rather than successes.
        if (detail !== undefined && detail.kind === 'request') requests.push(detail);
      }

      return {
        counts: countVariableUsage(requests),
        total: ids.length,
        scanned,
        complete: scanned === ids.length,
      };
    },
  });
}
