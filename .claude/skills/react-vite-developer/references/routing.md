# Routing (TanStack Router)

Contents: [Why TanStack Router](#why-tanstack-router) · [Setup](#setup) · [Routes](#defining-routes) ·
[Params & search](#params--search-params) · [Loaders](#loaders-and-query-integration) ·
[Auth guards](#auth-guards) · [Code splitting](#code-splitting) · [React Router](#if-the-project-uses-react-router)

## Why TanStack Router

The pitch is type safety that actually holds. Route params, search params, and loader data are
inferred end to end — `navigate({ to: '/projects/$id', params: { id } })` fails to compile if the
route doesn't exist or the param is wrong. In a large SPA, that catches a whole category of bug
that React Router lets you ship.

The cost is a heavier mental model and a codegen step for file-based routing. For a small app or
a team that already knows React Router well, React Router v6+ is a perfectly good answer — say so
rather than pushing a migration for its own sake.

## Setup

File-based routing with the Vite plugin:

```bash
npm i @tanstack/react-router
npm i -D @tanstack/router-plugin
```

```ts
// vite.config.ts
import { tanstackRouter } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(), // must come after the router plugin
  ],
});
```

The plugin generates `src/routeTree.gen.ts` from the files in `src/routes/`. Commit it or
gitignore it consistently — the build regenerates it either way, but a stale committed version
causes confusing diffs.

```tsx
// src/routes/index.ts (router instance)
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',        // prefetch on hover — feels instant
  defaultPreloadStaleTime: 0,      // let TanStack Query own caching
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

That `declare module` block is what makes every `Link` and `navigate` call type-safe app-wide.
Without it you get no inference at all.

## Defining routes

```
src/routes/
├── __root.tsx              → layout wrapping everything
├── index.tsx               → /
├── login.tsx               → /login
├── projects/
│   ├── route.tsx           → layout for /projects/*
│   ├── index.tsx           → /projects
│   └── $projectId.tsx      → /projects/:projectId
└── _authed/                → pathless layout (no URL segment)
    └── settings.tsx        → /settings, but guarded by _authed
```

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { AppShell } from '@/components/layout/AppShell';

export const Route = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
  notFoundComponent: () => <NotFound />,
});
```

## Params & search params

Search params are first-class here, which matters more than it sounds: filters, pagination, and
sort order belong in the URL so they survive a refresh and can be shared. Validate them with Zod
and they arrive typed.

```tsx
// src/routes/projects/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const searchSchema = z.object({
  page: z.number().int().min(1).catch(1),
  status: z.enum(['active', 'archived']).catch('active'),
});

export const Route = createFileRoute('/projects/')({
  validateSearch: searchSchema,
  component: ProjectList,
});

function ProjectList() {
  const { page, status } = Route.useSearch();   // fully typed
  const navigate = Route.useNavigate();

  return (
    <button
      onClick={() => navigate({ search: (prev) => ({ ...prev, page: prev.page + 1 }) })}
    >
      Next
    </button>
  );
}
```

`.catch()` on each field means a malformed URL degrades to a sane default instead of throwing —
users do edit URLs, and bots do send garbage.

## Loaders and Query integration

The loader runs before the component renders, which removes the request waterfall you get when
fetching inside `useEffect`. Pair it with TanStack Query so the loader warms the cache and the
component reads from it.

```tsx
export const Route = createFileRoute('/projects/$projectId')({
  loader: ({ context: { queryClient }, params }) =>
    queryClient.ensureQueryData(projectQuery(params.projectId)),
  component: ProjectDetail,
  pendingComponent: () => <ProjectSkeleton />,
  errorComponent: ({ error }) => <ErrorState error={error} />,
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const { data: project } = useSuspenseQuery(projectQuery(projectId));
  return <h1>{project.name}</h1>;
}
```

Pass the `queryClient` in when creating the router so loaders can reach it:

```ts
export const router = createRouter({ routeTree, context: { queryClient } });
```

## Auth guards

`beforeLoad` runs before the loader and can redirect. Putting it on a pathless `_authed` layout
route guards every child at once rather than repeating the check per route.

```tsx
// src/routes/_authed.tsx
import { createFileRoute, redirect, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },  // send them back after login
      });
    }
  },
  component: Outlet,
});
```

Client-side guards are UX, not security. They stop a confusing blank dashboard; they do not
protect data. The API must authorize every request independently — assume someone will call it
with curl.

## Code splitting

With `autoCodeSplitting: true` in the plugin, route components are split automatically and this
section is largely handled for you. To split further, lazy-load heavy leaves inside a route:

```tsx
const ReportBuilder = lazy(() => import('@/features/reports/ReportBuilder'));

<Suspense fallback={<Skeleton className="h-96" />}>
  <ReportBuilder />
</Suspense>
```

Split at boundaries where the user makes a choice — a route change, opening a modal, switching a
tab. Splitting below that granularity adds request overhead without perceptible benefit.

## Accessibility on navigation

Client-side routing replaces DOM without a page load, so assistive tech gets no announcement and
focus stays wherever it was. Handle it once at the root:

```tsx
function RouteAnnouncer() {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // move focus to the top of the new view and announce it
    ref.current?.focus();
  }, [pathname]);

  return <div ref={ref} tabIndex={-1} aria-live="polite" className="sr-only" />;
}
```

Also give every page a unique `<title>` — it's the first thing a screen reader reads and the only
thing distinguishing entries in browser history.

## If the project uses React Router

Don't migrate an existing React Router app without a reason the user actually cares about. Map the
concepts across: `loader` → `loader`, `createBrowserRouter` → `createRouter`, `useSearchParams` →
`Route.useSearch`. The main things worth adding to a React Router codebase are `loader`-based
fetching (instead of `useEffect`) and Zod-validated search params, both of which work fine there.
