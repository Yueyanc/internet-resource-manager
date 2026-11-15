import type { Domain } from '@irm/api-client';
import { CloudCog, Globe2, Mail, ParkingSquare, Sparkles } from 'lucide-react';
import type { CSSProperties } from 'react';

import { domainBrandIconUrl } from '../presets/domain-brand-icons';
import { type DomainPreset, resolveDomainPreset } from '../presets/domain-presets';
import { domainPurposeMeta } from '../utils/domain-metrics';

const purposeIcons = {
  prod: Globe2,
  personal: Sparkles,
  mail: Mail,
  cdn: CloudCog,
  parked: ParkingSquare,
} as const;

export function DomainMark({
  value,
  preset: explicitPreset,
  size = 'md',
}: {
  value?: Pick<Domain, 'presetKey' | 'registrar' | 'dnsProvider' | 'name' | 'purpose'>;
  preset?: DomainPreset;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const matched = explicitPreset ?? (value ? resolveDomainPreset(value) : undefined);
  const svgUrl = matched ? domainBrandIconUrl(matched.iconKey) : undefined;
  const purposeKey = value?.purpose ?? 'prod';
  const accentColor = matched?.color ?? domainPurposeMeta[purposeKey].color;
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

  const Icon = purposeIcons[purposeKey];
  const iconSize = size === 'xs' ? 12 : size === 'sm' ? 15 : size === 'lg' ? 22 : 19;
  return (
    <span className={`service-mark is-fallback size-${size}`} style={style} aria-hidden="true">
      <Icon size={iconSize} strokeWidth={1.75} />
    </span>
  );
}
