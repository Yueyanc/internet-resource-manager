import type { Preferences, Subscription } from '@irm/api-client';
import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import { futureDate, metrics, nextDate, renewalEvents } from './subscription-metrics';

const prefs: Preferences = { baseCurrency: 'CNY', rates: { CNY: 1, USD: 7, HKD: 0.9, EUR: 8, GBP: 9, JPY: 0.05 } };
const base: Subscription = { id: 'test', presetKey: '', name: 'Test', amountMinor: 2000, currency: 'USD', cycle: 'monthly', intervalDays: 0, dueDate: '2026-11-18', category: 'ai', renewalMode: 'auto', intention: 'cancel', renewalAmountMinor: 0, account: '', accountId: '', billingAccountId: '', paymentMethod: '', managementUrl: '', notes: '', archived: false, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' };

describe('subscription estimates', () => {
  it('normalizes periodic costs, excludes archived and once-only charges from recurring budgets', () => {
    const result = metrics([base, { ...base, id: 'annual', currency: 'CNY', amountMinor: 12000, cycle: 'yearly' }, { ...base, id: 'once', currency: 'CNY', amountMinor: 10000, cycle: 'once' }, { ...base, archived: true }], prefs, dayjs('2026-11-13'));

    expect(result.monthly).toBe(150);

    expect(result.yearly).toBe(1800);

    expect(result.pendingAmount).toBe(360);

    expect(result.expiring).toBe(3);

    expect(result.cancelling).toBe(3);
  });

  it('counts each custom-cycle bill and excludes earlier dates from remaining cash flow', () => {
    const item = { ...base, dueDate: '2026-11-01', cycle: 'custom' as const, intervalDays: 7 };

    expect(renewalEvents([item], '2026-11-13', '2026-11-30').map(event => event.date)).toEqual(['2026-11-15', '2026-11-22', '2026-11-29']);

    expect(metrics([item], prefs, dayjs('2026-11-13')).pendingAmount).toBe(420);
  });

  it('converts through CNY when the base currency changes', () => {
    expect(metrics([base], { ...prefs, baseCurrency: 'USD' }, dayjs('2026-11-13')).monthly).toBe(20);
  });

  it('clamps month-end and leap-year dates consistently with the server', () => {
    expect(nextDate('2026-01-31', 'monthly', 0)).toBe('2026-02-28');

    expect(nextDate('2028-02-29', 'yearly', 0)).toBe('2029-02-28');

    expect(nextDate('2026-11-13', 'custom', 180)).toBe('2027-05-12');

    expect(futureDate('2026-01-31', 'monthly', 0, '2026-03-10')).toBe('2026-03-28');
  });
});
