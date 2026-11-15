import type { Preferences, Subscription } from '@irm/api-client';
import dayjs from 'dayjs';
export const categories = {
  ai: { label: 'AI 与生产力', color: '#16815d', background: '#eaf6ef' },
  cloud: { label: '服务器与云', color: '#5279b8', background: '#edf3fc' },
  network: { label: '域名与网络', color: '#39939e', background: '#ecf7f8' },
  software: { label: '软件与工具', color: '#8b68a8', background: '#f5eff9' },
  life: { label: '影音与生活', color: '#c27b3f', background: '#fff5e9' },
  telecom: { label: '通信与保号', color: '#bd6285', background: '#fbedf3' },
  other: { label: '其他', color: '#7b8591', background: '#f1f3f5' },
} as const;
export const cycles = { monthly: '月付', quarterly: '季付', halfyear: '半年付', yearly: '年付', biennial: '两年付', triennial: '三年付', once: '一次性买断', custom: '自定义天数' } as const;
export const cycleUnits = { monthly: '月', quarterly: '季', halfyear: '半年', yearly: '年', biennial: '两年', triennial: '三年', once: '一次', custom: '周期' } as const;
const months = { monthly: 1, quarterly: 3, halfyear: 6, yearly: 12, biennial: 24, triennial: 36 };
export function nextDate(date: string, cycle: Subscription['cycle'], intervalDays: number) {
  if (cycle === 'once')
    return null;

  return (cycle === 'custom' ? dayjs(date).add(intervalDays, 'day') : dayjs(date).add(months[cycle], 'month')).format('YYYY-MM-DD');
}
export function futureDate(start: string, cycle: Subscription['cycle'], intervalDays: number, today = dayjs().format('YYYY-MM-DD')) {
  let date = start;

  for (let i = 0; date < today && i < 120000; i++) {
    const next = nextDate(date, cycle, intervalDays);

    if (!next || next <= date)
      return date;

    date = next;
  }

  return date;
}
export function convert(amountMinor: number, currency: Subscription['currency'], prefs: Preferences) {
  return amountMinor / 100 * prefs.rates[currency] / prefs.rates[prefs.baseCurrency];
}
export function monthlyCost(value: Subscription, prefs: Preferences) {
  const amount = convert(value.amountMinor, value.currency, prefs);

  if (value.cycle === 'once')
    return 0;

  if (value.cycle === 'custom')
    return amount * 365.2425 / 12 / value.intervalDays;

  return amount / months[value.cycle];
}
export function money(amount: number, currency = 'CNY') {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}
export function remaining(value: Subscription, today = dayjs()) {
  return dayjs(value.dueDate).diff(today.startOf('day'), 'day');
}
export function dueLabel(days: number) {
  return days < 0 ? `已逾期 ${-days} 天` : days === 0 ? '今天到期' : `剩 ${days} 天`;
}
export function periodDays(value: Subscription) {
  if (value.cycle === 'once')
    return 1;

  if (value.cycle === 'custom')
    return value.intervalDays;

  return dayjs(value.dueDate).diff(dayjs(value.dueDate).subtract(months[value.cycle], 'month'), 'day');
}
export type RenewalEvent = {
  date: string;
  subscription: Subscription;
};
// Forecast from the next recorded due date; never mutate the stored renewal state.
export function renewalEvents(items: Subscription[], from: string, to: string): RenewalEvent[] {
  const events: RenewalEvent[] = [];

  for (const value of items.filter(item => !item.archived)) {
    let date = futureDate(value.dueDate, value.cycle, value.intervalDays, from);

    for (let i = 0; date <= to && i < 32; i++) {
      if (date >= from)
        events.push({ date, subscription: value });

      const next = nextDate(date, value.cycle, value.intervalDays);

      if (!next || next <= date)
        break;

      date = next;
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.subscription.name.localeCompare(b.subscription.name));
}
export function metrics(items: Subscription[], prefs: Preferences, today = dayjs()) {
  const active = items.filter(item => !item.archived);

  const monthly = active.reduce((sum, item) => sum + monthlyCost(item, prefs), 0);

  const pending = renewalEvents(active, today.format('YYYY-MM-DD'), today.endOf('month').format('YYYY-MM-DD'));

  const expiring = active.filter(item => remaining(item, today) >= 0 && remaining(item, today) <= 30);

  const cancelling = expiring.filter(item => item.intention === 'cancel' && item.renewalMode === 'auto');

  const breakdown = Object.entries(categories).map(([key, category]) => ({ ...category, key, amount: active.filter(item => item.category === key).reduce((sum, item) => sum + monthlyCost(item, prefs), 0) })).filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount);

  return { monthly, yearly: monthly * 12, pendingCount: pending.length, pendingAmount: pending.reduce((sum, event) => sum + convert(event.subscription.amountMinor, event.subscription.currency, prefs), 0), expiring: expiring.length, cancelling: cancelling.length, breakdown };
}
