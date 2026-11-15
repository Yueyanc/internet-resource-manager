import type { IpNode, Subscription } from '@irm/api-client';
import { Card, Empty } from 'antd';
import dayjs from 'dayjs';

import { usePreferences } from '../../../app/preferences-context';
import { ipDisplayTitle, type IpMetrics, reviewRemaining, subscriptionAlert } from '../utils/ip-metrics';
import { IpMark } from './ip-mark';

export function IpHygieneCard({
  data,
  subscriptionsById,
  onSelect,
}: {
  data?: IpMetrics;
  subscriptionsById: Map<string, Subscription>;
  onSelect: (node: IpNode) => void;
}) {
  const { t } = usePreferences();

  return (
    <Card
      className="utility-card"
      title={<h2 className="section-title">{t('异常与复检待办')}</h2>}
      extra={data && <span className="unit-label">{t('{count} 项', { count: data.hygieneQueue.length })}</span>}
    >
      {!data
        ? <div className="side-empty">{t('待办数据不可用')}</div>
        : !data.hygieneQueue.length
            ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('暂无异常、临期复检或待迁出节点')} />
            : (
                <div className="calendar-events">
                  {data.hygieneQueue.slice(0, 6).map((item) => {
                    const days = reviewRemaining(item);
                    const subAlert = subscriptionAlert(item, subscriptionsById);
                    let badge = '';
                    let danger = false;

                    if (item.status === 'blocked') {
                      badge = t('被墙 / 封禁');
                      danger = true;
                    }
                    else if (item.probeMode !== 'none' && item.probeStatus === 'unreachable') {
                      badge = t('无法连通');
                      danger = true;
                    }
                    else if (item.riskLevel === 'high') {
                      badge = t('高危 / 黑名单');
                      danger = true;
                    }
                    else if (item.status === 'degraded') {
                      badge = t('质量降级');
                      danger = true;
                    }
                    else if (subAlert !== null) {
                      badge = t('续费预警');
                      danger = subAlert === 'cancel';
                    }
                    else if (item.status === 'retiring') {
                      badge = t('计划迁移');
                    }
                    else if (days !== null) {
                      danger = days <= 7;
                      badge = days < 0 ? t('逾期复检') : dayjs(item.nextReviewDate).format('MM/DD');
                    }

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="calendar-event"
                        onClick={() => onSelect(item)}
                      >
                        <IpMark value={item} size="sm" />
                        <span className="event-name">{ipDisplayTitle(item)}</span>
                        <time className={danger ? 'text-red-500 font-medium' : ''}>{badge}</time>
                      </button>
                    );
                  })}
                </div>
              )}
    </Card>
  );
}
