import type { IpNode, IpUnlockService } from '@irm/api-client';
import { Cloud, Home, Network, Route, Server, Wifi } from 'lucide-react';
import type { CSSProperties } from 'react';

import { ipBrandIconUrl } from '../presets/ip-brand-icons';
import type { IpPreset } from '../presets/ip-presets';
import { resolveIpPreset } from '../presets/ip-presets';
import { ipCategoryMeta, ipUnlockMeta } from '../utils/ip-metrics';

const categoryIcons = {
  residential_isp: Home,
  cloud_vps: Server,
  floating_eip: Cloud,
  transit_relay: Route,
  home_ddns: Wifi,
  overlay_subnet: Network,
} as const;

export function IpMark({
  value,
  preset: explicitPreset,
  size = 'md',
}: {
  value?: Pick<IpNode, 'presetKey' | 'provider' | 'category'>;
  preset?: IpPreset;
  size?: 'sm' | 'md' | 'lg';
}) {
  const matched = explicitPreset ?? (value ? resolveIpPreset(value) : undefined);
  const svgUrl = matched ? ipBrandIconUrl(matched.iconKey) : undefined;
  const categoryKey = value?.category ?? matched?.category ?? 'cloud_vps';
  const accentColor = matched?.color ?? ipCategoryMeta[categoryKey].color;
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

  const Icon = categoryIcons[categoryKey];
  return (
    <span className={`service-mark is-fallback size-${size}`} style={style} aria-hidden="true">
      <Icon size={size === 'sm' ? 15 : size === 'lg' ? 22 : 19} strokeWidth={1.75} />
    </span>
  );
}

export function UnlockServiceIcon({ service }: { service: IpUnlockService }) {
  const meta = ipUnlockMeta[service];
  const svgUrl = ipBrandIconUrl(meta.iconKey);
  const style = { '--mark-color': meta.color } as CSSProperties;

  if (svgUrl) {
    return (
      <span
        className={`service-mark is-brand size-sm ${meta.darkInvert ? 'is-dark-invert' : ''}`}
        style={style}
        aria-hidden="true"
      >
        <img src={svgUrl} alt="" draggable={false} className="service-brand-svg" />
      </span>
    );
  }

  return (
    <span className="service-mark is-fallback size-sm" style={style} aria-hidden="true">
      {meta.short.slice(0, 2)}
    </span>
  );
}
