import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  // TC-U-002 — conflicting Tailwind classes resolve last-wins
  it('keeps only the last of two conflicting padding classes', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
