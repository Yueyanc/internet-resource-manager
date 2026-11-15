import type { ServerHost, Subscription } from '@irm/api-client';
import { App, Button, Card, Dropdown, Tooltip } from 'antd';
import dayjs from 'dayjs';
import {
  Activity,
  Archive,
  ArrowUpRight,
  Boxes,
  CalendarPlus,
  Copy,
  Eye,
  MoreHorizontal,
  Pencil,
  Star,
  Terminal,
  Trash2,
  Wrench,
} from 'lucide-react';

import { usePreferences } from '../../../app/preferences-context';
import {
  buildSshCommand,
  computeTrafficUsage,
  formatNetRate,
  formatSpecSummary,
  formatTrafficBytes,
  maskEndpoint,
  primaryEndpoint,
  resolveServerExpiry,
  serverKindMeta,
} from '../utils/server-metrics';
import { ServerMark } from './server-mark';

export function ServerCard({
  value,
  subscriptionsById,
  masked,
  onDetails,
  onEdit,
  onConnectAgent,
  onRenew,
  onDelete,
  busyRenew,
}: {
  value: ServerHost;
  subscriptionsById: Map<string, Subscription>;
  masked: boolean;
  onDetails: () => void;
  onEdit: () => void;
  onConnectAgent: () => void;
  onRenew: (subscription: Subscription) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  busyRenew?: boolean;
}) {
  const { t } = usePreferences();
  const { modal, message } = App.useApp();

  const endpoint = primaryEndpoint(value);
  const sshCommand = buildSshCommand(value);
  const expiry = resolveServerExpiry(value, subscriptionsById);
  const linkedSub = expiry.subscription;
  const canRenew = Boolean(linkedSub && !linkedSub.archived && linkedSub.cycle !== 'once' && !value.archived);

  const displayAddress = endpoint.address
    ? (masked ? maskEndpoint(endpoint.address) : endpoint.address)
    : '';

  const copyText = async (text: string, isSsh: boolean) => {
    try {
      await navigator.clipboard.writeText(text);
      void message.success(t(isSsh ? '已复制 SSH 连接命令' : '已复制服务器地址'));
    }
    catch {
      /* Clipboard may be unavailable in restricted contexts. */
    }
  };

  const confirmRenew = () => {
    if (!linkedSub) return;
    modal.confirm({
      title: t('确认已完成本期付款？'),
      content: t('到期日将顺延一个计费周期。'),
      okText: t('确定'),
      cancelText: t('取消'),
      onOk: () => onRenew(linkedSub),
    });
  };

  const detailText = expiry.days === null
    ? ''
    : expiry.days < 0
      ? t('已逾期 {count} 天', { count: -expiry.days })
      : expiry.days === 0
        ? t('今天到期')
        : t('剩 {count} 天', { count: expiry.days });

  let rightBadge: { text: string; tone: '' | 'is-soon' | 'is-overdue' | 'is-safe'; tooltip: string };
  if (value.archived) {
    rightBadge = { text: t('已归档'), tone: '', tooltip: t('已归档') };
  }
  else if (expiry.source === 'subscription') {
    if (expiry.days === null) {
      rightBadge = { text: t('一次性买断'), tone: '', tooltip: expiry.date };
    }
    else {
      const tone = expiry.days < 0 ? 'is-overdue' : expiry.days <= 30 ? 'is-soon' : '';
      const text = expiry.days < 0
        ? t('已逾期 {count} 天', { count: -expiry.days })
        : t('{date} 续费', { date: dayjs(expiry.date).format('MM/DD') });
      rightBadge = { text, tone, tooltip: `${expiry.date} · ${detailText}` };
    }
  }
  else if (expiry.source === 'manual' && expiry.days !== null) {
    const tone = expiry.days < 0 ? 'is-overdue' : expiry.days <= 30 ? 'is-soon' : '';
    const text = expiry.days < 0
      ? t('已逾期 {count} 天', { count: -expiry.days })
      : t('{date} 到期', { date: dayjs(expiry.date).format('MM/DD') });
    rightBadge = { text, tone, tooltip: `${expiry.date} · ${detailText}` };
  }
  else {
    rightBadge = { text: t('自有 / 长期'), tone: '', tooltip: t('自有 / 免费（无周期账单）') };
  }

  const specSummary = formatSpecSummary(value);
  const subtitleParts = [
    value.provider || t(serverKindMeta[value.kind].short),
    specSummary || value.os || t('仅台账'),
  ].filter(Boolean);

  const tel = value.telemetry;
  const memPct = tel.memoryTotalBytes > 0
    ? Math.round((tel.memoryUsedBytes / tel.memoryTotalBytes) * 100)
    : 0;
  const traffic = computeTrafficUsage(value);
  const runningContainers = tel.containers.filter(c => c.state === 'running').length;

  return (
    <Card className={`subscription-card account-card server-card ${value.archived ? 'is-archived' : ''}`}>
      <button
        type="button"
        className="subscription-face"
        aria-label={t('查看 {name}', { name: value.name })}
        onClick={onDetails}
      >
        <div className="subscription-identity">
          <ServerMark value={value} />
          <div className="subscription-title-group">
            <div className="account-title-line">
              <h2 title={value.name}>{value.name}</h2>
              <span className={`account-region-pill ${value.region === 'CN' || value.region === 'LOCAL' ? 'is-domestic' : ''}`}>
                {value.region}
              </span>
              {tel.agentStatus === 'online' && (
                <span className="server-agent-pill is-online">{t('实时在线')}</span>
              )}
              {tel.agentStatus === 'stale' && (
                <Tooltip title={t('最后上报于 {time}（心跳超时不代表宿主机断电离线）', { time: dayjs(tel.lastReportedAt).format('MM/DD HH:mm') })}>
                  <span className="server-agent-pill is-stale">{t('心跳丢失')}</span>
                </Tooltip>
              )}
              {tel.agentStatus === 'snapshot' && (
                <span className="server-agent-pill is-snapshot">{t('快照建档')}</span>
              )}
            </div>
            <span className="subscription-subtitle">{subtitleParts.join(' · ')}</span>
          </div>
        </div>

        {(tel.agentStatus === 'online' || tel.agentStatus === 'stale') && (
          <div className="server-card-telemetry-strip">
            <span className="server-mini-metric">
              <em>CPU</em>
              <strong>{`${Math.round(tel.cpuPercent)}%`}</strong>
            </span>
            <span className="server-mini-metric">
              <em>RAM</em>
              <strong>{`${memPct}%`}</strong>
            </span>
            {tel.agentStatus === 'online' && (tel.netRxBps > 0 || tel.netTxBps > 0)
              ? (
                  <span className="server-mini-metric">
                    <em>NET</em>
                    <strong>{`↓${formatNetRate(tel.netRxBps)} ↑${formatNetRate(tel.netTxBps)}`}</strong>
                  </span>
                )
              : traffic.usedBytes > 0 && (
                <span className="server-mini-metric">
                  <em>{traffic.percent !== null ? `${traffic.percent}%` : 'TRAF'}</em>
                  <strong>{formatTrafficBytes(traffic.usedBytes)}</strong>
                </span>
              )}
            {tel.dockerAvailable && tel.containers.length > 0 && (
              <span className="server-mini-metric">
                <Boxes size={11} />
                <strong>{`${runningContainers}/${tel.containers.length}`}</strong>
              </span>
            )}
          </div>
        )}

        <div className="subscription-bottom">
          <div className="account-identifier-wrap server-endpoint-wrap">
            {displayAddress
              ? <code className="account-identifier" title={masked ? undefined : endpoint.address}>{displayAddress}</code>
              : <span className="text-xs text-gray-400">{t('未填写')}</span>}
            {value.ipv4 && value.ipv6 && <span className="account-mini-tag">IPv6</span>}
            {value.kind === 'nat' && <span className="account-mini-tag">NAT</span>}
          </div>

          <div className="subscription-meta-right">
            <div className="card-signals">
              {linkedSub?.intention === 'keep' && (
                <Tooltip title={t('绝版必留')}>
                  <Star size={13} className="text-amber-500" aria-label={t('绝版必留')} />
                </Tooltip>
              )}
              {value.status === 'maintenance' && !value.archived && (
                <Tooltip title={t('维护调试')}>
                  <Wrench size={13} className="text-amber-600" aria-label={t('维护调试')} />
                </Tooltip>
              )}
              {(linkedSub?.intention === 'cancel' || value.status === 'retiring') && !value.archived && (
                <Tooltip title={t(linkedSub?.intention === 'cancel' ? '到期必退' : '计划退役')}>
                  <span className="cancel-signal" aria-label={t('计划退役')} />
                </Tooltip>
              )}
              {value.archived && <Archive size={13} aria-label={t('已归档')} />}
            </div>
            <Tooltip title={rightBadge.tooltip}>
              <span className={`due-badge ${rightBadge.tone}`}>{rightBadge.text}</span>
            </Tooltip>
          </div>
        </div>
      </button>

      {(sshCommand || endpoint.address) && (
        <Tooltip title={t(sshCommand ? '复制 SSH 命令' : '复制主地址')}>
          <Button
            type="text"
            size="small"
            className="account-copy-btn"
            aria-label={t(sshCommand ? '复制 {name} SSH 命令' : '复制 {name} 主地址', { name: value.name })}
            icon={sshCommand ? <Terminal size={13} /> : <Copy size={13} />}
            onClick={() => {
              void copyText(sshCommand ?? endpoint.address, Boolean(sshCommand));
            }}
          />
        </Tooltip>
      )}

      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        menu={{
          items: [
            { key: 'details', label: t('查看详情'), icon: <Eye size={14} /> },
            {
              key: 'agent',
              label: t(tel.agentStatus === 'none' ? '接入监控探针' : '重装 / 更新探针'),
              icon: <Activity size={14} />,
            },
            { key: 'edit', label: t('编辑服务器'), icon: <Pencil size={14} /> },
            ...(endpoint.address
              ? [{ key: 'copy_ip', label: t('复制主地址'), icon: <Copy size={14} /> }]
              : []),
            ...(sshCommand
              ? [{ key: 'copy_ssh', label: t('复制 SSH 命令'), icon: <Terminal size={14} /> }]
              : []),
            ...(canRenew
              ? [{ key: 'renew', label: t('顺延一周期'), icon: <CalendarPlus size={14} />, disabled: busyRenew }]
              : []),
            ...(value.consoleUrl
              ? [{
                  key: 'console',
                  label: <a href={value.consoleUrl} target="_blank" rel="noopener noreferrer">{t('打开商家控制台')}</a>,
                  icon: <ArrowUpRight size={14} />,
                }]
              : []),
            ...(value.archived ? [{ key: 'delete', label: t('永久删除'), danger: true, icon: <Trash2 size={14} /> }] : []),
          ],
          onClick: ({ key }) => {
            if (key === 'details') onDetails();
            if (key === 'agent') onConnectAgent();
            if (key === 'edit') onEdit();
            if (key === 'copy_ip' && endpoint.address) void copyText(endpoint.address, false);
            if (key === 'copy_ssh' && sshCommand) void copyText(sshCommand, true);
            if (key === 'renew') confirmRenew();
            if (key === 'delete') {
              modal.confirm({
                title: t('永久删除这台服务器？'),
                content: t('删除后无法恢复。'),
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
    </Card>
  );
}
