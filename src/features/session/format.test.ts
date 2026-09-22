import { describe, expect, it } from 'vitest';
import { middleTruncatePath, requestCountLabel } from './format';

describe('requestCountLabel', () => {
  it('pluralises the count', () => {
    expect(requestCountLabel(214)).toBe('214 requests');
    expect(requestCountLabel(1)).toBe('1 request');
    expect(requestCountLabel(0)).toBe('0 requests');
  });
});

describe('middleTruncatePath', () => {
  it('leaves a short path alone', () => {
    expect(middleTruncatePath('/work/billing.json')).toBe('/work/billing.json');
  });

  // ux §S1 — middle-truncated, never head-truncated: the file name identifies the row.
  it('drops the middle and keeps the file name', () => {
    const path = '/Users/someone/very/deeply/nested/work/folder/billing.postman.json';
    const truncated = middleTruncatePath(path, 40);

    expect(truncated.length).toBeLessThanOrEqual(40);
    expect(truncated).toContain('…');
    expect(truncated.endsWith('billing.postman.json')).toBe(true);
    expect(truncated.startsWith('/Users')).toBe(true);
  });

  it('keeps the tail when the file name alone fills the budget', () => {
    const path = '/a/an-extremely-long-collection-file-name-indeed.json';
    const truncated = middleTruncatePath(path, 20);

    expect(truncated.length).toBeLessThanOrEqual(20);
    expect(truncated.startsWith('…')).toBe(true);
    expect(path.endsWith(truncated.slice(1))).toBe(true);
  });
});
