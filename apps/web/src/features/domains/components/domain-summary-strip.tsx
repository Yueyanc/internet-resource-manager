import type { Preferences } from '@irm/api-client';
import { Card, Statistic, Tooltip } from 'antd';
import { CalendarClock, Coins, Globe2, Network } from 'lucide-react';
import type { CSSProperties } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { displayMoney } from '../../subscriptions/utils/subscription-display';
import type { DomainMetrics } from '../utils/domain-metrics';

export function DomainSummaryStrip({
  data,
  prefs,
}: {
  data?: DomainMetrics;
  prefs?: Preferences;
}) {
  const { t, locale } = usePreferences();

  const topologyTotal = data ? data.linkedServerCount + data.linkedIpCount : 0;

  const stats = [
    {
      full: t('在用域名'),
      icon: Globe2,
      tint: 'var(--accent)',
      value: data?.activeCount ?? '—',
      hint: data
        ? t('生产 {prod} · 个人与邮箱 {personal} · 停放 {parked}', {
            prod: data.prodCount,
            personal: data.personalOrMailCount,
            parked: data.parkedCount,
          })
        : t('待加载'),
      caption: data
        ? t('生产 {prod} · 个人/邮箱 {personal}', {
            prod: data.prodCount,
            personal: data.personalOrMailCount,
          })
        : t('待加载'),
      warning: undefined,
    },
    {
      full: t('解析与拓扑'),
      icon: Network,
      tint: data && data.resolvedCount > 0 ? '#059669' : '#64748b',
      value: data ? `${data.resolvedCount} / ${data.activeCount}` : '—',
      hint: data
        ? t('关联服务器 {servers} 台 · 节点 {ips} 个', {
            servers: data.linkedServerCount,
            ips: data.linkedIpCount,
          })
        : t('待加载'),
      caption: data
        ? (topologyTotal > 0
            ? t('主机 {servers} 台 · 节点 {ips} 个', {
                servers: data.linkedServerCount,
                ips: data.linkedIpCount,
              })
            : t('支持关联承载服务器与解析节点'))
        : t('待加载'),
      warning: data && data.icpPendingCount > 0
        ? t('含 {count} 个域名 ICP 备案审核中', { count: data.icpPendingCount })
        : undefined,
    },
    {
      full: t('60 天内续费'),
      icon: CalendarClock,
      tint: data && (data.overdueCount > 0 || data.expiringCount > 0) ? '#d97706' : '#0891b2',
      value: data ? data.expiringCount + data.overdueCount : '—',
      hint: t('60 天内续费'),
      caption: data
        ? (data.autoRenewCount > 0
            ? t('已开启自动续费 {count} 项', { count: data.autoRenewCount })
            : t('暂无临期续费域名'))
        : t('待加载'),
      warning: data
        ? (data.overdueCount > 0
            ? t('含 {count} 个域名逾期未续费', { count: data.overdueCount })
            : data.retiringCount > 0
              ? t('含 {count} 个计划释放不续', { count: data.retiringCount })
              : undefined)
        : undefined,
    },
    {
      full: t('域名年均持有'),
      icon: Coins,
      tint: '#0d9488',
      value: data && prefs && data.yearlySpend !== undefined
        ? displayMoney(data.yearlySpend, prefs.baseCurrency, locale)
        : '—',
      hint: t('域名年均持有'),
      caption: data
        ? (data.linkedSubCount > 0 && prefs && data.monthlySpend !== undefined
            ? t('折合月均 {amount} · {count} 笔账单', {
                amount: displayMoney(data.monthlySpend, prefs.baseCurrency, locale),
                count: data.linkedSubCount,
              })
            : t('暂无关联周期账单'))
        : t('待加载'),
      warning: undefined,
    },
  ];

  return (
    <section className="spend-summary" aria-label={t('域名总览')}>
      {stats.map(stat => (
        <Card key={stat.full} className="spend-stat">
          <Statistic
            title={(
              <Tooltip title={stat.hint}>
                <span className="stat-label">
                  <span className="stat-icon-badge" style={{ '--stat-tint': stat.tint } as CSSProperties}>
                    <stat.icon size={15} />
                  </span>
                  <span>{stat.full}</span>
                </span>
              </Tooltip>
            )}
            value={stat.value}
          />
          {stat.warning
            ? <span className="stat-warning">{stat.warning}</span>
            : <span className="stat-caption">{stat.caption}</span>}
        </Card>
      ))}
    </section>
  );
}
