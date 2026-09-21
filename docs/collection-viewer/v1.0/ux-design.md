---
version: 1.0
status: approved
date: 2026-09-21
requires: design.md
---

# UX/UI Design: Collection Viewer

There is no design system to inherit — `.claude/design/` does not exist in this repo (see
[requirements.md § Constraints](requirements.md#constraints)). Everything here is defined from
scratch on top of shadcn/ui's default neutral scaffold, which is the smallest defensible starting
point given the stack is already fixed.

**The design problem in one line:** a v2.1 request carries eight-ish independent dimensions —
params, headers, body, auth, scripts, examples, behaviour, unknown extras — and most requests
populate only three of them. A viewer that renders all eight as stacked sections makes the user
scroll past six empty ones to find the two that matter. A viewer that hides the empty ones makes
"is there no auth, or did minim fail to show it?" unanswerable — and for a *reader of someone
else's collection*, that question is the whole job.

The resolution used throughout: **tabs with count badges**. The badge row answers "what's in this
request?" at a glance without a click; the tab panel answers "what exactly?" on demand; and a tab
reading `0` is a positive statement of absence, which is what [FR-036](requirements.md#fr-036)
asks for.

## Screens in Scope

Single window, no router ([ADR-010](design.md#key-decisions)). These are states of one shell, not
routes.

- **S1 — Empty shell** — no collection open; open action + recents. [FR-044](requirements.md#fr-044)
- **S2 — Viewer** — tree + request detail. The primary working state. [UC-002](requirements.md#uc-002), [UC-003](requirements.md#uc-003)
- **S3 — Folder detail** — a folder node selected: its scripts, auth, variables. [FR-039](requirements.md#fr-039)
- **S4 — Collection detail** — root node selected: `info`, variables, collection auth/scripts. [FR-038](requirements.md#fr-038), [FR-040](requirements.md#fr-040)
- **S5 — Examples** — saved responses for a request. [FR-037](requirements.md#fr-037)
- **S6 — Filter active** — tree filtered, ancestors retained. [FR-021](requirements.md#fr-021)
- **S7 — Load failure** — the four distinct rejection messages. [FR-005](requirements.md#fr-005)–[FR-007](requirements.md#fr-007)
- **S8 — Loading** — parse in flight.
- **S9 — Empty collection** — valid v2.1 with zero items. [FR-022](requirements.md#fr-022)
- **S10 — Warnings** — collection opened with `LoadWarning`s. [FR-009](requirements.md#fr-009)

---

## Lo-fi Wireframes

### S1 — Empty shell

<pre>
┌────────────────────────────────────────────────────────────────────────────┐
│  minim                                                        [◐ theme]    │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│                         ┌──────────────────────┐                           │
│                         │  (collection icon)   │                           │
│                         └──────────────────────┘                           │
│                                                                            │
│                       No collection open                                   │
│              Open a Postman v2.1 collection to inspect it.                 │
│                                                                            │
│                        [ Open collection… ]                                │
│                   or drop a .json file anywhere                            │
│                                                                            │
│   ── Recent ────────────────────────────────────────────────────────────   │
│   Billing API                     214 requests    ~/work/billing.json      │
│   Internal Tools                   38 requests    ~/dev/tools.json    [×]  │
│   Partner Webhooks                 12 requests    ~/dl/partner.json        │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
</pre>

- **Layout notes** — Centred hero over a left-aligned recents list. The whole window is the
  drop target ([FR-002](requirements.md#fr-002)), not a bordered rectangle — a bordered zone
  implies the rest of the window rejects the drop.
- **User flow** — Open… → native dialog → S8 → S2. Drop → S8 → S2. Recent click → S8 → S2, or
  → inline row error if the file is gone.
- **Annotations** — `[×]` appears on row hover/focus and calls `forget_recent`. Row count and path
  are secondary text; the collection name is the click target. Path is middle-truncated, never
  head-truncated — the filename is the identifying part.

### S2 — Viewer (primary state)

<pre>
┌────────────────────────────────────────────────────────────────────────────┐
│  Billing API   ~/work/billing.postman_collection.json   [⟳][✕]  [◐ theme]  │
├──────────────────────────┬─────────────────────────────────────────────────┤
│ [ Filter requests…   ⌘F] │  Auth  ›  Login                                 │
│ [⊞ all] [⊟ none]         │                                                 │
│                          │  ┌─────┐                                        │
│ ▾ ■ Billing API          │  │POST │  {{baseUrl}}/auth/login                │
│   ▾ 📁 Auth              │  └─────┘                                        │
│     ● POST  Login     ◀──┤  Authenticates a user and returns a JWT.        │
│     ● POST  Refresh      │                                                 │
│     ● GET   Me           │  ┌──────┬────────┬──────┬──────┬───────┬──────┐ │
│   ▾ 📁 Invoices          │  │Params│Headers │ Body │ Auth │Scripts│Exam. │ │
│     ▾ 📁 Drafts          │  │  2   │   3    │ raw  │  ⊥   │   2   │  2   │ │
│       ● GET   List       │  ╰──────┴────────┴──────┴──────┴───────┴──────╯ │
│       ● POST  Create     │                                                 │
│     ● GET   Get invoice  │  Query parameters                               │
│     ● DEL   Void         │  ┌──────────┬─────────────────┬────────────────┐│
│   ▸ 📁 Webhooks          │  │ expand   │ customer        │                ││
│   ▸ 📁 Reports           │  │ ~~dryRun~~│ ~~true~~       │ disabled       ││
│                          │  └──────────┴─────────────────┴────────────────┘│
│                          │                                                 │
│                          │  Path variables                                 │
│                          │  (none)                                         │
├──────────────────────────┴─────────────────────────────────────────────────┤
│ 214 requests · 18 folders · 1.2 MB · v2.1                                  │
└────────────────────────────────────────────────────────────────────────────┘
</pre>

- **Layout notes** — Two panes, draggable divider, sidebar 240–480 px (default 300), persisted.
  Sidebar scrolls independently and is virtualized ([ADR-014](design.md#key-decisions)). The
  detail header (breadcrumb, method, URL) is **sticky**; only the tab panel scrolls, so the user
  never loses track of which request they're reading.
- **User flow** — select leaf → detail loads (`get_node_detail`, cached by `NodeId`) → tabs
  default to the first **non-empty** tab, so a request with no params opens on Headers rather than
  on an empty panel.
- **Annotations** —
  - Tab badges: a count for countable things, the body `mode` for Body, `⊥` for
    inherited auth, `—` for none. The badge row is the request's fingerprint.
  - `~~strikethrough~~` = `disabled: true` ([FR-024](requirements.md#fr-024), [FR-025](requirements.md#fr-025)).
  - `{{baseUrl}}` renders as a token chip, not plain text ([FR-035](requirements.md#fr-035)).
  - `(none)` is printed for empty sections — never an omitted heading.
  - `[⟳]` reload ([FR-045](requirements.md#fr-045)), `[✕]` close → S1.

### S2b — Detail tabs, the interesting panels

<pre>
BODY — raw                                    BODY — formdata
┌──────────────────────────────────────┐      ┌──────────────────────────────┐
│ raw · json                     [copy]│      │ KEY        TYPE    VALUE     │
│ ┌──────────────────────────────────┐ │      │ invoice    file    ./inv.pdf │
│ │ 1  {                             │ │      │ note       text    "urgent"  │
│ │ 2    "email": "{{userEmail}}",   │ │      │ ~~debug~~  text    ~~1~~     │
│ │ 3    "scope": "full"             │ │      └──────────────────────────────┘
│ │ 4  }                             │ │
│ └──────────────────────────────────┘ │      BODY — graphql
└──────────────────────────────────────┘      ┌──────────────────────────────┐
                                              │ Query                        │
AUTH — inherited                              │ ┌──────────────────────────┐ │
┌──────────────────────────────────────┐      │ │ query Me { me { id } }   │ │
│ ⊥ Inherited from collection          │      │ └──────────────────────────┘ │
│   bearer                             │      │ Variables                    │
│ ┌────────────┬─────────────────────┐ │      │ ┌──────────────────────────┐ │
│ │ token      │ ••••••••••••   [👁] │ │      │ │ { "id": "{{userId}}" }   │ │
│ └────────────┴─────────────────────┘ │      │ └──────────────────────────┘ │
└──────────────────────────────────────┘      └──────────────────────────────┘

SCRIPTS                                       EXAMPLES
┌──────────────────────────────────────┐      ┌──────────────────────────────┐
│ ▾ Pre-request                        │      │ ● 200 OK   Success           │
│   ┌────────────────────────────────┐ │      │ ○ 401      Bad credentials   │
│   │ 1 pm.environment.set("ts", …)  │ │      ├──────────────────────────────┤
│   └────────────────────────────────┘ │      │ 200 OK · application/json    │
│ ▾ Test                               │      │ Headers (4)   Cookies (1)    │
│   ┌────────────────────────────────┐ │      │ ┌──────────────────────────┐ │
│   │ 1 pm.test("ok", () => { … })   │ │      │ │ { "token": "ey…" }       │ │
│   └────────────────────────────────┘ │      │ └──────────────────────────┘ │
│ ⓘ Scripts are displayed only.        │      └──────────────────────────────┘
│   minim never runs them.             │
└──────────────────────────────────────┘
</pre>

- **Annotations** — The Scripts note is load-bearing trust UI: a user reading a stranger's
  collection needs to know minim did not execute what they're looking at
  ([NFR-009](requirements.md#nfr-009)). Auth values are masked by default with a per-value reveal
  ([FR-032](requirements.md#fr-032)); the `⊥` chip names the inheritance source
  ([FR-030](requirements.md#fr-030)).

### S4 — Collection detail (root selected)

<pre>
│  Billing API                                                       │
│  https://schema.getpostman.com/json/collection/v2.1.0/collection…  │
│  version 2.4.0 · 214 requests · 18 folders                         │
│                                                                    │
│  ┌──────────┬───────────┬─────────┬──────────┐                     │
│  │Variables │ Auth      │ Scripts │ Info     │                     │
│  │    7     │  bearer   │    1    │          │                     │
│  ╰──────────┴───────────┴─────────┴──────────╯                     │
│                                                                    │
│  KEY          VALUE                        TYPE     USED           │
│  baseUrl      https://api.example.com      string    118           │
│  userEmail    —                            string      3           │
│  ~~legacyId~~ ~~42~~                       string      0  disabled │
</pre>

- **Annotations** — The `USED` column is the reverse of [FR-035](requirements.md#fr-035): from a
  variable, how many requests reference it. A `0` is the fastest way to spot a stale variable, and
  it costs nothing since the reference index is already built for the forward direction.

### S6 — Filter active

<pre>
│ [ invoice                   ×] │
│ 6 of 214                       │
│                                │
│ ▾ 📁 Invoices                  │   ← ancestor, dimmed, not itself a match
│   ▾ 📁 Drafts                  │
│     ● GET   List **invoice**s  │   ← match highlighted in place
│     ● POST  Create **invoice** │
│   ● GET   Get **invoice**      │
│ ▾ 📁 Reports                   │
│   ● GET   Monthly **invoice**… │
│ ▾ 📁 Webhooks                  │
│   ● POST  **invoice**.paid     │
</pre>

- **Annotations** — Ancestors are retained for context but rendered dimmed and non-matching, so
  the user can tell a folder appeared *because of its children*. All folders auto-expand while a
  filter is active; the pre-filter expansion state is restored when it clears. `6 of 214` is the
  answer to "did my filter work or is the collection just small?".

### S7 — Load failure

<pre>
┌──────────────────── Couldn't open this file ───────────────────────┐
│                                                                    │
│  billing-v2.postman_collection.json                                │
│                                                                    │
│  This is a Postman v2.0 collection.                                │
│  minim reads v2.1 only — that's the format Newman runs.            │
│                                                                    │
│     found     …/json/collection/v2.0.0/collection.json             │
│     expected  …/json/collection/v2.1.0/collection.json             │
│                                                                    │
│  In Postman: Export → Collection v2.1 (recommended).               │
│                                                                    │
│                              [ Try another file ]   [ Dismiss ]    │
└────────────────────────────────────────────────────────────────────┘

Other variants — same frame, different body:

  NotJson          "This file isn't valid JSON."
                   Unexpected token at line 418, column 12.

  NotACollection   "This is valid JSON, but not a Postman collection."
                   Missing required field: item

  FileTooLarge     "This file is 812 MB. minim reads collections up to 64 MB."

  FileNotFound     "This file no longer exists at that path."
                   (from a recents row) → [ Remove from recents ]
</pre>

- **Annotations** — Each `AppError` variant gets its own copy, which is exactly why the error type
  is structured rather than a string ([design.md § AppError wire shape](design.md#apperror-wire-shape)).
  The v2.0 case names the fix (`Export → Collection v2.1`) because that is the single most likely
  failure a new user will hit, and "unsupported schema" alone leaves them stuck.

### S8 · S9 · S10 — Loading, empty, warnings

<pre>
S8 LOADING                    S9 EMPTY COLLECTION           S10 WARNINGS BANNER
┌────────┬───────────────┐    ┌────────┬────────────────┐   ┌──────────────────────┐
│ ▭▭▭▭▭  │               │    │        │                │   │ ⚠ Opened with 2      │
│ ▭▭▭▭   │   Reading     │    │  (—)   │  "Billing API" │   │   notes        [view]│
│ ▭▭▭▭▭  │   billing.js… │    │        │  has no        │   └──────────────────────┘
│ ▭▭▭▭   │               │    │        │  requests.     │    ▾ expanded
│        │   [ Cancel ]  │    │        │                │   │ Unknown auth type    │
└────────┴───────────────┘    └────────┴────────────────┘   │ "hawk" · Auth › Login│
                                                            │ Shown as raw values. │
  skeleton rows, no spinner      names the collection       │                      │
  Cancel only appears >400ms     so the user knows it       │ Header line without  │
                                 parsed fine                │ ":" · Reports › CSV  │
                                                            └──────────────────────┘
</pre>

- **Annotations** — S9 must name the collection: a blank pane is indistinguishable from a bug,
  whereas "*Billing API* has no requests" confirms the parse succeeded
  ([FR-022](requirements.md#fr-022)). S10's banner is dismissible but the count stays in the
  status bar, so warnings are discoverable later without being modal.

---

## Hi-fi Component Specs

### Design tokens

shadcn's current Tailwind v4 convention is `@theme inline` mapping `--color-*` utilities onto raw
`--*` variables, with `.dark` overriding the raw layer. **Note:** this differs from
`.claude/skills/react-vite-developer/references/ui-system.md`, which documents a plain `@theme`
block with `--color-*` defined directly. Since the project uses shadcn components, shadcn's
convention wins — mixing them produces components whose tokens silently don't resolve.

Base scaffold is shadcn's default neutral (`npx shadcn@latest init -t vite`). minim adds one token
group of its own — HTTP method colors, the app's only genuinely domain-specific visual language:

```css
:root {
  --method-get:    oklch(0.52 0.13 155);   /* green  */
  --method-post:   oklch(0.52 0.15 250);   /* blue   */
  --method-put:    oklch(0.55 0.14 70);    /* amber  */
  --method-patch:  oklch(0.54 0.13 300);   /* violet */
  --method-delete: oklch(0.54 0.19 27);    /* red    */
  --method-other:  oklch(0.55 0 0);        /* grey — HEAD/OPTIONS/TRACE/… */
  --token-var:     oklch(0.50 0.14 290);   /* {{variable}} chips */
  --token-var-bg:  oklch(0.95 0.03 290);
}

.dark {
  --method-get:    oklch(0.75 0.15 155);
  --method-post:   oklch(0.74 0.14 250);
  --method-put:    oklch(0.78 0.14 70);
  --method-patch:  oklch(0.76 0.13 300);
  --method-delete: oklch(0.71 0.18 27);
  --method-other:  oklch(0.71 0 0);
  --token-var:     oklch(0.80 0.13 290);
  --token-var-bg:  oklch(0.30 0.06 290);
}

@theme inline {
  --color-method-get:    var(--method-get);
  --color-method-post:   var(--method-post);
  --color-method-put:    var(--method-put);
  --color-method-patch:  var(--method-patch);
  --color-method-delete: var(--method-delete);
  --color-method-other:  var(--method-other);
  --color-token-var:     var(--token-var);
  --color-token-var-bg:  var(--token-var-bg);
}
```

Method color is **never the sole carrier of meaning** — the verb text is always present. That is
what keeps the scheme usable for the ~8% of men with red/green deficiency, for whom GET and DELETE
would otherwise be the same chip.

Monospace is used for every value that came out of the collection file (URLs, header values, bodies,
scripts, variable values). Proportional type is used for minim's own chrome. The split tells the
user at a glance which text is *theirs* and which is *ours* — the same reason a diff viewer uses
mono.

```css
@theme inline {
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, monospace;
}
```

Both fonts are bundled locally, not fetched — the CSP forbids remote origins
([NFR-009](requirements.md#nfr-009)) and the app must work offline
([NFR-014](requirements.md#nfr-014)).

### S1 — Empty shell

#### Layout

- **Wrapper** — `div` · `flex h-screen flex-col bg-background text-foreground`
- **Hero** — `flex flex-1 flex-col items-center justify-center gap-6 px-6`
- **Recents** — `w-full max-w-2xl` below the hero
- **Responsive** — window min 800×600. Below 1000 px the recents path column is hidden (`hidden lg:block`); the name and count always survive.

#### Components

| Element | shadcn/ui | Variant / Size | Tailwind classes | States |
|---|---|---|---|---|
| Open button | `Button` | `default` / `lg` | `gap-2` | default, hover, focus-visible ring, active, loading (`disabled` + spinner) |
| Drop overlay | — (custom) | — | `fixed inset-0 z-50 border-2 border-dashed border-primary bg-primary/5` | hidden, drag-over only |
| Recents heading | — | — | `text-xs font-medium uppercase tracking-wide text-muted-foreground` | static |
| Recent row | `Button` | `ghost` / `default` | `w-full justify-between rounded-md px-3 py-2 text-left` | default, hover `bg-accent`, focus-visible, missing-file (`text-muted-foreground line-through`) |
| Row path | — | — | `hidden truncate font-mono text-xs text-muted-foreground lg:block` | static |
| Forget button | `Button` | `ghost` / `icon` | `size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100` | hidden until hover **or focus** — keyboard users must reach it |
| Theme toggle | `DropdownMenu` + `Button` | `ghost` / `icon` | — | system / light / dark, checked state |

### S2 — Viewer

#### Layout

- **Wrapper** — `ResizablePanelGroup direction="horizontal"` · `h-screen`
- **Sidebar** — `ResizablePanel defaultSize={24} minSize={16} maxSize={40}` · `flex flex-col border-r`
- **Detail** — `ResizablePanel` · `flex flex-col overflow-hidden`
- **Responsive** — below 900 px the panes collapse to a single column with a back affordance; the resize handle is hidden. A desktop app is rarely narrow, but a half-screen-snapped window is common and must not break.

#### Components — topbar and status bar

| Element | shadcn/ui | Variant / Size | Tailwind classes | States |
|---|---|---|---|---|
| Topbar | — | — | `flex h-12 shrink-0 items-center gap-3 border-b px-3` | static |
| Collection name | — | — | `truncate text-sm font-medium` | static |
| Source path | `Tooltip` | — | `hidden truncate font-mono text-xs text-muted-foreground md:block` | tooltip shows full path |
| Reload / Close | `Button` | `ghost` / `icon` | `size-8` | default, hover, focus-visible, reload spinning while pending |
| Status bar | — | — | `flex h-6 shrink-0 items-center gap-3 border-t px-3 text-xs text-muted-foreground` | static; warning count `text-amber-600 dark:text-amber-400` |

#### Components — tree

| Element | shadcn/ui | Variant / Size | Tailwind classes | States |
|---|---|---|---|---|
| Filter input | `Input` | `default` | `h-8 pl-8 text-sm` + search icon | default, focus ring, filled (shows `×`), no-results |
| Result count | — | — | `px-3 py-1 text-xs text-muted-foreground` | only while filtering |
| Expand/collapse all | `Button` | `ghost` / `icon` | `size-7` | default, hover, focus |
| Scroll container | `ScrollArea` | — | `flex-1` wrapping `@tanstack/react-virtual` | — |
| Tree row | — (custom, `role="treeitem"`) | — | `flex h-7 items-center gap-1.5 rounded-sm px-2 text-sm` | default, hover `bg-accent/50`, selected `bg-accent font-medium`, focus-visible `ring-2 ring-ring`, dimmed-ancestor `opacity-60` |
| Disclosure caret | `ChevronRight` (lucide) | — | `size-3.5 shrink-0 transition-transform data-[open]:rotate-90` | collapsed, expanded, hidden for leaves |
| Method chip | `Badge` | `outline` | `w-12 shrink-0 justify-center px-1 font-mono text-[10px] font-semibold text-method-{verb}` | one per verb + `other` fallback |
| Request name | — | — | `truncate` | match segments `bg-amber-200/60 dark:bg-amber-400/25 rounded-[2px]` |
| Indentation | — | — | `padding-left: calc(depth * 0.75rem + 0.5rem)` — padding, **not** nested DOM, so virtualization stays flat | — |

#### Components — detail pane

| Element | shadcn/ui | Variant / Size | Tailwind classes | States |
|---|---|---|---|---|
| Sticky header | — | — | `sticky top-0 z-10 shrink-0 border-b bg-background/95 px-5 py-3 backdrop-blur` | static |
| Breadcrumb | `Breadcrumb` | — | `text-xs text-muted-foreground` | truncates middle segments past 4 levels |
| Method chip (large) | `Badge` | `outline` | `px-2 py-0.5 font-mono text-xs font-bold text-method-{verb}` | per verb |
| URL | — | — | `break-all font-mono text-sm` | var chips inline |
| Description | — | — | `text-sm text-muted-foreground` | hidden when empty |
| Tabs | `Tabs` | — | `TabsList h-9`, `TabsTrigger gap-1.5 text-xs` | default, active, focus-visible; arrow-key roving per Radix |
| Tab badge | `Badge` | `secondary` | `h-4 min-w-4 px-1 font-mono text-[10px]` | count, `mode` string, `⊥` inherited, `—` none |
| Panel scroll | `ScrollArea` | — | `flex-1 px-5 py-4` | — |
| KV table | `Table` | — | `text-sm`; `TableHead` `text-xs uppercase tracking-wide` | row hover `bg-muted/40`; disabled row `text-muted-foreground line-through` |
| Empty section | — | — | `py-6 text-center text-sm text-muted-foreground` | literal `(none)` |
| Code block | — (custom, Shiki) | — | `rounded-md border bg-muted/40 p-3 font-mono text-xs` + `ScrollArea` | loading (plain text until grammar resolves), loaded |
| Copy button | `Button` + `Tooltip` | `ghost` / `icon` | `absolute right-2 top-2 size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100` | idle, copied (check icon, 1.5 s) |
| Var chip | `Badge` | `outline` | `rounded-[3px] bg-token-var-bg px-1 font-mono text-[11px] text-token-var` | defined, undefined (`border-dashed` + tooltip "not defined in this collection") |
| Mask field | `Button` | `ghost` / `icon` | `size-6` (`Eye` / `EyeOff`) | masked (default), revealed; re-masks on node change |
| Inherited chip | `Badge` | `secondary` | `gap-1 text-[10px]` | `from collection` / `from folder "X"` |
| Script notice | `Alert` | `default` | `mt-4 text-xs` | static, always present on Scripts tab |
| Warning banner | `Alert` | `default` (amber) | `mx-5 mt-3` + `Collapsible` | collapsed, expanded, dismissed |

#### Components — dialogs

| Element | shadcn/ui | Variant / Size | Tailwind classes | States |
|---|---|---|---|---|
| Error dialog | `AlertDialog` | — | `max-w-lg` | one body per `AppError` variant |
| Filename | — | — | `font-mono text-sm` | static |
| Detail rows | — | — | `rounded-md bg-muted p-3 font-mono text-xs` | only for `UnsupportedSchema` / `NotJson` |
| Primary action | `AlertDialogAction` | `default` | — | "Try another file" → reopens dialog |
| Secondary | `AlertDialogCancel` | `outline` | — | "Dismiss" |

### Accessibility

- **Contrast** — Every pair targets **WCAG AA** (≥ 4.5:1 body text, ≥ 3:1 large text and non-text
  UI). The method tokens above were picked at lightness 0.52–0.55 on light and 0.71–0.78 on dark
  specifically to clear 4.5:1 against `--background` in both themes. These are design *targets*;
  the exact ratios must be machine-verified, which is why an automated contrast assertion is an
  acceptance criterion in Phase 4 rather than a number asserted here.
- **Color independence** — verb text always accompanies verb color; `disabled` uses
  strikethrough **and** muted color **and** a "disabled" text label in the row.
- **ARIA — tree** — container `role="tree"` `aria-multiselectable="false"`; rows `role="treeitem"`
  with `aria-expanded` (folders only), `aria-level`, `aria-setsize`, `aria-posinset`,
  `aria-selected`. Virtualization makes `aria-setsize`/`aria-posinset` mandatory — the DOM holds
  only the visible window, so assistive tech cannot infer position from the tree itself.
- **Keyboard — tree** — roving `tabindex`: `↑`/`↓` move, `→` expand or descend, `←` collapse or
  ascend, `Home`/`End` jump, `Enter`/`Space` select, typeahead jumps by first letters. One tab stop
  for the whole tree.
- **Keyboard — app** — `⌘/Ctrl+O` open, `⌘/Ctrl+F` focus filter, `Esc` clear filter then close
  dialog, `⌘/Ctrl+R` reload, `⌘/Ctrl+W` close collection, `Tab` order: topbar → filter → tree →
  tabs → panel → status.
- **Focus** — visible `ring-2 ring-ring ring-offset-2` on every interactive element; never
  `outline-none` without a replacement. `AlertDialog` traps focus and restores it to the trigger.
- **Motion** — the only animations are the caret rotation and the tab indicator; both are disabled
  under `prefers-reduced-motion: reduce`.
- **Announcements** — `aria-live="polite"` on the filter result count and on load completion
  ("Billing API opened, 214 requests"); `role="alert"` on the error dialog.
- **Text scaling** — layout holds to 200% zoom; no fixed-height text containers.

---

## Design Review

Nielsen's 10 heuristics. Score 1 = cosmetic, 4 = critical. Per the skill's rules, any unresolved 3
or 4 blocks Phase 4 — all listed issues are resolved in the specs above.

| # | Heuristic | Issue found | Score | Resolution |
|---|---|---|---|---|
| 1 | Visibility of system status | A 5 MB parse shows nothing; the user can't tell "working" from "hung" | 3 | S8 skeleton rows immediately; `Cancel` appears after 400 ms; `aria-live` on completion |
| 2 | Match with the real world | "ItemGroup", "NodeId", "LoadWarning" are schema vocabulary, not user vocabulary | 3 | UI says folder, request, note. Schema terms appear only where the *file* is the subject (the S7 `found`/`expected` rows) |
| 3 | User control and freedom | An opened collection could not be closed without quitting | 2 | `[✕]` in the topbar returns to S1; `⌘W` |
| 4 | Consistency and standards | Tree keyboard behaviour could plausibly diverge from OS conventions | 3 | Full WAI-ARIA Authoring Practices tree pattern, including typeahead |
| 5 | Error prevention | Dropping a folder, or several files at once, was undefined | 2 | Drop overlay accepts exactly one `.json`; a multi-file or folder drop is rejected with an inline message before any read |
| 6 | Recognition over recall | Finding which of eight sections has content required clicking all eight | **4** | **Tab count badges** — the core resolution described at the top of this document |
| 7 | Flexibility and efficiency | Power users would fight a mouse-only tree | 2 | Full keyboard map, `⌘F` filter, typeahead, expand/collapse all |
| 8 | Aesthetic and minimalist design | Eight always-visible stacked sections would bury the two that matter | 3 | Tabs; default to the first non-empty tab |
| 9 | Help users recover from errors | "Failed to parse collection" would leave a v2.0 user stuck | **4** | Per-variant copy naming the actual cause and the fix (`Export → Collection v2.1`); line/column for JSON syntax errors |
| 10 | Help and documentation | Users can't tell whether minim executed the scripts it's displaying | 3 | Persistent notice on the Scripts tab: "displayed only, minim never runs them" |

### Accessibility audit

| Area | Status | Note |
|---|---|---|
| Contrast — body/chrome | **Pass (by construction)** | shadcn default neutral scaffold ships AA-compliant pairs |
| Contrast — method chips | **Target set, verification required** | Lightness chosen for AA in both themes; must be machine-asserted in Phase 4, not eyeballed |
| Contrast — var chips, warnings | **Target set, verification required** | Same |
| Color independence | **Pass** | Verb text + strikethrough + label back every color signal |
| Keyboard — tree | **Pass** | Full APG tree pattern specified |
| Keyboard — dialogs, tabs | **Pass** | Radix primitives handle trap and roving focus |
| Screen reader — virtualized tree | **Pass, conditional** | Requires `aria-setsize`/`aria-posinset`; easy to omit, so it is an explicit acceptance criterion |
| Reduced motion | **Pass** | Two animations, both gated |
| Zoom to 200% | **Pass** | No fixed-height text containers |

### Open questions for the owner

1. **Default sidebar width** is 300 px. Fine for `POST  Create invoice`; tight for deeply nested
   folders. It's resizable and persisted, so this is a starting value, not a constraint.
2. **The `USED` variable-reference count** (S4) is a small scope addition beyond
   [FR-038](requirements.md#fr-038) — it reuses the index built for
   [FR-035](requirements.md#fr-035). Cheap and genuinely useful, but say if you'd rather cut it.
