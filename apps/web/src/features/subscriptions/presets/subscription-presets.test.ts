import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { currencies } from '@irm/api-client';
import { describe, expect, it } from 'vitest';

import { filterPresets, findPreset, resolvePreset, subscriptionPresets } from './subscription-presets';

describe('subscriptionPresets', () => {
  it('bundles a valid local SVG brand asset and valid plan tiers for every preset', () => {
    expect(subscriptionPresets.length).toBeGreaterThanOrEqual(50);
    const seen = new Set<string>();
    for (const preset of subscriptionPresets) {
      expect(seen.has(preset.key)).toBe(false);
      seen.add(preset.key);
      const svgPath = path.resolve(import.meta.dirname, `../assets/brands/${preset.key}.svg`);
      expect(existsSync(svgPath), `Missing SVG for ${preset.key}`).toBe(true);
      const content = readFileSync(svgPath, 'utf8');
      expect(content).toContain('<svg');
      expect(content).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(content).not.toMatch(/<rect(?![^>]*\bwidth=)/);
      expect(content).not.toMatch(/<rect(?![^>]*\bheight=)/);
      expect(preset.plans.length).toBeGreaterThan(0);
      if (preset.managementUrl) {
        const parsed = new URL(preset.managementUrl);
        expect(['http:', 'https:']).toContain(parsed.protocol);
        expect(preset.managementUrl.includes(' ')).toBe(false);
      }
      for (const plan of preset.plans) {
        expect(currencies).toContain(plan.currency);
        expect(plan.amount).toBeGreaterThanOrEqual(0);
      }
    }
    const brandFiles = readdirSync(path.resolve(import.meta.dirname, '../assets/brands')).filter(file => file.endsWith('.svg'));
    expect(brandFiles.length).toBe(seen.size);
  });

  it('supports instant search across Chinese names, aliases, pinyin initials, and English names', () => {
    expect(filterPresets('b站', 'popular').map(item => item.key)).toContain('bilibili');
    expect(filterPresets('bz', 'popular').map(item => item.key)).toContain('bilibili');
    expect(filterPresets('绿钻', 'popular').map(item => item.key)).toContain('qq_music');
    expect(filterPresets('gpt', 'popular').map(item => item.key)).toContain('chatgpt');
    expect(filterPresets('88vip', 'popular').map(item => item.key)).toContain('vip_88');
    expect(filterPresets('苹果开发者', 'popular').map(item => item.key)).toContain('apple_developer');
    expect(filterPresets('adp', 'popular').map(item => item.key)).toContain('apple_developer');
    expect(filterPresets('谷歌开发者', 'popular').map(item => item.key)).toContain('google_developer');
    expect(filterPresets('play console', 'popular').map(item => item.key)).toContain('google_developer');
    expect(filterPresets('supergrok', 'popular').map(item => item.key)).toContain('grok');
  });

  it('assigns a distinct default itemName to every plan tier across AI & Dev presets', () => {
    const aiDevPresets = subscriptionPresets.filter(preset => preset.group === 'ai_dev');
    expect(aiDevPresets.length).toBeGreaterThanOrEqual(15);
    for (const preset of aiDevPresets) {
      const zhNames = preset.plans.map(plan => plan.itemName.zh);
      const enNames = preset.plans.map(plan => plan.itemName.en);
      expect(new Set(zhNames).size, `Duplicate zh itemName in ${preset.key}: ${zhNames.join(', ')}`).toBe(zhNames.length);
      expect(new Set(enNames).size, `Duplicate en itemName in ${preset.key}: ${enNames.join(', ')}`).toBe(enNames.length);
    }
  });

  it('resolves explicit preset keys first and falls back to recognizable brand names', () => {
    expect(resolvePreset({ presetKey: 'bilibili', name: '大号会员' })?.key).toBe('bilibili');
    expect(resolvePreset({ presetKey: '', name: 'ChatGPT Plus' })?.key).toBe('chatgpt');
    expect(resolvePreset({ presetKey: '', name: 'Apple Developer Program' })?.key).toBe('apple_developer');
    expect(resolvePreset({ presetKey: '', name: 'Google Play 开发者账号' })?.key).toBe('google_developer');
    expect(resolvePreset({ presetKey: '', name: 'SuperGrok Heavy' })?.key).toBe('grok');
    expect(resolvePreset({ presetKey: '', name: 'Spotify Premium' })?.key).toBe('spotify');
    expect(resolvePreset({ presetKey: '', name: 'AlphaVPS 1TB Storage' })?.key).toBe('alphavps');
    expect(filterPresets('alphavps', 'popular').map(item => item.key)).toContain('alphavps');
    expect(resolvePreset({ presetKey: '', name: 'Internal Custom Service' })).toBeUndefined();
    expect(findPreset('qq_music')?.name.zh).toBe('QQ 音乐');
  });
});
