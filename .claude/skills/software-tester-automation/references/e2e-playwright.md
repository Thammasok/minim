# E2E Automation Reference (Playwright)

## Configuration

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:        './tests/e2e',
  fullyParallel:  true,
  retries:        process.env.CI ? 2 : 0,
  workers:        process.env.CI ? 2 : undefined,
  reporter:       [['html', { open: 'never' }], ['github']],

  use: {
    baseURL:    process.env.BASE_URL ?? 'http://localhost:3000',
    trace:      'on-first-retry',
    screenshot: 'only-on-failure',
    video:      'retain-on-failure',
  },

  projects: [
    // Setup project — login and store auth state
    { name: 'setup', testMatch: '**/auth.setup.ts' },

    {
      name:         'chromium',
      use:          { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-chrome',
      use:  { ...devices['Pixel 7'] },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command:             'npm run start:test',
    url:                 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env:                 { NODE_ENV: 'test' },
  },
});
```

---

## Auth setup — login once, reuse state

```ts
// tests/e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const customerFile = path.join(__dirname, '../.auth/customer.json');
const adminFile    = path.join(__dirname, '../.auth/admin.json');

setup('authenticate as customer', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('test.customer@example.com');
  await page.getByLabel('Password').fill('Password1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/dashboard');
  await page.context().storageState({ path: customerFile });
});

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('test.admin@example.com');
  await page.getByLabel('Password').fill('AdminPass1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/admin');
  await page.context().storageState({ path: adminFile });
});
```

```ts
// tests/e2e/fixtures.ts — extend base test with pre-authenticated contexts
import { test as base } from '@playwright/test';
import path from 'path';

type Fixtures = { customerPage: Page; adminPage: Page };

export const test = base.extend<Fixtures>({
  customerPage: async ({ browser }, use) => {
    const ctx  = await browser.newContext({
      storageState: path.join(__dirname, '../.auth/customer.json'),
    });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },

  adminPage: async ({ browser }, use) => {
    const ctx  = await browser.newContext({
      storageState: path.join(__dirname, '../.auth/admin.json'),
    });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },
});

export { expect } from '@playwright/test';
```

---

## Page Object Model

```ts
// tests/e2e/pages/CheckoutPage.ts
import { type Page, type Locator, expect } from '@playwright/test';

export class CheckoutPage {
  readonly emailInput:   Locator;
  readonly addressInput: Locator;
  readonly placeOrderBtn:Locator;
  readonly errorAlert:   Locator;
  readonly confirmation: Locator;

  constructor(private page: Page) {
    this.emailInput    = page.getByLabel('Email');
    this.addressInput  = page.getByLabel('Delivery address');
    this.placeOrderBtn = page.getByRole('button', { name: 'Place order' });
    this.errorAlert    = page.getByRole('alert');
    this.confirmation  = page.getByRole('heading', { name: /order confirmed/i });
  }

  async goto()                          { await this.page.goto('/checkout'); }
  async fillEmail(email: string)        { await this.emailInput.fill(email); }
  async fillAddress(address: string)    { await this.addressInput.fill(address); }
  async submit()                        { await this.placeOrderBtn.click(); }

  async waitForConfirmation()           { await expect(this.confirmation).toBeVisible(); }
  async getOrderId() {
    const text = await this.page.getByTestId('order-id').textContent();
    return text?.trim();
  }
}
```

---

## Full E2E test file

```ts
// tests/e2e/checkout.spec.ts
import { test, expect } from './fixtures';
import { CheckoutPage } from './pages/CheckoutPage';

test.describe('Checkout flow', () => {

  // TC-E2E-01: authenticated customer completes purchase
  test('TC-E2E-01: customer can complete purchase and sees confirmation', async ({ customerPage }) => {
    // Arrange — seed product via API shortcut (faster than UI navigation)
    await customerPage.request.post('/api/test/seed/cart', {
      data: { items: [{ productId: 'SKU-001', qty: 2 }] },
    });

    const checkout = new CheckoutPage(customerPage);

    // Act
    await checkout.goto();
    await checkout.fillAddress('123 Main St, London, SW1A 1AA');
    await checkout.submit();

    // Assert
    await checkout.waitForConfirmation();
    const orderId = await checkout.getOrderId();
    expect(orderId).toMatch(/^[0-9a-f-]{36}$/i);

    // Assert URL changed to confirmation page
    await expect(customerPage).toHaveURL(/\/orders\/.+\/confirmation/);
  });

  // TC-E2E-02: unauthenticated user redirected to login
  test('TC-E2E-02: guest is redirected to login with cart preserved', async ({ page }) => {
    // Arrange — no auth (plain page, no fixture)
    await page.goto('/checkout');

    // Assert
    await expect(page).toHaveURL('/login?redirect=%2Fcheckout');
  });

  // TC-E2E-03: out-of-stock item blocked at checkout
  test('TC-E2E-03: shows out-of-stock error when item depleted between cart and checkout', async ({ customerPage }) => {
    // Arrange — seed cart with out-of-stock item
    await customerPage.request.post('/api/test/seed/cart', {
      data: { items: [{ productId: 'SKU-OUT-OF-STOCK', qty: 1 }] },
    });

    const checkout = new CheckoutPage(customerPage);
    await checkout.goto();
    await checkout.submit();

    // Assert — error displayed, no confirmation
    await expect(checkout.errorAlert).toContainText(/out of stock/i);
    await expect(checkout.confirmation).not.toBeVisible();
  });

  // TC-E2E-04: admin can view any order
  test('TC-E2E-04: admin can view order details of any customer', async ({ adminPage, customerPage }) => {
    // Arrange — customer places an order
    const res     = await customerPage.request.post('/api/orders', {
      data: { items: [{ productId: 'SKU-001', qty: 1 }] },
    });
    const orderId = (await res.json()).orderId;

    // Act — admin views the same order
    await adminPage.goto(`/admin/orders/${orderId}`);

    // Assert
    await expect(adminPage.getByTestId('order-id')).toHaveText(orderId);
    await expect(adminPage.getByTestId('customer-email')).toBeVisible();
  });
});
```

---

## API shortcuts inside E2E tests

Use `page.request` to call your API directly for Arrange/Cleanup steps —
never drive setup through the UI.

```ts
// ✅ Fast, stable setup via API
await page.request.post('/api/test/seed/product', {
  data: { id: 'SKU-001', name: 'Widget', stock: 10, priceCents: 2490 },
});

// ✅ Cleanup via API  
await page.request.delete(`/api/test/orders/${orderId}`);

// ❌ Slow, brittle setup via UI
await page.goto('/admin/products/new');
await page.getByLabel('Product name').fill('Widget');
// ... 10 more lines just for test data setup
```

---

## Waiting strategies — avoid flakiness

```ts
// ✅ Wait for network to settle
await page.waitForLoadState('networkidle');

// ✅ Wait for a specific element (auto-waits up to timeout)
await expect(page.getByRole('heading', { name: /confirmed/i })).toBeVisible();

// ✅ Wait for URL change
await page.waitForURL(/\/orders\/.+\/confirmation/);

// ✅ Wait for API response before asserting UI
const [response] = await Promise.all([
  page.waitForResponse(r => r.url().includes('/api/orders') && r.status() === 201),
  page.getByRole('button', { name: 'Place order' }).click(),
]);
const body = await response.json();
expect(body.orderId).toBeDefined();

// ❌ Never use fixed timeouts
await page.waitForTimeout(2000); // ← flaky: sometimes too short, always too slow
```

---

## Running Playwright

```bash
# All tests
npx playwright test

# Specific file
npx playwright test tests/e2e/checkout.spec.ts

# Specific TC by name (grep)
npx playwright test --grep "TC-E2E-01"

# Headed mode (watch the browser)
npx playwright test --headed

# Debug mode (pause on each step)
npx playwright test --debug

# UI mode (interactive test runner)
npx playwright test --ui

# Generate report after run
npx playwright show-report
```
