import { describe, expect, it } from 'vitest';
import type { AuthView } from '@/bindings';
import {
  authBadge,
  bodyBadge,
  breadcrumbSegments,
  buildTabs,
  firstNonEmptyTabId,
  INHERITED_BADGE,
  NONE_BADGE,
  type TabId,
} from './detail-model';
import { example, header, param, requestDetail, script, url } from './detail-fixtures';

function badgeOf(tabs: ReturnType<typeof buildTabs>, id: TabId): string {
  return tabs.find((tab) => tab.id === id)?.badge ?? '';
}

describe('buildTabs — the badge row is the request fingerprint', () => {
  it('counts params across the query string and the path variables', () => {
    const tabs = buildTabs(
      requestDetail({
        url: url('{{baseUrl}}/invoices/:id', {
          query: [param('expand', 'customer'), param('dryRun', 'true', { disabled: true })],
          pathVariables: [param('id', '42')],
        }),
      })
    );
    expect(badgeOf(tabs, 'params')).toBe('3');
  });

  it('counts headers, scripts and examples', () => {
    const tabs = buildTabs(
      requestDetail({
        headers: [header('Accept'), header('X-Trace')],
        events: [script('prerequest', 'noop()')],
        examples: [example(0, 'Success'), example(1, 'Bad credentials')],
      })
    );
    expect(badgeOf(tabs, 'headers')).toBe('2');
    expect(badgeOf(tabs, 'scripts')).toBe('1');
    expect(badgeOf(tabs, 'examples')).toBe('2');
  });

  it('badges Body with its mode string, not a count', () => {
    expect(bodyBadge({ mode: 'raw', language: 'json', text: '{}' }).badge).toBe('raw');
    expect(bodyBadge({ mode: 'formdata', fields: [] }).badge).toBe('formdata');
    expect(bodyBadge(null)).toEqual({ badge: NONE_BADGE, badgeLabel: 'none', isEmpty: true });
  });

  it('badges Auth by where the auth came from', () => {
    const own: AuthView = { source: { kind: 'own' }, authType: 'bearer', attributes: [] };
    const fromCollection: AuthView = { ...own, source: { kind: 'collection' } };
    const fromFolder: AuthView = { ...own, source: { kind: 'folder', name: 'Invoices' } };
    const none: AuthView = { source: { kind: 'none' }, authType: 'noauth', attributes: [] };

    expect(authBadge(own)).toEqual({ badge: 'bearer', badgeLabel: null, isEmpty: false });
    expect(authBadge(fromCollection).badge).toBe(INHERITED_BADGE);
    expect(authBadge(fromCollection).badgeLabel).toMatch(/inherited from collection/i);
    expect(authBadge(fromFolder).badgeLabel).toMatch(/inherited from folder Invoices/i);
    expect(authBadge(none)).toEqual({ badge: NONE_BADGE, badgeLabel: 'none', isEmpty: true });
  });

  it('marks a zero-count section empty but still badges it 0', () => {
    const tabs = buildTabs(requestDetail());
    expect(tabs.map((tab) => [tab.id, tab.badge, tab.isEmpty])).toEqual([
      ['params', '0', true],
      ['headers', '0', true],
      ['body', NONE_BADGE, true],
      ['auth', NONE_BADGE, true],
      ['scripts', '0', true],
      ['examples', '0', true],
    ]);
  });
});

describe('firstNonEmptyTabId', () => {
  // TC-U-068 at the model level — the component test asserts the rendered aria-selected.
  it('skips an empty Params tab in favour of Headers', () => {
    const tabs = buildTabs(requestDetail({ headers: [header('a'), header('b'), header('c')] }));
    expect(firstNonEmptyTabId(tabs)).toBe('headers');
  });

  it('prefers Params when it has content', () => {
    const tabs = buildTabs(
      requestDetail({ url: url('/x', { query: [param('q', '1')] }), headers: [header('a')] })
    );
    expect(firstNonEmptyTabId(tabs)).toBe('params');
  });

  it('reaches past every countable section to Body', () => {
    const tabs = buildTabs(requestDetail({ body: { mode: 'raw', language: 'json', text: '{}' } }));
    expect(firstNonEmptyTabId(tabs)).toBe('body');
  });

  it('falls back to the first tab for a request with nothing at all', () => {
    expect(firstNonEmptyTabId(buildTabs(requestDetail()))).toBe('params');
  });
});

describe('breadcrumbSegments', () => {
  it('passes a shallow path through unchanged', () => {
    expect(breadcrumbSegments(['Auth', 'Login'])).toEqual([
      { kind: 'folder', label: 'Auth' },
      { kind: 'folder', label: 'Login' },
    ]);
  });

  it('elides the middle past four levels, keeping the root and the last two', () => {
    expect(breadcrumbSegments(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual([
      { kind: 'folder', label: 'a' },
      { kind: 'ellipsis', hidden: 3 },
      { kind: 'folder', label: 'e' },
      { kind: 'folder', label: 'f' },
    ]);
  });

  it('is empty for a request at the collection root', () => {
    expect(breadcrumbSegments([])).toEqual([]);
  });
});
