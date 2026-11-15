import type { Account, Domain, IpNode, ServerHost, Subscription } from '@irm/api-client';
import { App, Button, Card, Dropdown, Tooltip } from 'antd';
import dayjs from 'dayjs';
import {
  Archive,
  ArrowUpRight,
  CalendarClock,
  CalendarPlus,
  Check,
  Copy,
  Eye,
  Globe2,
  MoreHorizontal,
  Network,
  Pencil,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { accountDisplayTitle } from '../../accounts/utils/account-metrics';
import { resolveDomainPreset } from '../presets/domain-presets';
import {
  domainIcpMeta,
  domainPurposeMeta,
  domainStatusMeta,
  extractDomainTld,
  maskDomainName,
  resolveDomainExpiry,
} from '../utils/domain-metrics';
import { DomainMark } from './domain-mark';

export function DomainCard({
  value,
  subscriptionsById,
  accountsById,
  serversById,
  ipsById,
  masked,
  onDetails,
  onEdit,
  onRenewSub,
  onExtendYear,
  onDelete,
  busyRenew,
}: {
  value: Domain;
  subscriptionsById: Map<string, Subscription>;
  accountsById: Map<string, Account>;
  serversById: Map<string, ServerHost>;
  ipsById: Map<string, IpNode>;
  masked: boolean;
  onDetails: () => void;
  onEdit: () => void;
  onRenewSub: (subscription: Subscription) => Promise<unknown>;
  onExtendYear: (domain: Domain) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  busyRenew?: boolean;
}) {
  const { t, locale } = usePreferences();
  const { modal, message } = App.useApp();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
    }
  }, []);

  const flashCopied = (key: string) => {
    setCopiedKey(key);
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setCopiedKey(prev => (prev === key ? null : prev));
    }, 1800);
  };

  const copyPlain = async (key: string, text: string, toastMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flashCopied(key);
      void message.success(toastMessage);
    }
    catch {
      /* Clipboard unavailable in restricted browser context. */
    }
  };

  const preset = resolveDomainPreset(value);
  const tld = extractDomainTld(value.name);
  const displayName = masked ? maskDomainName(value.name) : value.name;
  const expiry = resolveDomainExpiry(value, subscriptionsById);
  const registrarAccount = value.registrarAccountId ? accountsById.get(value.registrarAccountId) : undefined;

  const registrarLabel = value.registrar.trim()
    || (preset ? (locale === 'en-US' ? preset.registrar.en : preset.registrar.zh) : '');
  const dnsLabel = value.dnsProvider.trim()
    || (preset ? (locale === 'en-US' ? preset.dnsProvider.en : preset.dnsProvider.zh) : '');
  const effectiveConsoleUrl = value.managementUrl.trim() || preset?.defaultManagementUrl || '';

  const subtitleParts = [
    t(domainPurposeMeta[value.purpose].short),
    registrarLabel || dnsLabel,
  ].filter(Boolean);

  const canRenewSub = Boolean(
    expiry.subscription
    && !expiry.subscription.archived
    && expiry.subscription.cycle !== 'once'
    && !value.archived,
  );
  const canExtendManual = Boolean(!expiry.subscription && value.expireDate && !value.archived);

  const confirmRenew = () => {
    if (canRenewSub && expiry.subscription) {
      const sub = expiry.subscription;
      void modal.confirm({
        title: t('确认已完成本期域名续费？'),
        content: t('关联订阅到期日将顺延一个计费周期。'),
        okText: t('确定'),
        cancelText: t('取消'),
        onOk: () => onRenewSub(sub),
      });
      return;
    }
    if (canExtendManual) {
      void modal.confirm({
        title: t('将域名到期日顺延 1 年？'),
        content: t('到期日将从 {date} 更新为下一年同日。', { date: value.expireDate }),
        okText: t('确定'),
        cancelText: t('取消'),
        onOk: () => onExtendYear(value),
      });
    }
  };

  const linkedServers = value.serverIds
    .map(id => serversById.get(id))
    .filter((item): item is ServerHost => Boolean(item));
  const linkedIps = value.ipIds
    .map(id => ipsById.get(id))
    .filter((item): item is IpNode => Boolean(item));

  // Expiry slot presentation
  let expiryShort = t('未设到期日');
  let expiryUrgent = false;
  if (expiry.days !== null) {
    if (expiry.days < 0) {
      expiryShort = t('逾期 {count} 天', { count: -expiry.days });
      expiryUrgent = true;
    }
    else if (expiry.days === 0) {
      expiryShort = t('今天到期');
      expiryUrgent = true;
    }
    else if (expiry.days <= 60) {
      expiryShort = t('剩 {count} 天', { count: expiry.days });
      expiryUrgent = expiry.days <= 14;
    }
    else {
      expiryShort = dayjs(expiry.date).format('YYYY-MM-DD');
    }
  }
  else if (expiry.date) {
    expiryShort = expiry.date;
  }

  const expiryTooltip = expiry.date
    ? `${expiry.date} · ${
      expiry.source === 'subscription'
        ? t('关联订阅账单')
        : t('独立到期日')
    }`
    : t('可在编辑中设置到期日或关联续费账单');

  // Footer micro-chips
  const footerNodes: { key: string; node: ReactNode }[] = [];

  if (linkedServers.length > 0 || linkedIps.length > 0) {
    const topoText = linkedServers.length > 0 && linkedIps.length > 0
      ? t('承载: {servers} 主机 · {ips} 节点', { servers: linkedServers.length, ips: linkedIps.length })
      : linkedServers.length > 0
        ? (linkedServers.length === 1
            ? t('主机: {name}', { name: linkedServers[0]!.name })
            : t('承载主机 {count} 台', { count: linkedServers.length }))
        : (linkedIps.length === 1
            ? t('节点: {name}', { name: linkedIps[0]!.label || linkedIps[0]!.address })
            : t('解析节点 {count} 个', { count: linkedIps.length }));
    footerNodes.push({
      key: 'topology',
      node: (
        <button type="button" className="account-meta-chip is-interactive" onClick={onDetails}>
          <Network size={11.5} />
          <span>{topoText}</span>
        </button>
      ),
    });
  }

  if (registrarAccount) {
    footerNodes.push({
      key: 'account',
      node: (
        <button type="button" className="account-meta-chip is-interactive" onClick={onDetails}>
          <span>{t('账号: {name}', { name: accountDisplayTitle(registrarAccount) })}</span>
        </button>
      ),
    });
  }

  if (value.icpStatus === 'verified' && value.icpNumber) {
    footerNodes.push({
      key: 'icp-num',
      node: (
        <button
          type="button"
          className={`account-meta-chip is-copyable ${copiedKey === 'icp' ? 'is-copied' : ''}`}
          onClick={() => { void copyPlain('icp', value.icpNumber, t('已复制备案号')); }}
        >
          <span>{masked ? '***' : value.icpNumber}</span>
          {copiedKey === 'icp' ? <Check size={11.5} /> : <Copy size={11.5} />}
        </button>
      ),
    });
  }
  else if (value.whoisPrivacy) {
    footerNodes.push({
      key: 'whois',
      node: (
        <span className="account-meta-text is-safe">
          <ShieldCheck size={12.5} />
          <span>{t('WHOIS 隐私')}</span>
        </span>
      ),
    });
  }

  for (const tag of value.tags.slice(0, 2)) {
    if (footerNodes.length >= 4) break;
    footerNodes.push({
      key: `tag-${tag}`,
      node: <span className="account-meta-text">{tag}</span>,
    });
  }

  if (value.archived) {
    footerNodes.unshift({
      key: 'archived',
      node: (
        <span className="account-meta-pill" aria-label={t('已归档')}>
          <Archive size={11.5} />
          <span>{t('已归档')}</span>
        </span>
      ),
    });
  }

  const hostSlotText = dnsLabel || registrarLabel || t('未标记托管商');

  return (
    <Card className={`subscription-card account-card domain-card is-slot-card ${value.archived ? 'is-archived' : ''}`}>
      <div className="account-slot-header">
        <button
          type="button"
          className="account-slot-face"
          aria-label={t('查看 {name}', { name: value.name })}
          onClick={onDetails}
        >
          <DomainMark value={value} />
          <div className="account-slot-heading">
            <div className="account-title-line">
              <h2 className="domain-card-title" title={displayName}>{displayName}</h2>
              {tld && <span className="account-region-pill domain-tld-pill">{tld}</span>}
              {value.icpStatus === 'verified' && (
                <span className="account-meta-pill is-safe">{t(domainIcpMeta.verified.short)}</span>
              )}
              {value.icpStatus === 'pending' && (
                <span className="account-meta-pill is-warn">{t(domainIcpMeta.pending.short)}</span>
              )}
            </div>
            <div className="account-subtitle-row">
              <span className="subscription-subtitle">{subtitleParts.join(' · ')}</span>
              {!value.archived && value.status !== 'active' && (
                <span className={`account-meta-pill ${value.status === 'parked' ? '' : 'is-warn'}`}>
                  {t(domainStatusMeta[value.status].short)}
                </span>
              )}
            </div>
          </div>
        </button>

        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          menu={{
            items: [
              { key: 'details', label: t('查看详情'), icon: <Eye size={14} /> },
              { key: 'edit', label: t('编辑域名'), icon: <Pencil size={14} /> },
              { key: 'copy', label: t('复制域名'), icon: <Copy size={14} /> },
              ...(canRenewSub || canExtendManual
                ? [{
                    key: 'renew',
                    label: t(canRenewSub ? '顺延一期账单' : '顺延 1 年到期日'),
                    icon: <CalendarPlus size={14} />,
                    disabled: busyRenew,
                  }]
                : []),
              ...(effectiveConsoleUrl
                ? [{
                    key: 'console',
                    label: (
                      <a href={effectiveConsoleUrl} target="_blank" rel="noopener noreferrer">
                        {t('打开域名控制台')}
                      </a>
                    ),
                    icon: <ArrowUpRight size={14} />,
                  }]
                : []),
              ...(!masked
                ? [{
                    key: 'visit',
                    label: (
                      <a href={`https://${value.name}`} target="_blank" rel="noopener noreferrer">
                        {t('访问线上站点')}
                      </a>
                    ),
                    icon: <Globe2 size={14} />,
                  }]
                : []),
              {
                key: 'delete',
                label: t('永久删除'),
                danger: true,
                icon: <Trash2 size={14} />,
              },
            ],
            onClick: ({ key }) => {
              if (key === 'details') onDetails();
              if (key === 'edit') onEdit();
              if (key === 'copy') void copyPlain('fqdn', value.name, t('已复制域名'));
              if (key === 'renew') confirmRenew();
              if (key === 'delete') {
                modal.confirm({
                  title: t('永久删除 {name}？', { name: value.name }),
                  content: t('删除后无法恢复；如需保留历史记录可先归档。'),
                  okText: t('删除'),
                  cancelText: t('取消'),
                  okButtonProps: { danger: true },
                  onOk: onDelete,
                });
              }
            },
          }}
        >
          <Tooltip title={t('更多操作')}>
            <Button
              className="card-menu"
              type="text"
              aria-label={t('操作 {name}', { name: value.name })}
              icon={<MoreHorizontal size={17} />}
              loading={busyRenew}
            />
          </Tooltip>
        </Dropdown>
      </div>

      <div className="account-slot-stack">
        <div className={`account-cred-slot is-primary ${copiedKey === 'fqdn' ? 'is-copied' : ''}`}>
          <span className="account-slot-label">FQDN</span>
          <code className="account-slot-code" title={masked ? undefined : value.name}>
            {displayName}
          </code>
          {!masked && (
            <Tooltip title={t('访问站点')}>
              <a
                href={`https://${value.name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="account-slot-icon-btn"
                aria-label={t('访问 {name}', { name: value.name })}
              >
                <ArrowUpRight size={13} />
              </a>
            </Tooltip>
          )}
          <button
            type="button"
            className={`account-copy-pill ${copiedKey === 'fqdn' ? 'is-copied' : ''}`}
            aria-label={t('复制 {name}', { name: value.name })}
            onClick={() => { void copyPlain('fqdn', value.name, t('已复制域名')); }}
          >
            {copiedKey === 'fqdn' ? <Check size={12.5} /> : <Copy size={12.5} />}
            <span>{t(copiedKey === 'fqdn' ? '已复制' : '复制')}</span>
          </button>
        </div>

        <div className="account-cred-grid">
          <div className="account-cred-slot">
            <span className="account-slot-label">DNS</span>
            <span className="domain-slot-value" title={hostSlotText}>
              {hostSlotText}
            </span>
            {effectiveConsoleUrl && (
              <Tooltip title={t('打开域名控制台')}>
                <a
                  href={effectiveConsoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="account-slot-icon-btn"
                  aria-label={t('打开 {name} 控制台', { name: value.name })}
                >
                  <ArrowUpRight size={13} />
                </a>
              </Tooltip>
            )}
          </div>

          <div
            className={`account-cred-slot is-keepalive ${
              expiryUrgent ? 'is-overdue' : ''
            }`}
          >
            <Tooltip title={expiryTooltip}>
              <span className="account-keepalive-label">
                <CalendarClock size={13} />
                <span>{expiryShort}</span>
              </span>
            </Tooltip>
            {expiry.days !== null && expiry.days <= 30 && (canRenewSub || canExtendManual)
              ? (
                  <button
                    type="button"
                    className="account-checkin-pill"
                    disabled={busyRenew}
                    onClick={confirmRenew}
                  >
                    <Check size={11.5} />
                    <span>{t('顺延')}</span>
                  </button>
                )
              : expiry.date
                ? (
                    <span className={`domain-renew-mode-tag ${expiry.autoRenew ? 'is-auto' : ''}`}>
                      {t(expiry.autoRenew ? '自动' : '手动')}
                    </span>
                  )
                : null}
          </div>
        </div>

        {footerNodes.length > 0 && (
          <div className="account-meta-footer">
            {footerNodes.slice(0, 4).map(item => (
              <span key={item.key} className="account-meta-entry">
                {item.node}
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
