import {
  type Account,
  cloudflareTemplateOptions,
  connectProviderIntegration,
  deleteIntegration,
  integrationProvidersOptions,
  integrationsOptions,
  type ProviderConnection,
  type ProviderMetaSpec,
  syncIntegration,
  type SyncStats,
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
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { type CSSProperties, useMemo, useState } from 'react';

import { usePreferences } from '../../app/preferences-context';
import { errorMessage } from '../../shared/errors';
import { accountDisplayTitle } from '../accounts/utils/account-metrics';
import { type CloudSyncProviderKey, PROVIDER_BRIEFS } from './provider-matching';

export type ProviderSyncScope = 'all' | 'domains' | 'servers' | 'ips';

function defaultProviderForScope(scope: ProviderSyncScope): CloudSyncProviderKey {
  if (scope === 'servers') return 'tailscale';
  if (scope === 'ips') return 'tailscale';
  return 'cloudflare';
}

export function ProviderSyncPanel({
  active = true,
  scope = 'all',
  initialProvider,
  accounts,
  initialAccountId = '',
  cancelLabel,
  onCancel,
  onSynced,
}: {
  active?: boolean;
  scope?: ProviderSyncScope;
  initialProvider?: CloudSyncProviderKey;
  accounts: Account[];
  initialAccountId?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onSynced?: () => void;
}) {
  const { t, locale } = usePreferences();
  const { modal, message } = App.useApp();
  const client = useQueryClient();

  const [selectedKey, setSelectedKey] = useState<string>(
    () => initialProvider ?? defaultProviderForScope(scope),
  );
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [label, setLabel] = useState('');
  const [accountId, setAccountId] = useState(initialAccountId);
  const [showAddForm, setShowAddForm] = useState(false);

  const providersQuery = useQuery({
    ...integrationProvidersOptions,
    enabled: active,
  });

  const cfTemplateQuery = useQuery({
    ...cloudflareTemplateOptions,
    enabled: active && selectedKey === 'cloudflare',
  });

  const integrationsQuery = useQuery({
    ...integrationsOptions,
    enabled: active,
  });

  const availableSpecs = useMemo(() => {
    const all = providersQuery.data?.items ?? [];
    if (scope === 'all') return all;
    return all.filter(sp => sp.targets.includes(scope) || sp.key === initialProvider);
  }, [providersQuery.data, scope, initialProvider]);

  const activeSpec: ProviderMetaSpec | undefined = useMemo(() => {
    if (availableSpecs.length === 0) return undefined;
    return availableSpecs.find(sp => sp.key === selectedKey) ?? availableSpecs[0];
  }, [availableSpecs, selectedKey]);

  const effectiveKey = activeSpec?.key ?? selectedKey;

  const allConnections = useMemo(
    () => integrationsQuery.data?.items ?? [],
    [integrationsQuery.data],
  );
  const providerConnections = useMemo(
    () => allConnections.filter(item => item.provider === effectiveKey),
    [allConnections, effectiveKey],
  );
  const connectedCountByProvider = useMemo(() => {
    const map = new Map<string, { total: number; hasError: boolean }>();
    for (const c of allConnections) {
      const prev = map.get(c.provider) ?? { total: 0, hasError: false };
      prev.total += 1;
      if (c.status === 'error') prev.hasError = true;
      map.set(c.provider, prev);
    }
    return map;
  }, [allConnections]);

  const invalidateAll = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['integrations'] }),
      client.invalidateQueries({ queryKey: ['domains'] }),
      client.invalidateQueries({ queryKey: ['servers'] }),
      client.invalidateQueries({ queryKey: ['ips'] }),
      client.invalidateQueries({ queryKey: ['nav-counts'] }),
    ]);
  };

  const formatStatsToast = (s: SyncStats) => {
    const srvTotal = s.serversImported + s.serversUpdated;
    const ipTotal = s.ipsImported + s.ipsUpdated;
    if (srvTotal > 0 || ipTotal > 0) {
      return t(
        '同步完成：域名 +{dNew}/更新 {dUpd} · 服务器 +{sNew}/更新 {sUpd} · IP +{iNew}/更新 {iUpd}',
        {
          dNew: s.domainsImported,
          dUpd: s.domainsUpdated,
          sNew: s.serversImported,
          sUpd: s.serversUpdated,
          iNew: s.ipsImported,
          iUpd: s.ipsUpdated,
        },
      );
    }
    return t('同步完成：新增 {imported} 个域名，更新 {updated} 个域名，串联 {servers} 台服务器与 {ips} 个 IP', {
      imported: s.domainsImported,
      updated: s.domainsUpdated,
      servers: s.serverLinksAdded,
      ips: s.ipLinksAdded,
    });
  };

  const connectMutation = useMutation({
    mutationFn: () => {
      const trimmed: Record<string, string> = {};
      for (const [k, v] of Object.entries(credentials)) {
        const clean = v.trim();
        if (clean) trimmed[k] = clean;
      }
      return connectProviderIntegration({
        provider: effectiveKey,
        credentials: trimmed,
        label: label.trim(),
        accountId,
        syncNow: true,
      });
    },
    onSuccess: async (res) => {
      setCredentials({});
      setLabel('');
      setShowAddForm(false);
      await invalidateAll();
      if (res.syncStats) {
        void message.success(formatStatsToast(res.syncStats));
      }
      onSynced?.();
    },
    onError: (err) => {
      void message.error(errorMessage(err, locale));
    },
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => syncIntegration(id),
    onSuccess: async (res) => {
      await invalidateAll();
      if (res.syncStats) {
        void message.success(formatStatsToast(res.syncStats));
      }
      onSynced?.();
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
      void message.success(t('已移除云平台同步连接'));
    },
    onError: (err) => {
      void message.error(errorMessage(err, locale));
    },
  });

  const confirmDisconnect = (conn: ProviderConnection) => {
    modal.confirm({
      title: t('移除同步连接「{name}」？', { name: conn.label }),
      content: t('服务端加密存储的鉴权凭据将被彻底销毁；已导入的域名、服务器、IP 台账与拓扑关联将完整保留。'),
      okText: t('移除连接'),
      cancelText: t('取消'),
      okButtonProps: { danger: true },
      onOk: () => deleteMutation.mutateAsync(conn.id),
    });
  };

  const switchProvider = (nextKey: string) => {
    setSelectedKey(nextKey);
    setCredentials({});
    setShowAddForm(false);
  };

  const formExpanded = providerConnections.length === 0 || showAddForm;
  const activeAccounts = accounts.filter(a => !a.archived);
  const cfTemplate = cfTemplateQuery.data;

  const providerDisplayName = activeSpec
    ? (locale === 'en-US' ? activeSpec.nameEn : activeSpec.name)
    : (PROVIDER_BRIEFS[effectiveKey as CloudSyncProviderKey]
        ? (locale === 'en-US'
            ? PROVIDER_BRIEFS[effectiveKey as CloudSyncProviderKey].en
            : PROVIDER_BRIEFS[effectiveKey as CloudSyncProviderKey].zh)
        : effectiveKey);

  const canSubmit = useMemo(() => {
    if (!activeSpec) return false;
    return activeSpec.fields
      .filter(f => f.required)
      .every(f => (credentials[f.key] ?? '').trim().length > 0);
  }, [activeSpec, credentials]);

  const formatConnStatsBadge = (conn: ProviderConnection) => {
    const s = conn.stats;
    const parts: string[] = [];
    if (s.zonesTotal > 0 || s.domainsImported > 0 || s.domainsUpdated > 0) {
      parts.push(
        t('{zones} 域名 · {records} 解析', {
          zones: Math.max(s.zonesTotal, s.domainsImported + s.domainsUpdated),
          records: s.recordsSynced,
        }),
      );
    }
    if (s.tunnelsTotal > 0) {
      parts.push(t('{tunnels} 隧道', { tunnels: s.tunnelsTotal }));
    }
    const srvCount = s.serversImported + s.serversUpdated;
    if (srvCount > 0) {
      parts.push(t('{count} 服务器', { count: srvCount }));
    }
    const ipCount = s.ipsImported + s.ipsUpdated;
    if (ipCount > 0) {
      parts.push(t('{count} IP', { count: ipCount }));
    }
    if (parts.length === 0) {
      return t('0 项资产');
    }
    return parts.join(' · ');
  };

  return (
    <div className="cf-sync-body">
      {/* Provider Selector Strip */}
      {availableSpecs.length > 1 && (
        <div className="provider-sync-tabs" role="tablist" aria-label={t('选择同步平台')}>
          {availableSpecs.map((sp) => {
            const isSelected = sp.key === effectiveKey;
            const stat = connectedCountByProvider.get(sp.key);
            const title = locale === 'en-US' ? sp.nameEn : sp.name;
            return (
              <button
                key={sp.key}
                type="button"
                role="tab"
                aria-selected={isSelected}
                style={{ '--prov-tint': sp.color } as CSSProperties}
                className={`provider-sync-tab ${isSelected ? 'is-active' : ''}`}
                onClick={() => switchProvider(sp.key)}
              >
                <span className="provider-sync-dot" style={{ backgroundColor: sp.color }} aria-hidden="true" />
                <span>{title}</span>
                {stat && stat.total > 0 && (
                  <span
                    className={`cf-live-dot ${stat.hasError ? 'is-error' : ''}`}
                    title={`${stat.total}`}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Existing Connections for Selected Provider */}
      {providerConnections.length > 0 && (
        <div className="cf-conn-section">
          <div className="cf-conn-section-head">
            <span>{t('已连接的 {provider} 账号', { provider: providerDisplayName })}</span>
            <button
              type="button"
              className="cf-toggle-add-btn"
              onClick={() => setShowAddForm(prev => !prev)}
            >
              <Plus size={13} />
              <span>{t(showAddForm ? '收起新增面板' : '新增账号连接')}</span>
            </button>
          </div>

          <div className="cf-conn-list">
            {providerConnections.map((conn) => {
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
                    <span className="account-mini-tag">{formatConnStatsBadge(conn)}</span>
                    {conn.scopes.map(s => (
                      <span key={s} className="cf-scope-chip">{s}</span>
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

      {/* Guided Connection Form */}
      {formExpanded && activeSpec && (
        <div className="cf-guide-box">
          <div className="cf-step-block">
            <div className="cf-step-header">
              <span className="cf-step-num">1</span>
              <div>
                <h4>{locale === 'en-US' ? activeSpec.stepTitleEn : activeSpec.stepTitle}</h4>
                <p>{locale === 'en-US' ? activeSpec.stepDescriptionEn : activeSpec.stepDescription}</p>
              </div>
            </div>

            <div className="cf-template-actions">
              <a
                href={
                  effectiveKey === 'cloudflare' && cfTemplate?.userTokenUrl
                    ? cfTemplate.userTokenUrl
                    : activeSpec.primaryActionUrl
                }
                target="_blank"
                rel="noreferrer"
                className="cf-template-primary-btn"
              >
                <KeyRound size={14} />
                <span>{locale === 'en-US' ? activeSpec.primaryActionLabelEn : activeSpec.primaryActionLabel}</span>
                <ExternalLink size={13} />
              </a>

              {activeSpec.secondaryActionUrl && activeSpec.secondaryActionLabel && (
                <a
                  href={
                    effectiveKey === 'cloudflare' && cfTemplate?.accountTokenUrl
                      ? cfTemplate.accountTokenUrl
                      : activeSpec.secondaryActionUrl
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="cf-template-secondary-link"
                >
                  <span>{activeSpec.secondaryActionLabel}</span>
                  <ExternalLink size={12} />
                </a>
              )}
            </div>

            {activeSpec.recommendedScopes.length > 0 && (
              <div className="cf-perm-pills">
                {activeSpec.recommendedScopes.map(scopeLabel => (
                  <span key={scopeLabel} className="cf-perm-pill">
                    <ShieldCheck size={12} />
                    <strong>{scopeLabel}</strong>
                  </span>
                ))}
              </div>
            )}

            <div className={`cf-readonly-note ${activeSpec.readOnlyMode !== 'strict_readonly' ? 'is-amber' : ''}`}>
              {activeSpec.readOnlyMode === 'strict_readonly'
                ? <ShieldCheck size={14} />
                : <ShieldAlert size={14} />}
              <span>{locale === 'en-US' ? activeSpec.safetyNoteEn : activeSpec.safetyNote}</span>
            </div>
          </div>

          <div className="cf-step-divider" />

          <div className="cf-step-block">
            <div className="cf-step-header">
              <span className="cf-step-num">2</span>
              <div>
                <h4>{t('第二步：填写凭据并立即同步资产')}</h4>
                <p>{t('自动完成资产去重合并、到期日校准，并按 IP / 主机名自动串联名下域名、服务器与节点。')}</p>
              </div>
            </div>

            <div className="cf-form-grid">
              {activeSpec.fields.map((field) => {
                const fieldLabel = locale === 'en-US' ? field.labelEn : field.label;
                const fieldPlaceholder = locale === 'en-US' ? field.placeholderEn : field.placeholder;
                const fieldHelp = locale === 'en-US' ? field.helpEn : field.help;
                const val = credentials[field.key] ?? '';
                const onChange = (nextVal: string) =>
                  setCredentials(prev => ({ ...prev, [field.key]: nextVal }));

                return (
                  <div key={field.key} className="cf-field">
                    <label>{fieldLabel}</label>
                    {field.secret
                      ? (
                          <Input.Password
                            aria-label={fieldLabel}
                            placeholder={fieldPlaceholder}
                            value={val}
                            onChange={e => onChange(e.target.value)}
                            autoComplete="off"
                          />
                        )
                      : (
                          <Input
                            aria-label={fieldLabel}
                            placeholder={fieldPlaceholder}
                            value={val}
                            onChange={e => onChange(e.target.value)}
                            autoComplete="off"
                          />
                        )}
                    {fieldHelp && <small className="cf-field-help">{fieldHelp}</small>}
                  </div>
                );
              })}

              <div className="cf-field-row">
                <div className="cf-field">
                  <label>{t('连接备注（选填）')}</label>
                  <Input
                    placeholder={t('例如：主账号 / 生产环境')}
                    maxLength={64}
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                  />
                </div>

                <div className="cf-field">
                  <label>{t('默认归属账号（选填）')}</label>
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder={t('自动绑定到名下平台账号')}
                    value={accountId || undefined}
                    options={activeAccounts.map(acc => ({
                      value: acc.id,
                      label: `${accountDisplayTitle(acc)} (${acc.identifier || acc.platform})`,
                    }))}
                    onChange={val => setAccountId(val ?? '')}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            <div className="cf-form-actions">
              <Button onClick={onCancel}>{cancelLabel ?? t('取消')}</Button>
              <Button
                type="primary"
                icon={<RefreshCw size={14} className={connectMutation.isPending ? 'animate-spin' : ''} />}
                loading={connectMutation.isPending}
                disabled={!canSubmit}
                onClick={() => connectMutation.mutate()}
              >
                {t('验证凭据并同步资产')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProviderSyncModal({
  open,
  onClose,
  scope = 'all',
  initialProvider,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  scope?: ProviderSyncScope;
  initialProvider?: CloudSyncProviderKey;
  accounts: Account[];
}) {
  const { t } = usePreferences();

  const modalTitle = scope === 'domains'
    ? t('云平台域名与解析同步')
    : scope === 'servers'
      ? t('云平台服务器与组网同步')
      : scope === 'ips'
        ? t('云平台 IP 与组网节点同步')
        : t('云平台只读资产同步');

  const modalSubtitle = scope === 'domains'
    ? t('支持 Cloudflare、阿里云、腾讯云 DNSPod、Porkbun、Spaceship、DigitalOcean、Vercel 等平台一键同步托管域名、到期日与 DNS 拓扑。')
    : scope === 'servers'
      ? t('支持 Tailscale 组网、阿里云、腾讯云轻量/CVM、Hetzner、DigitalOcean、搬瓦工 KiwiVM 自动导入主机规格、到期日与月度账单流量。')
      : scope === 'ips'
        ? t('支持 Tailscale 100.x 组网节点、Hetzner、DigitalOcean、搬瓦工、阿里云、腾讯云自动同步公网/内网 IP 与封禁状态。')
        : t('通过最小只读权限 API 自动同步名下域名、服务器与 IP 节点，并按解析与地址拓扑自动串联。');

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={660}
      centered
      destroyOnHidden
      className="cf-sync-modal"
      title={(
        <div className="cf-modal-title">
          <span className="cf-brand-badge" aria-hidden="true">
            <Cloud size={17} />
          </span>
          <div>
            <h3>{modalTitle}</h3>
            <p>{modalSubtitle}</p>
          </div>
        </div>
      )}
    >
      <ProviderSyncPanel
        active={open}
        scope={scope}
        initialProvider={initialProvider}
        accounts={accounts}
        onCancel={onClose}
      />
    </Modal>
  );
}
