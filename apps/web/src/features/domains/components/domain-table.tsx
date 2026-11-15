import type { Domain, IpNode, ServerHost, Subscription } from '@irm/api-client';
import { App, Button, Dropdown, Table, Tooltip } from 'antd';
import dayjs from 'dayjs';
import {
  ArrowUpRight,
  CalendarPlus,
  Copy,
  Eye,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

import { usePreferences } from '../../../app/preferences-context';
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

export function DomainTable({
  items,
  subscriptionsById,
  serversById,
  ipsById,
  masked,
  loading,
  onDetails,
  onEdit,
  onRenewSub,
  onExtendYear,
  onDelete,
  busyId,
}: {
  items: Domain[];
  subscriptionsById: Map<string, Subscription>;
  serversById: Map<string, ServerHost>;
  ipsById: Map<string, IpNode>;
  masked: boolean;
  loading: boolean;
  onDetails: (value: Domain) => void;
  onEdit: (value: Domain) => void;
  onRenewSub: (subscription: Subscription) => Promise<unknown>;
  onExtendYear: (domain: Domain) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  busyId?: string;
}) {
  const { t, locale } = usePreferences();
  const { modal, message } = App.useApp();

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      void message.success(t('已复制域名'));
    }
    catch {
      /* Ignore clipboard denial. */
    }
  };

  return (
    <div className="table-region">
      <Table<Domain>
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={items}
        scroll={{ x: 860 }}
        pagination={{ pageSize: 12, showSizeChanger: false, hideOnSinglePage: true }}
        columns={[
          {
            title: t('域名与后缀'),
            key: 'domain',
            width: 250,
            render: (_, row) => {
              const tld = extractDomainTld(row.name);
              const display = masked ? maskDomainName(row.name) : row.name;
              return (
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    type="button"
                    className="account-table-platform"
                    onClick={() => onDetails(row)}
                  >
                    <DomainMark value={row} size="sm" />
                    <div className="account-table-platform-meta">
                      <div className="account-title-line">
                        <strong className="font-mono text-[13px]">{display}</strong>
                        {tld && <span className="account-region-pill domain-tld-pill">{tld}</span>}
                      </div>
                      <span>
                        {[
                          t(domainPurposeMeta[row.purpose].short),
                          row.status !== 'active' ? t(domainStatusMeta[row.status].short) : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                  </button>
                  <Tooltip title={t('复制域名')}>
                    <button
                      type="button"
                      className="account-slot-icon-btn shrink-0"
                      aria-label={t('复制 {name}', { name: row.name })}
                      onClick={() => { void copyText(row.name); }}
                    >
                      <Copy size={13} />
                    </button>
                  </Tooltip>
                </div>
              );
            },
          },
          {
            title: t('注册商与解析'),
            key: 'registrar',
            width: 210,
            render: (_, row) => {
              const preset = resolveDomainPreset(row);
              const reg = row.registrar.trim()
                || (preset ? (locale === 'en-US' ? preset.registrar.en : preset.registrar.zh) : '');
              const dns = row.dnsProvider.trim()
                || (preset ? (locale === 'en-US' ? preset.dnsProvider.en : preset.dnsProvider.zh) : '');
              if (!reg && !dns) return <span className="text-gray-400">—</span>;
              return (
                <div className="account-table-tags">
                  {reg && <span className="account-mini-tag">{reg}</span>}
                  {dns && dns.toLowerCase() !== reg.toLowerCase() && (
                    <span className="account-mini-tag">{dns}</span>
                  )}
                </div>
              );
            },
          },
          {
            title: t('隐私与合规'),
            key: 'compliance',
            width: 170,
            render: (_, row) => (
              <div className="account-table-tags">
                {row.icpStatus === 'verified' && (
                  <span className="account-meta-pill is-safe">
                    {row.icpNumber && !masked ? row.icpNumber : t(domainIcpMeta.verified.short)}
                  </span>
                )}
                {row.icpStatus === 'pending' && (
                  <span className="account-meta-pill is-warn">{t(domainIcpMeta.pending.short)}</span>
                )}
                {row.whoisPrivacy && (
                  <span className="account-mini-tag inline-flex items-center gap-1">
                    <ShieldCheck size={12} />
                    {t('WHOIS 隐私')}
                  </span>
                )}
                {row.icpStatus === 'none' && !row.whoisPrivacy && (
                  <span className="text-gray-400">{t('海外接入')}</span>
                )}
              </div>
            ),
          },
          {
            title: t('关联拓扑'),
            key: 'topology',
            width: 180,
            render: (_, row) => {
              const srvNames = row.serverIds
                .map(id => serversById.get(id)?.name)
                .filter((v): v is string => Boolean(v));
              const ipLabels = row.ipIds
                .map((id) => {
                  const node = ipsById.get(id);
                  return node ? (node.label || node.address) : undefined;
                })
                .filter((v): v is string => Boolean(v));
              const all = [...srvNames, ...ipLabels];
              if (!all.length) return <span className="text-gray-400">—</span>;
              return (
                <div className="account-table-tags">
                  {all.slice(0, 2).map(name => (
                    <span key={name} className="account-mini-tag">{name}</span>
                  ))}
                  {all.length > 2 && <span className="account-mini-tag">{`+${all.length - 2}`}</span>}
                </div>
              );
            },
          },
          {
            title: t('到期与续费'),
            key: 'expiry',
            width: 165,
            render: (_, row) => {
              const expiry = resolveDomainExpiry(row, subscriptionsById);
              if (!expiry.date) return <span className="text-gray-400">—</span>;
              const urgent = expiry.days !== null && expiry.days <= 14;
              const warn = expiry.days !== null && expiry.days <= 60;
              return (
                <div className="flex flex-col gap-0.5">
                  <span className={`font-mono text-[12.5px] ${urgent ? 'text-red-500 font-semibold' : warn ? 'text-amber-600 font-medium' : ''}`}>
                    {dayjs(expiry.date).format('YYYY-MM-DD')}
                  </span>
                  <span className="text-[11.5px] text-[var(--muted)]">
                    {expiry.days !== null
                      ? (expiry.days < 0
                          ? t('逾期 {count} 天', { count: -expiry.days })
                          : t('剩 {count} 天', { count: expiry.days }))
                      : ''}
                    {` · ${t(expiry.autoRenew ? '自动续费' : '手动续费')}`}
                  </span>
                </div>
              );
            },
          },
          {
            title: '',
            key: 'actions',
            width: 56,
            align: 'right',
            render: (_, row) => {
              const preset = resolveDomainPreset(row);
              const consoleUrl = row.managementUrl.trim() || preset?.defaultManagementUrl || '';
              const expiry = resolveDomainExpiry(row, subscriptionsById);
              const canRenewSub = Boolean(
                expiry.subscription
                && !expiry.subscription.archived
                && expiry.subscription.cycle !== 'once'
                && !row.archived,
              );
              const canExtendManual = Boolean(!expiry.subscription && row.expireDate && !row.archived);
              const busy = busyId === row.id || (expiry.subscription && busyId === expiry.subscription.id);

              return (
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
                          }]
                        : []),
                      ...(consoleUrl
                        ? [{
                            key: 'console',
                            label: (
                              <a href={consoleUrl} target="_blank" rel="noopener noreferrer">
                                {t('打开域名控制台')}
                              </a>
                            ),
                            icon: <ArrowUpRight size={14} />,
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
                      if (key === 'details') onDetails(row);
                      if (key === 'edit') onEdit(row);
                      if (key === 'copy') void copyText(row.name);
                      if (key === 'renew') {
                        if (canRenewSub && expiry.subscription) {
                          void onRenewSub(expiry.subscription);
                        }
                        else if (canExtendManual) {
                          void onExtendYear(row);
                        }
                      }
                      if (key === 'delete') {
                        modal.confirm({
                          title: t('永久删除 {name}？', { name: row.name }),
                          content: t('删除后无法恢复；如需保留历史记录可先归档。'),
                          okText: t('删除'),
                          cancelText: t('取消'),
                          okButtonProps: { danger: true },
                          onOk: () => onDelete(row.id),
                        });
                      }
                    },
                  }}
                >
                  <Button
                    type="text"
                    className="card-menu"
                    aria-label={t('操作 {name}', { name: row.name })}
                    icon={<MoreHorizontal size={17} />}
                    loading={Boolean(busy)}
                  />
                </Dropdown>
              );
            },
          },
        ]}
      />
    </div>
  );
}
