import type { Subscription } from '@irm/api-client';
import { Cloud, Code2, Globe2, Music2, Radio, Sparkles } from 'lucide-react';
import type { CSSProperties } from 'react';

import { brandIconUrl } from '../presets/brand-icons';
import type { SubscriptionPreset } from '../presets/subscription-presets';
import { resolvePreset } from '../presets/subscription-presets';
import { categories } from '../utils/subscription-metrics';

const categoryIcons = {
  ai: Sparkles,
  cloud: Cloud,
  network: Globe2,
  software: Code2,
  life: Music2,
  telecom: Radio,
} as const;

export function ServiceMark({
  value,
  preset: explicitPreset,
  size = 'md',
}: {
  value?: Pick<Subscription, 'presetKey' | 'name' | 'category'>;
  preset?: SubscriptionPreset;
  size?: 'sm' | 'md' | 'lg';
}) {
  const matched = explicitPreset ?? (value ? resolvePreset(value) : undefined);
  const svgUrl = matched ? brandIconUrl(matched.key) : undefined;
  const categoryKey = value?.category ?? matched?.category ?? 'other';
  const accentColor = matched?.color ?? categories[categoryKey].color;
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

  const Icon = categoryKey === 'other' ? undefined : categoryIcons[categoryKey];
  const initial = (value?.name ?? matched?.name.zh ?? '?').trim().charAt(0).toUpperCase();

  return (
    <span className={`service-mark is-fallback size-${size}`} style={style} aria-hidden="true">
      {Icon ? <Icon size={size === 'sm' ? 15 : size === 'lg' ? 22 : 19} strokeWidth={1.75} /> : initial}
    </span>
  );
}
