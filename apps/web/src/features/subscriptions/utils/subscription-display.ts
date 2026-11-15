import type { Subscription } from '@irm/api-client';

import type { Locale, Translate } from '../../../app/messages';
import { cycleUnits, remaining } from './subscription-metrics';

export function displayMoney(amount: number, currency: string, locale: Locale, compact = false) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: compact ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
}
export function cycleLabel(value: Subscription, t: Translate) {
  return value.cycle === 'custom' ? t('{count} 天', { count: value.intervalDays }) : t(cycleUnits[value.cycle]);
}
export function dueText(value: Subscription, t: Translate) {
  const days = remaining(value);
  return days < 0 ? t('已逾期 {count} 天', { count: -days }) : days === 0 ? t('今天到期') : t('剩 {count} 天', { count: days });
}
