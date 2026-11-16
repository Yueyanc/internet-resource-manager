import type { Account } from '@irm/api-client';
import { CircleUserRound, Code2, Compass, Gamepad2, Landmark, Mail, MessageCircle, Sparkles } from 'lucide-react';
import type { CSSProperties } from 'react';

import { brandIconUrl } from '../../../shared/brand-icons';
import type { AccountPreset } from '../presets/account-presets';
import { resolveAccountPreset } from '../presets/account-presets';
import { accountCategoryMeta } from '../utils/account-metrics';

const categoryIcons = {
  email: Mail,
  social: MessageCircle,
  ecosystem: CircleUserRound,
  dev_cloud: Code2,
  ai_productivity: Sparkles,
  media_gaming: Gamepad2,
  finance_commerce: Landmark,
  other: Compass,
} as const;

export function AccountMark({
  value,
  preset: explicitPreset,
  size = 'md',
}: {
  value?: Pick<Account, 'presetKey' | 'platform' | 'category'>;
  preset?: AccountPreset;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const matched = explicitPreset ?? (value ? resolveAccountPreset(value) : undefined);
  const svgUrl = matched ? brandIconUrl(matched.iconKey) : undefined;
  const categoryKey = value?.category ?? matched?.category ?? 'other';
  const accentColor = matched?.color ?? accountCategoryMeta[categoryKey].color;
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
  const initial = (value?.platform ?? matched?.platform.zh ?? '?').trim().charAt(0).toUpperCase();
  const iconSize = size === 'xs' ? 11 : size === 'sm' ? 15 : size === 'lg' ? 22 : 19;

  return (
    <span className={`service-mark is-fallback size-${size}`} style={style} aria-hidden="true">
      {categoryKey === 'other' && initial !== '?' ? initial : <Icon size={iconSize} strokeWidth={1.75} />}
    </span>
  );
}
