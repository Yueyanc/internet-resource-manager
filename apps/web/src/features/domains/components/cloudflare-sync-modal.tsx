import {
  type Account,
  cloudflareTemplateOptions,
  connectCloudflare,
  deleteIntegration,
  integrationsOptions,
  type ProviderConnection,
  syncIntegration,
} from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Input, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import {
  CheckCircle2,
  Cloud,
  ExternalLink,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { errorMessage } from '../../../shared/errors';
import { accountDisplayTitle } from '../../accounts/utils/account-metrics';

export function CloudflareSyncModal({
  open,
  accounts,
  onClose,
}: {
  open: boolean;
  accounts: Account[];
  onClose: () => void;
}) {
  const { t, locale } = usePreferences();
  const { modal, message } = App.useApp();
  const client = useQueryClient();

  const [apiToken, setApiToken] = useState('');
  const [label, setLabel] = useState('');
  const [accountId, setAccountId] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const templateQuery = useQuery({
    ...cloudflareTemplateOptions,
    enabled: open,
  });

  const integrationsQuery = useQuery({
    ...integrationsOptions,
    enabled: open,
  });

  const cfConnections = (integrationsQuery.data?.items ?? []).filter(
    item => item.provider === 'cloudflare',
  );

  const invalidateAll = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['integrations'] }),
      client.invalidateQueries({ queryKey: ['domains'] }),
      client.invalidateQueries({ queryKey: ['servers'] }),
      client.invalidateQueries({ queryKey: ['ips'] }),
      client.invalidateQueries({ queryKey: ['nav-counts'] }),
    ]);
  };

  const connectMutation = useMutation({
    mutationFn: () =>
      connectCloudflare({
        apiToken: apiToken.trim(),
        label: label.trim(),
        accountId,
        syncNow: true,
      }),
    onSuccess: async (res) => {
      setApiToken('');
      setLabel('');
      setShowAddForm(false);
      await invalidateAll();
      const s = res.syncStats;
      if (s) {
        void message.success(
          t('同步完成：新增 {imported} 个域名，更新 {updated} 个域名，串联 {servers} 台服务器与 {ips} 个 IP', {
            imported: s.domainsImported,
            updated: s.domainsUpdated,
            servers: s.serverLinksAdded,
            ips: s.ipLinksAdded,
          }),
        );
      }
    },
    onError: (err) => {
      void message.error(errorMessage(err, locale));
    },
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => syncIntegration(id),
    onSuccess: async (res) => {
      await invalidateAll();
      const s = res.syncStats;
      if (s) {
        void message.success(
          t('同步完成：新增 {imported} 个域名，更新 {updated} 个域名，串联 {servers} 台服务器与 {ips} 个 IP', {
            imported: s.domainsImported,
            updated: s.domainsUpdated,
            servers: s.serverLinksAdded,
            ips: s.ipLinksAdded,
          }),
        );
      }
    },
    onError: (err) => {
      void invalidateAll();
      void message.error(errorMessage(err, locale));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteIntegration(id),
    onSuccess: async () => {
      await invalidateAll();
      void message.success(t('已移除 Cloudflare 同步连接'));
    },
    onError: (err) => {
      void message.error(errorMessage(err, locale));
    },
  });

  const confirmDisconnect = (conn: ProviderConnection) => {
    modal.confirm({
      title: t('移除 Cloudflare 连接「{name}」？', { name: conn.label }),
      content: t('服务端加密存储的 API 令牌将被彻底销毁；已导入的域名台账、到期日与拓扑关联将完整保留。'),
      okText: t('移除连接'),
      cancelText: t('取消'),
      okButtonProps: { danger: true },
      onOk: () => deleteMutation.mutateAsync(conn.id),
    });
  };

  const formExpanded = cfConnections.length === 0 || showAddForm;
  const activeAccounts = accounts.filter(a => !a.archived);
  const template = templateQuery.data;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={620}
      destroyOnHidden
      title={(
        <div className="cf-modal-title">
          <span className="cf-brand-badge" aria-hidden="true">
            <Cloud size={17} />
          </span>
          <div>
            <h3>{t('Cloudflare 只读资产同步')}</h3>
            <p>{t('通过严格只读 API 令牌自动导入托管域名、Registrar 到期日、DNS 解析记录与 Zero Trust 隧道，并自动串联名下服务器与 IP 节点。')}</p>
          </div>
        </div>
      )}
    >
      <div className="cf-sync-body">
        {cfConnections.length > 0 && (
          <div className="cf-conn-section">
            <div className="cf-conn-section-head">
              <span>{t('已连接的 Cloudflare 账号')}</span>
              <button
                type="button"
                className="cf-toggle-add-btn"
                onClick={() => setShowAddForm(prev => !prev)}
              >
                <Plus size={13} />
                <span>{t(showAddForm ? '收起新增面板' : '新增 Cloudflare 账号连接')}</span>
              </button>
            </div>

            <div className="cf-conn-list">
              {cfConnections.map((conn) => {
                const isSyncing = syncMutation.isPending && syncMutation.variables === conn.id;
                const statusClass = conn.status === 'ok'
                  ? 'is-ok'
                  : conn.status === 'error'
                    ? 'is-error'
                    : 'is-pending';
                const statusText = conn.status === 'ok'
                  ? t('已同步')
                  : conn.status === 'error'
                    ? t('同步异常')
                    : t('待同步');

                return (
                  <div key={conn.id} className="cf-conn-card">
                    <div className="cf-conn-card-top">
                      <div className="cf-conn-identity">
                        <div className="cf-conn-title-row">
                          <strong>{conn.label}</strong>
                          <span className={`cf-conn-status ${statusClass}`}>
                            {conn.status === 'ok'
                              ? <CheckCircle2 size={12} />
                              : conn.status === 'error'
                                ? <XCircle size={12} />
                                : <RefreshCw size={12} />}
                            <span>{statusText}</span>
                          </span>
                          <code className="cf-token-hint">{conn.tokenHint}</code>
                        </div>
                        <div className="cf-conn-sub">
                          {conn.externalAccountName && <span>{conn.externalAccountName}</span>}
                          {conn.lastSyncedAt && (
                            <span>
                              {t('上次同步：{time}', {
                                time: dayjs(conn.lastSyncedAt).format('YYYY-MM-DD HH:mm'),
                              })}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="cf-conn-actions">
                        <Button
                          size="small"
                          type="primary"
                          icon={<RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />}
                          loading={isSyncing}
                          onClick={() => syncMutation.mutate(conn.id)}
                        >
                          {t('立即同步')}
                        </Button>
                        <Button
                          size="small"
                          danger
                          type="text"
                          aria-label={t('移除连接')}
                          icon={<Trash2 size={14} />}
                          onClick={() => confirmDisconnect(conn)}
                        />
                      </div>
                    </div>

                    <div className="cf-conn-stats-row">
                      <span className="account-mini-tag">
                        {t('{zones} 域名 · {records} 解析 · {tunnels} 隧道', {
                          zones: conn.stats.zonesTotal,
                          records: conn.stats.recordsSynced,
                          tunnels: conn.stats.tunnelsTotal,
                        })}
                      </span>
                      {conn.scopes.map(scope => (
                        <span key={scope} className="cf-scope-chip">{scope}</span>
                      ))}
                    </div>

                    {conn.lastError && (
                      <Alert
                        type="error"
                        showIcon
                        className="mt-2"
                        title={conn.lastError}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {formExpanded && (
          <div className="cf-guide-stack">
            <div className="cf-step-box">
              <div className="cf-step-head">
                <span className="cf-step-num">1</span>
                <div>
                  <h4>{t('第一步：在 Cloudflare 一键创建只读令牌')}</h4>
                  <p>{t('点击下方按钮会打开已预填最小只读权限（Zone / DNS / Tunnel / Pages / Workers Read）的官方授权页，滚动到底部点击 Continue to summary → Create Token 即可。')}</p>
                </div>
              </div>

              <div className="cf-template-actions">
                <Button
                  href={template?.userTokenUrl ?? 'https://dash.cloudflare.com/profile/api-tokens'}
                  target="_blank"
                  rel="noopener noreferrer"
                  icon={<ExternalLink size={14} />}
                  className="cf-template-btn"
                >
                  {t('一键打开 Cloudflare 只读令牌模板')}
                </Button>
                {template?.accountTokenUrl && (
                  <a
                    href={template.accountTokenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cf-secondary-link"
                  >
                    <span>{t('企业账号级令牌入口')}</span>
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>

              {template && (
                <div className="cf-perm-pills">
                  {template.permissions.map(perm => (
                    <span key={perm.key} className="cf-perm-pill" title={perm.description}>
                      {perm.label}
                    </span>
                  ))}
                </div>
              )}

              <div className="cf-security-note">
                <ShieldCheck size={15} />
                <span>{t('安全承诺：仅申请 Read 只读权限，绝无修改或删除 DNS 解析能力；令牌使用服务端独立 AES-256-GCM 密钥加密落盘，前端与接口永不回显明文。')}</span>
              </div>
            </div>

            <div className="cf-step-box">
              <div className="cf-step-head">
                <span className="cf-step-num">2</span>
                <div>
                  <h4>{t('第二步：粘贴 API 令牌并立即同步')}</h4>
                </div>
              </div>

              <div className="cf-form-grid">
                <div className="cf-field-full">
                  <label className="cf-field-label">{t('粘贴 Cloudflare API Token')}</label>
                  <Input.Password
                    aria-label={t('粘贴 Cloudflare API Token')}
                    placeholder={t('请输入 Cloudflare 只读 API 令牌')}
                    prefix={<KeyRound size={14} className="text-gray-400" />}
                    value={apiToken}
                    autoComplete="off"
                    onChange={e => setApiToken(e.target.value)}
                  />
                </div>

                <div>
                  <label className="cf-field-label">{t('连接备注（可选）')}</label>
                  <Input
                    aria-label={t('连接备注（可选）')}
                    placeholder={t('例如：主力 CF 账号 / 工作室账号')}
                    maxLength={64}
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                  />
                </div>

                <div>
                  <label className="cf-field-label">{t('默认归属注册商账号（可选）')}</label>
                  <Select
                    className="w-full"
                    value={accountId}
                    onChange={val => setAccountId(val)}
                    options={[
                      { value: '', label: t('不指定（保持独立）') },
                      ...activeAccounts.map(acct => ({
                        value: acct.id,
                        label: accountDisplayTitle(acct),
                      })),
                    ]}
                  />
                </div>
              </div>

              <div className="cf-submit-row">
                <Button onClick={onClose}>{t('取消')}</Button>
                <Button
                  type="primary"
                  loading={connectMutation.isPending}
                  disabled={apiToken.trim().length < 16}
                  icon={<RefreshCw size={14} className={connectMutation.isPending ? 'animate-spin' : ''} />}
                  onClick={() => connectMutation.mutate()}
                >
                  {t(connectMutation.isPending ? '正在验证并拉取 Cloudflare 资产...' : '验证令牌并同步资产')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
