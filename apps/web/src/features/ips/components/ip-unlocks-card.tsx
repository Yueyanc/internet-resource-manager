import type { IpUnlockService } from '@irm/api-client';
import { Card } from 'antd';

import { usePreferences } from '../../../app/preferences-context';
import { type IpMetrics, ipUnlockMeta } from '../utils/ip-metrics';
import { UnlockServiceIcon } from './ip-mark';

export function IpUnlocksCard({
  data,
  activeService,
  onSelectService,
}: {
  data?: IpMetrics;
  activeService?: IpUnlockService;
  onSelectService: (service: IpUnlockService) => void;
}) {
  const { t } = usePreferences();

  return (
    <Card
      className="utility-card"
      title={<h2 className="section-title">{t('解锁覆盖与独享出口')}</h2>}
      extra={data && <span className="unit-label">{t('{count} 项', { count: data.unlockReadyCount })}</span>}
    >
      {!data
        ? <div className="side-empty">{t('解锁数据不可用')}</div>
        : (
            <>
              <div className="calendar-events">
                {data.unlockCoverage.map(({ service, fullCount, partialCount }) => {
                  const selected = activeService === service;
                  const meta = ipUnlockMeta[service];
                  return (
                    <button
                      key={service}
                      type="button"
                      className={`calendar-event hub-row ${selected ? 'is-selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => onSelectService(service)}
                    >
                      <UnlockServiceIcon service={service} />
                      <span className="event-name">{meta.label}</span>
                      <span className={`hub-count-pill ${fullCount > 0 ? 'is-ready' : ''}`}>
                        {partialCount > 0 && fullCount === 0
                          ? `${partialCount} ${t('仅自制 / 受限')}`
                          : t('{count} 可用', { count: fullCount })}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="ip-aside-hint">{t('点击服务可筛选全解锁节点')}</p>
            </>
          )}
    </Card>
  );
}
