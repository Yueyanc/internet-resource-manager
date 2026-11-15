import type { Preferences } from '@irm/api-client';
import { Card, Statistic, Tooltip } from 'antd';
import { CalendarClock, ChartNoAxesCombined, Clock3, Wallet } from 'lucide-react';
import type { CSSProperties } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { displayMoney } from '../utils/subscription-display';
import type { metrics } from '../utils/subscription-metrics';

export function SpendSummaryStrip({ data, prefs }: { data?: ReturnType<typeof metrics>; prefs?: Preferences }) {
  const { t, locale, mode } = usePreferences();
  const isDark = mode === 'dark';
  const amount = (value: number) => displayMoney(value, prefs?.baseCurrency ?? 'CNY', locale, true);
  const stats = [
    {
      title: t('月均'),
      full: t('月均折算成本'),
      icon: Wallet,
      tint: isDark ? '#10b981' : '#27272a',
      value: data ? amount(data.monthly) : '—',
      hint: prefs?.baseCurrency,
      caption: prefs ? `${t('本位币')} ${prefs.baseCurrency}` : t('待加载'),
    },
    {
      title: t('年度'),
      full: t('年度折算总支出'),
      icon: ChartNoAxesCombined,
      tint: isDark ? '#14b8a6' : '#57534e',
      value: data ? amount(data.yearly) : '—',
      hint: t('全年周期预算'),
      caption: t('全年周期预算'),
    },
    {
      title: t('本月待付'),
      full: t('本月剩余待付'),
      icon: CalendarClock,
      tint: isDark ? '#0ea5e9' : '#0d9488',
      value: data ? amount(data.pendingAmount) : '—',
      hint: data ? t('{count} 笔计划扣款', { count: data.pendingCount }) : t('待加载'),
      caption: data ? t('{count} 笔计划扣款', { count: data.pendingCount }) : t('待加载'),
    },
    {
      title: t('即将到期'),
      full: t('30 天内到期'),
      icon: Clock3,
      tint: data?.cancelling ? '#dc2626' : '#d97706',
      value: data?.expiring ?? '—',
      hint: t('30 天内到期'),
      caption: data?.cancelling ? undefined : t('暂无待退订预警'),
    },
  ];
  return (
    <section className="spend-summary" aria-label={t('花费速览')}>
      {stats.map((stat, index) => (
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
          {index === 3 && !!data?.cancelling
            ? <span className="stat-warning">{t('含 {count} 项待退订', { count: data.cancelling })}</span>
            : <span className="stat-caption">{stat.caption}</span>}
        </Card>
      ))}
    </section>
  );
}
