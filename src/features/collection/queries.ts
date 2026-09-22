import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { commands } from '@/bindings';
import type { AppError, CollectionOverview, ExampleDetail, NodeDetail } from '@/bindings';

/**
 * Server state for the collection viewer (design.md §Frontend Structure).
 *
 * Everything the Rust core owns is read through these hooks and cached by TanStack Query;
 * `store.ts` keeps only client state (selection, expansion, filter). The split matters here
 * because of ADR-005: `open_collection` ships every summary once, and detail is pulled per
 * selected node. A node's detail is an O(1) arena lookup over an immutable load, so it is
 * cached forever — `staleTime: Infinity` is what makes re-selecting a request instant and is
 * half of how NFR-002's 100 ms budget is met. The other half is `reset()` on reload/close:
 * a new load invalidates `collectionKeys.all`, which is why every key is nested under it.
 */

export const collectionKeys = {
  /** Root of the namespace — invalidate this after a reload or a close. */
  all: ['collection'] as const,
  overview: (path: string | null) => ['collection', 'overview', path] as const,
  detail: (nodeId: string) => ['collection', 'node', nodeId] as const,
  example: (nodeId: string, index: number) =>
    ['collection', 'node', nodeId, 'example', index] as const,
} as const;

/** The `typedError` envelope every generated command resolves to. */
type CommandResult<T> = { status: 'ok'; data: T } | { status: 'error'; error: AppError };

/**
 * Turn the envelope into a promise Query understands: an `AppError` is thrown so it lands in
 * `query.error` with its structure intact, which is what `errorMessage()` needs.
 */
async function unwrap<T>(call: Promise<CommandResult<T>>): Promise<T> {
  const result = await call;
  if (result.status === 'error') throw result.error;
  return result.data;
}

/**
 * Narrow a thrown value to an `AppError`.
 *
 * `bindings.ts` re-throws anything that is a real `Error` (an IPC-layer failure rather than a
 * command-level one), so a rejected query is *usually* but not provably an `AppError`. Callers
 * narrow rather than assume, and keep a fallback for the transport case.
 */
export function asAppError(error: unknown): AppError | null {
  if (typeof error !== 'object' || error === null) return null;
  if (error instanceof Error) return null;
  const kind: unknown = (error as { kind?: unknown }).kind;
  return typeof kind === 'string' ? (error as AppError) : null;
}

const IMMUTABLE = {
  // One load of a collection is immutable: re-running a command would re-read the same arena.
  staleTime: Infinity,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  // AppError is a decision, not a blip — retrying a bad schema three times only delays the copy.
  retry: false,
} as const;

/**
 * The open collection's overview.
 *
 * `path` is the query key, so opening a second file is a second cache entry rather than a
 * refetch; `null` leaves the hook idle for the S1 empty shell.
 */
export function useCollection(path: string | null): UseQueryResult<CollectionOverview, AppError> {
  return useQuery<CollectionOverview, AppError>({
    queryKey: collectionKeys.overview(path),
    queryFn: () => {
      if (path === null || path === '') throw new Error('useCollection called without a path');
      return unwrap(commands.openCollection(path));
    },
    enabled: path !== null && path !== '',
    ...IMMUTABLE,
  });
}

/**
 * Detail for one node, keyed by `NodeId`.
 *
 * The root id (`""`) is deliberately not fetched: `get_node_detail("")` answers `UnknownNode`
 * because the collection's own detail already arrived with the overview (TC-CMD-019/020).
 */
export function useNodeDetail(nodeId: string | null): UseQueryResult<NodeDetail, AppError> {
  return useQuery<NodeDetail, AppError>({
    queryKey: collectionKeys.detail(nodeId ?? ''),
    queryFn: () => {
      if (nodeId === null || nodeId === '') throw new Error('useNodeDetail called without a node');
      return unwrap(commands.getNodeDetail(nodeId));
    },
    enabled: nodeId !== null && nodeId !== '',
    ...IMMUTABLE,
  });
}

/**
 * One saved response, fetched only once it is actually selected.
 *
 * Example bodies can be megabytes and are rarely all read, so `enabled` defaults to `false`:
 * mounting the Examples tab must not fetch anything (TC-U-079). T-018 flips it on selection.
 */
export function useExample(
  nodeId: string | null,
  index: number | null,
  options: { enabled?: boolean } = {}
): UseQueryResult<ExampleDetail, AppError> {
  const ready = nodeId !== null && nodeId !== '' && index !== null && index >= 0;
  return useQuery<ExampleDetail, AppError>({
    queryKey: collectionKeys.example(nodeId ?? '', index ?? -1),
    queryFn: () => {
      if (!ready || nodeId === null || index === null) {
        throw new Error('useExample called without a node and index');
      }
      return unwrap(commands.getExample(nodeId, index));
    },
    enabled: ready && (options.enabled ?? false),
    ...IMMUTABLE,
  });
}
