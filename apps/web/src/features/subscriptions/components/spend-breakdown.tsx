import type { Preferences } from '@irm/api-client';
import { Card, Empty, Tooltip } from 'antd';

import type { MessageKey } from '../../../app/messages';
import { usePreferences } from '../../../app/preferences-context';
import { displayMoney } from '../utils/subscription-display';
import type { metrics } from '../utils/subscription-metrics';

const lightPalette: Record<string, string> = {
  ai: '#27272a',
  cloud: '#0d9488',
  software: '#d97706',
  network: '#57534e',
  life: '#65a30d',
  telecom: '#0284c7',
  other: '#a8a29e',
};
const darkPalette: Record<string, string> = {
  ai: '#10b981',
  cloud: '#0ea5e9',
  software: '#6366f1',
  network: '#14b8a6',
  life: '#34d399',
  telecom: '#38bdf8',
  other: '#64748b',
};
const labels: Record<string, MessageKey> = { ai: 'AI', cloud: '云', software: '工具', network: '网络', life: '生活', telecom: '通信', other: '其他' };

export function SpendBreakdown({ data, prefs }: { data?: ReturnType<typeof metrics>; prefs?: Preferences }) {
  const { t, locale, mode } = usePreferences();
  const palette = mode === 'dark' ? darkPalette : lightPalette;
  let offset = 0;
  const segments = data?.breakdown.map((item) => {
    const start = offset;
    offset += item.amount / data.monthly * 360;
    return `${palette[item.key]} ${start}deg ${offset}deg`;
  }) ?? [];
  return (
    <Card className="breakdown-section utility-card" title={<h2 className="section-title">{t('支出分布')}</h2>} extra={prefs && <span className="unit-label">{prefs.baseCurrency}</span>}>
      {!data
        ? <div className="side-empty">{t('花费数据不可用')}</div>
        : !data.breakdown.length
            ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('暂无周期支出')} />
            : (
                <div className="breakdown-content">
                  <div role="img" aria-label={data.breakdown.map(item => `${t(item.label)} ${displayMoney(item.amount, prefs?.baseCurrency ?? 'CNY', locale)}`).join(', ')} className="spend-donut" style={{ background: `conic-gradient(${segments.join(',')})` }} />
                  <div className="breakdown-legend">
                    {data.breakdown.map(item => (
                      <Tooltip key={item.key} title={`${t(item.label)} · ${displayMoney(item.amount, prefs?.baseCurrency ?? 'CNY', locale)}`} trigger={['hover', 'focus']}>
                        <div className="breakdown-row" tabIndex={0}>
                          <span>
                            <i className="legend-dot" style={{ background: palette[item.key] }} />
                            <span>{t(labels[item.key] ?? '其他')}</span>
                          </span>
                          <strong>{`${Math.round(item.amount / data.monthly * 100)}%`}</strong>
                        </div>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              )}
    </Card>
  );
}
