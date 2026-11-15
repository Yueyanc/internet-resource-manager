import { Card, Statistic, Tooltip } from 'antd';
import { CalendarCheck2, Network, ShieldAlert, Users } from 'lucide-react';
import type { CSSProperties } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import type { AccountMetrics } from '../utils/account-metrics';

export function AccountSummaryStrip({ data }: { data?: AccountMetrics }) {
  const { t } = usePreferences();
  const stats = [
    {
      full: t('在用账号'),
      icon: Users,
      tint: 'var(--accent)',
      value: data?.activeCount ?? '—',
      hint: data ? t('国内 {cn} · 海外 {global}', { cn: data.domesticCount, global: data.overseasCount }) : t('待加载'),
      caption: data ? t('国内 {cn} · 海外 {global}', { cn: data.domesticCount, global: data.overseasCount }) : t('待加载'),
      warning: undefined,
    },
    {
      full: t('核心枢纽'),
      icon: Network,
      tint: 'var(--signal)',
      value: data?.hubCount ?? '—',
      hint: data ? t('支撑 {count} 个下游账号', { count: data.linkedDownstreamTotal }) : t('待加载'),
      caption: data
        ? (data.linkedDownstreamTotal > 0 ? t('支撑 {count} 个下游账号', { count: data.linkedDownstreamTotal }) : t('暂无下游绑定记录'))
        : t('待加载'),
      warning: undefined,
    },
    {
      full: t('安全待加固'),
      icon: ShieldAlert,
      tint: data?.weakSecurityCount ? '#dc2626' : '#0d9488',
      value: data?.weakSecurityCount ?? '—',
      hint: t('安全待加固'),
      caption: data && !data.weakSecurityCount ? t('安全姿态良好') : t('待加载'),
      warning: data && data.weakSecurityCount > 0
        ? (data.hubNo2faCount > 0 ? t('{count} 个核心号未开两步验证', { count: data.hubNo2faCount }) : t('存在待补齐项'))
        : undefined,
    },
    {
      full: t('待保活 / 待销号'),
      icon: CalendarCheck2,
      tint: data && (data.overdueCheckinCount > 0 || data.retiringCount > 0) ? '#d97706' : '#0891b2',
      value: data ? data.checkinSoonCount + data.retiringCount : '—',
      hint: t('待保活 / 待销号'),
      caption: data && data.overdueCheckinCount === 0 && data.retiringCount === 0 ? t('暂无临期保活') : t('待加载'),
      warning: data
        ? (data.overdueCheckinCount > 0
            ? t('含 {count} 项逾期未保活', { count: data.overdueCheckinCount })
            : data.retiringCount > 0
              ? t('含 {count} 项计划注销', { count: data.retiringCount })
              : undefined)
        : undefined,
    },
  ];

  return (
    <section className="spend-summary" aria-label={t('账号总览')}>
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
