import { describe, expect, it } from 'vitest';
import { contrastRatio, meetsAA } from './contrast';
import { methodClass, methodToken } from './method';
import { methodTokens, tokens } from './tokens';
import type { ThemeName } from './tokens';

describe('contrast', () => {
  // TC-U-054 — every method, var-chip and warning color clears WCAG AA (>= 4.5:1)
  // against --background in both themes
  for (const theme of ['light', 'dark'] as const) {
    const t = tokens[theme as ThemeName];
    describe(`${theme} theme`, () => {
      it.each(methodTokens)('method-%s meets AA text contrast', (verb) => {
        const fg = (theme === 'light' ? tokens.light : tokens.dark).method[verb];
        expect(meetsAA(fg, t.background)).toBe(true);
      });

      it('var-chip color meets AA text contrast against background', () => {
        expect(meetsAA(t.varChip, t.background)).toBe(true);
      });

      it('warning color meets AA text contrast against background', () => {
        expect(meetsAA(t.warning, t.background)).toBe(true);
      });

      it('var-chip background stays a backdrop, not a text color', () => {
        expect(contrastRatio(t.varChip, t.varChipBg)).toBeGreaterThanOrEqual(4.5);
      });
    });
  }

  it('reports a sub-threshold pair as failing AA', () => {
    expect(meetsAA('oklch(0.95 0.03 290)', 'oklch(1 0 0)')).toBe(false);
  });

  // TC-U-055 — an unknown HTTP verb falls back to the neutral token
  it('maps unknown verbs to the "other" token', () => {
    expect(methodToken('PROPFIND')).toBe('other');
    expect(methodClass('PROPFIND')).toBe('text-method-other');
  });

  it('keeps every known verb on its own token', () => {
    expect(methodClass('get')).toBe('text-method-get');
    expect(methodClass('DELETE')).toBe('text-method-delete');
  });

  it('maps HEAD to the neutral token (no dedicated colour)', () => {
    expect(methodClass('HEAD')).toBe('text-method-other');
  });
});
