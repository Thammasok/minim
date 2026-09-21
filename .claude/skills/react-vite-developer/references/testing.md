# Testing (Vitest + RTL + Playwright)

Contents: [What to test](#what-to-test) · [Vitest setup](#vitest-setup) · [Component tests](#component-tests) ·
[Testing Query & stores](#testing-query-and-stores) · [Mocking the network](#mocking-the-network-with-msw) ·
[Playwright](#playwright-e2e) · [Pitfalls](#pitfalls)

## What to test

Coverage percentage is a poor target — it rewards testing getters and punishes nothing. Aim
instead at the places where bugs actually reach users:

**Worth testing:** business logic and calculations, custom hooks with real branching, form
validation and submission, conditional rendering driven by state, error and empty paths, anything
that has broken before.

**Rarely worth it:** that a component renders its props, third-party library behavior, styling,
trivial pass-through wrappers.

Rough distribution for an SPA: many fast unit/component tests, a modest set of integration tests
covering full flows within the app, and a small number of E2E tests over the handful of journeys
that would be catastrophic to break (sign in, checkout, the core create-thing flow).

If this project has test cases designed by `software-tester-design`, implement against those
rather than inventing parallel coverage. The automation side belongs to
`software-tester-automation` — this reference covers the setup and idioms a Vite React app needs.

## Vitest setup

Vitest reuses the Vite config, so aliases and plugins work with no duplication.

```bash
npm i -D vitest @vitest/ui jsdom @testing-library/react \
  @testing-library/user-event @testing-library/jest-dom
```

```ts
// vite.config.ts
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,               // don't process CSS in tests — pure overhead
    coverage: { reporter: ['text', 'html'], exclude: ['**/*.gen.ts', 'src/test/**'] },
  },
});
```

```ts
// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);
```

```json
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test"
  }
}
```

## Component tests

Query by what a user perceives — role, label, text. `getByTestId` should be the last resort,
because a test that passes while the button is unlabeled is a test that missed a real bug.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('shows a validation error for an invalid email', async () => {
  const user = userEvent.setup();
  render(<SignupForm />);

  await user.type(screen.getByLabelText(/email/i), 'not-an-email');
  await user.click(screen.getByRole('button', { name: /create account/i }));

  expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
});
```

Query priority, best to worst: `getByRole` → `getByLabelText` → `getByPlaceholderText` →
`getByText` → `getByTestId`.

Use `userEvent`, not `fireEvent`. `userEvent.type` produces the full sequence of focus, keydown,
keypress, input, keyup that a real keyboard produces; `fireEvent.change` sets a value directly and
will happily pass on a component that's broken for actual users.

Pick the right async matcher: `findBy*` waits for something to appear, `waitFor` waits for an
assertion to pass, `waitForElementToBeRemoved` waits for a disappearance. A bare `getBy*` right
after an async action is the classic flaky test.

### A render helper with providers

Most components need Query and Router context. Write this once:

```tsx
// src/test/render.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender } from '@testing-library/react';

export function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }, // fail fast, no cache bleed
  });

  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}
```

A **fresh QueryClient per test** is not optional — a shared one leaks cached data between tests and
produces failures that depend on execution order.

## Testing Query and stores

```tsx
import { renderHook, waitFor } from '@testing-library/react';

test('loads the project', async () => {
  const { result } = renderHook(() => useQuery(projectQuery('p1')), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.name).toBe('Apollo');
});
```

Zustand stores are module singletons, so state persists across tests. Reset between them:

```ts
const initial = useAuthStore.getState();
beforeEach(() => useAuthStore.setState(initial, true));
```

For Redux, build a fresh store per test with a `setupStore(preloadedState)` helper — never import
the app singleton into tests.

## Mocking the network with MSW

MSW intercepts at the network layer, so your code under test uses its real fetch path. That's a
meaningfully better signal than stubbing `api.get` — it catches URL, method, and serialization
mistakes that a module mock hides.

```ts
// src/test/server.ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('*/projects/:id', ({ params }) =>
    HttpResponse.json({ id: params.id, name: 'Apollo' }),
  ),
];

export const server = setupServer(...handlers);
```

```ts
// src/test/setup.ts
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

`onUnhandledRequest: 'error'` is worth the initial noise — it surfaces requests you didn't know
the app was making.

Override per test for error paths, which are the ones most likely to be untested:

```ts
server.use(http.get('*/projects/:id', () => new HttpResponse(null, { status: 500 })));
```

## Playwright E2E

```bash
npm init playwright@latest
```

```ts
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:4173', trace: 'on-first-retry' },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
```

Run E2E against the **production build via `preview`**, not the dev server. Dev-only bugs and
build-only bugs are different classes, and the build is what users get.

```ts
test('user can create a project', async ({ page }) => {
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Name').fill('Apollo');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('heading', { name: 'Apollo' })).toBeVisible();
});
```

Playwright's web-first assertions (`toBeVisible`, `toHaveText`) auto-retry until timeout, so
`waitForTimeout` is almost never needed — and a fixed sleep is the leading cause of flaky suites.

Keep the E2E count low and the journeys high-value. Every E2E test is slow and has a nonzero
flake rate; twenty of them will cost the team more attention than they return.

## Pitfalls

**Testing implementation details.** Asserting on state variables or internal function calls means
a refactor that changes nothing user-visible breaks the suite. Assert on rendered output and
behavior.

**`act()` warnings.** Usually a state update after the test finished — an unawaited async
operation. Fix the missing `await`, don't wrap things in `act` to silence it.

**Shared QueryClient or store between tests.** Order-dependent failures. Fresh instance per test.

**Mocking too much.** Mocking every child component tests almost nothing. Mock the network
boundary and the clock; render everything else for real.

**Fixed sleeps.** `waitForTimeout(1000)` is slow when it works and flaky when it doesn't. Wait for
a condition.

**Snapshot tests of large trees.** They fail constantly for cosmetic reasons and get regenerated
without review, which means they assert nothing. Small, targeted snapshots only.
