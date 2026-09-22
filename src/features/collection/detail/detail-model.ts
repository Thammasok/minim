import type { AuthView, BodyView, RequestDetail } from '@/bindings';

/**
 * The badge row is the request's fingerprint (ux-design.md §S2, design review heuristic #6).
 *
 * Everything the tab shell decides — what each badge reads, which tab opens first, which panels
 * print "(none)" — is computed here as data rather than inside JSX, so it is unit-testable
 * without a DOM and so T-017/T-018 can reuse the same `isEmpty` judgement their panels need.
 */

export const TAB_IDS = ['params', 'headers', 'body', 'auth', 'scripts', 'examples'] as const;
export type TabId = (typeof TAB_IDS)[number];

/** FR-036 — an absent section says so out loud; it is never a heading that quietly vanished. */
export const NONE_LABEL = '(none)';

/** ux §S2: `⊥` for inherited auth, `—` for nothing at all. */
export const INHERITED_BADGE = '⊥';
export const NONE_BADGE = '—';

export interface TabDescriptor {
  id: TabId;
  label: string;
  /** What the badge prints: a count, a body mode, `⊥` or `—`. */
  badge: string;
  /** Spoken form for a badge whose glyph would not read aloud usefully; null when it would. */
  badgeLabel: string | null;
  /** Drives both the default tab and the "(none)" panel. */
  isEmpty: boolean;
}

interface BadgeSpec {
  badge: string;
  badgeLabel: string | null;
  isEmpty: boolean;
}

function countBadge(count: number): BadgeSpec {
  return { badge: String(count), badgeLabel: null, isEmpty: count === 0 };
}

/** FR-026 — the badge is the `mode` string itself, so the fingerprint says *what kind* of body. */
export function bodyBadge(body: BodyView | null): BadgeSpec {
  if (body === null) return { badge: NONE_BADGE, badgeLabel: 'none', isEmpty: true };
  return { badge: body.mode, badgeLabel: null, isEmpty: false };
}

/** FR-030 — an inherited auth is marked as inherited, and the marker names its source. */
export function authBadge(auth: AuthView): BadgeSpec {
  switch (auth.source.kind) {
    case 'none':
      return { badge: NONE_BADGE, badgeLabel: 'none', isEmpty: true };
    case 'own':
      return { badge: auth.authType, badgeLabel: null, isEmpty: false };
    case 'collection':
      return { badge: INHERITED_BADGE, badgeLabel: 'inherited from collection', isEmpty: false };
    case 'folder':
      return {
        badge: INHERITED_BADGE,
        badgeLabel: `inherited from folder ${auth.source.name}`,
        isEmpty: false,
      };
    default: {
      // A new AuthSourceView variant in bindings.ts fails tsc here rather than showing a blank.
      const exhaustive: never = auth.source;
      throw new Error(`Unhandled AuthSourceView variant: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export function buildTabs(detail: RequestDetail): TabDescriptor[] {
  return [
    // Params is one tab over two tables — query string and path variables are the same question.
    {
      id: 'params',
      label: 'Params',
      ...countBadge(detail.url.query.length + detail.url.pathVariables.length),
    },
    { id: 'headers', label: 'Headers', ...countBadge(detail.headers.length) },
    { id: 'body', label: 'Body', ...bodyBadge(detail.body) },
    { id: 'auth', label: 'Auth', ...authBadge(detail.auth) },
    { id: 'scripts', label: 'Scripts', ...countBadge(detail.events.length) },
    { id: 'examples', label: 'Examples', ...countBadge(detail.examples.length) },
  ];
}

/**
 * Which tab the pane opens on.
 *
 * Opening on an empty Params panel teaches the user nothing and costs a click on almost every
 * request, so the first tab with content wins (ux §S2 / TC-U-068). A request with nothing at all
 * falls back to the first tab rather than to no tab.
 */
export function firstNonEmptyTabId(tabs: readonly TabDescriptor[]): TabId {
  return (tabs.find((tab) => !tab.isEmpty) ?? tabs[0])?.id ?? 'params';
}

export type BreadcrumbSegment =
  { kind: 'folder'; label: string } | { kind: 'ellipsis'; hidden: number };

/**
 * Folder path for the header crumb, with the middle elided past `max` levels (ux §S2).
 *
 * The first and the last two folders are what orient a reader; the levels between them are the
 * ones a deep collection wastes a whole header line on.
 */
export function breadcrumbSegments(folderPath: readonly string[], max = 4): BreadcrumbSegment[] {
  if (folderPath.length <= max) {
    return folderPath.map((label) => ({ kind: 'folder', label }));
  }
  const head = folderPath.slice(0, 1);
  const tail = folderPath.slice(-2);
  return [
    ...head.map((label): BreadcrumbSegment => ({ kind: 'folder', label })),
    { kind: 'ellipsis', hidden: folderPath.length - head.length - tail.length },
    ...tail.map((label): BreadcrumbSegment => ({ kind: 'folder', label })),
  ];
}
