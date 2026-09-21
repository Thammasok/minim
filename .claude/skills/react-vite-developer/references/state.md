# Client State (Zustand & Redux Toolkit)

Contents: [Choosing where state lives](#choosing-where-state-lives) · [Zustand vs RTK](#zustand-vs-redux-toolkit) ·
[Zustand](#zustand) · [Redux Toolkit](#redux-toolkit) · [Context](#when-context-is-the-right-answer) ·
[Anti-patterns](#anti-patterns)

## Choosing where state lives

Work down this list and stop at the first fit. Most state stops early.

1. **Derivable from existing state?** Don't store it. Compute during render. A `filteredItems`
   state that must be kept in sync with `items` and `filter` is two bugs waiting to happen.
2. **Belongs in the URL?** Filters, pagination, sort, selected tab, open detail panel — these go in
   search params so a refresh or a shared link reproduces the view. See `routing.md`.
3. **Comes from the server?** TanStack Query. See `data-fetching.md`.
4. **Used by one component and its children?** `useState` / `useReducer` + props.
5. **Genuinely global and client-owned?** Zustand or Redux Toolkit — theme, auth session, sidebar
   collapse, a multi-step wizard spanning routes, unsaved-draft buffers.

By the time you reach step 5 the store is usually small. A global store with dozens of slices is
generally a sign that steps 2 and 3 were skipped.

## Zustand vs Redux Toolkit

Honest comparison — this is a team decision more than a technical one.

| | Zustand | Redux Toolkit |
|---|---|---|
| Boilerplate | Minimal | Moderate (slices, thunks, typed hooks) |
| Bundle | ~1 kB | ~13 kB + React Redux |
| Learning curve | An afternoon | A week to use it idiomatically |
| DevTools | Via middleware, decent | Excellent — time travel, action log |
| Enforced structure | None; discipline is on you | Strong conventions, consistent across teams |
| Async | Whatever you write | Thunks / RTK Query, standardized |
| Best for | Small–mid teams, small global state | Large teams, complex flows, strict auditability |

**Pick Zustand** when global state is a handful of concerns and the team values speed. **Pick
Redux Toolkit** when many developers touch the same state, when you need the action log to debug
production reports, or when RTK Query is already handling server state.

Don't run both. And don't migrate an existing working Redux app to Zustand for aesthetics — that's
weeks of risk for no user-visible gain.

## Zustand

```ts
// src/stores/auth-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: 'auth',
      partialize: (s) => ({ user: s.user }), // never persist derived or sensitive fields wholesale
    },
  ),
);
```

### Select narrowly

This is the one thing that determines whether a Zustand app performs well. Subscribing to the
whole store re-renders the component on every unrelated change.

```tsx
// ❌ re-renders when anything in the store changes
const { user } = useAuthStore();

// ✅ re-renders only when user changes
const user = useAuthStore((s) => s.user);

// ✅ multiple fields — useShallow prevents a new object identity each render
import { useShallow } from 'zustand/react/shallow';
const { user, logout } = useAuthStore(useShallow((s) => ({ user: s.user, logout: s.logout })));
```

### Slices for larger stores

```ts
const createUISlice = (set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
});

const createThemeSlice = (set) => ({
  theme: 'system' as Theme,
  setTheme: (theme: Theme) => set({ theme }),
});

export const useAppStore = create<UISlice & ThemeSlice>()((...a) => ({
  ...createUISlice(...a),
  ...createThemeSlice(...a),
}));
```

Actions live inside the store, not scattered across components. `set` outside the store means no
devtools trace and no single place to reason about transitions.

### Reading outside React

```ts
useAuthStore.getState().logout();          // e.g. from a 401 interceptor
const unsub = useAuthStore.subscribe(fn);  // remember to unsubscribe
```

## Redux Toolkit

```ts
// src/stores/slices/cart-slice.ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface CartState {
  items: CartItem[];
}

const cartSlice = createSlice({
  name: 'cart',
  initialState: { items: [] } as CartState,
  reducers: {
    // Immer is built in — this "mutation" produces an immutable update
    itemAdded(state, action: PayloadAction<CartItem>) {
      const existing = state.items.find((i) => i.id === action.payload.id);
      if (existing) existing.qty += action.payload.qty;
      else state.items.push(action.payload);
    },
    itemRemoved(state, action: PayloadAction<string>) {
      state.items = state.items.filter((i) => i.id !== action.payload);
    },
  },
  selectors: {
    selectTotal: (state) => state.items.reduce((sum, i) => sum + i.price * i.qty, 0),
  },
});

export const { itemAdded, itemRemoved } = cartSlice.actions;
export const { selectTotal } = cartSlice.selectors;
export default cartSlice.reducer;
```

Name actions as **events that happened** (`itemAdded`) rather than commands (`addItem`). One event
can drive several reducers across slices; a command implies one handler and pushes logic back into
components.

```ts
// src/stores/index.ts
export const store = configureStore({ reducer: { cart: cartReducer } });

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
```

Always use the typed hooks — plain `useSelector` gives you `unknown` state and no autocomplete,
which defeats most of the reason to use RTK.

If you're on RTK, prefer **RTK Query** over adding TanStack Query alongside it. Two server-state
caches in one app is a reliable source of inconsistency.

## When Context is the right answer

Context is a dependency-injection mechanism, not a state manager. Any consumer re-renders when the
value changes, with no selector to narrow it.

Good uses: a value set once and rarely changed (theme object, i18n instance, a configured client),
or scoping state to a subtree (a `<Form>` sharing state with its fields).

Bad use: frequently-updating app state. That's what Zustand and Redux are for.

If you do use Context with an object value, memoize it — otherwise every parent render creates a
new identity and re-renders all consumers.

## Anti-patterns

**Server data in a global store.** Now you own cache invalidation, refetch, staleness, and race
conditions. See `data-fetching.md`.

**One giant store object.** Split by concern. A single `useStore()` call that returns everything
guarantees every component re-renders on every change.

**Derived values stored as state.** `total`, `filteredList`, `isValid` — compute them. Stored
derivations desynchronize the first time someone updates the source without updating the copy.

**Persisting everything.** `persist` writes to localStorage synchronously on the main thread.
Persist the small stuff (theme, session hint) and use `partialize` to keep the rest out. Never
persist tokens or PII there — localStorage is readable by any script on the page.

**Prop drilling five levels to avoid a store.** If a value crosses more than about three
boundaries and isn't a URL concern, put it in a store or restructure with composition
(`children`/slots) so the intermediate layers don't need to know about it.
