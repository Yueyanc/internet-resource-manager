import { ThemeProvider } from '@irm/ui';
import dayjs from 'dayjs';
import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';

import { translator } from './messages';
import { PreferencesContext, readPreference } from './preferences-context';

export function AppProviders({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState(() => readPreference('locale', ['zh-CN', 'en-US'] as const, 'zh-CN'));
  const [mode, setMode] = useState(() => readPreference('theme', ['dark', 'light'] as const, 'light', 2));
  const [sidebar, setSidebar] = useState(() => readPreference('sidebar', ['collapsed', 'expanded'] as const, 'expanded', 2));
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.lang = locale;
    document.documentElement.style.colorScheme = mode;
    document.title = locale === 'zh-CN' ? 'IRM · 资源管家' : 'IRM · Resource Manager';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#0c0e12' : '#f6f5f1');
    dayjs.locale(locale === 'zh-CN' ? 'zh-cn' : 'en');
    try {
      localStorage.setItem('irm.locale.v1', locale);
      localStorage.setItem('irm.theme.v2', mode);
      localStorage.setItem('irm.sidebar.v2', sidebar);
    }
    catch {
      /* Preferences remain usable when browser storage is disabled. */
    }
  }, [locale, mode, sidebar]);
  return (
    <PreferencesContext.Provider value={{ locale, mode, collapsed: sidebar === 'collapsed', t: translator(locale), setLocale, setMode, toggleMode: () => setMode(value => value === 'dark' ? 'light' : 'dark'), toggleSidebar: () => setSidebar(value => value === 'collapsed' ? 'expanded' : 'collapsed') }}>
      <ThemeProvider mode={mode} locale={locale}>{children}</ThemeProvider>
    </PreferencesContext.Provider>
  );
}
