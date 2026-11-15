import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { filterIpPresets, findIpPreset, ipPresets, resolveIpPreset } from './ip-presets';

describe('ipPresets', () => {
  it('bundles a valid local SVG brand asset and valid console URLs for every IP preset', () => {
    expect(ipPresets.length).toBeGreaterThanOrEqual(20);
    const seen = new Set<string>();
    for (const preset of ipPresets) {
      expect(seen.has(preset.key)).toBe(false);
      seen.add(preset.key);
      const ipSvg = path.resolve(import.meta.dirname, `../assets/brands/${preset.iconKey}.svg`);
      const accountSvg = path.resolve(import.meta.dirname, `../../accounts/assets/brands/${preset.iconKey}.svg`);
      const sharedSvg = path.resolve(import.meta.dirname, `../../subscriptions/assets/brands/${preset.iconKey}.svg`);
      const target = existsSync(ipSvg) ? ipSvg : existsSync(accountSvg) ? accountSvg : sharedSvg;
      expect(existsSync(target), `Missing SVG for ${preset.key} (${preset.iconKey})`).toBe(true);
      const content = readFileSync(target, 'utf8');
      expect(content).toContain('<svg');
      expect(content).toContain('xmlns="http://www.w3.org/2000/svg"');
      if (preset.consoleUrl) {
        const parsed = new URL(preset.consoleUrl);
        expect(['http:', 'https:']).toContain(parsed.protocol);
        expect(parsed.username).toBe('');
      }
    }
  });

  it('supports instant search across residential ISP, VPS, CN transit, and overlay aliases', () => {
    expect(filterIpPresets('美国家宽', 'popular').map(item => item.key)).toContain('att_fiber');
    expect(filterIpPresets('bwg', 'popular').map(item => item.key)).toContain('bandwagon');
    expect(filterIpPresets('cmin2', 'popular').map(item => item.key)).toContain('dmit');
    expect(filterIpPresets('100.64', 'popular').map(item => item.key)).toContain('tailscale');
    expect(filterIpPresets('沪日', 'popular').map(item => item.key)).toContain('aliyun_eip');
  });

  it('resolves explicit preset keys first and falls back to recognizable provider names', () => {
    expect(resolveIpPreset({ presetKey: 'dmit', provider: '主力节点' })?.key).toBe('dmit');
    expect(resolveIpPreset({ presetKey: '', provider: 'AT&T Residential' })?.key).toBe('att_fiber');
    expect(resolveIpPreset({ presetKey: '', provider: 'Tailscale Exit' })?.key).toBe('tailscale');
    expect(resolveIpPreset({ presetKey: '', provider: 'Unknown Private Colocation' })).toBeUndefined();
    expect(findIpPreset('hinet_tw')?.region).toBe('TW');
  });
});
