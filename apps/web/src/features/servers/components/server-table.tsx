import type { ServerHost, Subscription } from '@irm/api-client';
import { App, Button, Dropdown, Table, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { Activity, ArrowUpRight, CalendarPlus, Copy, Eye, MoreHorizontal, Pencil, Terminal, Trash2 } from 'lucide-react';

import { usePreferences } from '../../../app/preferences-context';
import {
  buildSshCommand,
  formatSpecSummary,
  formatTrafficQuota,
  maskEndpoint,
  primaryEndpoint,
  resolveServerExpiry,
  serverKindMeta,
} from '../utils/server-metrics';
import { ServerMark } from './server-mark';

export function ServerTable({
  items,
  subscriptionsById,
  masked,
  loading,
  onDetails,
  onEdit,
  onConnectAgent,
  onRenew,
  onDelete,
  busySubId,
}: {
  items: ServerHost[];
  subscriptionsById: Map<string, Subscription>;
  masked: boolean;
  loading: boolean;
  onDetails: (value: ServerHost) => void;
  onEdit: (value: ServerHost) => void;
  onConnectAgent: (value: ServerHost) => void;
  onRenew: (subscription: Subscription) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  busySubId?: string;
}) {
  const { t } = usePreferences();
  const { modal, message } = App.useApp();

  const copyText = async (text: string, isSsh: boolean) => {
    try {
      await navigator.clipboard.writeText(text);
      void message.success(t(isSsh ? '已复制 SSH 连接命令' : '已复制服务器地址'));
    }
    catch {
      /* Ignore clipboard denial. */
    }
  };

  return (
    <div className="table-region">
      <Table<ServerHost>
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={items}
        scroll={{ x: 860 }}
        pagination={{ pageSize: 12, showSizeChanger: false, hideOnSinglePage: true }}
        columns={[
          {
            title: t('主机与地区'),
            key: 'host',
            width: 240,
            render: (_, row) => (
              <button
                type="button"
                className="account-table-platform"
                onClick={() => onDetails(row)}
              >
                <ServerMark value={row} size="sm" />
                <div className="account-table-platform-meta">
                  <div className="account-title-line">
                    <strong>{row.name}</strong>
                    <span className={`account-region-pill ${row.region === 'CN' || row.region === 'LOCAL' ? 'is-domestic' : ''}`}>
                      {row.region}
                    </span>
                    {row.telemetry.agentStatus !== 'none' && (
                      <span className={`server-agent-pill is-${row.telemetry.agentStatus}`}>
                        {t(
                          row.telemetry.agentStatus === 'online'
                            ? '实时在线'
                            : row.telemetry.agentStatus === 'stale'
                              ? '心跳丢失'
                              : '快照建档',
                        )}
                      </span>
                    )}
                  </div>
                  <span>
                    {[row.provider || t(serverKindMeta[row.kind].short), row.datacenter || row.os].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </button>
            ),
          },
          {
            title: t('规格与流量'),
            key: 'specs',
            width: 230,
            render: (_, row) => {
              const spec = formatSpecSummary(row);
              const traffic = row.trafficRule === 'unlimited'
                ? t('不限流量')
                : formatTrafficQuota(row.trafficGb);
              const ruleShort = row.trafficRule === 'out_only'
                ? t('单向出站')
                : row.trafficRule === 'both' && row.trafficGb > 0
                  ? t('双向')
                  : '';
              const memPct = row.telemetry.memoryTotalBytes > 0
                ? Math.round((row.telemetry.memoryUsedBytes / row.telemetry.memoryTotalBytes) * 100)
                : 0;
              return (
                <div className="account-table-tags">
                  {row.telemetry.agentStatus === 'online' && (
                    <span className="account-mini-tag">
                      {`CPU ${Math.round(row.telemetry.cpuPercent)}% · RAM ${memPct}%`}
                    </span>
                  )}
                  {spec && <span className="account-mini-tag">{spec}</span>}
                  {traffic && (
                    <span className="account-mini-tag">
                      {ruleShort ? `${traffic} · ${ruleShort}` : traffic}
                    </span>
                  )}
                  {!spec && !traffic && row.telemetry.agentStatus === 'none' && <span className="text-gray-400">—</span>}
                </div>
              );
            },
          },
          {
            title: t('主地址与 SSH'),
            key: 'endpoint',
            width: 200,
            render: (_, row) => {
              const endpoint = primaryEndpoint(row);
              const sshCmd = buildSshCommand(row);
              if (!endpoint.address) return <span className="text-gray-400">—</span>;
              return (
                <div className="account-table-id">
                  <code>{masked ? maskEndpoint(endpoint.address) : endpoint.address}</code>
                  <Button
                    type="text"
                    size="small"
                    aria-label={t(sshCmd ? '复制 {name} SSH 命令' : '复制 {name} 主地址', { name: row.name })}
                    icon={sshCmd ? <Terminal size={13} /> : <Copy size={13} />}
                    onClick={() => { void copyText(sshCmd ?? endpoint.address, Boolean(sshCmd)); }}
                  />
                </div>
              );
            },
          },
          {
            title: t('账单与状态'),
            key: 'billing',
            width: 170,
            render: (_, row) => {
              if (row.archived) return <span className="due-badge">{t('已归档')}</span>;
              const expiry = resolveServerExpiry(row, subscriptionsById);
              if (row.status === 'retiring' || expiry.subscription?.intention === 'cancel') {
                return <span className="due-badge is-overdue">{t(expiry.subscription?.intention === 'cancel' ? '到期必退' : '计划退役')}</span>;
              }
              if (row.status === 'maintenance') {
                return <span className="due-badge is-soon">{t('维护调试')}</span>;
              }
              if (expiry.days !== null) {
                const tone = expiry.days < 0 ? 'is-overdue' : expiry.days <= 30 ? 'is-soon' : '';
                const label = expiry.days < 0
                  ? t('已逾期 {count} 天', { count: -expiry.days })
                  : expiry.source === 'subscription'
                    ? t('{date} 续费', { date: dayjs(expiry.date).format('MM/DD') })
                    : t('{date} 到期', { date: dayjs(expiry.date).format('MM/DD') });
                return <span className={`due-badge ${tone}`}>{label}</span>;
              }
              return <span className="due-badge">{t('自有 / 长期')}</span>;
            },
          },
          {
            title: t('操作'),
            key: 'actions',
            width: 64,
            align: 'center',
            render: (_, row) => {
              const endpoint = primaryEndpoint(row);
              const sshCmd = buildSshCommand(row);
              const expiry = resolveServerExpiry(row, subscriptionsById);
              const linkedSub = expiry.subscription;
              const canRenew = Boolean(linkedSub && !linkedSub.archived && linkedSub.cycle !== 'once' && !row.archived);
              const busy = Boolean(linkedSub && busySubId === linkedSub.id);

              return (
                <Dropdown
                  trigger={['click']}
                  placement="bottomRight"
                  menu={{
                    items: [
                      { key: 'details', label: t('查看详情'), icon: <Eye size={14} /> },
                      {
                        key: 'agent',
                        label: t(row.telemetry.agentStatus === 'none' ? '接入监控探针' : '重装 / 更新探针'),
                        icon: <Activity size={14} />,
                      },
                      { key: 'edit', label: t('编辑服务器'), icon: <Pencil size={14} /> },
                      ...(endpoint.address
                        ? [{ key: 'copy_ip', label: t('复制主地址'), icon: <Copy size={14} /> }]
                        : []),
                      ...(sshCmd
                        ? [{ key: 'copy_ssh', label: t('复制 SSH 命令'), icon: <Terminal size={14} /> }]
                        : []),
                      ...(canRenew
                        ? [{ key: 'renew', label: t('顺延一周期'), icon: <CalendarPlus size={14} />, disabled: busy }]
                        : []),
                      ...(row.consoleUrl
                        ? [{ key: 'console', label: <a href={row.consoleUrl} target="_blank" rel="noopener noreferrer">{t('打开商家控制台')}</a>, icon: <ArrowUpRight size={14} /> }]
                        : []),
                      ...(row.archived ? [{ key: 'delete', label: t('永久删除'), danger: true, icon: <Trash2 size={14} /> }] : []),
                    ],
                    onClick: ({ key }) => {
                      if (key === 'details') onDetails(row);
                      if (key === 'agent') onConnectAgent(row);
                      if (key === 'edit') onEdit(row);
                      if (key === 'copy_ip' && endpoint.address) void copyText(endpoint.address, false);
                      if (key === 'copy_ssh' && sshCmd) void copyText(sshCmd, true);
                      if (key === 'renew' && linkedSub) {
                        modal.confirm({
                          title: t('确认已完成本期付款？'),
                          content: t('到期日将顺延一个计费周期。'),
                          okText: t('确定'),
                          cancelText: t('取消'),
                          onOk: () => onRenew(linkedSub),
                        });
                      }
                      if (key === 'delete') {
                        modal.confirm({
                          title: t('永久删除这台服务器？'),
                          content: t('删除后无法恢复。'),
                          okButtonProps: { danger: true },
                          onOk: () => onDelete(row.id),
                        });
                      }
                    },
                  }}
                >
                  <Tooltip title={t('更多操作')}>
                    <Button type="text" aria-label={t('操作 {name}', { name: row.name })} icon={<MoreHorizontal size={16} />} loading={busy} />
                  </Tooltip>
                </Dropdown>
              );
            },
          },
        ]}
      />
    </div>
  );
}
