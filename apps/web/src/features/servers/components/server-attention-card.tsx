import type { ServerHost } from '@irm/api-client';
import { Card, Empty } from 'antd';
import dayjs from 'dayjs';

import { usePreferences } from '../../../app/preferences-context';
import type { ServerMetrics } from '../utils/server-metrics';
import { ServerMark } from './server-mark';

export function ServerAttentionCard({
  data,
  onSelect,
}: {
  data?: ServerMetrics;
  onSelect: (server: ServerHost) => void;
}) {
  const { t } = usePreferences();

  return (
    <Card
      className="utility-card"
      title={<h2 className="section-title">{t('续费与维护待办')}</h2>}
      extra={data && <span className="unit-label">{t('{count} 项', { count: data.attentionQueue.length })}</span>}
    >
      {!data
        ? <div className="side-empty">{t('待办数据不可用')}</div>
        : !data.attentionQueue.length
            ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('暂无临期续费、维护或计划退役服务器')} />
            : (
                <div className="calendar-events">
                  {data.attentionQueue.slice(0, 6).map(({ server, expiry }) => {
                    let badge = '';
                    let danger = false;
                    if (server.telemetry.agentStatus === 'stale') {
                      badge = t('心跳丢失');
                      danger = true;
                    }
                    else if (expiry.subscription?.intention === 'cancel') {
                      badge = t('到期必退');
                      danger = true;
                    }
                    else if (server.status === 'retiring') {
                      badge = t('计划退役');
                      danger = true;
                    }
                    else if (server.status === 'maintenance') {
                      badge = t('维护调试');
                    }
                    else if (server.status === 'standby') {
                      badge = t('冷备待命');
                    }
                    else if (expiry.days !== null) {
                      danger = expiry.days <= 7;
                      badge = expiry.days < 0
                        ? t('已逾期 {count} 天', { count: -expiry.days })
                        : dayjs(expiry.date).format('MM/DD');
                    }

                    return (
                      <button
                        key={server.id}
                        type="button"
                        className="calendar-event"
                        onClick={() => onSelect(server)}
                      >
                        <ServerMark value={server} size="sm" />
                        <span className="event-name">{server.name}</span>
                        <time className={danger ? 'text-red-500 font-medium' : ''}>{badge}</time>
                      </button>
                    );
                  })}
                </div>
              )}
    </Card>
  );
}
