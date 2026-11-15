import type {
  Domain,
  DomainIcpStatus,
  DomainPurpose,
  DomainStatus,
  Preferences,
  Subscription,
} from '@irm/api-client';
import dayjs from 'dayjs';

import { monthlyCost } from '../../subscriptions/utils/subscription-metrics';
import { type DomainPreset, resolveDomainPreset } from '../presets/domain-presets';

export const domainPurposeMeta = {
  prod: { label: '主力生产 · API 与业务', short: '主力生产', color: '#059669' },
  personal: { label: '个人主页与博客', short: '个人博客', color: '#2563eb' },
  mail: { label: '邮箱与身份域名', short: '专属邮箱', color: '#7c3aed' },
  cdn: { label: '静态分发 / CDN 边缘', short: 'CDN 边缘', color: '#0891b2' },
  parked: { label: '防御性持有 / 停放备用', short: '停放备用', color: '#64748b' },
} as const satisfies Record<DomainPurpose, { label: string; short: string; color: string }>;

export const domainStatusMeta = {
  active: { label: '正常解析', short: '正常解析' },
  parked: { label: '停放备用', short: '停放备用' },
  transferring: { label: '转入 / 转移中', short: '转移中' },
  retiring: { label: '计划释放 / 不续费', short: '计划释放' },
} as const satisfies Record<DomainStatus, { label: string; short: string }>;

export const domainIcpMeta = {
  none: { label: '免备 / 海外接入', short: '海外接入' },
  verified: { label: '已完成 ICP 备案', short: '已备案' },
  pending: { label: 'ICP 备案审核中', short: '备案中' },
} as const satisfies Record<DomainIcpStatus, { label: string; short: string }>;

const multiPartTlds = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'com.cn',
  'net.cn',
  'org.cn',
  'gov.cn',
  'com.hk',
  'com.tw',
  'co.jp',
  'ne.jp',
  'or.jp',
  'com.au',
  'com.sg',
]);

export function normalizeDomainDraft(raw: string): string {
  let text = raw.trim().toLowerCase();
  text = text.replace(/^[a-z]+:\/\//i, '');
  const slashIdx = text.indexOf('/');
  if (slashIdx >= 0) {
    text = text.slice(0, slashIdx);
  }
  const colonIdx = text.indexOf(':');
  if (colonIdx >= 0) {
    text = text.slice(0, colonIdx);
  }
  return text.replace(/\.+$/, '');
}

export function inspectDomain(raw: string) {
  const clean = normalizeDomainDraft(raw);
  if (!clean) {
    return {
      state: 'empty' as const,
      clean: '',
      apex: '',
      tld: '',
      isSubdomain: false,
      isIdn: false,
    };
  }
  const hasNonAscii = (str: string) => Array.from(str).some(ch => ch.charCodeAt(0) > 127);
  const labels = clean.split('.').filter(Boolean);
  const isIdn = hasNonAscii(clean) || labels.some(part => part.startsWith('xn--'));
  const validLabels = labels.length >= 2
    && clean.length <= 253
    && labels.every(part =>
      part.length >= 1
      && part.length <= 63
      && !part.startsWith('-')
      && !part.endsWith('-')
      && (/^[a-z0-9-]+$/i.test(part) || hasNonAscii(part)),
    )
    && (labels.at(-1)?.length ?? 0) >= 2;

  if (!validLabels) {
    return {
      state: 'incomplete' as const,
      clean,
      apex: clean,
      tld: labels.length >= 2 ? `.${(labels.at(-1) ?? '').toUpperCase()}` : '',
      isSubdomain: labels.length > 2,
      isIdn,
    };
  }

  const lastTwo = labels.slice(-2).join('.');
  const apexParts = multiPartTlds.has(lastTwo) && labels.length >= 3 ? 3 : 2;
  const apex = labels.slice(-apexParts).join('.');
  const tldText = multiPartTlds.has(lastTwo) && labels.length >= 3
    ? `.${lastTwo.toUpperCase()}`
    : `.${(labels.at(-1) ?? '').toUpperCase()}`;

  return {
    state: 'valid' as const,
    clean,
    apex,
    tld: tldText,
    isSubdomain: labels.length > apexParts,
    isIdn,
  };
}

export function extractDomainTld(name: string): string {
  const info = inspectDomain(name);
  if (info.tld) return info.tld;
  const parts = name.trim().split('.').filter(Boolean);
  return parts.length >= 2 ? `.${(parts.at(-1) ?? '').toUpperCase()}` : '';
}

export function maskDomainName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const parts = trimmed.split('.');
  if (parts.length < 2) {
    return trimmed.length <= 2 ? `${trimmed.charAt(0)}***` : `${trimmed.slice(0, 2)}***`;
  }
  const info = inspectDomain(trimmed);
  const suffixParts = info.tld ? info.tld.slice(1).toLowerCase().split('.').length : 1;
  const keepSuffix = parts.slice(-suffixParts).join('.');
  const prefix = parts.slice(0, -suffixParts).join('.');
  const maskedPrefix = prefix.length <= 2
    ? `${prefix.charAt(0)}***`
    : `${prefix.slice(0, 2)}***`;
  return `${maskedPrefix}.${keepSuffix}`;
}

export type DomainExpiryInfo = {
  source: 'subscription' | 'manual' | 'none';
  date: string;
  days: number | null;
  autoRenew: boolean;
  subscription?: Subscription;
};

export function resolveDomainExpiry(
  value: Pick<Domain, 'subscriptionId' | 'expireDate' | 'autoRenew'>,
  subscriptionsById: Map<string, Subscription>,
  today = dayjs(),
): DomainExpiryInfo {
  if (value.subscriptionId) {
    const sub = subscriptionsById.get(value.subscriptionId);
    if (sub && !sub.archived) {
      if (sub.cycle === 'once') {
        return {
          source: 'subscription',
          date: sub.dueDate,
          days: null,
          autoRenew: sub.renewalMode === 'auto',
          subscription: sub,
        };
      }
      const days = dayjs(sub.dueDate).diff(today.startOf('day'), 'day');
      return {
        source: 'subscription',
        date: sub.dueDate,
        days,
        autoRenew: sub.renewalMode === 'auto',
        subscription: sub,
      };
    }
  }
  if (value.expireDate) {
    const days = dayjs(value.expireDate).diff(today.startOf('day'), 'day');
    return {
      source: 'manual',
      date: value.expireDate,
      days,
      autoRenew: value.autoRenew,
    };
  }
  return {
    source: 'none',
    date: '',
    days: null,
    autoRenew: value.autoRenew,
  };
}

export function domainNeedsAttention(
  value: Domain,
  subscriptionsById: Map<string, Subscription>,
  today = dayjs(),
): boolean {
  if (value.archived) return false;
  if (value.status === 'transferring' || value.status === 'retiring') return true;
  if (value.icpStatus === 'pending') return true;
  const expiry = resolveDomainExpiry(value, subscriptionsById, today);
  if (expiry.subscription?.intention === 'cancel') return true;
  return expiry.days !== null && expiry.days <= 60;
}

export type DomainRegistrarSummary = {
  key: string;
  registrar: string;
  dnsHint: string;
  preset?: DomainPreset;
  count: number;
};

export type DomainTldSummary = {
  tld: string;
  count: number;
};

export type DomainAttentionReason
  = | 'overdue'
    | 'transferring'
    | 'icp_pending'
    | 'retiring'
    | 'expiring';

export type DomainMetrics = {
  activeCount: number;
  prodCount: number;
  personalOrMailCount: number;
  parkedCount: number;
  resolvedCount: number;
  linkedServerCount: number;
  linkedIpCount: number;
  expiringCount: number;
  overdueCount: number;
  retiringCount: number;
  autoRenewCount: number;
  whoisPrivacyCount: number;
  icpVerifiedCount: number;
  icpPendingCount: number;
  monthlySpend?: number;
  yearlySpend?: number;
  linkedSubCount: number;
  registrars: DomainRegistrarSummary[];
  tlds: DomainTldSummary[];
  attentionQueue: { domain: Domain; expiry: DomainExpiryInfo; reason: DomainAttentionReason }[];
  breakdown: {
    key: DomainPurpose;
    label: (typeof domainPurposeMeta)[DomainPurpose]['label'];
    short: (typeof domainPurposeMeta)[DomainPurpose]['short'];
    color: string;
    count: number;
  }[];
};

export function computeDomainMetrics(
  items: Domain[],
  subscriptionsById: Map<string, Subscription>,
  prefs?: Preferences,
  today = dayjs(),
): DomainMetrics {
  const active = items.filter(item => !item.archived);

  let prodCount = 0;
  let personalOrMailCount = 0;
  let parkedCount = 0;
  let resolvedCount = 0;
  let expiringCount = 0;
  let overdueCount = 0;
  let retiringCount = 0;
  let autoRenewCount = 0;
  let whoisPrivacyCount = 0;
  let icpVerifiedCount = 0;
  let icpPendingCount = 0;

  const uniqueServerIds = new Set<string>();
  const uniqueIpIds = new Set<string>();
  const uniqueSubIds = new Set<string>();
  const registrarMap = new Map<string, DomainRegistrarSummary>();
  const tldMap = new Map<string, number>();
  const attentionQueue: { domain: Domain; expiry: DomainExpiryInfo; reason: DomainAttentionReason }[] = [];

  for (const item of active) {
    if (item.purpose === 'prod' || item.purpose === 'cdn') prodCount += 1;
    else if (item.purpose === 'personal' || item.purpose === 'mail') personalOrMailCount += 1;
    if (item.purpose === 'parked' || item.status === 'parked') parkedCount += 1;

    if (item.status === 'active' && (item.dnsProvider.trim() || item.serverIds.length > 0 || item.ipIds.length > 0)) {
      resolvedCount += 1;
    }

    for (const sid of item.serverIds) uniqueServerIds.add(sid);
    for (const iid of item.ipIds) uniqueIpIds.add(iid);

    if (item.whoisPrivacy) whoisPrivacyCount += 1;
    if (item.icpStatus === 'verified') icpVerifiedCount += 1;
    else if (item.icpStatus === 'pending') icpPendingCount += 1;

    const tld = extractDomainTld(item.name);
    if (tld) {
      tldMap.set(tld, (tldMap.get(tld) ?? 0) + 1);
    }

    const preset = resolveDomainPreset(item);
    const registrarLabel = item.registrar.trim() || preset?.registrar.zh || '';
    if (registrarLabel) {
      const regKey = registrarLabel.toLowerCase();
      const existing = registrarMap.get(regKey);
      if (existing) {
        existing.count += 1;
        if (!existing.dnsHint && item.dnsProvider.trim()) {
          existing.dnsHint = item.dnsProvider.trim();
        }
      }
      else {
        registrarMap.set(regKey, {
          key: regKey,
          registrar: registrarLabel,
          dnsHint: item.dnsProvider.trim() || preset?.dnsProvider.zh || '',
          preset,
          count: 1,
        });
      }
    }

    const expiry = resolveDomainExpiry(item, subscriptionsById, today);
    if (expiry.autoRenew) autoRenewCount += 1;
    if (expiry.subscription) {
      uniqueSubIds.add(expiry.subscription.id);
    }

    const isRetiring = item.status === 'retiring' || expiry.subscription?.intention === 'cancel';
    if (isRetiring) retiringCount += 1;

    if (expiry.days !== null) {
      if (expiry.days < 0) overdueCount += 1;
      else if (expiry.days <= 60) expiringCount += 1;
    }

    if (domainNeedsAttention(item, subscriptionsById, today)) {
      let reason: DomainAttentionReason = 'expiring';
      if (expiry.days !== null && expiry.days < 0) reason = 'overdue';
      else if (item.status === 'transferring') reason = 'transferring';
      else if (item.icpStatus === 'pending') reason = 'icp_pending';
      else if (isRetiring) reason = 'retiring';
      attentionQueue.push({ domain: item, expiry, reason });
    }
  }

  const reasonRank: Record<DomainAttentionReason, number> = {
    overdue: 0,
    transferring: 1,
    icp_pending: 2,
    expiring: 3,
    retiring: 4,
  };

  attentionQueue.sort((a, b) => {
    if (reasonRank[a.reason] !== reasonRank[b.reason]) {
      return reasonRank[a.reason] - reasonRank[b.reason];
    }
    const daysA = a.expiry.days ?? 99999;
    const daysB = b.expiry.days ?? 99999;
    if (daysA !== daysB) return daysA - daysB;
    return a.domain.name.localeCompare(b.domain.name);
  });

  const registrars = Array.from(registrarMap.values()).sort(
    (a, b) => b.count - a.count || a.registrar.localeCompare(b.registrar),
  );

  const tlds = Array.from(tldMap.entries())
    .map(([tld, count]) => ({ tld, count }))
    .sort((a, b) => b.count - a.count || a.tld.localeCompare(b.tld));

  let monthlySpend: number | undefined;
  let yearlySpend: number | undefined;
  if (prefs) {
    let sum = 0;
    for (const subId of uniqueSubIds) {
      const sub = subscriptionsById.get(subId);
      if (sub && !sub.archived) {
        sum += monthlyCost(sub, prefs);
      }
    }
    monthlySpend = sum;
    yearlySpend = sum * 12;
  }

  const breakdown = (Object.keys(domainPurposeMeta) as DomainPurpose[])
    .map(key => ({
      key,
      label: domainPurposeMeta[key].label,
      short: domainPurposeMeta[key].short,
      color: domainPurposeMeta[key].color,
      count: active.filter(item => item.purpose === key).length,
    }))
    .filter(entry => entry.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    activeCount: active.length,
    prodCount,
    personalOrMailCount,
    parkedCount,
    resolvedCount,
    linkedServerCount: uniqueServerIds.size,
    linkedIpCount: uniqueIpIds.size,
    expiringCount,
    overdueCount,
    retiringCount,
    autoRenewCount,
    whoisPrivacyCount,
    icpVerifiedCount,
    icpPendingCount,
    monthlySpend,
    yearlySpend,
    linkedSubCount: uniqueSubIds.size,
    registrars,
    tlds,
    attentionQueue,
    breakdown,
  };
}
