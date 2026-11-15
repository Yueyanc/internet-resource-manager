import type { Domain } from '@irm/api-client';
import { Card, Empty } from 'antd';
import dayjs from 'dayjs';
import { ShieldCheck } from 'lucide-react';

import { usePreferences } from '../../../app/preferences-context';
import { type DomainMetrics, maskDomainName } from '../utils/domain-metrics';
import { DomainMark } from './domain-mark';

export function DomainAttentionCard({
  data,
  masked,
  onSelect,
}: {
  data?: DomainMetrics;
  masked: boolean;
  onSelect: (domain: Domain) => void;
}) {
  const { t } = usePreferences();

  return (
    <Card
      className="utility-card"
      title={<h2 className="section-title">{t('续费与合规待办')}</h2>}
      extra={data && <span className="unit-label">{t('{count} 项', { count: data.attentionQueue.length })}</span>}
    >
      {!data
        ? <div className="side-empty">{t('待办数据不可用')}</div>
        : !data.attentionQueue.length
            ? (
                data.activeCount > 0
                  ? (
                      <div className="domain-all-clear-pill">
                        <ShieldCheck size={16} />
                        <span>{t('全部在用域名解析与续费状态良好')}</span>
                      </div>
                    )
                  : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('暂无续费或备案待办')} />
              )
            : (
                <div className="calendar-events">
                  {data.attentionQueue.slice(0, 6).map(({ domain, expiry, reason }) => {
                    let badge = '';
                    let danger = false;

                    if (reason === 'overdue') {
                      badge = t('已逾期');
                      danger = true;
                    }
                    else if (reason === 'transferring') {
                      badge = t('转移中');
                    }
                    else if (reason === 'icp_pending') {
                      badge = t('备案审核');
                    }
                    else if (reason === 'retiring') {
                      badge = t('计划释放');
                    }
                    else if (expiry.days !== null) {
                      danger = expiry.days <= 14;
                      badge = expiry.days === 0
                        ? t('今天到期')
                        : expiry.days <= 30
                          ? t('剩 {count} 天', { count: expiry.days })
                          : dayjs(expiry.date).format('MM/DD');
                    }

                    return (
                      <button
                        key={domain.id}
                        type="button"
                        className="calendar-event"
                        onClick={() => onSelect(domain)}
                      >
                        <DomainMark value={domain} size="sm" />
                        <span className="event-name font-mono text-[12.5px]">
                          {masked ? maskDomainName(domain.name) : domain.name}
                        </span>
                        <time className={danger ? 'text-red-500 font-medium' : ''}>{badge}</time>
                      </button>
                    );
                  })}
                </div>
              )}
    </Card>
  );
}
