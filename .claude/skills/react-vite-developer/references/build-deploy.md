# Build Optimization & Deployment

Contents: [Measure first](#measure-first) · [Code splitting](#code-splitting) ·
[Chunking strategy](#chunking-strategy) · [Assets](#assets) · [Performance budget](#performance-budget) ·
[SPA fallback](#spa-fallback-the-one-that-always-bites) · [Hosts](#host-configuration) ·
[Caching headers](#caching-headers) · [CI](#ci-pipeline) · [Production readiness](#production-readiness)

## Measure first

Don't optimize on intuition — bundle problems are almost always one or two dependencies you didn't
expect, and guessing wastes an afternoon.

```bash
npm i -D rollup-plugin-visualizer
```

```ts
import { visualizer } from 'rollup-plugin-visualizer';

plugins: [
  react(),
  visualizer({ open: true, gzipSize: true, brotliSize: true }),
]
```

Read the treemap for: a date/locale library shipping every locale, an icon set imported wholesale,
a chart or editor library in the entry chunk, lodash imported as a namespace, or two versions of
the same package (check with `npm ls <pkg>`).

Then measure what users feel, not just what the bundler reports — run Lighthouse against
`vite preview`, not the dev server, since dev serves unbundled modules and the numbers are
meaningless.

## Code splitting

The entry chunk should contain what's needed to render the first screen. Everything else waits.

**Route level** — the highest-value split, and automatic with TanStack Router's
`autoCodeSplitting`. With React Router:

```tsx
const Dashboard = lazy(() => import('@/routes/Dashboard'));

<Suspense fallback={<PageSkeleton />}>
  <Routes>
    <Route path="/dashboard" element={<Dashboard />} />
  </Routes>
</Suspense>
```

**Heavy leaf components** — charts, rich text editors, maps, PDF viewers, code editors. These are
often larger than the rest of the app combined and are frequently below the fold or behind a click.

```tsx
const Editor = lazy(() => import('@/features/docs/Editor'));
```

**Named exports** need a small shim, since `lazy` expects a default:

```tsx
const Chart = lazy(() => import('./Chart').then((m) => ({ default: m.Chart })));
```

**Prefetch on intent** so the split is invisible to the user:

```tsx
<Link to="/reports" onMouseEnter={() => import('@/routes/Reports')}>Reports</Link>
```

Every `Suspense` boundary needs a fallback that matches the final layout's dimensions — a spinner
that's replaced by taller content causes layout shift, which is both a CLS penalty and genuinely
annoying.

## Chunking strategy

The default Rollup output is usually fine. Manual chunks help when a large, rarely-changing
dependency would otherwise be invalidated by every app change.

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (id.includes('node_modules')) {
          if (id.includes('react') || id.includes('scheduler')) return 'react-vendor';
          if (id.includes('recharts') || id.includes('d3')) return 'charts';
          return 'vendor';
        }
      },
    },
  },
}
```

Resist over-splitting. Fifty small chunks means fifty requests and worse compression than a few
well-sized ones; HTTP/2 multiplexing helps but doesn't make it free. A handful of chunks in the
100–200 kB range is a healthy shape.

Don't put everything in one `vendor` chunk either — a single dependency bump then invalidates the
whole thing for every returning user.

## Assets

- **Images**: WebP or AVIF, explicit `width`/`height` to reserve space, `loading="lazy"` on
  anything below the fold, `fetchpriority="high"` on the LCP image.
- **Fonts**: self-host, `woff2`, `font-display: swap`, and preload the one used above the fold.
  Variable fonts often beat shipping four weights.
- **SVG icons**: import as components via `vite-plugin-svgr`, and import individually — a whole
  icon library imported as a namespace can add hundreds of kB.
- **Small assets** under 4 kB are inlined as base64 automatically; tune with
  `build.assetsInlineLimit`.
- **`public/`** is copied verbatim without hashing — for `robots.txt`, `favicon.ico`, and files
  referenced by absolute URL. Everything else should be imported so it gets a content hash.

## Performance budget

Reasonable targets for an SPA on a mid-range device:

| Metric | Target |
|---|---|
| Initial JS (gzipped) | < 200 kB |
| LCP | < 2.5 s |
| CLS | < 0.1 |
| INP | < 200 ms |
| Total initial transfer | < 500 kB |

Fail the build when JS regresses past the line — a budget nobody enforces isn't a budget:

```ts
build: {
  chunkSizeWarningLimit: 500,   // warn, in kB
}
```

Then check it properly in CI with `size-limit` or by asserting on the output of a build script,
since Vite's warning doesn't fail the build.

## SPA fallback (the one that always bites)

A client-routed app has exactly one HTML file. Navigating to `/projects/42` in-app works because
the router handles it in JavaScript. **Refreshing** that URL sends a real request to
`/projects/42`, and any host that doesn't know to serve `index.html` returns 404.

Every deploy target needs this configured. It's the number one "works locally, broken in prod"
report for Vite SPAs, and `vite preview` handles it automatically — which is exactly why it goes
unnoticed until deploy.

## Host configuration

**Netlify** — `public/_redirects`:
```
/*  /index.html  200
```

**Vercel** — `vercel.json`:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

**Nginx**:
```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

**Apache** — `.htaccess`:
```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

**S3 + CloudFront**: set the error document to `index.html` and map both 403 and 404 to
`/index.html` with a 200 response.

**Subpath deploys** (`example.com/app/`) also need `base: '/app/'` in `vite.config.ts`, or every
asset URL will 404.

## Caching headers

Vite hashes asset filenames, which makes aggressive caching safe — and makes caching `index.html`
dangerous, since it's the file that points at the new hashes.

```
/assets/*      Cache-Control: public, max-age=31536000, immutable
/index.html    Cache-Control: no-cache
```

Getting this backwards is why users see a stale app after a deploy, or why a deploy causes a burst
of 404s on chunks that no longer exist.

For long-lived sessions, detect a new deploy and prompt a reload — a user with the old
`index.html` open will 404 on lazy chunks after you deploy. `vite-plugin-pwa` handles this, or
poll a version endpoint and show a "New version available" toast.

## CI pipeline

```yaml
- run: npm ci
- run: npm run lint
- run: npx tsc --noEmit          # type errors don't fail vite build by default
- run: npm run test:run
- run: npm run build
- run: npx playwright install --with-deps && npm run test:e2e
```

That `tsc --noEmit` line matters more than it looks: Vite strips types with esbuild without
checking them, so a build can succeed with type errors in it. CI is where they get caught.

Build-time env vars must be present in CI, not just on the host — Vite inlines them during the
build (see `vite-config.md`).

## Production readiness

- [ ] SPA fallback configured on the host — verify by refreshing a deep link
- [ ] Correct `base` if deployed under a subpath
- [ ] Caching headers: hashed assets immutable, `index.html` no-cache
- [ ] Build-time env vars set in CI; no secrets in any `VITE_*` var
- [ ] Source maps uploaded to error tracking, and not publicly served if the code is sensitive
- [ ] Error boundary at the root so one component crash doesn't blank the page
- [ ] `console`/`debugger` dropped in production builds
- [ ] Error tracking (Sentry or similar) wired up with release tagging
- [ ] Lighthouse run against `vite preview` and within budget
- [ ] Deep links, refresh, and browser back/forward manually verified
- [ ] Tested on a real mid-range phone, not just a desktop viewport
