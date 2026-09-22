import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from './theme-provider';
import { useTheme } from './theme-context';
import { THEME_STORAGE_KEY } from './theme';
import type { ThemePref } from './theme';

function Harness() {
  const { theme, prefs, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="resolved">{theme}</span>
      <span data-testid="prefs">{prefs}</span>
      <button type="button" onClick={() => setTheme('light' as ThemePref)}>
        light
      </button>
      <button type="button" onClick={() => setTheme('dark' as ThemePref)}>
        dark
      </button>
      <button type="button" onClick={() => setTheme('system' as ThemePref)}>
        system
      </button>
    </div>
  );
}

function installMatchMedia(dark: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches: dark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
    dispatchEvent: vi.fn(() => false),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql)
  );
  return {
    mql,
    setMatches(value: boolean) {
      mql.matches = value;
      listeners.forEach((listener) => listener());
    },
  };
}

function renderWithTheme() {
  return render(
    <ThemeProvider>
      <Harness />
    </ThemeProvider>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // TC-U-056 — no stored override, system prefers dark → documentElement is dark
  it('defaults to the system preference when nothing is stored', () => {
    installMatchMedia(true);
    renderWithTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(screen.getByTestId('prefs')).toHaveTextContent('system');
  });

  // TC-U-057 — a stored override beats the system preference
  it('lets a manual light override win over a dark system preference', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    installMatchMedia(true);
    renderWithTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
  });

  it('applies a manual dark override immediately', () => {
    installMatchMedia(false);
    renderWithTheme();
    fireEvent.click(screen.getByRole('button', { name: 'dark' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('tracks system-preference changes while no override is set', () => {
    const { setMatches } = installMatchMedia(false);
    renderWithTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    act(() => setMatches(true));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
  });

  it('stops tracking system changes after a manual override', () => {
    const { setMatches } = installMatchMedia(false);
    renderWithTheme();
    fireEvent.click(screen.getByRole('button', { name: 'light' }));
    act(() => setMatches(true));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
