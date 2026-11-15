import { Card, Statistic, Tooltip } from 'antd';
import { Activity, Network, ShieldCheck, Sparkles } from 'lucide-react';
import type { CSSProperties } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import type { IpMetrics } from '../utils/ip-metrics';

export function IpSummaryStrip({ data }: { data?: IpMetrics }) {
  const { t } = usePreferences();
  const stats = [
    {
      full: t('在用节点'),
      icon: Network,
      tint: 'var(--accent)',
      value: data?.activeCount ?? '—',
      hint: data
        ? t('出口 {exit} · 入口 {entry} · 组网 {overlay}', {
            exit: data.overseasExitCount,
            entry: data.domesticEntryCount,
            overlay: data.overlayCount,
          })
        : t('待加载'),
      caption: data
        ? t('出口 {exit} · 入口 {entry} · 组网 {overlay}', {
            exit: data.overseasExitCount,
            entry: data.domesticEntryCount,
            overlay: data.overlayCount,
          })
        : t('待加载'),
      warning: undefined,
    },
    {
      full: t('住宅与原生'),
      icon: ShieldCheck,
      tint: '#0d9488',
      value: data?.residentialOrNativeCount ?? '—',
      hint: data ? t('含 {count} 个独享固定出口', { count: data.dedicatedCount }) : t('待加载'),
      caption: data
        ? (data.dedicatedCount > 0 ? t('含 {count} 个独享固定出口', { count: data.dedicatedCount }) : t('暂无独享出口标记'))
        : t('待加载'),
      warning: undefined,
    },
    {
      full: t('解锁就绪'),
      icon: Sparkles,
      tint: '#4f46e5',
      value: data?.unlockReadyCount ?? '—',
      hint: data
        ? t('ChatGPT {ai} · Netflix {media}', { ai: data.chatgptReadyCount, media: data.netflixReadyCount })
        : t('待加载'),
      caption: data
        ? (data.unlockReadyCount > 0
            ? t('ChatGPT {ai} · Netflix {media}', { ai: data.chatgptReadyCount, media: data.netflixReadyCount })
            : t('尚未录入解锁画像'))
        : t('待加载'),
      warning: undefined,
    },
    {
      full: t('连通与待办'),
      icon: Activity,
      tint: data
        ? (data.unhealthyCount > 0 ? '#dc2626' : data.attentionCount > 0 ? '#d97706' : '#0891b2')
        : '#0891b2',
      value: data?.attentionCount ?? '—',
      hint: t('连通与待办'),
      caption: data && data.attentionCount === 0 ? t('全部在线且无待办') : t('待加载'),
      warning: data
        ? (data.unhealthyCount > 0
            ? t('含 {count} 项不可达或封禁', { count: data.unhealthyCount })
            : data.subscriptionAlertCount > 0
              ? t('含 {count} 项关联续费预警', { count: data.subscriptionAlertCount })
              : data.overdueReviewCount > 0
                ? t('含 {count} 项逾期未复检', { count: data.overdueReviewCount })
                : data.attentionCount > 0
                  ? t('{count} 项', { count: data.attentionCount })
                  : undefined)
        : undefined,
    },
  ];

  return (
    <section className="spend-summary" aria-label={t('IP 节点总览')}>
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
