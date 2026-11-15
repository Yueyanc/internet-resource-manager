import type { Preferences } from '@irm/api-client';
import { Card, Statistic, Tooltip } from 'antd';
import { Activity, CalendarClock, Coins, Server } from 'lucide-react';
import type { CSSProperties } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { displayMoney } from '../../subscriptions/utils/subscription-display';
import type { ServerMetrics } from '../utils/server-metrics';

export function ServerSummaryStrip({
  data,
  prefs,
}: {
  data?: ServerMetrics;
  prefs?: Preferences;
  agentIngestEnabled?: boolean;
}) {
  const { t, locale } = usePreferences();

  const connectedTotal = data
    ? data.onlineAgentCount + data.staleAgentCount + data.snapshotCount
    : 0;

  const stats = [
    {
      full: t('在役服务器'),
      icon: Server,
      tint: 'var(--accent)',
      value: data?.activeCount ?? '—',
      hint: data
        ? t('云端 {cloud} · 本地 {local}', { cloud: data.cloudCount, local: data.localCount })
        : t('待加载'),
      caption: data
        ? t('云端 {cloud} · 本地 {local}', { cloud: data.cloudCount, local: data.localCount })
        : t('待加载'),
      warning: undefined,
    },
    {
      full: t('监控探针'),
      icon: Activity,
      tint: data && data.staleAgentCount > 0 ? '#d97706' : connectedTotal > 0 ? '#059669' : '#64748b',
      value: data
        ? (data.onlineAgentCount > 0
            ? `${data.onlineAgentCount} / ${data.activeCount}`
            : connectedTotal > 0
              ? `${connectedTotal} / ${data.activeCount}`
              : `0 / ${data.activeCount}`)
        : '—',
      hint: data
        ? t('实时在线 {online} · 快照 {snapshot}', { online: data.onlineAgentCount, snapshot: data.snapshotCount })
        : t('待加载'),
      caption: data
        ? (connectedTotal > 0
            ? t('实时在线 {online} · 快照 {snapshot}', { online: data.onlineAgentCount, snapshot: data.snapshotCount })
            : t('支持一键命令自动建档与监控'))
        : t('待加载'),
      warning: data && data.staleAgentCount > 0
        ? t('含 {count} 台探针心跳丢失', { count: data.staleAgentCount })
        : undefined,
    },
    {
      full: t('30 天内到期'),
      icon: CalendarClock,
      tint: data && (data.overdueCount > 0 || data.expiringCount > 0) ? '#d97706' : '#0891b2',
      value: data ? data.expiringCount + data.overdueCount : '—',
      hint: t('30 天内到期'),
      caption: data && data.overdueCount === 0 && data.cancelCount === 0 ? t('暂无临期续费') : t('待加载'),
      warning: data
        ? (data.overdueCount > 0
            ? t('含 {count} 台逾期未续费', { count: data.overdueCount })
            : data.cancelCount > 0
              ? t('含 {count} 台计划退订/退役', { count: data.cancelCount })
              : undefined)
        : undefined,
    },
    {
      full: t('基础设施月均'),
      icon: Coins,
      tint: '#0d9488',
      value: data && prefs && data.monthlySpend !== undefined
        ? displayMoney(data.monthlySpend, prefs.baseCurrency, locale)
        : '—',
      hint: t('基础设施月均'),
      caption: data
        ? (data.linkedSubCount > 0
            ? t('关联 {count} 笔周期账单', { count: data.linkedSubCount })
            : t('暂无关联周期账单'))
        : t('待加载'),
      warning: undefined,
    },
  ];

  return (
    <section className="spend-summary" aria-label={t('服务器总览')}>
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
