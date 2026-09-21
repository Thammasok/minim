# Data Fetching (TanStack Query v5)

Contents: [Setup](#setup) · [API client](#api-client) · [Query options pattern](#query-options-pattern) ·
[Query keys](#query-keys) · [Mutations](#mutations) · [Optimistic updates](#optimistic-updates) ·
[Pagination & infinite](#pagination--infinite-lists) · [Common mistakes](#common-mistakes)

## Setup

```tsx
// src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,          // 1 min — stop the refetch-on-every-mount noise
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        // retrying a 404 or 403 is pointless and slows down the error state
        const status = (error as ApiError).status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false, // enable per-query where freshness matters
    },
  },
});
```

The default `staleTime: 0` is the single most surprising default in the library — it means every
mount refetches. Set a sensible baseline and override per query. Data that changes hourly doesn't
need a network request every time a user switches tabs.

Add the devtools in development; they pay for themselves immediately when debugging cache issues:

```tsx
{import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
```

## API client

One configured client, one place errors get normalized. Both matter — scattered `fetch` calls
mean scattered error handling and no single place to attach an auth token.

```ts
// src/lib/api-client.ts
import { env } from '@/lib/env';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.VITE_API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new ApiError(res.status, body?.message ?? res.statusText, body);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body: unknown) =>
    request<T>(p, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(p: string, body: unknown) =>
    request<T>(p, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
};
```

Validate the response shape at this boundary with Zod (see the SKILL.md principle on typing the
boundary). It costs a few microseconds and turns a mystery `undefined` three components deep into
a clear error at the source.

## Query options pattern

Define queries as `queryOptions` objects rather than inline in components. The same definition
then works in a component, in a route loader, and in a prefetch call — with types intact and no
chance of the key drifting between them.

```ts
// src/features/projects/queries.ts
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { ProjectSchema, ProjectListSchema, type Project } from './api';

export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (filters: ProjectFilters) => [...projectKeys.lists(), filters] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
};

export const projectQuery = (id: string) =>
  queryOptions({
    queryKey: projectKeys.detail(id),
    queryFn: async () => ProjectSchema.parse(await api.get(`/projects/${id}`)),
  });

export const projectListQuery = (filters: ProjectFilters) =>
  queryOptions({
    queryKey: projectKeys.list(filters),
    queryFn: async () =>
      ProjectListSchema.parse(await api.get(`/projects?${new URLSearchParams(filters)}`)),
    placeholderData: (prev) => prev,   // keep old rows visible while filters change
  });
```

Usage stays trivial:

```tsx
const { data, isPending, isError, error } = useQuery(projectQuery(projectId));
```

## Query keys

The key is the cache identity. Two rules cover almost everything:

1. **Every variable the `queryFn` reads must be in the key.** Miss one and you'll serve cached
   data for the wrong arguments — the most common and most confusing bug in the library.
2. **Structure keys hierarchically** so invalidation can be broad or narrow. With the factory
   above, `invalidateQueries({ queryKey: projectKeys.lists() })` refreshes every list without
   touching detail queries.

Keys are compared structurally, so object order doesn't matter, but stable references do help
avoid unnecessary work.

## Mutations

```ts
export function useUpdateProject() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateProjectInput) =>
      api.patch<Project>(`/projects/${id}`, patch),

    onSuccess: (updated) => {
      // write the response straight into the detail cache — no extra round trip
      qc.setQueryData(projectKeys.detail(updated.id), updated);
      // lists may now be ordered or filtered differently, so refetch those
      qc.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}
```

```tsx
const { mutate, isPending } = useUpdateProject();

<Button onClick={() => mutate({ id, name })} disabled={isPending}>
  {isPending ? 'Saving…' : 'Save'}
</Button>
```

Prefer `setQueryData` for the thing you just changed and `invalidateQueries` for everything that
might be indirectly affected. Invalidating everything is simpler but produces a visible flash of
refetching across the screen.

## Optimistic updates

Worth it for high-frequency, low-risk actions — toggling a checkbox, reordering a list, liking
something. Not worth the complexity for a form submission the user expects to take a moment.

```ts
useMutation({
  mutationFn: toggleFavorite,

  onMutate: async ({ id, favorite }) => {
    await qc.cancelQueries({ queryKey: projectKeys.detail(id) }); // stop an in-flight refetch overwriting us
    const previous = qc.getQueryData(projectKeys.detail(id));
    qc.setQueryData(projectKeys.detail(id), (old) => ({ ...old!, favorite }));
    return { previous };
  },

  onError: (_err, { id }, context) => {
    qc.setQueryData(projectKeys.detail(id), context?.previous); // roll back
  },

  onSettled: (_data, _err, { id }) => {
    qc.invalidateQueries({ queryKey: projectKeys.detail(id) });  // reconcile with the server
  },
});
```

All four callbacks are needed. Skipping `cancelQueries` lets a slow in-flight request clobber the
optimistic value; skipping `onSettled` leaves the client believing a state the server may have
rejected.

## Pagination & infinite lists

For pages, `placeholderData: (prev) => prev` keeps the previous page rendered while the next
loads, avoiding a jarring empty state on every click.

For infinite scroll:

```ts
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
  queryKey: projectKeys.lists(),
  queryFn: ({ pageParam }) => api.get(`/projects?cursor=${pageParam}`),
  initialPageParam: null as string | null,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
});

const items = data?.pages.flatMap((p) => p.items) ?? [];
```

Pair the trigger with an IntersectionObserver rather than a scroll listener, and always keep a
visible "Load more" button as a fallback — infinite scroll alone is inaccessible to keyboard users
and traps them out of anything below the list.

## Common mistakes

**Copying query data into `useState`.** It immediately goes stale and you've recreated the problem
the library solves. Derive during render instead; if the derivation is expensive, `useMemo` it.

**Wrapping every query in a `useEffect`.** Query already manages the lifecycle. An effect around
it is a symptom of not trusting the cache.

**`enabled: false` used as flow control.** Legitimate for dependent queries
(`enabled: !!userId`), but if you're toggling it to "control when the fetch happens", you probably
want a mutation or an imperative `queryClient.fetchQuery`.

**No error UI.** `isError` exists and users hit it. An unhandled rejection that renders nothing
looks identical to a hung app.

**Putting auth tokens in the query cache.** Cache contents are inspectable and persist in memory
across routes. Tokens belong in an httpOnly cookie set by the backend.
