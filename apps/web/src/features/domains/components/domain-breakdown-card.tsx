import { Card, Empty, Tooltip } from 'antd';
import { ShieldCheck } from 'lucide-react';

import { usePreferences } from '../../../app/preferences-context';
import type { DomainMetrics } from '../utils/domain-metrics';

export function DomainBreakdownCard({
  data,
  activeTld,
  onSelectTld,
}: {
  data?: DomainMetrics;
  activeTld: string;
  onSelectTld: (tld: string) => void;
}) {
  const { t } = usePreferences();
  let offset = 0;
  const total = data?.activeCount ?? 0;
  const segments = data && total > 0
    ? data.breakdown.map((item) => {
        const start = offset;
        offset += (item.count / total) * 360;
        return `${item.color} ${start}deg ${offset}deg`;
      })
    : [];
  const whoisPct = total > 0 && data ? Math.round((data.whoisPrivacyCount / total) * 100) : 0;

  return (
    <Card
      className="breakdown-section utility-card"
      title={<h2 className="section-title">{t('用途与后缀盘点')}</h2>}
    >
      {!data
        ? <div className="side-empty">{t('盘点数据不可用')}</div>
        : !data.breakdown.length
            ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('暂无在用域名')} />
            : (
                <>
                  <div className="ecosystem-split">
                    <div className="ecosystem-split-labels">
                      <span>{`${t('WHOIS 隐私')} ${data.whoisPrivacyCount}`}</span>
                      <span>{`${t('ICP 已备案')} ${data.icpVerifiedCount}`}</span>
                    </div>
                    <div className="ecosystem-split-bar" aria-hidden="true">
                      <span style={{ width: `${whoisPct}%` }} />
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
                        <Tooltip
                          key={item.key}
                          title={`${t(item.label)} · ${t('{count} 项', { count: item.count })}`}
                          trigger={['hover', 'focus']}
                        >
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

                  {data.tlds.length > 0 && (
                    <div className="domain-tld-cloud" aria-label={t('后缀分布')}>
                      {data.tlds.slice(0, 8).map((item) => {
                        const selected = activeTld === item.tld;
                        return (
                          <button
                            key={item.tld}
                            type="button"
                            aria-pressed={selected}
                            className={`domain-tld-chip ${selected ? 'is-selected' : ''}`}
                            onClick={() => onSelectTld(selected ? 'all' : item.tld)}
                          >
                            <code>{item.tld}</code>
                            <span>{item.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {data.whoisPrivacyCount === data.activeCount && data.activeCount > 0 && (
                    <div className="domain-privacy-footnote">
                      <ShieldCheck size={13} />
                      <span>{t('WHOIS 隐私保护已全覆盖')}</span>
                    </div>
                  )}
                </>
              )}
    </Card>
  );
}
