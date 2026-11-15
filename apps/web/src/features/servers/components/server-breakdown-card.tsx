import { Card, Empty, Tooltip } from 'antd';

import { usePreferences } from '../../../app/preferences-context';
import { formatDisk, formatMemory, type ServerMetrics } from '../utils/server-metrics';

export function ServerBreakdownCard({ data }: { data?: ServerMetrics }) {
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

  return (
    <Card
      className="breakdown-section utility-card"
      title={<h2 className="section-title">{t('算力汇总与类型分布')}</h2>}
    >
      {!data
        ? <div className="side-empty">{t('分布数据不可用')}</div>
        : !data.breakdown.length
            ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('暂无在役服务器')} />
            : (
                <>
                  <div className="server-capacity-strip">
                    <div className="server-capacity-cell">
                      <span>{t('总核数')}</span>
                      <strong>{data.totalCores > 0 ? `${data.totalCores}C` : '—'}</strong>
                    </div>
                    <div className="server-capacity-cell">
                      <span>{t('总内存')}</span>
                      <strong>{formatMemory(data.totalMemoryMb) || '—'}</strong>
                    </div>
                    <div className="server-capacity-cell">
                      <span>{t('总存储')}</span>
                      <strong>{formatDisk(data.totalDiskGb) || '—'}</strong>
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
                        <Tooltip key={item.key} title={`${t(item.label)} · ${t('{count} 台', { count: item.count })}`} trigger={['hover', 'focus']}>
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
                </>
              )}
    </Card>
  );
}
