import type { Account, Domain, IpNode, ServerHost, Subscription } from '@irm/api-client';
import { Link } from '@tanstack/react-router';
import { Alert, App, Button, Descriptions, Drawer, Progress } from 'antd';
import dayjs from 'dayjs';
import {
  Activity,
  ArrowUpRight,
  Boxes,
  CalendarPlus,
  Copy,
  Pencil,
  ShieldOff,
  Terminal,
  Zap,
} from 'lucide-react';

import { usePreferences } from '../../../app/preferences-context';
import { accountDisplayTitle } from '../../accounts/utils/account-metrics';
import { ipDisplayTitle } from '../../ips/utils/ip-metrics';
import { cycleLabel, displayMoney } from '../../subscriptions/utils/subscription-display';
import { periodDays, remaining } from '../../subscriptions/utils/subscription-metrics';
import {
  buildSshCommand,
  computeTrafficUsage,
  formatBandwidth,
  formatBinaryBytes,
  formatDisk,
  formatMemory,
  formatNetRate,
  formatTrafficBytes,
  formatTrafficQuota,
  formatUptime,
  serverKindMeta,
} from '../utils/server-metrics';
import { ServerMark } from './server-mark';

export function ServerDetails({
  value,
  linkedSubscription,
  linkedAccount,
  linkedIps,
  linkedDomains,
  onClose,
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
  agentIngestEnabled?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onConnectAgent: () => void;
  onRevokeAgent: () => Promise<unknown>;
  onRenew: (subscription: Subscription) => Promise<unknown>;
  busyRenew?: boolean;
  busyRevoke?: boolean;
}) {
  const { t, locale } = usePreferences();
  const { modal, message } = App.useApp();
  const fallback = t('未填写');

  const sshCommand = buildSshCommand(value);
  const canRenew = Boolean(
    linkedSubscription
    && !linkedSubscription.archived
    && linkedSubscription.cycle !== 'once'
    && !value.archived,
  );
  const subDays = linkedSubscription && linkedSubscription.cycle !== 'once'
    ? remaining(linkedSubscription)
    : null;

  const copyText = async (text: string, isSsh: boolean) => {
    try {
      await navigator.clipboard.writeText(text);
      void message.success(t(isSsh ? '已复制 SSH 连接命令' : '已复制服务器地址'));
    }
    catch {
      /* Ignore clipboard denial. */
    }
  };

  const statusLabel = {
    active: t('主力在役'),
    standby: t('冷备待命'),
    maintenance: t('维护调试'),
    retiring: t('计划退役'),
  }[value.status];

  const archLabel = value.arch === 'arm64' ? 'ARM64' : value.arch === 'amd64' ? 'x86_64 (amd64)' : value.arch;

  const specParts = [
    value.cpuCores > 0 ? `${value.cpuCores} vCPU (${archLabel})` : archLabel,
    formatMemory(value.memoryMb),
    formatDisk(value.diskGb, value.diskType),
  ].filter(Boolean);

  const trafficRuleLabel = {
    both: t('双向计费'),
    out_only: t('仅算上行'),
    unlimited: t('不限流量'),
  }[value.trafficRule];

  const bandwidthParts = [
    formatBandwidth(value.bandwidthMbps),
    value.trafficRule === 'unlimited'
      ? t('不限流量')
      : [formatTrafficQuota(value.trafficGb), trafficRuleLabel].filter(Boolean).join(' · '),
    value.trafficResetDay > 0 ? t('每月 {day} 日重置', { day: value.trafficResetDay }) : '',
  ].filter(Boolean);

  const billingSummary = linkedSubscription
    ? `${displayMoney(linkedSubscription.amountMinor / 100, linkedSubscription.currency, locale)} / ${cycleLabel(linkedSubscription, t)} · ${linkedSubscription.dueDate}`
    : value.expireDate
      ? `${t('自有 / 免费（无周期账单）')} · ${t('{date} 到期', { date: value.expireDate })}`
      : t('自有 / 免费（无周期账单）');

  const tel = value.telemetry;
  const memPct = tel.memoryTotalBytes > 0
    ? Math.min(100, Math.round((tel.memoryUsedBytes / tel.memoryTotalBytes) * 100))
    : 0;
  const diskPct = tel.rootDiskTotalBytes > 0
    ? Math.min(100, Math.round((tel.rootDiskUsedBytes / tel.rootDiskTotalBytes) * 100))
    : 0;
  const traffic = computeTrafficUsage(value);
  const runningContainers = tel.containers.filter(c => c.state === 'running').length;
  const lastReportLabel = tel.lastReportedAt ? dayjs(tel.lastReportedAt).format('YYYY-MM-DD HH:mm:ss') : '—';

  const items = [
    { key: 'provider', label: t('服务商 / 品牌'), children: value.provider || fallback },
    ...(value.hostname ? [{ key: 'hostname', label: t('主机名 (Hostname)'), children: <code>{value.hostname}</code> }] : []),
    { key: 'kind', label: t('服务器类型'), children: `${t(serverKindMeta[value.kind].label)} · ${statusLabel}` },
    {
      key: 'location',
      label: t('机房 / 位置备注'),
      children: `${value.region}${value.datacenter ? ` · ${value.datacenter}` : ''}`,
    },
    {
      key: 'os',
      label: t('操作系统'),
      children: [value.os, tel.kernelVersion].filter(Boolean).join(' · ') || fallback,
    },
    { key: 'specs', label: t('硬件规格'), children: specParts.join(' · ') || fallback },
    { key: 'traffic', label: t('网络带宽与流量'), children: bandwidthParts.join(' · ') || fallback },
    ...(value.ipv4
      ? [{
          key: 'ipv4',
          label: t('主公网 IPv4'),
          children: (
            <span className="inline-flex items-center gap-1.5">
              <code>{value.ipv4}</code>
              <Button
                type="text"
                size="small"
                aria-label={t('复制主地址')}
                icon={<Copy size={13} />}
                onClick={() => { void copyText(value.ipv4, false); }}
              />
            </span>
          ),
        }]
      : []),
    ...(value.ipv6
      ? [{
          key: 'ipv6',
          label: t('主公网 IPv6'),
          children: (
            <span className="inline-flex items-center gap-1.5">
              <code>{value.ipv6}</code>
              <Button
                type="text"
                size="small"
                aria-label={t('复制主地址')}
                icon={<Copy size={13} />}
                onClick={() => { void copyText(value.ipv6, false); }}
              />
            </span>
          ),
        }]
      : []),
    ...(value.privateIp
      ? [{ key: 'privateIp', label: t('内网 / 组网 IP'), children: <code>{value.privateIp}</code> }]
      : []),
    ...(value.portNote
      ? [{ key: 'portNote', label: t('线路 / NAT 端口段备注'), children: value.portNote }]
      : []),
    ...(sshCommand
      ? [{
          key: 'ssh',
          label: t('本地终端 SSH 命令'),
          children: (
            <span className="inline-flex items-center gap-1.5 flex-wrap">
              <code className="server-ssh-code">{sshCommand}</code>
              <Button
                type="text"
                size="small"
                aria-label={t('复制 SSH 命令')}
                icon={<Terminal size={13} />}
                onClick={() => { void copyText(sshCommand, true); }}
              />
            </span>
          ),
        }]
      : []),
    { key: 'billing', label: t('计费与到期管理'), children: billingSummary },
    ...(value.tags.length > 0
      ? [{
          key: 'tags',
          label: t('用途与角色标签'),
          children: (
            <span className="account-table-tags">
              {value.tags.map(tag => <span key={tag} className="account-mini-tag">{tag}</span>)}
            </span>
          ),
        }]
      : []),
    {
      key: 'consoleUrl',
      label: t('商家控制台网址'),
      children: value.consoleUrl
        ? <a href={value.consoleUrl} target="_blank" rel="noopener noreferrer">{value.consoleUrl}</a>
        : fallback,
    },
    { key: 'notes', label: t('运维备注'), children: <span className="detail-notes">{value.notes || fallback}</span> },
    { key: 'archived', label: t('已停用归档'), children: value.archived ? t('已归档') : '—' },
  ];

  return (
    <Drawer
      open
      title={t('服务器详情')}
      size={540}
      onClose={onClose}
      footer={(
        <div className="detail-actions">
          <Button icon={<Pencil size={14} />} onClick={onEdit}>{t('编辑服务器')}</Button>
          <Button icon={<Activity size={14} />} onClick={onConnectAgent}>
            {t(tel.agentStatus === 'none' ? '接入监控探针' : '重装 / 更新探针')}
          </Button>
          {sshCommand && (
            <Button
              icon={<Terminal size={14} />}
              onClick={() => { void copyText(sshCommand, true); }}
            >
              {t('复制 SSH 命令')}
            </Button>
          )}
          {canRenew && linkedSubscription && (
            <Button
              type="primary"
              icon={<CalendarPlus size={14} />}
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
      )}
    >
      <div className="detail-hero">
        <ServerMark value={value} size="lg" />
        <div className="detail-hero-meta">
          <div className="account-title-line">
            <h3>{value.name}</h3>
            {tel.agentStatus !== 'none' && (
              <span className={`server-agent-pill is-${tel.agentStatus}`}>
                {t(
                  tel.agentStatus === 'online'
                    ? '实时在线'
                    : tel.agentStatus === 'stale'
                      ? '心跳丢失'
                      : '快照建档',
                )}
              </span>
            )}
          </div>
          <span>{[value.provider || t(serverKindMeta[value.kind].short), value.region, value.os].filter(Boolean).join(' · ')}</span>
        </div>
      </div>

      {linkedSubscription && linkedSubscription.intention === 'cancel' && !value.archived && (
        <Alert
          showIcon
          type="warning"
          className="mb-4"
          title={t('该服务器关联的订阅「{name}」已标记到期必退，请提前迁移数据与解析域名。', { name: linkedSubscription.name })}
        />
      )}

      {tel.agentStatus === 'stale' && (
        <Alert
          showIcon
          type="warning"
          className="mb-4"
          title={t('探针心跳已超时（最后上报：{time}）。探针进程可能已停止或网络阻断，此状态不代表服务器已关机离线。', { time: lastReportLabel })}
        />
      )}

      {tel.agentStatus === 'snapshot' && (
        <Alert
          showIcon
          type="info"
          className="mb-4"
          title={t('当前展示一次性快照数据（采集于 {time}），升级常驻探针可开启实时速率与流量累计。', { time: lastReportLabel })}
          action={(
            <Button size="small" type="primary" ghost onClick={onConnectAgent}>
              {t('升级为常驻实时探针')}
            </Button>
          )}
        />
      )}

      {tel.agentStatus === 'none'
        ? (
            <div className="server-connect-cta-box mb-4">
              <div>
                <strong>{t('接入监控探针')}</strong>
                <p>{t('一键在服务器执行单行命令，自动采集 CPU/内存/磁盘/IP 并开启实时负载与容器监控。')}</p>
              </div>
              <Button type="primary" icon={<Zap size={14} />} onClick={onConnectAgent}>
                {t('接入监控探针')}
              </Button>
            </div>
          )
        : (
            <div className="server-telemetry-panel mb-4" aria-label={t('实时负载与遥测')}>
              <div className="server-telemetry-panel-head">
                <div className="inline-flex items-center gap-2 flex-wrap">
                  <strong>{t('实时负载与遥测')}</strong>
                  {tel.uptimeSeconds > 0 && (
                    <span className="account-mini-tag">
                      {t('在线时长 {uptime}', { uptime: formatUptime(tel.uptimeSeconds, locale) })}
                    </span>
                  )}
                  {tel.tcpConnections > 0 && (
                    <span className="account-mini-tag">
                      {t('连接数 {count}', { count: tel.tcpConnections })}
                    </span>
                  )}
                </div>
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
              </div>

              <div className="server-gauge-grid">
                <div className="server-gauge-box">
                  <div className="server-gauge-top">
                    <span>{t('处理器负载')}</span>
                    <strong>{`${tel.cpuPercent.toFixed(1)}%`}</strong>
                  </div>
                  <Progress percent={Math.min(100, Math.round(tel.cpuPercent))} showInfo={false} size="small" />
                  <small>
                    {`Load ${tel.load1.toFixed(2)} / ${tel.load5.toFixed(2)} / ${tel.load15.toFixed(2)}${tel.cpuModel ? ` · ${tel.cpuModel}` : ''}`}
                  </small>
                </div>

                <div className="server-gauge-box">
                  <div className="server-gauge-top">
                    <span>{t('内存占用')}</span>
                    <strong>{`${formatBinaryBytes(tel.memoryUsedBytes)} / ${formatBinaryBytes(tel.memoryTotalBytes)}`}</strong>
                  </div>
                  <Progress percent={memPct} showInfo={false} size="small" />
                  <small>
                    {tel.swapTotalBytes > 0
                      ? t('交换分区 {used} / {total}', {
                          used: formatBinaryBytes(tel.swapUsedBytes),
                          total: formatBinaryBytes(tel.swapTotalBytes),
                        })
                      : `${memPct}%`}
                  </small>
                </div>

                <div className="server-gauge-box">
                  <div className="server-gauge-top">
                    <span>{t('根分区存储')}</span>
                    <strong>{`${formatBinaryBytes(tel.rootDiskUsedBytes)} / ${formatBinaryBytes(tel.rootDiskTotalBytes)}`}</strong>
                  </div>
                  <Progress percent={diskPct} showInfo={false} size="small" />
                  <small>{`${diskPct}%${value.diskType ? ` · ${value.diskType.toUpperCase()}` : ''}`}</small>
                </div>

                <div className="server-gauge-box">
                  <div className="server-gauge-top">
                    <span>{t('实时速率与周期流量')}</span>
                    <strong>{`↓${formatNetRate(tel.netRxBps)} · ↑${formatNetRate(tel.netTxBps)}`}</strong>
                  </div>
                  {traffic.percent !== null && (
                    <Progress percent={traffic.percent} showInfo={false} size="small" />
                  )}
                  <small>
                    {traffic.percent !== null
                      ? `${t('本月已用 {used}', { used: formatTrafficBytes(traffic.usedBytes) })} / ${formatTrafficQuota(value.trafficGb)} (${traffic.percent}%)`
                      : `${t('本月已用 {used}', { used: formatTrafficBytes(traffic.usedBytes) })} (↓${formatTrafficBytes(tel.trafficRxBytes)} / ↑${formatTrafficBytes(tel.trafficTxBytes)})`}
                  </small>
                </div>
              </div>

              {tel.dockerEnabled && (
                <div className="server-containers-section">
                  <div className="server-containers-head">
                    <Boxes size={14} />
                    <span>
                      {t('Docker 容器 ({running}/{total} 运行中)', {
                        running: runningContainers,
                        total: tel.containers.length,
                      })}
                    </span>
                  </div>
                  {!tel.dockerAvailable
                    ? (
                        <div className="text-xs text-amber-600">
                          {t('Docker 容器采集未就绪：{reason}', { reason: tel.dockerError || 'unavailable' })}
                        </div>
                      )
                    : tel.containers.length === 0
                      ? <div className="text-xs text-gray-400">{t('尚未发现容器')}</div>
                      : (
                          <div className="server-containers-list">
                            {tel.containers.map(container => (
                              <div key={container.id || container.name} className="server-container-row">
                                <span className={`server-container-dot ${container.state === 'running' ? 'is-running' : ''}`} />
                                <strong className="server-container-name">{container.name}</strong>
                                {container.composeProject && (
                                  <span className="account-mini-tag">{container.composeProject}</span>
                                )}
                                <code className="server-container-image">{container.image}</code>
                                <span className="server-container-status">{container.status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                </div>
              )}
            </div>
          )}

      {linkedSubscription && subDays !== null && !value.archived && (
        <div className="detail-progress">
          <span>{t('周期剩余')}</span>
          <Progress
            percent={Math.min(100, Math.max(0, subDays / periodDays(linkedSubscription) * 100))}
            showInfo={false}
            size="small"
          />
        </div>
      )}

      <Descriptions column={1} size="small" items={items} />

      {linkedSubscription && (
        <div className="detail-related-block">
          <h4>{t('关联订阅')}</h4>
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
          <h4>{t('归属云平台账号')}</h4>
          <div className="detail-related-list">
            <Link to="/accounts" search={{ detail: linkedAccount.id }} className="detail-related-item" onClick={onClose}>
              <span>{accountDisplayTitle(linkedAccount)}</span>
              <code>{linkedAccount.identifier}</code>
            </Link>
          </div>
        </div>
      )}

      {linkedIps.length > 0 && (
        <div className="detail-related-block">
          <h4>{`${t('绑定公网 / 组网 IP 节点')} (${linkedIps.length})`}</h4>
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

      {linkedDomains.length > 0 && (
        <div className="detail-related-block">
          <h4>{`${t('承载解析域名')} (${linkedDomains.length})`}</h4>
          <div className="detail-related-list">
            {linkedDomains.map(dom => (
              <Link key={dom.id} to="/domains" search={{ detail: dom.id }} className="detail-related-item" onClick={onClose}>
                <span>{dom.name}</span>
                <code>{dom.dnsProvider || dom.registrar || dom.notes || 'DNS'}</code>
              </Link>
            ))}
          </div>
        </div>
      )}

      {value.consoleUrl && (
        <Button className="mt-5" icon={<ArrowUpRight size={14} />} href={value.consoleUrl} target="_blank" rel="noopener noreferrer">
          {t('打开商家控制台')}
        </Button>
      )}
    </Drawer>
  );
}
