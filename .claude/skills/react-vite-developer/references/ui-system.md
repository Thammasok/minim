# UI System (Tailwind + shadcn/ui + Radix)

Contents: [Tailwind v4 setup](#tailwind-v4-setup) · [Design tokens](#design-tokens) ·
[Dark mode](#dark-mode) · [cn() and variants](#cn-and-variants) · [shadcn/ui](#shadcnui) ·
[Radix directly](#using-radix-directly) · [Accessibility](#accessibility) · [Pitfalls](#pitfalls)

## Tailwind v4 setup

v4 configures itself in CSS. There is no `tailwind.config.js` and no PostCSS chain — the Vite
plugin plus one `@import` is the whole setup.

```ts
// vite.config.ts
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss()] });
```

```css
/* src/index.css */
@import 'tailwindcss';
```

If you're in an existing **v3** project, it uses `tailwind.config.js` + PostCSS with a `content`
array. Don't half-migrate: v3 and v4 configuration styles don't compose, and a partial migration
produces classes that silently do nothing.

## Design tokens

Define semantic tokens, then use them everywhere. The point is that `bg-surface` survives a
rebrand while `bg-slate-800` scattered across 200 files does not.

```css
/* src/index.css */
@import 'tailwindcss';

@theme {
  /* Semantic colors — name by role, not by hue */
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.15 0 0);
  --color-surface: oklch(0.98 0 0);
  --color-border: oklch(0.9 0 0);
  --color-primary: oklch(0.55 0.2 260);
  --color-primary-foreground: oklch(0.99 0 0);
  --color-muted: oklch(0.96 0 0);
  --color-muted-foreground: oklch(0.5 0 0);
  --color-destructive: oklch(0.58 0.22 25);

  /* Type scale */
  --font-sans: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;

  /* Radii */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
}
```

Every token in `@theme` becomes a utility automatically: `bg-primary`, `text-muted-foreground`,
`rounded-md`, `font-sans`.

The `foreground` naming convention is worth adopting — pairing `--color-primary` with
`--color-primary-foreground` means the text color on a colored surface is defined once and can't
drift into an unreadable combination.

OKLCH is the better color space here: lightness is perceptually uniform, so generating a scale or
adjusting for dark mode produces predictable results rather than mud.

## Dark mode

```css
@custom-variant dark (&:where(.dark, .dark *));

:root {
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.15 0 0);
  --color-surface: oklch(0.98 0 0);
}

.dark {
  --color-background: oklch(0.15 0 0);
  --color-foreground: oklch(0.95 0 0);
  --color-surface: oklch(0.2 0 0);
}
```

Because the tokens are semantic, dark mode is a variable swap — components need no `dark:`
classes at all. That's the payoff for naming by role.

Apply the class before first paint or users get a white flash on every load:

```html
<!-- index.html, before the app script -->
<script>
  const t = localStorage.getItem('theme') ?? 'system';
  const dark = t === 'dark' || (t === 'system' &&
    matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
</script>
```

Offer three options — light, dark, and system. Defaulting to system respects what the user already
told their OS.

## cn() and variants

```ts
// src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`twMerge` resolves conflicts by precedence rather than source order, so a `className` prop passed
by a caller actually wins. Without it, `cn('p-4', 'p-2')` leaves both classes and CSS order decides
— which is why "my override doesn't work" is such a common complaint.

For components with variants, `class-variance-authority` keeps the combinations declarative and
typed:

```ts
import { cva, type VariantProps } from 'class-variance-authority';

const button = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ' +
    'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-border bg-background hover:bg-muted',
        ghost: 'hover:bg-muted',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
      },
      size: { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4', lg: 'h-12 px-6 text-lg' },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof button>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}
```

## shadcn/ui

shadcn is not a dependency — the CLI copies component source into your repo. That's the whole
value proposition: you own the code, can edit it freely, and never fight a library's API to change
a border radius. The trade-off is no automatic upgrades; components you've edited are yours to
maintain.

```bash
npx shadcn@latest init
npx shadcn@latest add button input dialog form select
```

Files land in `src/components/ui/`. Treat them as your code:

- **Edit them freely** to match your tokens and conventions.
- **Don't wrap them in a second abstraction layer** just to change defaults — change the defaults
  in the file.
- **Do wrap them** when you're composing several into a domain component (`ProjectPicker` built
  from `Command` + `Popover`), which belongs in `features/`, not `components/ui/`.

Add components as you need them. Running `add` for everything up front puts code in the repo that
nobody has reviewed and tree shaking can't help with if it's imported by a barrel file.

## Using Radix directly

shadcn's interactive components are Radix primitives with styling. Reach for Radix directly when
you need a behavior shadcn doesn't ship, and take it seriously — dialogs, popovers, dropdowns, and
comboboxes have a genuinely hard accessibility surface (focus trapping, restoration, escape
handling, typeahead, scroll locking, `aria-*` wiring). Hand-rolling them is how apps end up with
modals keyboard users can't escape.

`asChild` is the pattern to know — it merges the primitive's behavior onto your element instead of
rendering an extra wrapper:

```tsx
<DialogTrigger asChild>
  <Button variant="outline">Open</Button>
</DialogTrigger>
```

## Accessibility

Baseline that costs almost nothing if done as you go:

- **Semantics first.** `<button>` for actions, `<a>` for navigation, `<nav>`/`<main>`/`<header>`
  for landmarks. A `<div onClick>` is invisible to keyboards and screen readers.
- **Visible focus.** Never `outline-none` without a `focus-visible:ring` replacement. If a design
  removes focus rings, push back — it makes the app unusable without a mouse.
- **Contrast.** 4.5:1 for body text, 3:1 for large text and UI boundaries. Check the muted greys
  and the disabled states; that's where it usually fails.
- **Touch targets** at least 44×44px.
- **Icon-only buttons** need `aria-label`.
- **Don't convey state by color alone** — pair it with an icon or text.
- **Respect reduced motion:**

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Also see the route-change announcement pattern in `routing.md` — it's the a11y issue specific to
SPAs and the easiest one to miss.

## Pitfalls

**Dynamically built class names.** Tailwind scans source text; it can't evaluate expressions.

```tsx
// ❌ produces no CSS
<div className={`text-${color}-500`} />

// ✅ full strings the scanner can see
const colors = { red: 'text-red-500', blue: 'text-blue-500' } as const;
<div className={colors[color]} />
```

**Arbitrary values everywhere.** One `w-[347px]` is pragmatic; fifty of them means the design has
no scale and you've lost the consistency Tailwind provides.

**Long class strings on every element.** Extract a component, not an `@apply` class — `@apply`
recreates the CSS-file indirection Tailwind exists to avoid, and it doesn't compose with props.

**`space-y-*` on a flex container.** Use `gap-*`; `space-*` fights flex/grid and breaks on wrap.

**Overriding a shadcn component from outside instead of editing it.** You own the file. Edit it.
