import { Card, Empty, Tooltip } from 'antd';
import { IdCard } from 'lucide-react';

import { usePreferences } from '../../../app/preferences-context';
import type { AccountMetrics } from '../utils/account-metrics';

export function AccountBreakdownCard({ data }: { data?: AccountMetrics }) {
  const { t } = usePreferences();
  let offset = 0;
  const total = data?.activeCount ?? 0;
  const segments = data && total > 0
    ? data.breakdown.map((item) => {
        const start = offset;
        offset += item.count / total * 360;
        return `${item.color} ${start}deg ${offset}deg`;
      })
    : [];
  const domesticPct = total > 0 && data ? Math.round(data.domesticCount / total * 100) : 0;
  const overseasPct = total > 0 ? 100 - domesticPct : 0;

  return (
    <Card
      className="breakdown-section utility-card"
      title={<h2 className="section-title">{t('生态与实名盘点')}</h2>}
    >
      {!data
        ? <div className="side-empty">{t('分布数据不可用')}</div>
        : !data.breakdown.length
            ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('暂无在用账号')} />
            : (
                <>
                  <div className="ecosystem-split">
                    <div className="ecosystem-split-labels">
                      <span>
                        {t('国内')}
                        {' '}
                        <strong>{data.domesticCount}</strong>
                        {' · '}
                        {t('海外')}
                        {' '}
                        <strong>{data.overseasCount}</strong>
                      </span>
                    </div>
                    <div className="ecosystem-pill-bar" aria-hidden="true">
                      {data.domesticCount > 0 && (
                        <span className="is-domestic" style={{ width: `${Math.max(18, domesticPct)}%` }}>
                          {data.domesticCount}
                        </span>
                      )}
                      {data.overseasCount > 0 && (
                        <span className="is-overseas" style={{ width: `${Math.max(18, overseasPct)}%` }}>
                          {data.overseasCount}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="breakdown-content">
                    <div
                      role="img"
                      aria-label={data.breakdown.map(item => `${t(item.label)} ${item.count}`).join(', ')}
                      className="spend-donut"
                      style={{ background: `conic-gradient(${segments.join(',')})` }}
                    />
                    <div className="breakdown-legend">
                      {data.breakdown.map(item => (
                        <Tooltip key={item.key} title={`${t(item.label)} · ${t('{count} 项', { count: item.count })}`} trigger={['hover', 'focus']}>
                          <div className="breakdown-row" tabIndex={0}>
                            <span>
                              <i className="legend-dot" style={{ background: item.color }} />
                              <span>{t(item.short)}</span>
                            </span>
                            <strong>{item.count}</strong>
                          </div>
                        </Tooltip>
                      ))}
                    </div>
                  </div>

                  <div className="kyc-footprint-callout">
                    <IdCard size={14} />
                    <span>{t('实名认证占用 {count} 项', { count: data.kycVerifiedCount })}</span>
                  </div>
                </>
              )}
    </Card>
  );
}
