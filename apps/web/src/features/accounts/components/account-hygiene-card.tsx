import type { Account } from '@irm/api-client';
import { App, Card, Empty, Tooltip } from 'antd';
import { Check, ShieldAlert, ShieldCheck } from 'lucide-react';

import { usePreferences } from '../../../app/preferences-context';
import { accountDisplayTitle, type AccountMetrics, checkinRemaining } from '../utils/account-metrics';
import { AccountMark } from './account-mark';

export function AccountHygieneCard({
  data,
  onSelect,
  onCheckin,
}: {
  data?: AccountMetrics;
  onSelect: (account: Account) => void;
  onCheckin?: (account: Account) => Promise<unknown>;
}) {
  const { t } = usePreferences();
  const { modal } = App.useApp();

  const confirmCheckin = (item: Account) => {
    if (!onCheckin) return;
    modal.confirm({
      title: t('确认已完成登录保活？'),
      content: t('下次保活提醒日期将按周期顺延。'),
      okText: t('确定'),
      cancelText: t('取消'),
      onOk: () => onCheckin(item),
    });
  };

  return (
    <Card
      className="utility-card"
      title={<h2 className="section-title">{t('安全与保活待办')}</h2>}
      extra={data && <span className="unit-label">{t('{count} 项', { count: data.hygieneQueue.length })}</span>}
    >
      {!data
        ? <div className="side-empty">{t('待办数据不可用')}</div>
        : !data.hygieneQueue.length && data.activeCount === 0
            ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('暂无临期保活或计划注销账号')} />
            : (
                <div className="hygiene-task-stack">
                  {data.hygieneQueue.slice(0, 5).map((item) => {
                    const days = checkinRemaining(item);
                    const canQuickCheckin = Boolean(onCheckin && item.status === 'active' && days !== null);
                    let detail = '';
                    let danger = false;

                    if (item.status === 'retiring') {
                      detail = item.kycStatus === 'verified' ? t('实名待解绑') : t('计划注销');
                      danger = item.kycStatus === 'verified';
                    }
                    else if (item.status === 'restricted') {
                      detail = t('风控受限');
                      danger = true;
                    }
                    else if (days !== null) {
                      danger = days <= 7;
                      detail = days < 0
                        ? t('已逾期 {count} 天未保活', { count: -days })
                        : days === 0
                          ? t('今天需完成保活')
                          : t('剩 {count} 天需保活', { count: days });
                    }

                    return (
                      <div key={item.id} className="hygiene-task-row">
                        {canQuickCheckin
                          ? (
                              <Tooltip title={t('确认已保活')}>
                                <button
                                  type="button"
                                  className="hygiene-checkbox-btn"
                                  aria-label={`${t('确认已保活')} ${accountDisplayTitle(item)}`}
                                  onClick={() => confirmCheckin(item)}
                                >
                                  <Check size={11} />
                                </button>
                              </Tooltip>
                            )
                          : <AccountMark value={item} size="xs" />}
                        <button
                          type="button"
                          className="hygiene-task-trigger"
                          onClick={() => onSelect(item)}
                        >
                          <span className="hygiene-task-title">{accountDisplayTitle(item)}</span>
                          <span className={`hygiene-task-sub ${danger ? 'is-danger' : ''}`}>
                            {detail}
                          </span>
                        </button>
                      </div>
                    );
                  })}

                  {data.activeCount > 0 && (
                    data.weakSecurityCount === 0
                      ? (
                          <div className="hygiene-posture-banner is-healthy">
                            <span className="hygiene-posture-check" aria-hidden="true">
                              <ShieldCheck size={13} />
                            </span>
                            <span>{t('恢复码与 2FA 姿态良好')}</span>
                          </div>
                        )
                      : (
                          <div className="hygiene-posture-banner is-warn">
                            <ShieldAlert size={13} />
                            <span>
                              {data.hubNo2faCount > 0
                                ? t('{count} 个核心号未开两步验证', { count: data.hubNo2faCount })
                                : t('安全待加固')}
                            </span>
                          </div>
                        )
                  )}
                </div>
              )}
    </Card>
  );
}
