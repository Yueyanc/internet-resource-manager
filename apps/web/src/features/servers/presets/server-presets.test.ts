import { describe, expect, it } from 'vitest';

import { filterServerPresets, findServerPreset, resolveServerPreset, serverPresets } from './server-presets';

describe('server presets', () => {
  it('has unique keys and valid default fields', () => {
    const seen = new Set<string>();
    for (const preset of serverPresets) {
      expect(seen.has(preset.key)).toBe(false);
      seen.add(preset.key);
      expect(preset.provider.zh.length).toBeGreaterThan(0);
      expect(preset.provider.en.length).toBeGreaterThan(0);
    }
  });

  it('filters popular and keyword queries acrossgroups', () => {
    const popular = filterServerPresets('', 'popular');
    expect(popular.length).toBeGreaterThanOrEqual(6);

    const byKeyword = filterServerPresets('搬瓦工', 'homelab_nas');
    expect(byKeyword.map(item => item.key)).toContain('bandwagon');

    const pve = filterServerPresets('proxmox', 'popular');
    expect(pve.map(item => item.key)).toContain('proxmox');
  });

  it('resolves preset by presetKey or provider keyword fallback', () => {
    expect(findServerPreset('hetzner')?.provider.en).toBe('Hetzner');
    expect(resolveServerPreset({ presetKey: 'dmit', provider: '', name: 'Test' })?.key).toBe('dmit');
    expect(resolveServerPreset({ presetKey: '', provider: 'Synology', name: 'NAS-01' })?.key).toBe('synology');
  });
});
