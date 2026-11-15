import { type IpInput, type IpNode, type IpUnlockService, ipUnlockServices, type Subscription } from '@irm/api-client';
import dayjs from 'dayjs';

export const ipCategoryMeta = {
  residential_isp: { label: '住宅原生 / 家宽', short: '住宅家宽', color: '#0d9488' },
  cloud_vps: { label: '海外云与常规 VPS', short: '海外 VPS', color: '#2563eb' },
  floating_eip: { label: '弹性公网 / 浮动 IP', short: '弹性 IP', color: '#4f46e5' },
  transit_relay: { label: '国内入口与专线中转', short: '入口中转', color: '#ea580c' },
  home_ddns: { label: '家庭宽带与动态公网', short: '家庭公网', color: '#0284c7' },
  overlay_subnet: { label: '内网组网与地址段', short: '内网组网', color: '#64748b' },
} as const;

export const ipAsnTypeMeta = {
  residential: { label: '住宅宽带 (Residential)', short: '住宅' },
  isp: { label: '运营商 (ISP)', short: '运营商' },
  hosting: { label: '机房托管 (Hosting)', short: '机房' },
  mobile: { label: '移动蜂窝 (Mobile)', short: '蜂窝' },
  business: { label: '商业专线 (Business)', short: '商宽' },
  private: { label: '保留 / 组网 (Private)', short: '内网' },
} as const;

export const ipUnlockMeta: Record<IpUnlockService, { label: string; short: string; iconKey: string; color: string; darkInvert?: boolean }> = {
  openai: { label: 'ChatGPT', short: 'GPT', iconKey: 'chatgpt', color: '#10a37f' },
  claude: { label: 'Claude', short: 'Claude', iconKey: 'claude', color: '#d97757' },
  gemini: { label: 'Gemini', short: 'Gemini', iconKey: 'gemini', color: '#4285f4' },
  netflix: { label: 'Netflix', short: 'NF', iconKey: 'netflix', color: '#e50914' },
  disney_plus: { label: 'Disney+', short: 'D+', iconKey: 'disney_plus', color: '#113ccf' },
  youtube: { label: 'YouTube', short: 'YT', iconKey: 'youtube', color: '#ff0000' },
  tiktok: { label: 'TikTok', short: 'TK', iconKey: 'tiktok', color: '#111827', darkInvert: true },
};

export const reviewCycles = {
  none: '无需复检',
  monthly: '每月复检',
  quarterly: '每季复检',
  halfyear: '半年复检',
  yearly: '每年复检',
  custom: '自定义天数',
} as const;

const reviewMonths = { monthly: 1, quarterly: 3, halfyear: 6, yearly: 12 } as const;

export function nextReviewDate(date: string, cycle: IpInput['reviewCycle'], days: number): string | null {
  if (cycle === 'none') return null;
  if (cycle === 'custom') return dayjs(date).add(days, 'day').format('YYYY-MM-DD');
  return dayjs(date).add(reviewMonths[cycle], 'month').format('YYYY-MM-DD');
}

export function reviewRemaining(value: Pick<IpNode, 'reviewCycle' | 'nextReviewDate'>, today = dayjs()): number | null {
  if (value.reviewCycle === 'none' || !value.nextReviewDate) return null;
  return dayjs(value.nextReviewDate).diff(today.startOf('day'), 'day');
}

export function reviewPeriodDays(value: Pick<IpNode, 'reviewCycle' | 'reviewDays' | 'nextReviewDate'>): number {
  if (value.reviewCycle === 'none' || !value.nextReviewDate) return 1;
  if (value.reviewCycle === 'custom') return Math.max(1, value.reviewDays);
  return Math.max(1, dayjs(value.nextReviewDate).diff(dayjs(value.nextReviewDate).subtract(reviewMonths[value.reviewCycle], 'month'), 'day'));
}

export function ipDisplayTitle(value: Pick<IpNode, 'provider' | 'label'>): string {
  return value.label ? `${value.provider} · ${value.label}` : value.provider;
}

export function maskIpAddress(address: string): string {
  const trimmed = address.trim();
  if (!trimmed) return '';
  const slashIdx = trimmed.indexOf('/');
  const host = slashIdx >= 0 ? trimmed.slice(0, slashIdx) : trimmed;
  const cidr = slashIdx >= 0 ? trimmed.slice(slashIdx) : '';

  if (host.includes('.')) {
    const parts = host.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.*.*${cidr}`;
    }
  }
  if (host.includes(':')) {
    const groups = host.split(':').filter(Boolean);
    if (groups.length === 0) return `*:*${cidr}`;
    if (groups.length === 1) return `${groups[0]}:*:*${cidr}`;
    return `${groups[0]}:${groups[1]}:*:*${cidr}`;
  }
  return trimmed.length <= 4 ? `${trimmed.charAt(0)}***` : `${trimmed.slice(0, 3)}***`;
}

export function isResidentialOrNative(value: Pick<IpNode, 'asnType' | 'originType' | 'networkScope'>): boolean {
  if (value.networkScope === 'overlay_private') return false;
  return value.asnType === 'residential' || value.asnType === 'isp' || value.originType === 'native';
}

export function countUnlockedServices(value: Pick<IpNode, 'unlocks'>): { full: number; partial: number; blocked: number } {
  let full = 0;
  let partial = 0;
  let blocked = 0;
  for (const svc of ipUnlockServices) {
    const state = value.unlocks[svc]?.status;
    if (state === 'full') full += 1;
    else if (state === 'partial') partial += 1;
    else if (state === 'blocked') blocked += 1;
  }
  return { full, partial, blocked };
}

export type LinkedSubscriptionAlert = 'cancel' | 'due_soon';

export function subscriptionAlert(
  value: Pick<IpNode, 'archived' | 'subscriptionId'>,
  subscriptionsById?: Map<string, Subscription>,
  today = dayjs(),
): LinkedSubscriptionAlert | null {
  if (value.archived || !value.subscriptionId || !subscriptionsById) return null;
  const sub = subscriptionsById.get(value.subscriptionId);
  if (!sub || sub.archived) return null;
  if (sub.intention === 'cancel') return 'cancel';
  if (sub.cycle !== 'once' && sub.dueDate) {
    const dueDays = dayjs(sub.dueDate).diff(today.startOf('day'), 'day');
    if (dueDays <= 14) return 'due_soon';
  }
  return null;
}

export function ipNeedsAttention(
  value: IpNode,
  subscriptionsById?: Map<string, Subscription>,
  today = dayjs(),
): boolean {
  if (value.archived) return false;
  if (value.status !== 'active') return true;
  if (value.riskLevel === 'high') return true;
  if (value.probeMode !== 'none' && value.probeStatus === 'unreachable') return true;
  if (subscriptionAlert(value, subscriptionsById, today) !== null) return true;
  const days = reviewRemaining(value, today);
  return days !== null && days <= 30;
}

export type UnlockCoverageItem = {
  service: IpUnlockService;
  fullCount: number;
  partialCount: number;
  blockedCount: number;
};

export type IpMetrics = {
  activeCount: number;
  overseasExitCount: number;
  domesticEntryCount: number;
  overlayCount: number;
  residentialOrNativeCount: number;
  dedicatedCount: number;
  unlockReadyCount: number;
  chatgptReadyCount: number;
  netflixReadyCount: number;
  unhealthyCount: number;
  overdueReviewCount: number;
  reviewSoonCount: number;
  retiringCount: number;
  subscriptionAlertCount: number;
  attentionCount: number;
  unlockCoverage: UnlockCoverageItem[];
  hygieneQueue: IpNode[];
  nativeOrIspCount: number;
  hostingOrOtherCount: number;
  breakdown: {
    key: IpNode['category'];
    label: (typeof ipCategoryMeta)[IpNode['category']]['label'];
    short: (typeof ipCategoryMeta)[IpNode['category']]['short'];
    color: string;
    count: number;
  }[];
  topRegions: { region: string; count: number }[];
};

export function computeIpMetrics(items: IpNode[], subscriptions: Subscription[] = [], today = dayjs()): IpMetrics {
  const active = items.filter(item => !item.archived);
  const subscriptionsById = new Map(subscriptions.map(sub => [sub.id, sub]));

  const overseasExitCount = active.filter(item => item.networkScope === 'overseas_exit').length;
  const domesticEntryCount = active.filter(item => item.networkScope === 'domestic_entry').length;
  const overlayCount = active.filter(item => item.networkScope === 'overlay_private').length;

  const residentialOrNativeCount = active.filter(item => isResidentialOrNative(item)).length;
  const dedicatedCount = active.filter(item => item.role === 'dedicated').length;

  const unlockReadyCount = active.filter((item) => {
    const counts = countUnlockedServices(item);
    return counts.full > 0 || counts.partial > 0;
  }).length;
  const chatgptReadyCount = active.filter(item => item.unlocks.openai?.status === 'full').length;
  const netflixReadyCount = active.filter(item => item.unlocks.netflix?.status === 'full').length;

  const unhealthyCount = active.filter(
    item =>
      item.status === 'blocked'
      || item.status === 'degraded'
      || item.riskLevel === 'high'
      || (item.probeMode !== 'none' && item.probeStatus === 'unreachable'),
  ).length;

  const reviewSoon = active.filter((item) => {
    const days = reviewRemaining(item, today);
    return days !== null && days <= 30;
  });
  const overdueReviewCount = reviewSoon.filter((item) => {
    const days = reviewRemaining(item, today);
    return days !== null && days < 0;
  }).length;
  const retiringCount = active.filter(item => item.status === 'retiring').length;
  const subscriptionAlertCount = active.filter(item => subscriptionAlert(item, subscriptionsById, today) !== null).length;

  const attentionItems = active.filter(item => ipNeedsAttention(item, subscriptionsById, today));

  const unlockCoverage: UnlockCoverageItem[] = ipUnlockServices.map((service) => {
    let fullCount = 0;
    let partialCount = 0;
    let blockedCount = 0;
    for (const item of active) {
      const state = item.unlocks[service]?.status;
      if (state === 'full') fullCount += 1;
      else if (state === 'partial') partialCount += 1;
      else if (state === 'blocked') blockedCount += 1;
    }
    return { service, fullCount, partialCount, blockedCount };
  });

  const severityScore = (node: IpNode): number => {
    if (node.status === 'blocked' || (node.probeMode !== 'none' && node.probeStatus === 'unreachable')) return 0;
    if (node.riskLevel === 'high' || node.status === 'degraded') return 1;
    if (subscriptionAlert(node, subscriptionsById, today) === 'cancel') return 2;
    const days = reviewRemaining(node, today);
    if (days !== null && days < 0) return 3;
    if (node.status === 'retiring' || subscriptionAlert(node, subscriptionsById, today) === 'due_soon') return 4;
    return 5;
  };

  const hygieneQueue = [...attentionItems].sort((a, b) => {
    const diff = severityScore(a) - severityScore(b);
    if (diff !== 0) return diff;
    const daysA = reviewRemaining(a, today) ?? 99999;
    const daysB = reviewRemaining(b, today) ?? 99999;
    if (daysA !== daysB) return daysA - daysB;
    return ipDisplayTitle(a).localeCompare(ipDisplayTitle(b));
  });

  const nativeOrIspCount = active.filter(
    item => item.asnType === 'residential' || item.asnType === 'isp' || item.originType === 'native',
  ).length;
  const hostingOrOtherCount = Math.max(0, active.length - nativeOrIspCount);

  const breakdown = (Object.entries(ipCategoryMeta) as [IpNode['category'], (typeof ipCategoryMeta)[IpNode['category']]][])
    .map(([key, meta]) => ({
      key,
      label: meta.label,
      short: meta.short,
      color: meta.color,
      count: active.filter(item => item.category === key).length,
    }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count);

  const regionCounts = new Map<string, number>();
  for (const item of active) {
    regionCounts.set(item.region, (regionCounts.get(item.region) ?? 0) + 1);
  }
  const topRegions = Array.from(regionCounts.entries())
    .map(([region, count]) => ({ region, count }))
    .sort((a, b) => b.count - a.count || a.region.localeCompare(b.region))
    .slice(0, 5);

  return {
    activeCount: active.length,
    overseasExitCount,
    domesticEntryCount,
    overlayCount,
    residentialOrNativeCount,
    dedicatedCount,
    unlockReadyCount,
    chatgptReadyCount,
    netflixReadyCount,
    unhealthyCount,
    overdueReviewCount,
    reviewSoonCount: reviewSoon.length,
    retiringCount,
    subscriptionAlertCount,
    attentionCount: attentionItems.length,
    unlockCoverage,
    hygieneQueue,
    nativeOrIspCount,
    hostingOrOtherCount,
    breakdown,
    topRegions,
  };
}
