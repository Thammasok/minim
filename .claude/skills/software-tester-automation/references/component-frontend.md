# Frontend Component Testing Reference (React Testing Library + Vitest)

## Setup

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals:     true,
    environment: 'jsdom',
    setupFiles:  ['./tests/setup.ts'],
  },
});

// tests/setup.ts
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll } from 'vitest';
import { server } from './mocks/server'; // MSW

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => server.close());
```

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react
             @testing-library/user-event @testing-library/jest-dom
             msw jsdom
```

---

## MSW — mock server setup

```ts
// tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('/api/orders', async ({ request }) => {
    const body = await request.json() as any;
    if (!body.items?.length) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', fields: { items: ['Required'] } } },
        { status: 422 }
      );
    }
    return HttpResponse.json(
      { orderId: 'order-abc-123', total: 4980, status: 'confirmed' },
      { status: 201 }
    );
  }),

  http.get('/api/products', () =>
    HttpResponse.json([
      { id: 'SKU-001', name: 'Widget', priceCents: 2490, stock: 10 },
    ])
  ),
];

// tests/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers }    from './handlers';
export const server = setupServer(...handlers);
```

---

## Anatomy of a component test

```tsx
// tests/frontend/CheckoutForm.test.tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CheckoutForm } from '../../src/components/CheckoutForm';

// Test wrapper — provide all context the component needs
function renderCheckout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils  = render(
    <QueryClientProvider client={client}>
      <CheckoutForm />
    </QueryClientProvider>
  );
  return { user: userEvent.setup(), ...utils };
}

describe('CheckoutForm', () => {

  // TC-FRONT-01: happy path — form submits and shows confirmation
  it('TC-FRONT-01: shows order confirmation after successful submission', async () => {
    // Arrange
    const { user } = renderCheckout();

    // Act
    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/address/i), '123 Main St');
    await user.click(screen.getByRole('button', { name: /place order/i }));

    // Assert
    expect(
      await screen.findByRole('heading', { name: /order confirmed/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/order-abc-123/i)).toBeInTheDocument();
  });

  // TC-FRONT-02: validation error — email missing
  it('TC-FRONT-02: shows email validation error when field is empty', async () => {
    const { user } = renderCheckout();

    await user.click(screen.getByRole('button', { name: /place order/i }));

    expect(
      await screen.findByRole('alert', { name: /email/i })
    ).toHaveTextContent(/required/i);
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true');
  });

  // TC-FRONT-03: API error displayed to user
  it('TC-FRONT-03: shows server error when API returns 422', async () => {
    // Override handler for this test only
    server.use(
      http.post('/api/orders', () =>
        HttpResponse.json(
          { error: { code: 'OUT_OF_STOCK', message: 'Widget is out of stock' } },
          { status: 409 }
        )
      )
    );

    const { user } = renderCheckout();
    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.click(screen.getByRole('button', { name: /place order/i }));

    expect(
      await screen.findByRole('alert')
    ).toHaveTextContent(/out of stock/i);
  });

  // TC-FRONT-04: loading state — button disabled while pending
  it('TC-FRONT-04: disables submit button while request is in flight', async () => {
    // Slow the handler to observe the loading state
    server.use(
      http.post('/api/orders', async () => {
        await new Promise(r => setTimeout(r, 200));
        return HttpResponse.json({ orderId: 'x', total: 100, status: 'confirmed' }, { status: 201 });
      })
    );

    const { user } = renderCheckout();
    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.click(screen.getByRole('button', { name: /place order/i }));

    // Mid-flight: button should be disabled
    expect(screen.getByRole('button', { name: /placing order/i })).toBeDisabled();

    // After completion: confirmation shown
    await screen.findByRole('heading', { name: /order confirmed/i });
  });

  // TC-FRONT-05: accessible — error links to input via aria-describedby
  it('TC-FRONT-05: error message is linked to input via aria-describedby', async () => {
    const { user } = renderCheckout();
    await user.click(screen.getByRole('button', { name: /place order/i }));

    await waitFor(() => {
      const input = screen.getByLabelText(/email/i);
      const errId = input.getAttribute('aria-describedby');
      expect(errId).toBeTruthy();
      const errEl = document.getElementById(errId!);
      expect(errEl).toHaveTextContent(/required/i);
    });
  });
});
```

---

## Testing custom hooks

```ts
// tests/frontend/useCart.test.ts
import { renderHook, act } from '@testing-library/react';
import { useCart } from '../../src/hooks/useCart';

describe('useCart', () => {
  // TC-HOOK-01: add item increments count
  it('TC-HOOK-01: addItem increments item count', () => {
    const { result } = renderHook(() => useCart());

    act(() => result.current.addItem({ id: 'SKU-001', name: 'Widget', priceCents: 2490 }));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.totalCents).toBe(2490);
  });

  // TC-HOOK-02: remove item decrements count
  it('TC-HOOK-02: removeItem removes the item by id', () => {
    const { result } = renderHook(() => useCart());
    act(() => result.current.addItem({ id: 'SKU-001', name: 'Widget', priceCents: 2490 }));
    act(() => result.current.removeItem('SKU-001'));

    expect(result.current.items).toHaveLength(0);
    expect(result.current.totalCents).toBe(0);
  });
});
```

---

## Testing TanStack Query components

```tsx
// Wrapper that provides a fresh QueryClient per test
function queryWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

// TC-QUERY-01: renders fetched data
it('TC-QUERY-01: UserList renders users from API', async () => {
  render(<UserList />, { wrapper: queryWrapper() });

  // Loading state
  expect(screen.getByRole('status')).toHaveTextContent(/loading/i);

  // Loaded state (MSW returns data)
  expect(await screen.findByText('Alice')).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

// TC-QUERY-02: shows error state
it('TC-QUERY-02: UserList shows error message when API fails', async () => {
  server.use(
    http.get('/api/users', () => HttpResponse.json({}, { status: 500 }))
  );

  render(<UserList />, { wrapper: queryWrapper() });
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});
```

---

## Selecting elements — priority order (RTL guiding principle)

Always query by what the user sees/interacts with — not by implementation details.

```ts
// 1. Accessible queries (preferred)
screen.getByRole('button', { name: /submit/i })
screen.getByLabelText(/email address/i)
screen.getByRole('textbox', { name: /search/i })
screen.getByRole('dialog', { name: /confirm/i })

// 2. Text content
screen.getByText(/welcome back/i)
screen.getByTitle('Close dialog')

// 3. Test ID (last resort — for elements with no accessible name)
screen.getByTestId('order-total')

// ❌ Never use: querySelector, class names, element type
// container.querySelector('.submit-btn')  ← brittle, tests implementation
```
