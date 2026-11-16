import { createContext, useContext } from 'react';

import type { Locale, Translate } from './messages';
import { translator } from './messages';

export type ColorMode = 'dark' | 'light';
export const PreferencesContext = createContext<{
  locale: Locale; mode: ColorMode; collapsed: boolean; t: Translate;
  setLocale: (locale: Locale) => void; setMode: (mode: ColorMode) => void; toggleMode: () => void; toggleSidebar: () => void;
}>({ locale: 'zh-CN', mode: 'light', collapsed: false, t: translator('zh-CN'), setLocale: () => {
}, setMode: () => {
}, toggleMode: () => {
}, toggleSidebar: () => {
} });

export function usePreferences() {
  return useContext(PreferencesContext);
}

export function readPreference<T extends string>(key: string, allowed: readonly T[], fallback: T, version = 1): T {
  try {
    const value = localStorage.getItem(`irm.${key}.v${version}`);
    return allowed.find(item => item === value) ?? fallback;
  }
  catch {
    return fallback;
  }
}
