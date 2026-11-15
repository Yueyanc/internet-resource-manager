import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { accountPresets, filterAccountPresets, findAccountPreset, resolveAccountPreset } from './account-presets';

describe('accountPresets', () => {
  it('bundles a valid local SVG brand asset and valid URLs for every account preset', () => {
    expect(accountPresets.length).toBeGreaterThanOrEqual(35);
    const seen = new Set<string>();
    for (const preset of accountPresets) {
      expect(seen.has(preset.key)).toBe(false);
      seen.add(preset.key);
      const accountSvg = path.resolve(import.meta.dirname, `../assets/brands/${preset.iconKey}.svg`);
      const sharedSvg = path.resolve(import.meta.dirname, `../../subscriptions/assets/brands/${preset.iconKey}.svg`);
      const target = existsSync(accountSvg) ? accountSvg : sharedSvg;
      expect(existsSync(target), `Missing SVG for ${preset.key} (${preset.iconKey})`).toBe(true);
      const content = readFileSync(target, 'utf8');
      expect(content).toContain('<svg');
      expect(content).toContain('xmlns="http://www.w3.org/2000/svg"');
      if (preset.securityUrl) {
        const parsed = new URL(preset.securityUrl);
        expect(['http:', 'https:']).toContain(parsed.protocol);
        expect(parsed.username).toBe('');
      }
    }
  });

  it('supports instant search across domestic & global names, aliases, and pinyin initials', () => {
    expect(filterAccountPresets('小红书', 'popular').map(item => item.key)).toContain('xiaohongshu');
    expect(filterAccountPresets('xhs', 'popular').map(item => item.key)).toContain('xiaohongshu');
    expect(filterAccountPresets('gv', 'popular').map(item => item.key)).toContain('google_voice');
    expect(filterAccountPresets('美区', 'popular').map(item => item.key)).toContain('apple');
    expect(filterAccountPresets('163', 'popular').map(item => item.key)).toContain('netease_mail');
  });

  it('resolves explicit preset keys first and falls back to recognizable platform names', () => {
    expect(resolveAccountPreset({ presetKey: 'wechat', platform: '主力通讯' })?.key).toBe('wechat');
    expect(resolveAccountPreset({ presetKey: '', platform: 'Apple ID' })?.key).toBe('apple');
    expect(resolveAccountPreset({ presetKey: '', platform: 'Proton Mail' })?.key).toBe('proton');
    expect(resolveAccountPreset({ presetKey: '', platform: 'Private Intranet SSO' })).toBeUndefined();
    expect(findAccountPreset('gmail')?.platform.zh).toBe('Gmail');
  });
});
