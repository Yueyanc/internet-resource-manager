import type { ServerHost } from '@irm/api-client';
import { Cpu, HardDrive, Home, Network, Server } from 'lucide-react';
import type { CSSProperties } from 'react';

import { brandIconUrl } from '../../../shared/brand-icons';
import type { ServerPreset } from '../presets/server-presets';
import { resolveServerPreset } from '../presets/server-presets';
import { serverKindMeta } from '../utils/server-metrics';

const kindIcons = {
  vps: Server,
  dedicated: Cpu,
  nat: Network,
  homelab: Home,
  nas: HardDrive,
} as const;

export function ServerMark({
  value,
  preset: explicitPreset,
  size = 'md',
}: {
  value?: Pick<ServerHost, 'presetKey' | 'provider' | 'name' | 'kind'>;
  preset?: ServerPreset;
  size?: 'sm' | 'md' | 'lg';
}) {
  const matched = explicitPreset ?? (value ? resolveServerPreset(value) : undefined);
  const svgUrl = matched ? brandIconUrl(matched.iconKey) : undefined;
  const kindKey = value?.kind ?? matched?.kind ?? 'vps';
  const accentColor = matched?.color ?? serverKindMeta[kindKey].color;
  const style = { '--mark-color': accentColor } as CSSProperties;

  if (matched && svgUrl) {
    return (
      <span
        className={`service-mark is-brand size-${size} ${matched.darkInvert ? 'is-dark-invert' : ''}`}
        style={style}
        aria-hidden="true"
      >
        <img src={svgUrl} alt="" draggable={false} className="service-brand-svg" />
      </span>
    );
  }

  const Icon = kindIcons[kindKey];
  return (
    <span className={`service-mark is-fallback size-${size}`} style={style} aria-hidden="true">
      <Icon size={size === 'sm' ? 15 : size === 'lg' ? 22 : 19} strokeWidth={1.75} />
    </span>
  );
}
