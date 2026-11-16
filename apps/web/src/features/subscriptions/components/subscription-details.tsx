import type { Account, Domain, IpNode, Preferences, ServerHost, Subscription } from '@irm/api-client';
import { Link } from '@tanstack/react-router';
import { Alert, App, Button, Descriptions, Drawer, Progress } from 'antd';
import { ArrowUpRight, Globe, Pencil, RotateCw } from 'lucide-react';

import { usePreferences } from '../../../app/preferences-context';
import { AccountMark } from '../../accounts/components/account-mark';
import { accountDisplayTitle } from '../../accounts/utils/account-metrics';
import { ipDisplayTitle } from '../../ips/utils/ip-metrics';
import { cycleLabel, displayMoney, dueText } from '../utils/subscription-display';
import { categories, convert, periodDays, remaining } from '../utils/subscription-metrics';
import { ServiceMark } from './service-mark';

export function SubscriptionDetails({
  value,
  prefs,
  linkedAccount,
  billingAccount,
  linkedDomains = [],
  linkedServers = [],
  linkedIps = [],
  onClose,
  onEdit,
  onRenew,
  renewing,
}: {
  value: Subscription;
  prefs?: Preferences;
  linkedAccount?: Account;
  billingAccount?: Account;
  linkedDomains?: Domain[];
  linkedServers?: ServerHost[];
  linkedIps?: IpNode[];
  onClose: () => void;
  onEdit: () => void;
  onRenew: () => Promise<unknown>;
  renewing: boolean;
}) {
  const { t, locale } = usePreferences();
  const { modal } = App.useApp();
  const fallback = t('未填写');

  const upstreamAccounts = [
    ...(linkedAccount ? [{ account: linkedAccount, role: t('权益归属') }] : []),
    ...(billingAccount && billingAccount.id !== linkedAccount?.id
      ? [{ account: billingAccount, role: t('代扣渠道') }]
      : []),
  ];

  const items = [
    { key: 'name', label: t('订阅名称'), children: value.name },
    { key: 'amount', label: t('金额'), children: `${value.currency} ${(value.amountMinor / 100).toFixed(2)} / ${cycleLabel(value, t)}` },
    ...(prefs ? [{ key: 'converted', label: t('本位币'), children: displayMoney(convert(value.amountMinor, value.currency, prefs), prefs.baseCurrency, locale) }] : []),
    { key: 'category', label: t('所属分类'), children: t(categories[value.category].label) },
    { key: 'due', label: t('下次到期'), children: `${value.dueDate} · ${dueText(value, t)}` },
    { key: 'mode', label: t('续费方式'), children: t(value.renewalMode === 'auto' ? '自动扣款' : '手动续费') },
    { key: 'intention', label: t('续退意向'), children: t(value.intention === 'cancel' ? '到期必退' : value.intention === 'keep' ? '绝版必留' : '正常续用') },
    {
      key: 'account',
      label: t('权益归属账号'),
      children: linkedAccount
        ? (
            <Link to="/accounts" search={{ detail: linkedAccount.id }} className="account-link-chip" onClick={onClose}>
              {`${accountDisplayTitle(linkedAccount)} (${linkedAccount.identifier})`}
            </Link>
          )
        : (value.account || t('未关联账号')),
    },
    ...(billingAccount
      ? [{
          key: 'billingAccount',
          label: t('代扣 / 商店账号'),
          children: (
            <Link to="/accounts" search={{ detail: billingAccount.id }} className="account-link-chip" onClick={onClose}>
              {`${accountDisplayTitle(billingAccount)} (${billingAccount.identifier})`}
            </Link>
          ),
        }]
      : []),
    ...(linkedAccount && value.account
      ? [{ key: 'accountNote', label: t('补充账号备注'), children: value.account }]
      : []),
    { key: 'payment', label: t('支付方式'), children: value.paymentMethod || fallback },
    { key: 'renewal', label: t('续费原价'), children: value.renewalAmountMinor ? `${value.currency} ${(value.renewalAmountMinor / 100).toFixed(2)}` : fallback },
    { key: 'url', label: t('管理 / 退订网址'), children: value.managementUrl ? <a href={value.managementUrl} target="_blank" rel="noopener noreferrer">{value.managementUrl}</a> : fallback },
    { key: 'notes', label: t('备注'), children: <span className="detail-notes">{value.notes || fallback}</span> },
    { key: 'archived', label: t('已停用归档'), children: value.archived ? t('已归档') : '—' },
  ];

  const infraCount = linkedServers.length + linkedIps.length;

  return (
    <Drawer
      open
      title={t('订阅详情')}
      size={480}
      onClose={onClose}
      footer={(
        <div className="detail-actions">
          <Button icon={<Pencil size={14} />} onClick={onEdit}>{t('编辑订阅')}</Button>
          <Button
            type="primary"
            icon={<RotateCw size={14} />}
            disabled={value.archived || value.cycle === 'once'}
            loading={renewing}
            onClick={() => {
              modal.confirm({
                title: t('确认已完成本期付款？'),
                content: t('到期日将顺延一个计费周期。'),
                onOk: onRenew,
              });
            }}
          >
            {t('顺延一周期')}
          </Button>
        </div>
      )}
    >
      <div className="detail-hero">
        <ServiceMark value={value} size="lg" />
        <div className="detail-hero-meta">
          <h3>{value.name}</h3>
          <span>{`${displayMoney(value.amountMinor / 100, value.currency, locale)} / ${cycleLabel(value, t)}`}</span>
        </div>
      </div>

      {!value.archived && upstreamAccounts.map(({ account }) => {
        if (account.status === 'restricted') {
          return (
            <Alert
              key={`restricted-${account.id}`}
              showIcon
              type="warning"
              className="mb-4"
              title={t('关联的上游账号「{name}」当前处于风控受限状态，请留意续费扣款与服务可用性。', { name: accountDisplayTitle(account) })}
            />
          );
        }
        if (account.status === 'retiring') {
          return (
            <Alert
              key={`retiring-${account.id}`}
              showIcon
              type="warning"
              className="mb-4"
              title={t('关联的上游账号「{name}」已标记计划注销，销号前请先关闭自动续费或换绑账号。', { name: accountDisplayTitle(account) })}
            />
          );
        }
        return null;
      })}

      {value.renewalAmountMinor > value.amountMinor && (
        <Alert
          showIcon
          type="warning"
          className="mb-5"
          title={t('续费恢复为 {amount}', { amount: `${value.currency} ${(value.renewalAmountMinor / 100).toFixed(2)}` })}
        />
      )}

      {value.cycle !== 'once' && !value.archived && (
        <div className="detail-progress">
          <span>{t('周期剩余')}</span>
          <Progress percent={Math.min(100, Math.max(0, remaining(value) / periodDays(value) * 100))} showInfo={false} size="small" />
        </div>
      )}

      <Descriptions column={1} size="small" items={items} />

      {upstreamAccounts.length > 0 && (
        <div className="detail-related-block">
          <h4>{`${t('关联上游账号')} (${upstreamAccounts.length})`}</h4>
          <div className="detail-related-list">
            {upstreamAccounts.map(({ account, role }) => (
              <Link
                key={`${account.id}-${role}`}
                to="/accounts"
                search={{ detail: account.id }}
                className="detail-related-item"
                onClick={onClose}
              >
                <AccountMark value={account} size="sm" />
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <span className="truncate">{accountDisplayTitle(account)}</span>
                  <span className="account-mini-tag shrink-0">{role}</span>
                </span>
                <code>{account.identifier}</code>
              </Link>
            ))}
          </div>
        </div>
      )}

      {linkedDomains.length > 0 && (
        <div className="detail-related-block">
          <h4>{`${t('反向关联域名')} (${linkedDomains.length})`}</h4>
          <div className="sub-reverse-domains">
            {linkedDomains.map(dom => (
              <Link
                key={`dom-${dom.id}`}
                to="/domains"
                search={{ detail: dom.id }}
                className="sub-reverse-domain-pill"
                onClick={onClose}
              >
                <Globe size={13.5} />
                <span>{dom.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {infraCount > 0 && (
        <div className="detail-related-block">
          <h4>{`${t('承载基础设施')} (${infraCount})`}</h4>
          <div className="detail-related-list">
            {linkedServers.map(srv => (
              <Link
                key={`srv-${srv.id}`}
                to="/servers/$serverId"
                params={{ serverId: srv.id }}
                className="detail-related-item"
                onClick={onClose}
              >
                <span>{srv.name}</span>
                <code>{srv.ipv4 || srv.hostname || srv.region}</code>
              </Link>
            ))}
            {linkedIps.map(ip => (
              <Link
                key={`ip-${ip.id}`}
                to="/ips"
                search={{ detail: ip.id }}
                className="detail-related-item"
                onClick={onClose}
              >
                <span>{ipDisplayTitle(ip)}</span>
                <code>{ip.address}</code>
              </Link>
            ))}
          </div>
        </div>
      )}

      {value.managementUrl && (
        <Button className="mt-5" icon={<ArrowUpRight size={14} />} href={value.managementUrl} target="_blank" rel="noopener noreferrer">
          {t('打开管理 / 退订网址')}
        </Button>
      )}
    </Drawer>
  );
}
