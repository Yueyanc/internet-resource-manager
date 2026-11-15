import type { Account } from '@irm/api-client';
import { App, Card, Empty, Tooltip } from 'antd';
import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { accountDisplayTitle, type AccountMetrics } from '../utils/account-metrics';
import { AccountMark } from './account-mark';

export function AccountHubsCard({
  data,
  activeHubId,
  onSelectHub,
}: {
  data?: AccountMetrics;
  activeHubId?: string;
  onSelectHub: (hubId: string) => void;
}) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
    }
  }, []);

  const copyHubIdentifier = async (account: Account) => {
    try {
      await navigator.clipboard.writeText(account.identifier);
      setCopiedId(account.id);
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        setCopiedId(prev => (prev === account.id ? null : prev));
      }, 1800);
      void message.success(t('已复制登录标识'));
    }
    catch {
      /* Ignore clipboard denial. */
    }
  };

  return (
    <Card
      className="utility-card"
      title={<h2 className="section-title">{t('核心身份枢纽')}</h2>}
      extra={data && <span className="unit-label">{t('{count} 项', { count: data.hubCount })}</span>}
    >
      {!data
        ? <div className="side-empty">{t('枢纽数据不可用')}</div>
        : !data.hubs.length
            ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('暂无枢纽身份，可将主邮箱或微信设为核心枢纽')} />
            : (
                <div className="calendar-events hub-list">
                  {data.hubs.slice(0, 6).map(({ account, downstreamCount }) => {
                    const selected = activeHubId === account.id;
                    const hubName = accountDisplayTitle(account);
                    const isCopied = copiedId === account.id;
                    return (
                      <div key={account.id} className={`hub-row-item ${selected ? 'is-selected' : ''}`}>
                        <button
                          type="button"
                          className={`hub-row-trigger ${selected ? 'is-selected' : ''}`}
                          aria-pressed={selected}
                          onClick={() => onSelectHub(account.id)}
                        >
                          <AccountMark value={account} size="sm" />
                          <span className="event-name">{hubName}</span>
                          <span className="hub-count-pill is-warm">
                            {t('{count} 关联', { count: downstreamCount })}
                          </span>
                        </button>
                        <Tooltip title={t('复制标识')}>
                          <button
                            type="button"
                            className={`hub-copy-btn ${isCopied ? 'is-copied' : ''}`}
                            aria-label={t('复制 {name} 登录标识', { name: hubName })}
                            onClick={() => { void copyHubIdentifier(account); }}
                          >
                            {isCopied ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                        </Tooltip>
                      </div>
                    );
                  })}
                </div>
              )}
    </Card>
  );
}
