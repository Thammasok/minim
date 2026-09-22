import { describe, expect, it } from 'vitest';
import { computeFilter, isFilterActive, matchRanges, nodeMatches, normalizeQuery } from './filter';
import { folder, request } from './tree-fixtures';

const login = request('n1', 'Login', {
  method: 'POST',
  urlPreview: '{{baseUrl}}/auth/token',
});

describe('nodeMatches', () => {
  // TC-U-062 — the filter matches against method and URL, not just name
  it('matches on the URL when the name does not contain the query', () => {
    expect(nodeMatches(login, 'token')).toBe(true);
    expect(login.name.toLowerCase().includes('token')).toBe(false);
  });

  it('matches on the method', () => {
    expect(nodeMatches(login, 'post')).toBe(true);
  });

  // TC-UNIT-044 — name, URL and method, case-insensitive substring
  it('is a case-insensitive substring match, never prefix-only and never fuzzy', () => {
    const invoice = request('n2', 'Get invoice', {
      method: 'GET',
      urlPreview: '{{baseUrl}}/invoices/:id',
    });
    for (const query of ['INVOICE', 'get', '{{base', '/invoices/']) {
      expect(nodeMatches(invoice, normalizeQuery(query))).toBe(true);
    }
    expect(nodeMatches(invoice, 'zzz')).toBe(false);
    // fuzzy would match "gti"; substring must not
    expect(nodeMatches(invoice, 'gti')).toBe(false);
  });

  // TC-UNIT-045 — regex metacharacters are literal and never throw
  it('treats regex metacharacters as literal text', () => {
    const dotted = request('a', 'a.b');
    const plain = request('b', 'axb');
    expect(nodeMatches(dotted, 'a.b')).toBe(true);
    expect(nodeMatches(plain, 'a.b')).toBe(false);
    for (const query of ['.*', '(', '[a-']) {
      expect(() => nodeMatches(dotted, query)).not.toThrow();
      expect(nodeMatches(dotted, query)).toBe(false);
    }
  });
});

describe('normalizeQuery / isFilterActive', () => {
  // TC-UNIT-046 (pin) — a whitespace-only query is not a query
  it('treats a whitespace-only query as no filter at all', () => {
    expect(normalizeQuery('   ')).toBe('');
    expect(isFilterActive('   ')).toBe(false);
    expect(isFilterActive('\t\n')).toBe(false);
    expect(isFilterActive(' a ')).toBe(true);
  });
});

describe('computeFilter', () => {
  const tree = [
    folder('f-invoices', 'Invoices', [
      folder('f-drafts', 'Drafts', [
        request('r-list', 'List invoices'),
        request('r-create', 'Create invoice'),
      ]),
    ]),
    folder('f-auth', 'Auth', [request('r-login', 'Login', { urlPreview: '{{baseUrl}}/auth' })]),
  ];

  it('is inactive for an empty query and shows the whole tree', () => {
    const result = computeFilter(tree, '');
    expect(result.active).toBe(false);
    expect(result.visibleIds).toBeNull();
    expect(result.matchCount).toBe(0);
  });

  // TC-U-063 (set level) — ancestors are visible but are not matches
  it('retains ancestors as context without counting them as matches', () => {
    const result = computeFilter(tree, 'invoice');
    expect(result.active).toBe(true);
    expect([...(result.visibleIds ?? [])].sort()).toEqual(
      ['f-drafts', 'f-invoices', 'r-create', 'r-list'].sort()
    );
    expect(result.matchIds.has('f-drafts')).toBe(false);
    // the folder itself is named "Invoices", so it is a genuine match — "Drafts" is not
    expect(result.matchIds.has('r-list')).toBe(true);
    expect(result.matchIds.has('r-create')).toBe(true);
  });

  it('counts matching request leaves only — folders never inflate "n of m"', () => {
    // "Invoices" the folder matches too, but the count is over requests
    expect(computeFilter(tree, 'invoice').matchCount).toBe(2);
    expect(computeFilter(tree, 'drafts').matchCount).toBe(0);
  });

  it('returns nothing visible when nothing matches', () => {
    const result = computeFilter(tree, 'zzz');
    expect(result.matchCount).toBe(0);
    expect(result.visibleIds?.size).toBe(0);
  });
});

describe('matchRanges', () => {
  it('finds every literal occurrence, case-insensitively', () => {
    expect(matchRanges('Invoice invoice', 'invoice')).toEqual([
      { start: 0, end: 7 },
      { start: 8, end: 15 },
    ]);
    expect(matchRanges('a.b', '.')).toEqual([{ start: 1, end: 2 }]);
    expect(matchRanges('anything', '')).toEqual([]);
  });
});
