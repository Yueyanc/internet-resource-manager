import { type IpNode, ipUnlockServices, type Subscription } from '@irm/api-client';
import { App, Button, Dropdown, Table, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { Activity, ArrowUpRight, CheckCircle2, Copy, Eye, MoreHorizontal, Pencil, RefreshCw, Trash2 } from 'lucide-react';

import { usePreferences } from '../../../app/preferences-context';
import {
  ipAsnTypeMeta,
  ipCategoryMeta,
  ipDisplayTitle,
  ipUnlockMeta,
  maskIpAddress,
  reviewRemaining,
} from '../utils/ip-metrics';
import { IpMark } from './ip-mark';

export function IpTable({
  items,
  subscriptionsById,
  masked,
  loading,
  onDetails,
  onEdit,
  onProbe,
  onLookup,
  onReview,
  onDelete,
  busyId,
}: {
  items: IpNode[];
  subscriptionsById: Map<string, Subscription>;
  masked: boolean;
  loading: boolean;
  onDetails: (value: IpNode) => void;
  onEdit: (value: IpNode) => void;
  onProbe: (value: IpNode) => Promise<unknown>;
  onLookup: (value: IpNode) => Promise<unknown>;
  onReview: (value: IpNode) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  busyId?: string;
}) {
  const { t } = usePreferences();
  const { modal, message } = App.useApp();

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      void message.success(t('已复制 IP 地址'));
    }
    catch {
      /* Ignore clipboard denial. */
    }
  };

  return (
    <div className="table-region">
      <Table<IpNode>
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={items}
        scroll={{ x: 860 }}
        pagination={{ pageSize: 12, showSizeChanger: false, hideOnSinglePage: true }}
        columns={[
          {
            title: t('节点与地区'),
            key: 'node',
            width: 215,
            render: (_, row) => {
              const title = ipDisplayTitle(row);
              return (
                <button
                  type="button"
                  className="account-table-platform"
                  onClick={() => onDetails(row)}
                >
                  <IpMark value={row} size="sm" />
                  <div className="account-table-platform-meta">
                    <div className="account-title-line">
                      <strong>{title}</strong>
                      <span className={`account-region-pill ${row.networkScope === 'domestic_entry' ? 'is-domestic' : ''}`}>
                        {row.region}
                      </span>
                    </div>
                    <span>{row.city ? `${t(ipCategoryMeta[row.category].short)} · ${row.city}` : t(ipCategoryMeta[row.category].short)}</span>
                  </div>
                </button>
              );
            },
          },
          {
            title: t('IP / CIDR'),
            key: 'address',
            width: 195,
            render: (_, row) => (
              <div className="account-table-id">
                <code>{masked ? maskIpAddress(row.address) : row.address}</code>
                <Button
                  type="text"
                  size="small"
                  aria-label={t('复制 {name} 地址', { name: ipDisplayTitle(row) })}
                  icon={<Copy size={13} />}
                  onClick={() => { void copy(row.address); }}
                />
              </div>
            ),
          },
          {
            title: t('ASN 与属性'),
            key: 'asn',
            width: 175,
            render: (_, row) => (
              <div className="account-table-tags">
                {row.asn > 0 && (
                  <Tooltip title={row.asnOrg || undefined}>
                    <span className="account-mini-tag">{`AS${row.asn}`}</span>
                  </Tooltip>
                )}
                <span className={`account-mini-tag ${row.asnType === 'residential' || row.asnType === 'isp' ? 'is-safe' : ''}`}>
                  {t(ipAsnTypeMeta[row.asnType].short)}
                </span>
                {row.originType !== 'unknown' && (
                  <span className={`account-mini-tag ${row.originType === 'native' ? 'is-kyc' : ''}`}>
                    {t(row.originType === 'native' ? '原生' : '广播')}
                  </span>
                )}
              </div>
            ),
          },
          {
            title: t('纯净度与解锁'),
            key: 'unlocks',
            width: 190,
            render: (_, row) => {
              const ready = ipUnlockServices.filter(svc => row.unlocks[svc]?.status === 'full');
              return (
                <div className="account-table-tags">
                  {row.riskLevel === 'high' && <span className="account-mini-tag is-danger">{t('高危 / 黑名单')}</span>}
                  {row.riskLevel === 'clean' && <span className="account-mini-tag is-safe">{t('极度纯净')}</span>}
                  {ready.slice(0, 4).map(svc => (
                    <span key={svc} className="account-mini-tag">
                      {ipUnlockMeta[svc].short}
                    </span>
                  ))}
                  {ready.length > 4 && <span className="account-mini-tag">{`+${ready.length - 4}`}</span>}
                  {ready.length === 0 && row.riskLevel !== 'high' && row.riskLevel !== 'clean' && (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
              );
            },
          },
          {
            title: t('连通与关联'),
            key: 'status',
            width: 165,
            render: (_, row) => {
              const days = reviewRemaining(row);
              const sub = row.subscriptionId ? subscriptionsById.get(row.subscriptionId) : undefined;
              const linksCount = row.domainIds.length + row.accountIds.length + (sub ? 1 : 0);

              if (row.archived) return <span className="due-badge">{t('已归档')}</span>;
              if (row.status === 'blocked') return <span className="due-badge is-overdue">{t('被墙 / 封禁')}</span>;
              if (row.probeMode !== 'none' && row.probeStatus === 'unreachable') {
                return <span className="due-badge is-overdue">{t('无法连通')}</span>;
              }
              if (row.probeStatus === 'skipped_non_public' || row.networkScope === 'overlay_private') {
                return <span className="due-badge">{t('内网跳过')}</span>;
              }
              if (row.probeStatus === 'reachable') {
                return <span className="due-badge is-safe">{`${row.probeLatencyMs} ms`}</span>;
              }
              if (days !== null) {
                const tone = days < 0 ? 'is-overdue' : days <= 30 ? 'is-soon' : '';
                return (
                  <span className={`due-badge ${tone}`}>
                    {days < 0 ? t('逾期复检') : t('{date} 复检', { date: dayjs(row.nextReviewDate).format('MM/DD') })}
                  </span>
                );
              }
              return (
                <span className="text-gray-400">
                  {linksCount > 0 ? t('{count} 关联', { count: linksCount }) : t('正常在用')}
                </span>
              );
            },
          },
          {
            title: t('操作'),
            key: 'actions',
            width: 64,
            align: 'center',
            render: (_, row) => {
              const title = ipDisplayTitle(row);
              const busy = busyId === row.id;
              const isSingleHost = (row.version === 4 && row.prefixLen === 32) || (row.version === 6 && row.prefixLen === 128);
              const canLookup = row.networkScope !== 'overlay_private' && row.probeStatus !== 'skipped_non_public';
              const canProbe = canLookup && isSingleHost && row.probeMode !== 'none' && row.probePort > 0;

              return (
                <Dropdown
                  trigger={['click']}
                  placement="bottomRight"
                  menu={{
                    items: [
                      { key: 'details', label: t('查看详情'), icon: <Eye size={14} /> },
                      { key: 'edit', label: t('编辑节点'), icon: <Pencil size={14} /> },
                      ...(canProbe
                        ? [{ key: 'probe', label: t('检测连通性'), icon: <Activity size={14} />, disabled: row.archived || busy }]
                        : []),
                      ...(canLookup
                        ? [{ key: 'lookup', label: t('同步归属信息'), icon: <RefreshCw size={14} />, disabled: row.archived || busy }]
                        : []),
                      ...(row.reviewCycle !== 'none'
                        ? [{ key: 'review', label: t('确认已复检'), icon: <CheckCircle2 size={14} />, disabled: row.archived || busy }]
                        : []),
                      ...(row.consoleUrl
                        ? [{ key: 'console', label: <a href={row.consoleUrl} target="_blank" rel="noopener noreferrer">{t('打开商家控制台')}</a>, icon: <ArrowUpRight size={14} /> }]
                        : []),
                      ...(row.archived ? [{ key: 'delete', label: t('永久删除'), danger: true, icon: <Trash2 size={14} /> }] : []),
                    ],
                    onClick: ({ key }) => {
                      if (key === 'details') onDetails(row);
                      if (key === 'edit') onEdit(row);
                      if (key === 'probe') void onProbe(row);
                      if (key === 'lookup') void onLookup(row);
                      if (key === 'review') {
                        modal.confirm({
                          title: t('确认已完成纯净度与解锁复检？'),
                          content: t('下次复检日期将按周期顺延。'),
                          okText: t('确定'),
                          cancelText: t('取消'),
                          onOk: () => onReview(row),
                        });
                      }
                      if (key === 'delete') {
                        modal.confirm({
                          title: t('永久删除这个 IP 节点？'),
                          content: t('删除后无法恢复。'),
                          okButtonProps: { danger: true },
                          onOk: () => onDelete(row.id),
                        });
                      }
                    },
                  }}
                >
                  <Tooltip title={t('更多操作')}>
                    <Button type="text" aria-label={t('操作 {name}', { name: title })} icon={<MoreHorizontal size={16} />} loading={busy} />
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
