import type { Subscription } from '@irm/api-client';
import { Button, Card, Empty, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { displayMoney } from '../utils/subscription-display';
import { renewalEvents } from '../utils/subscription-metrics';
import { ServiceMark } from './service-mark';

export function RenewalCalendar({ items, available, onSelect }: { items: Subscription[]; available: boolean; onSelect: (value: Subscription) => void }) {
  const { t, locale } = usePreferences();
  const [month, setMonth] = useState(() => dayjs().startOf('month'));
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const first = month.startOf('month');
  const start = first.subtract((first.day() + 6) % 7, 'day');
  const events = renewalEvents(items, first.format('YYYY-MM-DD'), month.endOf('month').format('YYYY-MM-DD'));
  const visible = selected ? events.filter(event => event.date === selected) : events;
  const changeMonth = (amount: number) => {
    setMonth(value => value.add(amount, 'month'));

    setSelected(null);

    setExpanded(false);
  };
  return (
    <>
      <Card
        className="calendar-section utility-card"
        aria-label={t('到期日历')}
        title={<h2 className="section-title">{t('续费日历')}</h2>}
        extra={(
          <Tooltip title={t('本月')}>
            <Button
              type="text"
              size="small"
              aria-label={t('本月')}
              icon={<RotateCcw size={13} />}
              onClick={() => {
                setMonth(dayjs().startOf('month'));

                setSelected(null);
              }}
            />
          </Tooltip>
        )}
      >
        <div className="calendar-heading">
          <Tooltip title={t('上个月')}><Button size="small" type="text" aria-label={t('上个月')} icon={<ChevronLeft size={15} />} onClick={() => changeMonth(-1)} /></Tooltip>
          <strong>{month.locale(locale === 'zh-CN' ? 'zh-cn' : 'en').format(locale === 'zh-CN' ? 'YYYY 年 M 月' : 'MMM YYYY')}</strong>
          <Tooltip title={t('下个月')}><Button size="small" type="text" aria-label={t('下个月')} icon={<ChevronRight size={15} />} onClick={() => changeMonth(1)} /></Tooltip>
        </div>
        <div className="calendar-weekdays">{(['一', '二', '三', '四', '五', '六', '日'] as const).map(day => <span key={day}>{t(day)}</span>)}</div>
        <div className="calendar-grid">
          {Array.from({ length: 42 }, (_, i) => {
            const date = start.add(i, 'day');
            const key = date.format('YYYY-MM-DD');
            const matches = events.filter(event => event.date === key);
            return (
              <button
                type="button"
                key={key}
                aria-label={key}
                aria-pressed={key === selected}
                className={`calendar-day ${date.month() !== month.month() ? 'outside' : ''} ${date.isSame(dayjs(), 'day') ? 'today' : ''} ${key === selected ? 'selected' : ''} ${matches.length > 1 ? 'multiple' : ''}`}
                onClick={() => {
                  setSelected(value => value === key ? null : key);

                  setExpanded(false);
                }}
              >
                <span>{date.date()}</span>
                {matches.length > 0 && <i className={matches.some(event => event.subscription.intention === 'cancel') ? 'danger' : ''} />}
              </button>
            );
          })}
        </div>
      </Card>
      <Card className="renewals-section utility-card" title={<h2 className="section-title">{selected ? dayjs(selected).format('MM/DD') : t('最近续费')}</h2>} extra={visible.length > 3 && <Tooltip title={t(expanded ? '收起日程' : '查看全部日程')}><Button type="text" size="small" aria-label={t(expanded ? '收起日程' : '查看全部日程')} icon={<ChevronRight size={15} className={expanded ? 'rotate-90' : ''} />} onClick={() => setExpanded(value => !value)} /></Tooltip>}>
        {!available
          ? <div className="side-empty">{t('日程数据不可用')}</div>
          : !visible.length
              ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(selected ? '这一天没有到期订阅' : '本月没有到期订阅')} />
              : (
                  <div className="calendar-events">
                    {(expanded ? visible : visible.slice(0, 3)).map(event => (
                      <Tooltip key={`${event.date}-${event.subscription.id}`} title={displayMoney(event.subscription.amountMinor / 100, event.subscription.currency, locale)}>
                        <button type="button" className="calendar-event" onClick={() => onSelect(event.subscription)}>
                          <ServiceMark value={event.subscription} size="sm" />
                          <span className="event-name">{event.subscription.name}</span>
                          <time dateTime={event.date}>{dayjs(event.date).format('MM/DD')}</time>
                          {event.subscription.intention === 'cancel' && <i className="legend-dot danger" />}
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                )}
      </Card>
    </>
  );
}
