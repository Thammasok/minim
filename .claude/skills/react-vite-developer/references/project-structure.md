# Project Structure

Contents: [The layout](#the-layout) · [Why feature folders](#why-feature-folders) ·
[Import rules](#import-rules) · [Naming](#naming) · [When to split a feature](#when-to-split-a-feature)

## The layout

```
src/
├── main.tsx                    # Entry — providers, router mount
├── App.tsx                     # Root shell (only if not fully router-driven)
├── index.css                   # Tailwind import + design tokens
│
├── routes/                     # Route definitions / route components
│   ├── __root.tsx
│   ├── index.tsx
│   └── dashboard/
│       └── $projectId.tsx
│
├── features/                   # Vertical slices — the bulk of the app
│   └── projects/
│       ├── api.ts              # fetch functions + Zod schemas
│       ├── queries.ts          # useQuery / useMutation hooks
│       ├── store.ts            # feature-local Zustand slice (if needed)
│       ├── components/
│       │   ├── project-card.tsx
│       │   └── project-form.tsx
│       ├── hooks/
│       └── types.ts
│
├── components/
│   ├── ui/                     # shadcn primitives — Button, Input, Dialog
│   └── layout/                 # AppShell, Sidebar, Header
│
├── lib/
│   ├── api-client.ts           # configured fetch/axios instance
│   ├── query-client.ts         # TanStack Query defaults
│   ├── env.ts                  # validated env
│   └── utils.ts                # cn(), formatters
│
├── hooks/                      # genuinely cross-feature hooks only
├── stores/                     # global client state (auth, theme, UI)
└── types/                      # shared types used by 3+ features
```

## Why feature folders

The alternative — top-level `components/`, `hooks/`, `services/`, `types/` — groups files by what
they *are* rather than what they're *for*. It reads fine at 20 files and becomes unnavigable at
200: adding one feature touches four distant folders, and deleting a feature means hunting its
pieces across the tree.

With vertical slices, a feature is one folder. You can read it, move it, or delete it as a unit,
and a new team member can understand "projects" without loading the whole app into their head.

The trade-off is real but small: some duplication between features before an abstraction is
obvious. That's usually the right price — premature shared abstractions are harder to undo than
duplication is.

## Import rules

Two rules keep the graph from turning into a mesh:

1. **Features don't import from each other.** If `billing` needs something from `projects`, that
   something belongs in `lib/`, `components/ui/`, or a shared store. A direct cross-feature import
   is a signal that the boundary is in the wrong place.
2. **`components/ui/` never imports from `features/`.** Primitives know nothing about domain.
   Dependencies point inward: `routes` → `features` → `components/ui` + `lib`.

Enforce it if the team is large enough to need it:

```js
// eslint.config.js — no-restricted-imports, roughly
{
  'no-restricted-imports': ['error', {
    patterns: [{
      group: ['@/features/*/*'],
      message: 'Import from the feature root, or lift the shared code to lib/.',
    }],
  }],
}
```

Expose a feature's public surface from its own files rather than reaching into its internals. A
barrel `index.ts` per feature is optional — it reads nicely but can defeat tree shaking if it
re-exports everything, so skip it for large features.

## Naming

**Every file and folder is kebab-case.** Casing lives on the *exported symbol*, never on the
path.

| Thing | Convention | Example |
|---|---|---|
| Files — all of them | kebab-case | `project-card.tsx`, `api-client.ts` |
| Folders — all of them | kebab-case | `features/billing-history/`, `pages/not-found/` |
| Route files | follow the router's convention | `$projectId.tsx` |
| Component exports | PascalCase | `project-card.tsx` → `ProjectCard` |
| Hook exports | camelCase, `use` prefix | `use-project-filters.ts` → `useProjectFilters` |
| Types | PascalCase, no `I` prefix | `Project`, not `IProject` |
| Booleans | `is` / `has` / `should` | `isLoading`, `hasAccess` |

One rule for paths beats three. The decisive reason is mechanical, not aesthetic: `shadcn add`
writes kebab-case and will keep doing so, so any other convention leaves you renaming generated
files forever or living with a permanently mixed tree. kebab-case also sidesteps the case-only
rename problem — `ProjectCard.tsx` vs `projectcard.tsx` is invisible to a case-insensitive macOS
or Windows filesystem but not to git, which is how a rename lands in a PR as a phantom conflict.

snake_case (`project_card.tsx`) works mechanically and solves the same filesystem problem, but
nothing in the React toolchain emits it, so it costs the same rename treadmill for no gain.

The two Vite entry points, `App.tsx` and `main.tsx`, keep the template's names — same reasoning
as shadcn: don't fight what the generator writes.

One component per file when it's exported. Small private subcomponents can live beside their only
consumer — splitting them into files nobody else imports adds navigation cost for no benefit.

## Entry point

Keep `main.tsx` boring. It composes providers and mounts; it holds no logic.

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { queryClient } from '@/lib/query-client';
import { router } from '@/routes';
import '@/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
```

`StrictMode` double-invokes effects in development on purpose. If that breaks something, the
effect has a cleanup bug that would have surfaced in production eventually — fix the effect rather
than removing StrictMode.

## When to split a feature

Feature folders grow. Split when:

- The folder exceeds roughly 15–20 files and has two clearly separable nouns inside it.
- Two parts of it are never touched in the same PR.
- Its `api.ts` covers two distinct backend resources.

Don't split on line count alone. A single cohesive feature at 800 lines is easier to work with
than three artificially separated ones that constantly import each other.
