import type { Account, Domain, IpNode, ServerHost, Subscription } from '@irm/api-client';
import { Link } from '@tanstack/react-router';
import { App, Button, Input, Tooltip } from 'antd';
import dayjs from 'dayjs';
import {
  ArrowUpRight,
  Box,
  Calendar,
  Check,
  Cloud,
  Container,
  Copy,
  CreditCard,
  Globe2,
  Layers,
  Link2,
  Network,
  Pencil,
  RefreshCw,
  Search,
  Server,
  ShieldOff,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { accountDisplayTitle } from '../../accounts/utils/account-metrics';
import { ipAsnTypeMeta, maskIpAddress } from '../../ips/utils/ip-metrics';
import { cycleLabel, displayMoney } from '../../subscriptions/utils/subscription-display';
import { periodDays, remaining } from '../../subscriptions/utils/subscription-metrics';
import {
  groupContainersByStack,
  maskEndpoint,
  resolveServerExpiry,
  serverKindMeta,
} from '../utils/server-metrics';

export function ServerCockpitWorkspace({
  value,
  linkedSubscription,
  linkedAccount,
  linkedIps,
  linkedDomains,
  masked,
  copiedKey,
  onCopyContainer,
  onEdit,
  onConnectAgent,
  onRevokeAgent,
  onRenew,
  busyRenew,
  busyRevoke,
}: {
  value: ServerHost;
  linkedSubscription?: Subscription;
  linkedAccount?: Account;
  linkedIps: IpNode[];
  linkedDomains: Domain[];
  masked: boolean;
  copiedKey: string | null;
  onCopyContainer: (key: string, containerName: string) => void;
  onEdit: () => void;
  onConnectAgent: () => void;
  onRevokeAgent: () => Promise<unknown>;
  onRenew: (subscription: Subscription) => Promise<unknown>;
  busyRenew?: boolean;
  busyRevoke?: boolean;
}) {
  const { t, locale } = usePreferences();
  const { modal } = App.useApp();
  const [containerQuery, setContainerQuery] = useState('');

  const tel = value.telemetry;
  const runningContainers = tel.containers.filter(c => c.state === 'running').length;

  const filteredContainers = useMemo(() => {
    const q = containerQuery.trim().toLowerCase();
    if (!q) return tel.containers;
    return tel.containers.filter(c =>
      `${c.name} ${c.image} ${c.composeProject ?? ''} ${c.composeService ?? ''} ${c.status}`
        .toLowerCase()
        .includes(q),
    );
  }, [tel.containers, containerQuery]);

  const stackGroups = useMemo(
    () => groupContainersByStack(filteredContainers, t('独立运行容器')),
    [filteredContainers, t],
  );

  const subscriptionsMap = useMemo(() => {
    const map = new Map<string, Subscription>();
    if (linkedSubscription) map.set(linkedSubscription.id, linkedSubscription);
    return map;
  }, [linkedSubscription]);

  const expiry = resolveServerExpiry(value, subscriptionsMap);
  const canRenew = Boolean(
    linkedSubscription
    && !linkedSubscription.archived
    && linkedSubscription.cycle !== 'once'
    && !value.archived,
  );
  const subDays = linkedSubscription && linkedSubscription.cycle !== 'once'
    ? remaining(linkedSubscription)
    : expiry.days;

  const dueBadge = (() => {
    if (subDays === null) return null;
    if (subDays < 0) {
      return { text: t('已逾期 {count} 天', { count: -subDays }), tone: 'is-overdue' as const };
    }
    if (subDays === 0) {
      return { text: t('今天到期'), tone: 'is-soon' as const };
    }
    return {
      text: t('剩 {count} 天', { count: subDays }),
      tone: subDays <= 30 ? ('is-soon' as const) : ('is-safe' as const),
    };
  })();

  const billingBarPct = linkedSubscription && subDays !== null
    ? Math.min(100, Math.max(subDays > 0 ? 4 : 0, Math.round((subDays / periodDays(linkedSubscription)) * 100)))
    : null;
  const billingBarTone = subDays !== null
    ? (subDays < 0 ? 'is-danger' : subDays <= 30 ? 'is-warn' : 'is-ok')
    : 'is-ok';

  const trafficRuleLabel = {
    both: t('双向计费'),
    out_only: t('仅算上行'),
    unlimited: t('不限流量'),
  }[value.trafficRule];

  const lastReportLabel = tel.lastReportedAt
    ? dayjs(tel.lastReportedAt).format('YYYY-MM-DD HH:mm:ss')
    : '—';

  const ipBadgePrefix = (ip: IpNode) => {
    const origin = ip.originType === 'native'
      ? t('原生 IP')
      : ip.originType === 'broadcast'
        ? t('广播 IP')
        : t(ipAsnTypeMeta[ip.asnType].short);
    return origin ? `${origin} · ` : '';
  };

  return (
    <div className="server-cockpit-workspace">
      <div className="server-cockpit-main">
        <section className="server-cockpit-panel is-stacks" aria-label={t('Docker 容器与服务栈')}>
          <div className="server-cockpit-panel-head">
            <div className="server-cockpit-panel-title">
              <Container size={17} />
              <h3>{t('Docker 容器与服务栈')}</h3>
              {tel.dockerEnabled && tel.dockerAvailable && (
                <span className="server-running-pill">
                  {t('{running}/{total} 运行中', {
                    running: runningContainers,
                    total: tel.containers.length,
                  })}
                </span>
              )}
            </div>

            {tel.dockerEnabled && tel.dockerAvailable && tel.containers.length > 5 && (
              <Input
                size="small"
                allowClear
                value={containerQuery}
                onChange={e => setContainerQuery(e.target.value)}
                prefix={<Search size={13} />}
                placeholder={t('搜索容器或镜像...')}
                className="server-stack-search"
              />
            )}
          </div>

          {tel.agentStatus === 'none'
            ? (
                <div className="server-stack-empty-box">
                  <div>
                    <strong>{t('容器发现尚未开启')}</strong>
                    <p>{t('一键在服务器执行单行命令，自动采集 CPU/内存/磁盘/IP 并开启实时负载与容器监控。')}</p>
                  </div>
                  <Button size="small" onClick={onConnectAgent}>
                    {t('接入监控探针')}
                  </Button>
                </div>
              )
            : !tel.dockerEnabled
                ? (
                    <div className="server-stack-empty-box">
                      <div>
                        <strong>{t('容器发现尚未开启')}</strong>
                        <p>{t('默认不访问特权 Docker Socket；重装或更新探针时开启 Docker 选项即可自动枚举 Compose 服务栈。')}</p>
                      </div>
                      <Button size="small" onClick={onConnectAgent}>
                        {t('开启 Docker 容器采集')}
                      </Button>
                    </div>
                  )
                : !tel.dockerAvailable
                    ? (
                        <div className="server-stack-warn-box">
                          {t('Docker 容器采集未就绪：{reason}', { reason: tel.dockerError || 'unavailable' })}
                        </div>
                      )
                    : tel.containers.length === 0
                      ? (
                          <div className="server-stack-quiet">
                            {t('当前主机未发现运行或停止的容器')}
                          </div>
                        )
                      : stackGroups.length === 0
                        ? (
                            <div className="server-stack-quiet">
                              {t('尚未发现容器')}
                            </div>
                          )
                        : (
                            <div className="server-stack-groups">
                              {stackGroups.map(group => (
                                <div key={group.key} className="server-compose-group">
                                  <div className="server-compose-head">
                                    <Layers size={14} />
                                    <strong>{group.title}</strong>
                                    <span className="server-compose-count">
                                      {`${group.running}/${group.items.length}`}
                                    </span>
                                  </div>
                                  <div className="server-compose-rows">
                                    {group.items.map((container) => {
                                      const rowKey = `ctr:${container.id || container.name}`;
                                      const copied = copiedKey === rowKey;
                                      return (
                                        <div key={container.id || container.name} className="server-stack-row">
                                          <span
                                            className={`server-container-dot ${container.state === 'running' ? 'is-running' : ''}`}
                                          />
                                          <Box size={14} className="server-stack-cube" />
                                          <strong className="server-stack-name" title={container.name}>
                                            {container.name}
                                          </strong>
                                          {container.composeService && container.composeService !== container.name && (
                                            <span className="account-mini-tag">{container.composeService}</span>
                                          )}
                                          <div className="server-stack-meta">
                                            <code className="server-stack-image" title={container.image}>
                                              {container.image}
                                            </code>
                                            {container.status && (
                                              <span className="server-stack-status">{` · ${container.status}`}</span>
                                            )}
                                          </div>
                                          <button
                                            type="button"
                                            className={`account-slot-icon-btn ${copied ? 'is-copied' : ''}`}
                                            aria-label={t('复制容器名称')}
                                            onClick={() => onCopyContainer(rowKey, container.name)}
                                          >
                                            {copied ? <Check size={13} /> : <Copy size={13} />}
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
        </section>

        <section className="server-cockpit-panel is-ledger" aria-label={t('主机台账与运维备注')}>
          <div className="server-cockpit-panel-head">
            <div className="server-cockpit-panel-title">
              <Server size={16} />
              <h3>{t('主机台账与运维备注')}</h3>
            </div>
            <div className="inline-flex items-center gap-1.5">
              {tel.agentStatus !== 'none' && (
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<ShieldOff size={13} />}
                  loading={busyRevoke}
                  onClick={() => {
                    modal.confirm({
                      title: t('吊销此服务器的探针凭据？'),
                      content: t('吊销后现有常驻探针将无法继续上报指标，已采集的硬件台账会保留。'),
                      okButtonProps: { danger: true },
                      okText: t('确定'),
                      cancelText: t('取消'),
                      onOk: onRevokeAgent,
                    });
                  }}
                >
                  {t('吊销探针凭据')}
                </Button>
              )}
              <Button size="small" type="text" icon={<Pencil size={13} />} onClick={onEdit}>
                {t('编辑')}
              </Button>
            </div>
          </div>

          <div className="server-ledger-grid">
            <div className="server-ledger-item">
              <span>{t('服务商 / 品牌')}</span>
              <strong>{value.provider || t(serverKindMeta[value.kind].label)}</strong>
            </div>
            <div className="server-ledger-item">
              <span>{t('SSH 登录配置')}</span>
              <strong>{value.sshPort > 0 ? `${value.sshUser || 'root'} · Port ${value.sshPort}` : '—'}</strong>
            </div>
            <div className="server-ledger-item">
              <span>{t('流量计费规则')}</span>
              <strong>
                {[
                  trafficRuleLabel,
                  value.trafficResetDay > 0 ? t('每月 {day} 日重置', { day: value.trafficResetDay }) : '',
                ].filter(Boolean).join(' · ')}
              </strong>
            </div>
            <div className="server-ledger-item">
              <span>{t('最后心跳上报')}</span>
              <strong>{lastReportLabel}</strong>
            </div>
            {value.hostname && (
              <div className="server-ledger-item">
                <span>{t('主机名 (Hostname)')}</span>
                <code>{masked ? maskEndpoint(value.hostname) : value.hostname}</code>
              </div>
            )}
            {value.portNote && (
              <div className="server-ledger-item">
                <span>{t('线路 / NAT 端口段备注')}</span>
                <strong>{value.portNote}</strong>
              </div>
            )}
          </div>

          {value.tags.length > 0 && (
            <div className="server-ledger-tags">
              {value.tags.map(tag => (
                <span key={tag} className="account-mini-tag">{tag}</span>
              ))}
            </div>
          )}

          {value.notes && (
            <div className="server-ledger-notes">
              <span>{t('运维备注')}</span>
              <p className="detail-notes">{value.notes}</p>
            </div>
          )}
        </section>
      </div>

      <aside className="server-cockpit-aside">
        <section className="server-cockpit-panel is-billing" aria-label={t('计费与续费通行证')}>
          <div className="server-cockpit-panel-head">
            <div className="server-cockpit-panel-title">
              <CreditCard size={16} />
              <h3>{t('计费与续费通行证')}</h3>
            </div>
            {linkedSubscription && (
              <Tooltip title={t('查看订阅详情')}>
                <Link
                  to="/subscriptions"
                  search={{ detail: linkedSubscription.id }}
                  className="server-panel-icon-link"
                  aria-label={t('查看订阅详情')}
                >
                  <ArrowUpRight size={15} />
                </Link>
              </Tooltip>
            )}
          </div>

          {linkedSubscription
            ? (
                <div className="server-billing-body">
                  <div className="server-billing-price">
                    <strong>
                      {displayMoney(linkedSubscription.amountMinor / 100, linkedSubscription.currency, locale)}
                    </strong>
                    <span>{`/ ${cycleLabel(linkedSubscription, t)}`}</span>
                  </div>

                  <div className="server-billing-due-row">
                    <span className="server-billing-date">
                      <Calendar size={14} />
                      <span>
                        {linkedSubscription.cycle === 'once'
                          ? t('一次性买断')
                          : t('{date} 到期', { date: linkedSubscription.dueDate })}
                      </span>
                    </span>
                    {dueBadge && (
                      <span className={`due-badge ${dueBadge.tone}`}>{dueBadge.text}</span>
                    )}
                  </div>

                  {billingBarPct !== null && (
                    <div className="server-bento-bar" aria-hidden="true">
                      <span
                        className={`server-bento-bar-fill ${billingBarTone}`}
                        style={{ width: `${billingBarPct}%` }}
                      />
                    </div>
                  )}

                  {canRenew && (
                    <Button
                      block
                      className="server-renew-btn"
                      icon={<RefreshCw size={14} />}
                      loading={busyRenew}
                      onClick={() => {
                        modal.confirm({
                          title: t('确认已完成本期付款？'),
                          content: t('到期日将顺延一个计费周期。'),
                          okText: t('确定'),
                          cancelText: t('取消'),
                          onOk: () => onRenew(linkedSubscription),
                        });
                      }}
                    >
                      {t('顺延一周期')}
                    </Button>
                  )}
                </div>
              )
            : expiry.source === 'manual' && value.expireDate
              ? (
                  <div className="server-billing-body">
                    <div className="server-billing-price">
                      <strong>{t('独立到期台账')}</strong>
                    </div>
                    <div className="server-billing-due-row">
                      <span className="server-billing-date">
                        <Calendar size={14} />
                        <span>{t('{date} 到期', { date: value.expireDate })}</span>
                      </span>
                      {dueBadge && (
                        <span className={`due-badge ${dueBadge.tone}`}>{dueBadge.text}</span>
                      )}
                    </div>
                    <Button block className="server-renew-btn" onClick={onEdit}>
                      {t('关联已有订阅')}
                    </Button>
                  </div>
                )
              : (
                  <div className="server-billing-body">
                    <div className="server-billing-price">
                      <strong>{t('自有 / 长期持有')}</strong>
                    </div>
                    <p className="server-billing-empty">{t('自有 / 免费（无周期账单）')}</p>
                    <Button block className="server-renew-btn" onClick={onEdit}>
                      {t('关联已有订阅')}
                    </Button>
                  </div>
                )}
        </section>

        <section className="server-cockpit-panel is-topology" aria-label={t('承载拓扑与关联资源')}>
          <div className="server-cockpit-panel-head">
            <div className="server-cockpit-panel-title">
              <Link2 size={16} />
              <h3>{t('承载拓扑与关联资源')}</h3>
            </div>
            <Button
              type="text"
              size="small"
              className="server-panel-icon-btn"
              aria-label={t('编辑')}
              icon={<Pencil size={13} />}
              onClick={onEdit}
            />
          </div>

          {linkedDomains.length > 0 && (
            <div className="server-topo-domains">
              {linkedDomains.map(dom => (
                <Link
                  key={dom.id}
                  to="/domains"
                  search={{ detail: dom.id }}
                  className="server-topo-domain-row"
                >
                  <Globe2 size={14} />
                  <span>{dom.name}</span>
                  <ArrowUpRight size={14} className="server-topo-arrow" />
                </Link>
              ))}
            </div>
          )}

          <div className="server-topo-kv-list">
            {linkedIps.length > 0
              ? linkedIps.map(ip => (
                  <Link
                    key={ip.id}
                    to="/ips"
                    search={{ detail: ip.id }}
                    className="server-topo-kv-row"
                  >
                    <span className="server-topo-kv-label">
                      <Network size={14} />
                      <span>{t('绑定 IP')}</span>
                    </span>
                    <span className="server-topo-ip-pill">
                      {`${ipBadgePrefix(ip)}${masked ? maskIpAddress(ip.address) : ip.address}`}
                    </span>
                  </Link>
                ))
              : value.ipv4 && (
                <div className="server-topo-kv-row">
                  <span className="server-topo-kv-label">
                    <Network size={14} />
                    <span>{t('绑定 IP')}</span>
                  </span>
                  <span className="server-topo-ip-pill">
                    {masked ? maskEndpoint(value.ipv4) : value.ipv4}
                  </span>
                </div>
              )}

            {linkedAccount
              ? (
                  <Link
                    to="/accounts"
                    search={{ detail: linkedAccount.id }}
                    className="server-topo-kv-row"
                  >
                    <span className="server-topo-kv-label">
                      <Cloud size={14} />
                      <span>{t('关联云账号')}</span>
                    </span>
                    <strong className="server-topo-kv-val">{accountDisplayTitle(linkedAccount)}</strong>
                  </Link>
                )
              : (
                  <div className="server-topo-kv-row is-muted">
                    <span className="server-topo-kv-label">
                      <Cloud size={14} />
                      <span>{t('关联云账号')}</span>
                    </span>
                    <button type="button" className="server-topo-link-btn" onClick={onEdit}>
                      {t('未关联')}
                    </button>
                  </div>
                )}
          </div>

          {linkedDomains.length === 0 && linkedIps.length === 0 && !linkedAccount && !value.ipv4 && (
            <div className="mt-3">
              <Button size="small" block onClick={onEdit}>
                {t('关联域名与节点')}
              </Button>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
