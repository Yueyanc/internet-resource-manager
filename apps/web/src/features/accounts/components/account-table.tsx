import type { Account } from '@irm/api-client';
import { App, Button, Dropdown, Table, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { ArrowUpRight, CheckCircle2, Copy, Eye, KeyRound, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import { usePreferences } from '../../../app/preferences-context';
import {
  accountCategoryMeta,
  accountDisplayTitle,
  checkinRemaining,
  maskIdentifier,
  securityIssues,
} from '../utils/account-metrics';
import { useVault } from '../vault/vault-context';
import { AccountMark } from './account-mark';
import { TotpLiveBadge } from './totp-live-badge';

export function AccountTable({
  items,
  allById,
  masked,
  loading,
  onDetails,
  onEdit,
  onCheckin,
  onDelete,
  checkingId,
}: {
  items: Account[];
  allById: Map<string, Account>;
  masked: boolean;
  loading: boolean;
  onDetails: (value: Account) => void;
  onEdit: (value: Account) => void;
  onCheckin: (value: Account) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  checkingId?: string;
}) {
  const { t } = usePreferences();
  const { modal, message } = App.useApp();
  const vault = useVault();

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      void message.success(t('已复制登录标识'));
    }
    catch {
      /* Ignore clipboard denial. */
    }
  };

  const twoFactorLabel = (tf: Account['twoFactor']) => {
    if (tf === 'passkey') return 'Passkey';
    if (tf === 'hardware') return t('硬件密钥');
    if (tf === 'totp') return 'TOTP';
    if (tf === 'sms') return 'SMS';
    if (tf === 'email') return 'Email';
    return t('未开启');
  };

  return (
    <div className="table-region">
      <Table<Account>
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={items}
        scroll={{ x: 780 }}
        pagination={{ pageSize: 12, showSizeChanger: false, hideOnSinglePage: true }}
        columns={[
          {
            title: t('平台与区服'),
            key: 'platform',
            width: 210,
            render: (_, row) => {
              const title = accountDisplayTitle(row);
              return (
                <button
                  type="button"
                  className="account-table-platform"
                  onClick={() => onDetails(row)}
                >
                  <AccountMark value={row} size="sm" />
                  <div className="account-table-platform-meta">
                    <div className="account-title-line">
                      <strong>{title}</strong>
                      <span className={`account-region-pill ${row.ecosystem === 'domestic' ? 'is-domestic' : ''}`}>
                        {row.region === 'GLOBAL' ? t(row.ecosystem === 'domestic' ? '国内' : '海外') : row.region}
                      </span>
                    </div>
                    <span>{t(accountCategoryMeta[row.category].short)}</span>
                  </div>
                </button>
              );
            },
          },
          {
            title: t('登录标识'),
            key: 'identifier',
            width: 210,
            render: (_, row) => {
              const title = accountDisplayTitle(row);
              const hasPwd = Boolean(vault.summariesById.get(row.id)?.hasPassword);
              return (
                <div className="account-table-id">
                  <code>{masked ? maskIdentifier(row.identifier) : row.identifier}</code>
                  <Button
                    type="text"
                    size="small"
                    aria-label={t('复制 {name} 登录标识', { name: title })}
                    icon={<Copy size={13} />}
                    onClick={() => { void copy(row.identifier); }}
                  />
                  {hasPwd && (
                    <Tooltip title={t('复制密码')}>
                      <Button
                        type="text"
                        size="small"
                        aria-label={t('复制 {name} 密码', { name: title })}
                        icon={<KeyRound size={13} />}
                        onClick={() => { void vault.copyAccountPassword(row.id); }}
                      />
                    </Tooltip>
                  )}
                </div>
              );
            },
          },
          {
            title: t('上游绑定'),
            key: 'bindings',
            width: 190,
            render: (_, row) => {
              const recovery = row.recoveryAccountId ? allById.get(row.recoveryAccountId) : undefined;
              const sso = row.ssoAccountId ? allById.get(row.ssoAccountId) : undefined;
              const tags = [
                recovery ? accountDisplayTitle(recovery) : row.recoveryEmail,
                sso ? `SSO: ${accountDisplayTitle(sso)}` : '',
                row.phoneHint,
              ].filter(Boolean);
              return tags.length
                ? (
                    <div className="account-table-tags">
                      {tags.map(tag => <span key={tag} className="account-mini-tag">{tag}</span>)}
                    </div>
                  )
                : <span className="text-gray-400">—</span>;
            },
          },
          {
            title: t('安全与实名'),
            key: 'security',
            width: 170,
            render: (_, row) => {
              const warn = securityIssues(row).length > 0;
              const summary = vault.summariesById.get(row.id);
              const dec = vault.secretsById.get(row.id);
              return (
                <div className="account-table-tags">
                  {summary?.hasTotp
                    ? <TotpLiveBadge totp={dec?.totp} hasTotp accountName={accountDisplayTitle(row)} />
                    : (
                        <span className={`account-mini-tag ${warn ? 'is-danger' : row.twoFactor !== 'none' ? 'is-safe' : ''}`}>
                          {twoFactorLabel(row.twoFactor)}
                        </span>
                      )}
                  {row.kycStatus === 'verified' && (
                    <span className="account-mini-tag is-kyc">{t('已实名')}</span>
                  )}
                </div>
              );
            },
          },
          {
            title: t('保活与状态'),
            key: 'status',
            width: 130,
            render: (_, row) => {
              const days = checkinRemaining(row);
              if (row.archived) return <span className="due-badge">{t('已归档')}</span>;
              if (row.status === 'retiring') return <span className="due-badge is-soon">{t('计划注销')}</span>;
              if (row.status === 'restricted') return <span className="due-badge is-overdue">{t('风控受限')}</span>;
              if (days !== null) {
                const tone = days < 0 ? 'is-overdue' : days <= 30 ? 'is-soon' : '';
                return (
                  <span className={`due-badge ${tone}`}>
                    {days < 0 ? t('逾期保活') : t('{date} 保活', { date: dayjs(row.nextCheckinDate).format('MM/DD') })}
                  </span>
                );
              }
              return <span className="text-gray-400">{t(row.role === 'hub' ? '核心枢纽' : '正常在用')}</span>;
            },
          },
          {
            title: t('操作'),
            key: 'actions',
            width: 64,
            align: 'center',
            render: (_, row) => {
              const title = accountDisplayTitle(row);
              const busy = checkingId === row.id;
              return (
                <Dropdown
                  trigger={['click']}
                  placement="bottomRight"
                  menu={{
                    items: [
                      { key: 'details', label: t('查看详情'), icon: <Eye size={14} /> },
                      { key: 'edit', label: t('编辑账号'), icon: <Pencil size={14} /> },
                      ...(row.keepaliveCycle !== 'none'
                        ? [{ key: 'checkin', label: t('确认已保活'), icon: <CheckCircle2 size={14} />, disabled: row.archived || busy }]
                        : []),
                      ...(row.securityUrl
                        ? [{ key: 'security', label: <a href={row.securityUrl} target="_blank" rel="noopener noreferrer">{t('打开安全中心')}</a>, icon: <ArrowUpRight size={14} /> }]
                        : []),
                      ...(row.archived ? [{ key: 'delete', label: t('永久删除'), danger: true, icon: <Trash2 size={14} /> }] : []),
                    ],
                    onClick: ({ key }) => {
                      if (key === 'details') onDetails(row);
                      if (key === 'edit') onEdit(row);
                      if (key === 'checkin') {
                        modal.confirm({
                          title: t('确认已完成登录保活？'),
                          content: t('下次保活提醒日期将按周期顺延。'),
                          okText: t('确定'),
                          cancelText: t('取消'),
                          onOk: () => onCheckin(row),
                        });
                      }
                      if (key === 'delete') {
                        modal.confirm({
                          title: t('永久删除这个账号？'),
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
