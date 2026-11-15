import { Card, Empty, Tooltip } from 'antd';

import { usePreferences } from '../../../app/preferences-context';
import type { IpMetrics } from '../utils/ip-metrics';

export function IpBreakdownCard({ data }: { data?: IpMetrics }) {
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
  const nativePct = total > 0 && data ? Math.round(data.nativeOrIspCount / total * 100) : 0;

  return (
    <Card
      className="breakdown-section utility-card"
      title={<h2 className="section-title">{t('属性与地区分布')}</h2>}
    >
      {!data
        ? <div className="side-empty">{t('分布数据不可用')}</div>
        : !data.breakdown.length
            ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('暂无在用节点')} />
            : (
                <>
                  <div className="ecosystem-split">
                    <div className="ecosystem-split-labels">
                      <span>{`${t('住宅/ISP')} ${data.nativeOrIspCount}`}</span>
                      <span>{`${t('机房/其他')} ${data.hostingOrOtherCount}`}</span>
                    </div>
                    <div className="ecosystem-split-bar" aria-hidden="true">
                      <span style={{ width: `${nativePct}%` }} />
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
                  {data.topRegions.length > 0 && (
                    <div className="ip-region-chips" aria-label={t('主要地区')}>
                      {data.topRegions.map(item => (
                        <span key={item.region} className="account-mini-tag">
                          {`${item.region} · ${item.count}`}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
    </Card>
  );
}
