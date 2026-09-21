# Frontend & E2E Testing Reference

## What to test at the E2E level

**Do test E2E:**
- Critical business journeys (sign-up, login, checkout, core feature activation)
- Smoke suite for deployment gates (5–10 tests max)
- Cross-cutting concerns (auth redirects, CSRF, SSO flows)

**Don't test E2E:**
- Every form validation error (→ unit/API level)
- Every UI state (→ component test with RTL)
- Pagination buttons (→ API test)

---

## Playwright test structure

### 3A pattern

```ts
// tests/e2e/checkout.spec.ts
import { test, expect } from '@playwright/test';
import { UserFactory, ProductFactory } from '../factories';

test.describe('Checkout flow', () => {
  test('TC-E2E-01: authenticated user can complete purchase', async ({ page }) => {
    // Arrange
    const user    = await UserFactory.create({ role: 'customer' });
    const product = await ProductFactory.create({ priceCents: 2990, stock: 5 });
    await page.goto('/login');
    await loginAs(page, user);

    // Act
    await page.goto(`/products/${product.slug}`);
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await page.getByRole('link',   { name: 'Checkout' }).click();
    await page.getByLabel('Card number').fill('4242424242424242');
    await page.getByLabel('Expiry').fill('12/26');
    await page.getByLabel('CVC').fill('123');
    await page.getByRole('button', { name: 'Place order' }).click();

    // Assert
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+\/confirmation/);
    await expect(page.getByRole('heading', { name: /order confirmed/i })).toBeVisible();
    await expect(page.getByText(product.name)).toBeVisible();
  });

  test('TC-E2E-02: unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/checkout');
    await expect(page).toHaveURL('/login?redirect=%2Fcheckout');
  });
});
```

### Page Object Model (POM)

```ts
// tests/pages/LoginPage.ts
export class LoginPage {
  constructor(private page: Page) {}

  async goto()                         { await this.page.goto('/login'); }
  async fillEmail(email: string)       { await this.page.getByLabel('Email').fill(email); }
  async fillPassword(password: string) { await this.page.getByLabel('Password').fill(password); }
  async submit()                       { await this.page.getByRole('button', { name: 'Sign in' }).click(); }

  async loginAs(email: string, password: string) {
    await this.goto();
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.submit();
  }

  get errorAlert() { return this.page.getByRole('alert'); }
}

// In test:
const loginPage = new LoginPage(page);
await loginPage.loginAs('alice@example.com', 'secret');
await expect(page).toHaveURL('/dashboard');
```

### API login shortcut (skip UI for non-auth tests)

```ts
// tests/fixtures/auth.ts — set auth cookie directly, skip the UI login flow
test.use({
  storageState: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page    = await context.newPage();
    await page.goto('/api/test/login?userId=seed-user-1'); // test-only endpoint
    await use(await context.storageState());
    await context.close();
  },
});
```

---

## Component testing with React Testing Library

### What belongs at component level (not E2E):

```tsx
// TC-COMP-01: Form shows field-level validation errors
it('shows validation error on blur for invalid email', async () => {
  // Arrange
  const user = userEvent.setup();
  render(<SignUpForm />);

  // Act
  await user.click(screen.getByLabelText(/email/i));
  await user.type(screen.getByLabelText(/email/i), 'not-an-email');
  await user.tab(); // trigger blur

  // Assert
  expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email/i);
  expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true');
});

// TC-COMP-02: Loading state is shown during async submit
it('disables button and shows spinner while submitting', async () => {
  const user     = userEvent.setup();
  const onSubmit = vi.fn(() => new Promise(r => setTimeout(r, 500)));
  render(<ContactForm onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText(/name/i), 'Alice');
  await user.click(screen.getByRole('button', { name: /send/i }));

  expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
});
```

---

## Accessibility test scenarios

Design these as explicit test cases, not afterthoughts:

```
TC-A11Y-01: Login form is keyboard-navigable in logical order
  Tab through: Email → Password → Remember me → Sign in → Forgot password
  Expected: Focus order matches visual order; all elements reachable

TC-A11Y-02: Error messages are announced to screen readers
  Given: Form is submitted with empty required fields
  Then:  role="alert" elements exist; aria-describedby links input to error

TC-A11Y-03: Modal traps focus while open
  Given: Confirmation dialog is open
  When:  User presses Tab repeatedly
  Then:  Focus cycles within dialog; never leaves dialog until dismissed

TC-A11Y-04: Images have meaningful alt text
  Given: Product listing page
  Then:  All <img> elements have non-empty, descriptive alt attributes
         Decorative images have alt=""

TC-A11Y-05: Colour contrast meets WCAG AA
  Then:  All text/background pairs ≥ 4.5:1 ratio (3:1 for large text)
```

```ts
// Automated a11y scan with axe-playwright
import { checkA11y } from 'axe-playwright';

test('home page has no accessibility violations', async ({ page }) => {
  await page.goto('/');
  await checkA11y(page, undefined, {
    detailedReport: true,
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
  });
});
```

---

## Visual regression testing

```ts
// Playwright screenshots — compare against baseline
test('dashboard layout matches baseline', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('dashboard.png', {
    maxDiffPixelRatio: 0.02, // allow 2% pixel difference
  });
});
```

---

## playwright.config.ts best practices

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:          './tests/e2e',
  fullyParallel:    true,
  retries:          process.env.CI ? 2 : 0,
  reporter:         [['html'], ['github']],
  use: {
    baseURL:        process.env.BASE_URL ?? 'http://localhost:3000',
    trace:          'on-first-retry',
    screenshot:     'only-on-failure',
    video:          'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile',   use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command:              'npm run dev',
    url:                  'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```
