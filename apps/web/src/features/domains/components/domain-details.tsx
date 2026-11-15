import type { Account, Domain, IpNode, ServerHost, Subscription } from '@irm/api-client';
import { Link } from '@tanstack/react-router';
import { Alert, App, Button, Descriptions, Drawer, Input } from 'antd';
import dayjs from 'dayjs';
import {
  ArrowUpRight,
  CalendarPlus,
  Cloud,
  Copy,
  Globe2,
  Pencil,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { accountDisplayTitle } from '../../accounts/utils/account-metrics';
import { ipDisplayTitle } from '../../ips/utils/ip-metrics';
import { cycleLabel, displayMoney } from '../../subscriptions/utils/subscription-display';
import { resolveDomainPreset } from '../presets/domain-presets';
import {
  domainIcpMeta,
  domainPurposeMeta,
  domainStatusMeta,
  extractDomainTld,
  inspectDomain,
  resolveDomainExpiry,
} from '../utils/domain-metrics';
import { DomainMark } from './domain-mark';

export function DomainDetails({
  value,
  linkedSubscription,
  linkedAccount,
  linkedServers,
  linkedIps,
  serversById,
  ipsById,
  onClose,
  onEdit,
  onRenewSub,
  onExtendYear,
  onRefreshLookup,
  busyRenew,
  busyLookup,
}: {
  value: Domain;
  linkedSubscription?: Subscription;
  linkedAccount?: Account;
  linkedServers: ServerHost[];
  linkedIps: IpNode[];
  serversById?: Map<string, ServerHost>;
  ipsById?: Map<string, IpNode>;
  onClose: () => void;
  onEdit: () => void;
  onRenewSub: (subscription: Subscription) => Promise<unknown>;
  onExtendYear: (domain: Domain) => Promise<unknown>;
  onRefreshLookup?: (domain: Domain) => Promise<unknown>;
  busyRenew?: boolean;
  busyLookup?: boolean;
}) {
  const { t, locale } = usePreferences();
  const { modal, message } = App.useApp();
  const fallback = t('未填写');

  const [recordFilter, setRecordFilter] = useState('');
  const [showAllRecords, setShowAllRecords] = useState(false);

  const preset = resolveDomainPreset(value);
  const parsed = inspectDomain(value.name);
  const tld = extractDomainTld(value.name);
  const subscriptionsMap = new Map(linkedSubscription ? [[linkedSubscription.id, linkedSubscription]] : []);
  const expiry = resolveDomainExpiry(value, subscriptionsMap);

  const registrarLabel = value.registrar.trim()
    || (preset ? (locale === 'en-US' ? preset.registrar.en : preset.registrar.zh) : '');
  const dnsLabel = value.dnsProvider.trim()
    || (preset ? (locale === 'en-US' ? preset.dnsProvider.en : preset.dnsProvider.zh) : '');
  const effectiveConsoleUrl = value.managementUrl.trim() || preset?.defaultManagementUrl || '';

  const canRenewSub = Boolean(
    linkedSubscription
    && !linkedSubscription.archived
    && linkedSubscription.cycle !== 'once'
    && !value.archived,
  );
  const canExtendManual = Boolean(!linkedSubscription && value.expireDate && !value.archived);

  const copyText = async (text: string, toastText: string) => {
    try {
      await navigator.clipboard.writeText(text);
      void message.success(toastText);
    }
    catch {
      /* Ignore clipboard denial. */
    }
  };

  let billingSummary = fallback;
  if (linkedSubscription) {
    const price = displayMoney(linkedSubscription.amountMinor, linkedSubscription.currency, locale);
    const cyc = cycleLabel(linkedSubscription, t);
    billingSummary = `${price} / ${cyc} · ${linkedSubscription.dueDate} (${
      t(linkedSubscription.renewalMode === 'auto' ? '自动续费' : '手动续费')
    })`;
  }
  else if (value.expireDate) {
    const daysText = expiry.days !== null
      ? (expiry.days < 0
          ? t('逾期 {count} 天', { count: -expiry.days })
          : t('剩 {count} 天', { count: expiry.days }))
      : '';
    billingSummary = `${value.expireDate}${daysText ? ` · ${daysText}` : ''} · ${
      t(value.autoRenew ? '自动续费' : '手动续费')
    }`;
  }

  const dnsRecords = useMemo(() => value.dnsRecords ?? [], [value.dnsRecords]);
  const filteredRecords = useMemo(() => {
    const q = recordFilter.trim().toLowerCase();
    if (!q) return dnsRecords;
    return dnsRecords.filter(rec =>
      rec.name.toLowerCase().includes(q)
      || rec.type.toLowerCase().includes(q)
      || rec.content.toLowerCase().includes(q),
    );
  }, [dnsRecords, recordFilter]);

  const visibleRecords = showAllRecords || recordFilter.trim()
    ? filteredRecords
    : filteredRecords.slice(0, 10);

  const hasEdgeSection = Boolean(
    value.edgeMeta
    || dnsRecords.length > 0,
  );

  const formatRelativeHost = (fqdn: string) => {
    const lower = fqdn.toLowerCase();
    const zoneLower = value.name.toLowerCase();
    if (lower === zoneLower) return '@';
    if (lower.endsWith(`.${zoneLower}`)) {
      return fqdn.slice(0, fqdn.length - zoneLower.length - 1);
    }
    return fqdn;
  };

  const items = [
    {
      key: 'fqdn',
      label: 'FQDN',
      children: (
        <span className="inline-flex items-center gap-2 font-mono">
          <span>{value.name}</span>
          {parsed.isSubdomain && <span className="account-mini-tag">{`${t('主域')}: ${parsed.apex}`}</span>}
        </span>
      ),
    },
    { key: 'purpose', label: t('域名用途'), children: t(domainPurposeMeta[value.purpose].label) },
    { key: 'status', label: t('当前状态'), children: t(domainStatusMeta[value.status].label) },
    { key: 'registrar', label: t('域名注册商'), children: registrarLabel || fallback },
    { key: 'dns', label: t('权威 DNS 托管'), children: dnsLabel || fallback },
    {
      key: 'whois',
      label: t('WHOIS 隐私保护'),
      children: value.whoisPrivacy
        ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
              <ShieldCheck size={14} />
              <span>{t('已开启隐私保护')}</span>
            </span>
          )
        : t('未开启'),
    },
    {
      key: 'icp',
      label: t('ICP 备案状态'),
      children: value.icpStatus === 'verified' && value.icpNumber
        ? `${t(domainIcpMeta.verified.label)} · ${value.icpNumber}`
        : t(domainIcpMeta[value.icpStatus].label),
    },
    { key: 'billing', label: t('续费与到期管理'), children: billingSummary },
    ...(value.lookupCheckedAt
      ? [{
          key: 'lookupMeta',
          label: t('最近元数据核验'),
          children: `${value.lookupSource ? value.lookupSource.toUpperCase() : 'RDAP'} · ${dayjs(value.lookupCheckedAt).format('YYYY-MM-DD HH:mm')}`,
        }]
      : []),
    ...(value.tags.length > 0
      ? [{
          key: 'tags',
          label: t('标签'),
          children: (
            <span className="account-table-tags">
              {value.tags.map(tag => <span key={tag} className="account-mini-tag">{tag}</span>)}
            </span>
          ),
        }]
      : []),
    {
      key: 'managementUrl',
      label: t('域名控制台网址'),
      children: effectiveConsoleUrl
        ? <a href={effectiveConsoleUrl} target="_blank" rel="noopener noreferrer">{effectiveConsoleUrl}</a>
        : fallback,
    },
    { key: 'notes', label: t('备注说明'), children: <span className="detail-notes">{value.notes || fallback}</span> },
    { key: 'createdAt', label: t('建档时间'), children: dayjs(value.createdAt).format('YYYY-MM-DD HH:mm') },
    ...(value.archived ? [{ key: 'archived', label: t('归档状态'), children: t('已归档') }] : []),
  ];

  return (
    <Drawer
      open
      title={t('域名详情')}
      size={580}
      onClose={onClose}
      footer={(
        <div className="detail-actions">
          <Button icon={<Pencil size={14} />} onClick={onEdit}>{t('编辑域名')}</Button>
          {onRefreshLookup && !value.archived && (
            <Button
              icon={<RefreshCw size={14} className={busyLookup ? 'animate-spin' : ''} />}
              loading={busyLookup}
              onClick={() => { void onRefreshLookup(value); }}
            >
              {t('同步到期日')}
            </Button>
          )}
          <Button
            icon={<Copy size={14} />}
            onClick={() => { void copyText(value.name, t('已复制域名')); }}
          >
            {t('复制域名')}
          </Button>
          <Button
            icon={<Globe2 size={14} />}
            href={`https://${value.name}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('访问站点')}
          </Button>
          {(canRenewSub || canExtendManual) && (
            <Button
              type="primary"
              icon={<CalendarPlus size={14} />}
              loading={busyRenew}
              onClick={() => {
                if (canRenewSub && linkedSubscription) {
                  modal.confirm({
                    title: t('确认已完成本期域名续费？'),
                    content: t('关联订阅到期日将顺延一个计费周期。'),
                    okText: t('确定'),
                    cancelText: t('取消'),
                    onOk: () => onRenewSub(linkedSubscription),
                  });
                }
                else if (canExtendManual) {
                  modal.confirm({
                    title: t('将域名到期日顺延 1 年？'),
                    content: t('到期日将从 {date} 更新为下一年同日。', { date: value.expireDate }),
                    okText: t('确定'),
                    cancelText: t('取消'),
                    onOk: () => onExtendYear(value),
                  });
                }
              }}
            >
              {t(canRenewSub ? '顺延一周期' : '顺延 1 年')}
            </Button>
          )}
        </div>
      )}
    >
      <div className="detail-hero">
        <DomainMark value={value} size="lg" />
        <div className="detail-hero-meta">
          <div className="account-title-line">
            <h3 className="font-mono">{value.name}</h3>
            {tld && <span className="account-region-pill domain-tld-pill">{tld}</span>}
            {value.icpStatus === 'verified' && (
              <span className="account-meta-pill is-safe">{t('已备案')}</span>
            )}
          </div>
          <span>
            {[
              t(domainPurposeMeta[value.purpose].short),
              registrarLabel,
              dnsLabel && dnsLabel.toLowerCase() !== registrarLabel.toLowerCase() ? dnsLabel : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      </div>

      {linkedSubscription && linkedSubscription.intention === 'cancel' && !value.archived && (
        <Alert
          showIcon
          type="warning"
          className="mb-4"
          title={t('该域名关联的订阅「{name}」已标记到期不续，请提前导出解析记录或解除业务绑定。', { name: linkedSubscription.name })}
        />
      )}

      {value.status === 'transferring' && !value.archived && (
        <Alert
          showIcon
          type="info"
          className="mb-4"
          title={t('该域名处于注册商转移（Transfer）流程中，请注意查收解锁码（EPP Auth Code）与确认邮件。')}
        />
      )}

      <Descriptions column={1} size="small" items={items} />

      {hasEdgeSection && (
        <div className="detail-related-block cf-edge-panel">
          <div className="cf-edge-header">
            <div className="cf-edge-title">
              <Cloud size={15} />
              <h4>{t('Cloudflare 边缘与 DNS 解析快照')}</h4>
            </div>
            <div className="cf-edge-badges">
              {value.edgeMeta?.plan && (
                <span className="account-mini-tag">{value.edgeMeta.plan}</span>
              )}
              {dnsRecords.length > 0 && (
                <span className="cf-proxied-pill">
                  {t('{proxied}/{total} 已开橙云代理', {
                    proxied: value.edgeMeta?.proxiedCount ?? dnsRecords.filter(r => r.proxied).length,
                    total: dnsRecords.length,
                  })}
                </span>
              )}
            </div>
          </div>

          {value.edgeMeta && value.edgeMeta.nameServers.length > 0 && (
            <div className="cf-ns-strip">
              <span className="cf-ns-label">{t('权威 NS')}</span>
              <div className="cf-ns-list">
                {value.edgeMeta.nameServers.map(ns => (
                  <code key={ns}>{ns}</code>
                ))}
              </div>
            </div>
          )}

          {value.edgeMeta && value.edgeMeta.tunnels.length > 0 && (
            <div className="cf-sub-section">
              <span className="cf-sub-title">{t('Zero Trust 内网穿透隧道')}</span>
              <div className="cf-tunnel-list">
                {value.edgeMeta.tunnels.map((tun, idx) => {
                  const statusTone = tun.status === 'healthy'
                    ? 'is-ok'
                    : tun.status === 'degraded'
                      ? 'is-warn'
                      : 'is-down';
                  const statusLabel = tun.status === 'healthy'
                    ? t('在线')
                    : tun.status === 'degraded'
                      ? t('降级')
                      : t('离线');
                  return (
                    <div key={`${tun.id}-${tun.hostname || idx}`} className="cf-tunnel-row">
                      <span className={`cf-tunnel-status ${statusTone}`}>{statusLabel}</span>
                      <strong>{tun.name}</strong>
                      {tun.hostname && <code>{tun.hostname}</code>}
                      {tun.service && <span className="cf-tunnel-target">{`→ ${tun.service}`}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {value.edgeMeta && (value.edgeMeta.pagesProjects.length > 0 || value.edgeMeta.workerRoutes.length > 0) && (
            <div className="cf-sub-section">
              <span className="cf-sub-title">{t('Cloudflare Pages 与边缘路由')}</span>
              <div className="cf-edge-route-pills">
                {value.edgeMeta.pagesProjects.map(p => (
                  <span key={p.name} className="account-mini-tag">
                    {`Pages · ${p.name}${p.domains.length > 0 ? ` (${p.domains.join(', ')})` : ''}`}
                  </span>
                ))}
                {value.edgeMeta.workerRoutes.map(route => (
                  <span key={route} className="account-mini-tag font-mono">{`Worker · ${route}`}</span>
                ))}
              </div>
            </div>
          )}

          {dnsRecords.length > 0 && (
            <div className="cf-sub-section">
              <div className="cf-dns-head">
                <span className="cf-sub-title">{t('DNS 解析记录 ({count})', { count: dnsRecords.length })}</span>
                {dnsRecords.length > 6 && (
                  <Input
                    size="small"
                    allowClear
                    className="cf-dns-filter"
                    prefix={<Search size={12} className="text-gray-400" />}
                    placeholder={t('筛选主机记录、类型或目标值...')}
                    value={recordFilter}
                    onChange={e => setRecordFilter(e.target.value)}
                  />
                )}
              </div>

              <div className="cf-dns-table">
                {visibleRecords.map(rec => (
                  <div key={rec.id} className="cf-dns-row">
                    <span className="cf-dns-type">{rec.type}</span>
                    <code className="cf-dns-name" title={rec.name}>{formatRelativeHost(rec.name)}</code>
                    <code className="cf-dns-content" title={rec.content}>{rec.content}</code>
                    <span className={`cf-dns-proxy ${rec.proxied ? 'is-proxied' : ''}`}>
                      {t(rec.proxied ? '橙云代理' : '仅 DNS')}
                    </span>

                    {((rec.matchedServerIds?.length ?? 0) > 0 || (rec.matchedIpIds?.length ?? 0) > 0) && (
                      <div className="cf-dns-matches">
                        {(rec.matchedServerIds ?? []).map((srvId) => {
                          const srv = serversById?.get(srvId) ?? linkedServers.find(s => s.id === srvId);
                          if (!srv) return null;
                          return (
                            <Link
                              key={srv.id}
                              to="/servers/$serverId"
                              params={{ serverId: srv.id }}
                              className="cf-dns-match-link"
                              onClick={onClose}
                            >
                              <Server size={11} />
                              <span>{srv.name}</span>
                            </Link>
                          );
                        })}
                        {(rec.matchedIpIds ?? []).map((ipId) => {
                          const ip = ipsById?.get(ipId) ?? linkedIps.find(i => i.id === ipId);
                          if (!ip) return null;
                          return (
                            <Link
                              key={ip.id}
                              to="/ips"
                              search={{ detail: ip.id }}
                              className="cf-dns-match-link"
                              onClick={onClose}
                            >
                              <span>{ipDisplayTitle(ip)}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {!recordFilter.trim() && filteredRecords.length > 10 && (
                <button
                  type="button"
                  className="cf-dns-more-btn"
                  onClick={() => setShowAllRecords(prev => !prev)}
                >
                  {showAllRecords
                    ? t('收起解析记录')
                    : t('展开全部 {count} 条解析记录', { count: filteredRecords.length })}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {linkedSubscription && (
        <div className="detail-related-block">
          <h4>{t('关联续费账单')}</h4>
          <div className="detail-related-list">
            <Link to="/subscriptions" search={{ detail: linkedSubscription.id }} className="detail-related-item" onClick={onClose}>
              <span>{linkedSubscription.name}</span>
              <code>{`${linkedSubscription.currency} ${(linkedSubscription.amountMinor / 100).toFixed(2)} · ${linkedSubscription.dueDate}`}</code>
            </Link>
          </div>
        </div>
      )}

      {linkedAccount && (
        <div className="detail-related-block">
          <h4>{t('归属注册商账号')}</h4>
          <div className="detail-related-list">
            <Link to="/accounts" search={{ detail: linkedAccount.id }} className="detail-related-item" onClick={onClose}>
              <span>{accountDisplayTitle(linkedAccount)}</span>
              <code>{linkedAccount.identifier}</code>
            </Link>
          </div>
        </div>
      )}

      {linkedServers.length > 0 && (
        <div className="detail-related-block">
          <h4>{`${t('解析承载服务器')} (${linkedServers.length})`}</h4>
          <div className="detail-related-list">
            {linkedServers.map(srv => (
              <Link key={srv.id} to="/servers/$serverId" params={{ serverId: srv.id }} className="detail-related-item" onClick={onClose}>
                <span>{srv.name}</span>
                <code>{srv.ipv4 || srv.ipv6 || srv.hostname || srv.region}</code>
              </Link>
            ))}
          </div>
        </div>
      )}

      {linkedIps.length > 0 && (
        <div className="detail-related-block">
          <h4>{`${t('绑定解析 IP 节点')} (${linkedIps.length})`}</h4>
          <div className="detail-related-list">
            {linkedIps.map(ip => (
              <Link key={ip.id} to="/ips" search={{ detail: ip.id }} className="detail-related-item" onClick={onClose}>
                <span>{ipDisplayTitle(ip)}</span>
                <code>{ip.address}</code>
              </Link>
            ))}
          </div>
        </div>
      )}

      {effectiveConsoleUrl && (
        <Button className="mt-5" icon={<ArrowUpRight size={14} />} href={effectiveConsoleUrl} target="_blank" rel="noopener noreferrer">
          {t('打开域名控制台')}
        </Button>
      )}
    </Drawer>
  );
}
