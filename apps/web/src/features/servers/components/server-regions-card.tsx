import { Card, Empty, Tooltip } from 'antd';
import { MapPin } from 'lucide-react';

import { usePreferences } from '../../../app/preferences-context';
import { serverRegionPresets } from '../presets/server-presets';
import type { ServerMetrics } from '../utils/server-metrics';

export function ServerRegionsCard({
  data,
  activeRegion,
  onSelectRegion,
}: {
  data?: ServerMetrics;
  activeRegion?: string;
  onSelectRegion: (region: string) => void;
}) {
  const { t, locale } = usePreferences();

  const regionName = (code: string) => {
    const matched = serverRegionPresets.find(item => item.code === code);
    if (!matched) return code;
    return locale === 'en-US' ? matched.en : matched.zh;
  };

  return (
    <Card
      className="utility-card"
      title={(
        <Tooltip title={t('点击地区可快速筛选服务器')}>
          <h2 className="section-title">{t('机房地区分布')}</h2>
        </Tooltip>
      )}
      extra={data && <span className="unit-label">{t('{count} 项', { count: data.regions.length })}</span>}
    >
      {!data
        ? <div className="side-empty">{t('地区数据不可用')}</div>
        : !data.regions.length
            ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('暂无在役服务器')} />
            : (
                <div className="calendar-events">
                  {data.regions.slice(0, 7).map(({ region, count }) => {
                    const selected = activeRegion === region;
                    return (
                      <button
                        key={region}
                        type="button"
                        className={`calendar-event hub-row ${selected ? 'is-selected' : ''}`}
                        aria-pressed={selected}
                        onClick={() => onSelectRegion(region)}
                      >
                        <span className="service-mark size-sm is-fallback" aria-hidden="true">
                          <MapPin size={14} strokeWidth={1.8} />
                        </span>
                        <span className="event-name">{regionName(region)}</span>
                        <span className="hub-count-pill">{t('{count} 台', { count })}</span>
                      </button>
                    );
                  })}
                </div>
              )}
    </Card>
  );
}
