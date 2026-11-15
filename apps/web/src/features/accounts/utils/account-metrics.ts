import type { Account, AccountInput } from '@irm/api-client';
import dayjs from 'dayjs';

export const accountCategoryMeta = {
  email: { label: '邮箱与通信身份', short: '邮箱', color: '#0d9488' },
  social: { label: '社媒与即时通讯', short: '社媒', color: '#10b981' },
  ecosystem: { label: '生态通行证与商店', short: '通行证', color: '#6366f1' },
  dev_cloud: { label: '开发者、云与网络', short: '开发与云', color: '#3b82f6' },
  ai_productivity: { label: 'AI 与效率工具', short: 'AI 工具', color: '#059669' },
  media_gaming: { label: '影音阅读与游戏', short: '影音游戏', color: '#8b5cf6' },
  finance_commerce: { label: '电商、支付与生活', short: '电商支付', color: '#d97706' },
  other: { label: '社区论坛与其他', short: '社区其他', color: '#64748b' },
} as const;

export const keepaliveCycles = {
  none: '无需保活',
  monthly: '每月保活',
  quarterly: '每季保活',
  halfyear: '半年保活',
  yearly: '每年保活',
  custom: '自定义天数',
} as const;

const keepaliveMonths = { monthly: 1, quarterly: 3, halfyear: 6, yearly: 12 } as const;

export function nextKeepaliveDate(date: string, cycle: AccountInput['keepaliveCycle'], days: number): string | null {
  if (cycle === 'none') return null;
  if (cycle === 'custom') return dayjs(date).add(days, 'day').format('YYYY-MM-DD');
  return dayjs(date).add(keepaliveMonths[cycle], 'month').format('YYYY-MM-DD');
}

export function checkinRemaining(value: Pick<Account, 'keepaliveCycle' | 'nextCheckinDate'>, today = dayjs()): number | null {
  if (value.keepaliveCycle === 'none' || !value.nextCheckinDate) return null;
  return dayjs(value.nextCheckinDate).diff(today.startOf('day'), 'day');
}

export function keepalivePeriodDays(value: Pick<Account, 'keepaliveCycle' | 'keepaliveDays' | 'nextCheckinDate'>): number {
  if (value.keepaliveCycle === 'none' || !value.nextCheckinDate) return 1;
  if (value.keepaliveCycle === 'custom') return Math.max(1, value.keepaliveDays);
  return Math.max(1, dayjs(value.nextCheckinDate).diff(dayjs(value.nextCheckinDate).subtract(keepaliveMonths[value.keepaliveCycle], 'month'), 'day'));
}

export function accountDisplayTitle(value: Pick<Account, 'platform' | 'label'>): string {
  return value.label ? `${value.platform} · ${value.label}` : value.platform;
}

export function maskIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  if (!trimmed) return '';
  const atIndex = trimmed.indexOf('@');
  if (atIndex > 0) {
    const local = trimmed.slice(0, atIndex);
    const domain = trimmed.slice(atIndex);
    if (local.length <= 2) return `${local.charAt(0)}***${domain}`;
    return `${local.slice(0, 2)}***${domain}`;
  }
  if (trimmed.startsWith('@')) {
    const handle = trimmed.slice(1);
    return handle.length <= 2 ? `@${handle.charAt(0)}***` : `@${handle.slice(0, 2)}***`;
  }
  if (trimmed.length <= 4) return `${trimmed.charAt(0)}***`;
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}

export type SecurityIssue = 'hub_no_2fa' | 'missing_recovery_codes';

export function securityIssues(value: Pick<Account, 'archived' | 'role' | 'twoFactor' | 'recoveryCodes'>): SecurityIssue[] {
  if (value.archived) return [];
  const issues: SecurityIssue[] = [];
  if (value.role === 'hub' && value.twoFactor === 'none') {
    issues.push('hub_no_2fa');
  }
  if ((value.twoFactor === 'totp' || value.twoFactor === 'hardware') && value.recoveryCodes === 'missing') {
    issues.push('missing_recovery_codes');
  }
  return issues;
}

export function needsAttention(value: Account, today = dayjs()): boolean {
  if (value.archived) return false;
  if (value.status !== 'active') return true;
  if (securityIssues(value).length > 0) return true;
  const days = checkinRemaining(value, today);
  return days !== null && days <= 30;
}

export type IdentityHubSummary = {
  account: Account;
  downstreamIds: string[];
  downstreamCount: number;
};

export type AccountMetrics = {
  activeCount: number;
  domesticCount: number;
  overseasCount: number;
  hubCount: number;
  linkedDownstreamTotal: number;
  weakSecurityCount: number;
  hubNo2faCount: number;
  checkinSoonCount: number;
  overdueCheckinCount: number;
  retiringCount: number;
  kycVerifiedCount: number;
  hubs: IdentityHubSummary[];
  downstreamByAccountId: Map<string, Account[]>;
  hygieneQueue: Account[];
  breakdown: { key: Account['category']; label: (typeof accountCategoryMeta)[Account['category']]['label']; short: (typeof accountCategoryMeta)[Account['category']]['short']; color: string; count: number }[];
};

export function computeAccountMetrics(items: Account[], today = dayjs()): AccountMetrics {
  const active = items.filter(item => !item.archived);
  const domesticCount = active.filter(item => item.ecosystem === 'domestic').length;
  const overseasCount = active.filter(item => item.ecosystem === 'overseas').length;
  const kycVerifiedCount = active.filter(item => item.kycStatus === 'verified').length;

  const downstreamByAccountId = new Map<string, Account[]>();
  for (const item of active) {
    const parents = new Set<string>();
    if (item.recoveryAccountId) parents.add(item.recoveryAccountId);
    if (item.ssoAccountId) parents.add(item.ssoAccountId);
    for (const parentId of parents) {
      const list = downstreamByAccountId.get(parentId) ?? [];
      list.push(item);
      downstreamByAccountId.set(parentId, list);
    }
  }

  const hubCandidates = active
    .filter(item => item.role === 'hub' || (downstreamByAccountId.get(item.id)?.length ?? 0) > 0)
    .map((account) => {
      const children = downstreamByAccountId.get(account.id) ?? [];
      return {
        account,
        downstreamIds: children.map(child => child.id),
        downstreamCount: children.length,
      };
    })
    .sort((a, b) => b.downstreamCount - a.downstreamCount || accountDisplayTitle(a.account).localeCompare(accountDisplayTitle(b.account)));

  const linkedDownstreamSet = new Set<string>();
  for (const hub of hubCandidates) {
    for (const childId of hub.downstreamIds) {
      linkedDownstreamSet.add(childId);
    }
  }

  const weakSecurity = active.filter(item => securityIssues(item).length > 0);
  const hubNo2faCount = active.filter(item => item.role === 'hub' && item.twoFactor === 'none').length;

  const checkinSoon = active.filter((item) => {
    const days = checkinRemaining(item, today);
    return days !== null && days <= 30;
  });
  const overdueCheckinCount = checkinSoon.filter((item) => {
    const days = checkinRemaining(item, today);
    return days !== null && days < 0;
  }).length;
  const retiring = active.filter(item => item.status === 'retiring');

  const hygieneQueue = active
    .filter((item) => {
      const days = checkinRemaining(item, today);
      return (days !== null && days <= 45) || item.status === 'retiring' || item.status === 'restricted';
    })
    .sort((a, b) => {
      const daysA = checkinRemaining(a, today) ?? 99999;
      const daysB = checkinRemaining(b, today) ?? 99999;
      if (daysA !== daysB) return daysA - daysB;
      if (a.status !== b.status) return a.status === 'retiring' ? -1 : 1;
      return accountDisplayTitle(a).localeCompare(accountDisplayTitle(b));
    });

  const breakdown = (Object.entries(accountCategoryMeta) as [Account['category'], (typeof accountCategoryMeta)[Account['category']]][])
    .map(([key, meta]) => ({
      key,
      label: meta.label,
      short: meta.short,
      color: meta.color,
      count: active.filter(item => item.category === key).length,
    }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    activeCount: active.length,
    domesticCount,
    overseasCount,
    hubCount: hubCandidates.length,
    linkedDownstreamTotal: linkedDownstreamSet.size,
    weakSecurityCount: weakSecurity.length,
    hubNo2faCount,
    checkinSoonCount: checkinSoon.length,
    overdueCheckinCount,
    retiringCount: retiring.length,
    kycVerifiedCount,
    hubs: hubCandidates,
    downstreamByAccountId,
    hygieneQueue,
    breakdown,
  };
}
