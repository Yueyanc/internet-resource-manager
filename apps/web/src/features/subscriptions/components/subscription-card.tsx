import type { Account, Preferences, Subscription } from '@irm/api-client';
import { App, Button, Card, Dropdown, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { Archive, ArrowUpRight, Eye, MoreHorizontal, Pencil, RotateCw, ShieldAlert, Star, Trash2, TriangleAlert } from 'lucide-react';

import { usePreferences } from '../../../app/preferences-context';
import { accountDisplayTitle } from '../../accounts/utils/account-metrics';
import { cycleLabel, displayMoney, dueText } from '../utils/subscription-display';
import { categories, remaining } from '../utils/subscription-metrics';
import { ServiceMark } from './service-mark';

export function SubscriptionCard({
  value,
  prefs,
  account,
  billingAccount,
  onEdit,
  onDetails,
  onRenew,
  onDelete,
  renewing,
}: {
  value: Subscription;
  prefs?: Preferences;
  account?: Account;
  billingAccount?: Account;
  onEdit: () => void;
  onDetails: () => void;
  onRenew: () => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  renewing: boolean;
}) {
  const { t, locale } = usePreferences();
  const { modal } = App.useApp();
  const confirmRenew = () => modal.confirm({
    title: t('确认已完成本期付款？'),
    content: t('到期日将顺延一个计费周期。'),
    okText: t('确定'),
    cancelText: t('取消'),
    onOk: onRenew,
  });
  const fullPrice = `${value.currency} ${(value.amountMinor / 100).toFixed(2)}`;
  const higher = value.renewalAmountMinor > value.amountMinor;
  const daysLeft = remaining(value);
  const dueState = value.archived
    ? 'is-muted'
    : daysLeft < 0
      ? 'is-overdue'
      : daysLeft <= 3
        ? 'is-soon'
        : '';

  const riskyUpstream = !value.archived
    ? [account, billingAccount].find(item => item && (item.status === 'restricted' || item.status === 'retiring'))
    : undefined;

  const subtitleParts = account
    ? [
        accountDisplayTitle(account),
        billingAccount
          ? t('{platform} 代扣', { platform: billingAccount.platform })
          : t(value.renewalMode === 'auto' ? '自动扣款' : '手动续费'),
      ]
    : billingAccount
      ? [
          t(categories[value.category].label),
          t('{platform} 代扣', { platform: billingAccount.platform }),
        ]
      : [
          t(categories[value.category].label),
          t(value.renewalMode === 'auto' ? '自动扣款' : '手动续费'),
        ];

  return (
    <Card className={`subscription-card ${value.archived ? 'is-archived' : ''}`}>
      <button type="button" className="subscription-face" aria-label={t('查看 {name}', { name: value.name })} onClick={onDetails}>
        <div className="subscription-identity">
          <ServiceMark value={value} size="md" />
          <div className="subscription-title-group">
            <h2 title={value.name}>{value.name}</h2>
            <span className="subscription-subtitle" title={subtitleParts.join(' · ')}>
              {subtitleParts.join(' · ')}
            </span>
          </div>
        </div>
        <div className="subscription-bottom">
          <div className="subscription-price">
            <Tooltip title={`${fullPrice}${prefs ? ` · ${t('本位币')} ${prefs.baseCurrency}` : ''}`}>
              <strong>{displayMoney(value.amountMinor / 100, value.currency, locale, true)}</strong>
            </Tooltip>
            <span>
              /
              {' '}
              {cycleLabel(value, t)}
            </span>
          </div>
          <div className="subscription-meta-right">
            <div className="card-signals">
              {riskyUpstream && (
                <Tooltip
                  title={t(
                    riskyUpstream.status === 'restricted'
                      ? '关联的上游账号「{name}」当前处于风控受限状态，请留意续费扣款与服务可用性。'
                      : '关联的上游账号「{name}」已标记计划注销，销号前请先关闭自动续费或换绑账号。',
                    { name: accountDisplayTitle(riskyUpstream) },
                  )}
                >
                  <ShieldAlert size={13} className="text-amber-500" aria-label={t('上游账号待处理')} />
                </Tooltip>
              )}
              {value.intention === 'cancel' && !value.archived && (
                <Tooltip title={t('到期必退')}>
                  <span className="cancel-signal" aria-label={t('到期必退')} />
                </Tooltip>
              )}
              {value.intention === 'keep' && (
                <Tooltip title={t('绝版必留')}>
                  <Star size={13} aria-label={t('绝版必留')} />
                </Tooltip>
              )}
              {value.archived && <Archive size={13} aria-label={t('已归档')} />}
              {higher && (
                <Tooltip title={t('续费恢复为 {amount}', { amount: `${value.currency} ${(value.renewalAmountMinor / 100).toFixed(2)}` })}>
                  <TriangleAlert size={13} aria-label={t('续费原价')} />
                </Tooltip>
              )}
            </div>
            <Tooltip title={`${value.dueDate} · ${dueText(value, t)}`}>
              <time dateTime={value.dueDate} className={`due-badge ${dueState}`}>
                {value.archived
                  ? t('已归档')
                  : value.cycle === 'once'
                    ? dayjs(value.dueDate).format('MM/DD')
                    : t('{date} 续费', { date: dayjs(value.dueDate).format('MM/DD') })}
              </time>
            </Tooltip>
          </div>
        </div>
      </button>
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        menu={{
          items: [
            { key: 'details', label: t('查看详情'), icon: <Eye size={14} /> },
            { key: 'edit', label: t('编辑订阅'), icon: <Pencil size={14} /> },
            { key: 'renew', label: t('顺延一周期'), icon: <RotateCw size={14} />, disabled: value.archived || value.cycle === 'once' || renewing },
            ...(value.managementUrl ? [{ key: 'manage', label: <a href={value.managementUrl} target="_blank" rel="noopener noreferrer">{t('打开管理 / 退订网址')}</a>, icon: <ArrowUpRight size={14} /> }] : []),
            ...(value.archived ? [{ key: 'delete', label: t('永久删除'), danger: true, icon: <Trash2 size={14} /> }] : []),
          ],
          onClick: ({ key }) => {
            if (key === 'details') onDetails();
            if (key === 'edit') onEdit();
            if (key === 'renew') confirmRenew();
            if (key === 'delete') modal.confirm({ title: t('永久删除这笔订阅？'), content: t('删除后无法恢复。'), okButtonProps: { danger: true }, onOk: onDelete });
          },
        }}
      >
        <Tooltip title={t('更多操作')}>
          <Button className="card-menu" type="text" aria-label={t('操作 {name}', { name: value.name })} icon={<MoreHorizontal size={17} />} loading={renewing} />
        </Tooltip>
      </Dropdown>
    </Card>
  );
}
