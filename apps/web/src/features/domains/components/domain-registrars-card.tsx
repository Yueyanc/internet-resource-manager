import { Card, Empty } from 'antd';

import { usePreferences } from '../../../app/preferences-context';
import type { DomainMetrics } from '../utils/domain-metrics';
import { DomainMark } from './domain-mark';

export function DomainRegistrarsCard({
  data,
  activeRegistrar,
  onSelectRegistrar,
}: {
  data?: DomainMetrics;
  activeRegistrar?: string;
  onSelectRegistrar: (registrarKey: string) => void;
}) {
  const { t } = usePreferences();

  return (
    <Card
      className="utility-card"
      title={<h2 className="section-title">{t('注册商与权威托管')}</h2>}
      extra={data && <span className="unit-label">{t('{count} 家', { count: data.registrars.length })}</span>}
    >
      {!data
        ? <div className="side-empty">{t('托管数据不可用')}</div>
        : !data.registrars.length
            ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('暂未标记注册商')} />
            : (
                <>
                  <div className="calendar-events">
                    {data.registrars.slice(0, 6).map((entry) => {
                      const selected = activeRegistrar === entry.key;
                      return (
                        <button
                          key={entry.key}
                          type="button"
                          className={`calendar-event hub-row ${selected ? 'is-selected' : ''}`}
                          aria-pressed={selected}
                          onClick={() => onSelectRegistrar(entry.key)}
                        >
                          <DomainMark
                            preset={entry.preset}
                            value={{
                              presetKey: entry.preset?.key ?? '',
                              registrar: entry.registrar,
                              dnsProvider: entry.dnsHint,
                              name: '',
                              purpose: 'prod',
                            }}
                            size="sm"
                          />
                          <span className="event-name">{entry.registrar}</span>
                          <span className="hub-count-pill is-ready">
                            {t('{count} 域名', { count: entry.count })}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="ip-aside-hint">{t('点击注册商可快速筛选名下域名')}</p>
                </>
              )}
    </Card>
  );
}
