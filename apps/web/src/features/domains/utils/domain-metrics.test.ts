import type { Domain, Subscription } from '@irm/api-client';
import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import {
  computeDomainMetrics,
  inspectDomain,
  maskDomainName,
  normalizeDomainDraft,
  resolveDomainExpiry,
} from './domain-metrics';

function makeDomain(overrides: Partial<Domain> = {}): Domain {
  return {
    id: 'dom-1',
    presetKey: 'cloudflare',
    name: 'craftstudio.io',
    registrar: 'Cloudflare',
    dnsProvider: 'Cloudflare DNS',
    purpose: 'prod',
    status: 'active',
    expireDate: '2026-12-10',
    autoRenew: true,
    whoisPrivacy: true,
    icpStatus: 'none',
    icpNumber: '',
    managementUrl: 'https://dash.cloudflare.com',
    subscriptionId: '',
    registrarAccountId: '',
    serverIds: [],
    ipIds: [],
    tags: [],
    notes: '',
    archived: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('domain-metrics', () => {
  it('normalizes URLs and inspects multi-part TLDs & subdomains', () => {
    expect(normalizeDomainDraft('https://API.Example.com.cn:8443/v1/health')).toBe('api.example.com.cn');

    const info = inspectDomain('https://api.example.com.cn/docs');
    expect(info.state).toBe('valid');
    expect(info.apex).toBe('example.com.cn');
    expect(info.tld).toBe('.COM.CN');
    expect(info.isSubdomain).toBe(true);
  });

  it('masks domain names while preserving TLD suffixes', () => {
    expect(maskDomainName('craftstudio.io')).toBe('cr***.io');
    expect(maskDomainName('portal.acme.com.cn')).toBe('po***.com.cn');
  });

  it('resolves subscription vs manual expiry and computes portfolio metrics', () => {
    const today = dayjs('2026-11-01');
    const sub: Subscription = {
      id: 'sub-1',
      presetKey: 'cloudflare',
      name: 'craftstudio.io Renewal',
      amountMinor: 1200,
      currency: 'USD',
      cycle: 'yearly',
      intervalDays: 0,
      dueDate: '2026-11-25',
      category: 'cloud',
      renewalMode: 'auto',
      intention: 'keep',
      renewalAmountMinor: 0,
      accountId: '',
      billingAccountId: '',
      account: '',
      paymentMethod: '',
      managementUrl: '',
      notes: '',
      archived: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const d1 = makeDomain({
      id: 'd1',
      name: 'craftstudio.io',
      subscriptionId: 'sub-1',
      serverIds: ['srv-1'],
      ipIds: ['ip-1'],
    });
    const d2 = makeDomain({
      id: 'd2',
      name: 'brandhold.com.cn',
      registrar: '阿里云万网',
      dnsProvider: '阿里云云解析 DNS',
      purpose: 'parked',
      status: 'parked',
      icpStatus: 'pending',
      expireDate: '2027-08-01',
    });

    const subsMap = new Map([[sub.id, sub]]);
    const exp1 = resolveDomainExpiry(d1, subsMap, today);
    expect(exp1.source).toBe('subscription');
    expect(exp1.days).toBe(24);
    expect(exp1.autoRenew).toBe(true);

    const metrics = computeDomainMetrics(
      [d1, d2],
      subsMap,
      { baseCurrency: 'CNY', rates: { CNY: 1, USD: 7.2, HKD: 0.92, EUR: 7.8, GBP: 9.1, JPY: 0.048 } },
      today,
    );

    expect(metrics.activeCount).toBe(2);
    expect(metrics.expiringCount).toBe(1);
    expect(metrics.icpPendingCount).toBe(1);
    expect(metrics.linkedServerCount).toBe(1);
    expect(metrics.linkedIpCount).toBe(1);
    expect(metrics.attentionQueue).toHaveLength(2);
    expect(metrics.tlds.map(item => item.tld)).toEqual(['.COM.CN', '.IO']);
  });
});
