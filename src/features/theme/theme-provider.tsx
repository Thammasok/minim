import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { ThemeContext } from './theme-context';
import type { ThemeContextValue } from './theme-context';
import { applyThemeClass, getSystemTheme, readThemePref, THEME_STORAGE_KEY } from './theme';
import type { ResolvedTheme, ThemePref } from './theme';

const SYSTEM_QUERY = '(prefers-color-scheme: dark)';

function subscribeToSystem(callback: () => void): () => void {
  if (typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const media = window.matchMedia(SYSTEM_QUERY);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

const neverSubscribe = () => () => {};

const getSystemDark = (): boolean => getSystemTheme() === 'dark';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ThemePref>(readThemePref);
  const systemDark = useSyncExternalStore(
    prefs === 'system' ? subscribeToSystem : neverSubscribe,
    getSystemDark,
    getSystemDark
  );

  const theme: ResolvedTheme = prefs === 'system' ? (systemDark ? 'dark' : 'light') : prefs;

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const setThemePref = useCallback((pref: ThemePref) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref);
    setPrefs(pref);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, prefs, setTheme: setThemePref }),
    [theme, prefs, setThemePref]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
