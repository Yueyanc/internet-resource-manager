import { afterEach, describe, expect, it, vi } from 'vitest';

import { english, translator } from './messages';
import { readPreference } from './preferences-context';

afterEach(() => vi.unstubAllGlobals());

describe('appearance and language preferences', () => {
  it('provides English translations and interpolates values without translating user data', () => {
    expect(translator('en-US')('订阅管理')).toBe('Subscriptions');
    expect(translator('en-US')('查看 {name}', { name: '我的 VPS' })).toBe('View 我的 VPS');
    expect(translator('zh-CN')('剩 {count} 天', { count: 3 })).toBe('剩 3 天');
    expect(Object.values(english).every(value => value.length > 0)).toBe(true);
  });
  it('rejects malformed saved options and falls back when browser storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'invalid' });
    expect(readPreference('theme', ['dark', 'light'], 'dark')).toBe('dark');
    vi.stubGlobal('localStorage', { getItem: () => {
      throw new Error('disabled');
    } });
    expect(readPreference('locale', ['zh-CN', 'en-US'], 'zh-CN')).toBe('zh-CN');
  });
  it('restores supported saved values', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'light' });
    expect(readPreference('theme', ['dark', 'light'], 'dark')).toBe('light');
  });
  it('resets the former custom appearance without changing language or new saved preferences', () => {
    const values: Record<string, string> = { 'irm.theme.v1': 'dark', 'irm.sidebar.v1': 'collapsed', 'irm.locale.v1': 'en-US' };
    vi.stubGlobal('localStorage', { getItem: (key: string) => values[key] ?? null });
    expect(readPreference('theme', ['dark', 'light'], 'light', 2)).toBe('light');
    expect(readPreference('sidebar', ['collapsed', 'expanded'], 'expanded', 2)).toBe('expanded');
    expect(readPreference('locale', ['zh-CN', 'en-US'], 'zh-CN')).toBe('en-US');
    values['irm.theme.v2'] = 'dark';
    expect(readPreference('theme', ['dark', 'light'], 'light', 2)).toBe('dark');
  });
});
