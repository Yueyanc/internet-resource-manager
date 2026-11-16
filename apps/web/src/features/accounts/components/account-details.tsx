import type {
  Account,
  Domain,
  IpNode,
  Preferences,
  ProviderConnection,
  ServerHost,
  Subscription,
} from '@irm/api-client';
import { Link } from '@tanstack/react-router';
import { Alert, App, Button, Checkbox, Descriptions, Drawer, Progress } from 'antd';
import dayjs from 'dayjs';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  CreditCard,
  Crown,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  LockKeyhole,
  Network,
  Pencil,
  Server,
} from 'lucide-react';
import { useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { ServiceMark } from '../../subscriptions/components/service-mark';
import { cycleLabel, displayMoney } from '../../subscriptions/utils/subscription-display';
import { monthlyCost } from '../../subscriptions/utils/subscription-metrics';
import {
  accountCategoryMeta,
  accountDisplayTitle,
  checkinRemaining,
  keepaliveCycles,
  keepalivePeriodDays,
  securityIssues,
} from '../utils/account-metrics';
import { useVault } from '../vault/vault-context';
import { AccountMark } from './account-mark';
import { TotpLiveBadge } from './totp-live-badge';

export function AccountDetails({
  value,
  prefs,
  allById,
  downstream,
  linkedSubscriptions,
  downstreamSubscriptions = [],
  linkedDomains = [],
  linkedServers = [],
  linkedIps = [],
  linkedConnections = [],
  onClose,
  onEdit,
  onSelectAccount,
  onOpenCloudSettings,
  onCheckin,
  checkingIn,
}: {
  value: Account;
  prefs?: Preferences;
  allById: Map<string, Account>;
  downstream: Account[];
  linkedSubscriptions: Subscription[];
  downstreamSubscriptions?: Subscription[];
  linkedDomains?: Domain[];
  linkedServers?: ServerHost[];
  linkedIps?: IpNode[];
  linkedConnections?: ProviderConnection[];
  onClose: () => void;
  onEdit: () => void;
  onSelectAccount: (id: string) => void;
  onOpenCloudSettings?: () => void;
  onCheckin: () => Promise<unknown>;
  checkingIn: boolean;
}) {
  const { t, locale } = usePreferences();
  const { modal, message } = App.useApp();
  const vault = useVault();
  const [revealPassword, setRevealPassword] = useState(false);

  const secretSummary = vault.summariesById.get(value.id);
  const decryptedSecret = vault.secretsById.get(value.id);
  const hasAnyVaultRecord = Boolean(secretSummary?.hasPassword || secretSummary?.hasTotp || secretSummary?.hasRecoveryCodes);

  const toggleRecoveryCodeUsed = async (index: number) => {
    if (!vault.unlocked || !decryptedSecret) return;
    const nextCodes = decryptedSecret.recoveryCodes.map((entry, idx) => (
      idx === index ? { ...entry, used: !entry.used } : entry
    ));
    await vault.saveSecretForAccount(value.id, {
      ...decryptedSecret,
      recoveryCodes: nextCodes,
    });
  };

  const copyAllRecoveryCodes = async () => {
    if (!decryptedSecret?.recoveryCodes.length) return;
    try {
      await navigator.clipboard.writeText(decryptedSecret.recoveryCodes.map(c => c.code).join('\n'));
      void message.success(t('已复制恢复码'));
    }
    catch {
      /* Ignore clipboard denial. */
    }
  };
  const fallback = t('未填写');
  const title = accountDisplayTitle(value);
  const days = checkinRemaining(value);
  const issues = securityIssues(value);
  const recoveryAccount = value.recoveryAccountId ? allById.get(value.recoveryAccountId) : undefined;
  const ssoAccount = value.ssoAccountId ? allById.get(value.ssoAccountId) : undefined;

  const copyIdentifier = async () => {
    try {
      await navigator.clipboard.writeText(value.identifier);
      void message.success(t('已复制登录标识'));
    }
    catch {
      /* Ignore clipboard denial. */
    }
  };

  const authLabel = {
    password: t('独立密码'),
    passkey: t('Passkey 通行密钥'),
    sso: t('SSO 快捷登录'),
    code: t('验证码无密登录'),
  }[value.authMethod];

  const twoFactorLabel = {
    none: t('未开启'),
    sms: t('短信验证'),
    email: t('邮件验证'),
    totp: t('验证器 App (TOTP)'),
    passkey: t('Passkey 通行密钥'),
    hardware: t('硬件密钥'),
  }[value.twoFactor];

  const recoveryCodesLabel = {
    not_applicable: t('不适用'),
    saved: t('已妥善备份'),
    missing: t('待备份确认'),
  }[value.recoveryCodes];

  const roleLabel = {
    hub: t('核心枢纽'),
    primary: t('主力日常'),
    alt: t('备用小号'),
  }[value.role];

  const statusLabel = {
    active: t('正常在用'),
    retiring: t('计划注销'),
    restricted: t('风控受限'),
  }[value.status];

  const checkinStatusText = days === null
    ? t('无需保活')
    : days < 0
      ? `${value.nextCheckinDate} · ${t('已逾期 {count} 天', { count: -days })}`
      : days === 0
        ? `${value.nextCheckinDate} · ${t('今天到期')}`
        : `${value.nextCheckinDate} · ${t('剩 {count} 天', { count: days })}`;

  const totalImpactCount = linkedSubscriptions.length
    + linkedDomains.length
    + linkedServers.length
    + linkedIps.length
    + linkedConnections.length
    + downstream.length
    + downstreamSubscriptions.length;

  const items = [
    { key: 'platform', label: t('平台名称'), children: title },
    {
      key: 'identifier',
      label: t('主登录标识'),
      children: (
        <span className="inline-flex items-center gap-1.5">
          <code>{value.identifier}</code>
          <Button
            type="text"
            size="small"
            aria-label={t('复制标识')}
            icon={<Copy size={13} />}
            onClick={() => { void copyIdentifier(); }}
          />
        </span>
      ),
    },
    ...(value.uid ? [{ key: 'uid', label: t('平台 UID / 编号'), children: <code>{value.uid}</code> }] : []),
    { key: 'category', label: t('所属分类'), children: t(accountCategoryMeta[value.category].label) },
    {
      key: 'ecosystem',
      label: t('生态归属'),
      children: `${t(value.ecosystem === 'domestic' ? '国内生态' : '海外生态')} · ${value.region}`,
    },
    { key: 'role', label: t('账号角色'), children: `${roleLabel} · ${statusLabel}` },
    { key: 'auth', label: t('主登录方式'), children: authLabel },
    {
      key: 'recoveryEmail',
      label: t('救援 / 注册邮箱'),
      children: recoveryAccount
        ? (
            <button type="button" className="account-link-chip" onClick={() => onSelectAccount(recoveryAccount.id)}>
              {`${accountDisplayTitle(recoveryAccount)} (${recoveryAccount.identifier})`}
            </button>
          )
        : (value.recoveryEmail || fallback),
    },
    ...(ssoAccount
      ? [{
          key: 'sso',
          label: t('上游 SSO 登录账号'),
          children: (
            <button type="button" className="account-link-chip" onClick={() => onSelectAccount(ssoAccount.id)}>
              {accountDisplayTitle(ssoAccount)}
            </button>
          ),
        }]
      : []),
    { key: 'phone', label: t('绑定手机提示'), children: value.phoneHint || fallback },
    { key: 'twoFactor', label: t('两步验证'), children: twoFactorLabel },
    { key: 'recoveryCodes', label: t('恢复码状态'), children: recoveryCodesLabel },
    {
      key: 'kyc',
      label: t('实名认证'),
      children: value.kycStatus === 'verified'
        ? `${t('已实名')}${value.kycNote ? ` · ${value.kycNote}` : ''}`
        : t('未实名 / 免实名'),
    },
    {
      key: 'keepalive',
      label: t('防回收保活'),
      children: value.keepaliveCycle === 'none'
        ? t('无需保活')
        : `${value.keepaliveCycle === 'custom' ? t('{count} 天', { count: value.keepaliveDays }) : t(keepaliveCycles[value.keepaliveCycle])} · ${checkinStatusText}`,
    },
    ...(value.lastCheckedAt ? [{ key: 'lastChecked', label: t('上次保活打卡'), children: value.lastCheckedAt }] : []),
    { key: 'vault', label: t('密码库位置引用'), children: value.vaultReference || fallback },
    {
      key: 'url',
      label: t('账号安全中心网址'),
      children: value.securityUrl
        ? <a href={value.securityUrl} target="_blank" rel="noopener noreferrer">{value.securityUrl}</a>
        : fallback,
    },
    { key: 'notes', label: t('风控与常规备注'), children: <span className="detail-notes">{value.notes || fallback}</span> },
    { key: 'archived', label: t('已停用归档'), children: value.archived ? t('已归档') : '—' },
  ];

  const todayStart = dayjs().startOf('day');

  return (
    <Drawer
      open
      title={t('账号详情')}
      size={500}
      onClose={onClose}
      footer={(
        <div className="detail-actions">
          <Button icon={<Pencil size={14} />} onClick={onEdit}>{t('编辑账号')}</Button>
          {value.keepaliveCycle !== 'none' && (
            <Button
              type="primary"
              icon={<CheckCircle2 size={14} />}
              disabled={value.archived}
              loading={checkingIn}
              onClick={() => {
                modal.confirm({
                  title: t('确认已完成登录保活？'),
                  content: t('下次保活提醒日期将按周期顺延。'),
                  okText: t('确定'),
                  cancelText: t('取消'),
                  onOk: onCheckin,
                });
              }}
            >
              {t('确认已保活')}
            </Button>
          )}
        </div>
      )}
    >
      <div className="detail-hero">
        <AccountMark value={value} size="lg" />
        <div className="detail-hero-meta">
          <h3>{title}</h3>
          <span>{`${value.identifier} · ${value.region}`}</span>
        </div>
      </div>

      {hasAnyVaultRecord && (
        <div className="vault-detail-card">
          <div className="vault-detail-card-head">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[13.5px]">
              <KeyRound size={14} />
              {t('加密凭据与实时 2FA')}
            </span>
            {!vault.unlocked && (
              <Button size="small" type="primary" icon={<LockKeyhole size={13} />} onClick={() => vault.openModal('unlock')}>
                {t('解锁保险箱')}
              </Button>
            )}
          </div>

          {!vault.unlocked
            ? (
                <p className="vault-detail-locked-note">
                  {t('加密保险箱当前已锁定，解锁后可录入、查看或修改密码与 2FA 密钥（不解锁也可正常保存普通台账信息）。')}
                </p>
              )
            : decryptedSecret && (
              <div className="vault-detail-stack">
                {decryptedSecret.password && (
                  <div className="vault-password-row">
                    <div className="vault-password-meta">
                      <span>{t('账号密码（加密存储）')}</span>
                      <code>{revealPassword ? decryptedSecret.password : '••••••••••••'}</code>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="small"
                        type="text"
                        aria-label={t(revealPassword ? '隐藏密码' : '显示密码')}
                        icon={revealPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        onClick={() => setRevealPassword(prev => !prev)}
                      />
                      <Button
                        size="small"
                        icon={<Copy size={13} />}
                        onClick={() => { void vault.copyAccountPassword(value.id); }}
                      >
                        {t('复制密码')}
                      </Button>
                    </div>
                  </div>
                )}

                {decryptedSecret.totp && (
                  <TotpLiveBadge totp={decryptedSecret.totp} hasTotp accountName={title} variant="detail" />
                )}

                {decryptedSecret.recoveryCodes.length > 0 && (
                  <div className="vault-recovery-list-box">
                    <div className="vault-recovery-list-head">
                      <span>
                        {t('一次性恢复码 ({unused}/{total} 可用)', {
                          unused: decryptedSecret.recoveryCodes.filter(c => !c.used).length,
                          total: decryptedSecret.recoveryCodes.length,
                        })}
                      </span>
                      <Button size="small" type="link" className="px-0 h-auto" onClick={() => { void copyAllRecoveryCodes(); }}>
                        {t('复制全部恢复码')}
                      </Button>
                    </div>
                    <div className="vault-recovery-codes-grid">
                      {decryptedSecret.recoveryCodes.map((entry, idx) => (
                        <Checkbox
                          key={`${entry.code}-${String(idx)}`}
                          checked={entry.used}
                          onChange={() => { void toggleRecoveryCodeUsed(idx); }}
                          aria-label={t(entry.used ? '标记为可用' : '标记为已使用')}
                        >
                          <code className={entry.used ? 'line-through opacity-50' : ''}>{entry.code}</code>
                        </Checkbox>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
        </div>
      )}

      {issues.includes('hub_no_2fa') && (
        <Alert showIcon type="warning" className="mb-4" title={t('核心账号未开启两步验证')} />
      )}
      {issues.includes('missing_recovery_codes') && (
        <Alert showIcon type="warning" className="mb-4" title={t('已开启两步验证但未确认恢复码备份')} />
      )}
      {(value.status === 'retiring' || value.status === 'restricted') && !value.archived && totalImpactCount > 0 && (
        <Alert
          showIcon
          type="warning"
          className="mb-4"
          title={t('该账号仍串联 {count} 项下游资产，销号或换绑前请先解除关联影响面。', { count: totalImpactCount })}
        />
      )}
      {value.status === 'retiring' && value.kycStatus === 'verified' && !value.archived && (
        <Alert showIcon type="info" className="mb-4" title={t('该计划注销账号含实名认证，销号前请确认解绑实名与手机号。')} />
      )}

      {totalImpactCount > 0 && (
        <section className="reverse-topology-section" aria-label={t('关联资产与影响面')}>
          <div className="reverse-topology-head">
            <h4>{t('关联资产与影响面 (反向拓扑)')}</h4>
            {prefs && linkedSubscriptions.length > 0 && (
              <span className="detail-related-spend">
                {t('月均约 {amount}', {
                  amount: displayMoney(
                    linkedSubscriptions.reduce((sum, sub) => sum + monthlyCost(sub, prefs), 0),
                    prefs.baseCurrency,
                    locale,
                  ),
                })}
              </span>
            )}
          </div>

          <div className="reverse-topology-banner">
            <Crown size={15} />
            <span>
              {value.role === 'hub' || totalImpactCount >= 3
                ? t('核心枢纽账号 · 共串联 {count} 项下游资产', { count: totalImpactCount })
                : t('共串联 {count} 项关联资产', { count: totalImpactCount })}
            </span>
          </div>

          <div className="reverse-topology-stack">
            {linkedSubscriptions.length > 0 && (
              <div className="reverse-topology-group">
                <div className="reverse-group-label">
                  <CreditCard size={14} />
                  <span>{`${t('关联订阅')} (${linkedSubscriptions.length})`}</span>
                </div>
                <div className="reverse-group-rows">
                  {linkedSubscriptions.map(sub => (
                    <Link
                      key={sub.id}
                      to="/subscriptions"
                      search={{ detail: sub.id }}
                      className="reverse-row-link"
                      onClick={onClose}
                    >
                      <ServiceMark value={sub} size="sm" />
                      <span className="reverse-row-title">{sub.name}</span>
                      <span className="reverse-row-pill">
                        {sub.billingAccountId === value.id && sub.accountId !== value.id ? t('代扣渠道') : cycleLabel(sub, t)}
                      </span>
                      <ArrowRight size={13} className="reverse-row-arrow" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {linkedDomains.length > 0 && (
              <div className="reverse-topology-group">
                <div className="reverse-group-label">
                  <Globe size={14} />
                  <span>{`${t('托管与注册域名')} (${linkedDomains.length})`}</span>
                </div>
                <div className="reverse-group-rows">
                  {linkedDomains.map((dom) => {
                    const remDays = dom.expireDate ? dayjs(dom.expireDate).diff(todayStart, 'day') : null;
                    return (
                      <Link
                        key={dom.id}
                        to="/domains"
                        search={{ detail: dom.id }}
                        className="reverse-row-link"
                        onClick={onClose}
                      >
                        <Globe size={14} className="text-slate-500 shrink-0" />
                        <span className="reverse-row-title">{dom.name}</span>
                        {remDays !== null && remDays <= 30 && (
                          <span className={`reverse-row-pill ${remDays < 0 ? 'is-danger' : 'is-warn'}`}>
                            {remDays < 0 ? t('已过期') : t('剩 {count} 天', { count: remDays })}
                          </span>
                        )}
                        {dom.autoRenew && (remDays === null || remDays > 30) && (
                          <span className="reverse-row-pill is-safe">{t('自动续费')}</span>
                        )}
                        {dom.status === 'active' && (
                          <span className="reverse-row-pill is-safe">{t('DNS 正常')}</span>
                        )}
                        <ArrowRight size={13} className="reverse-row-arrow" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {linkedServers.length > 0 && (
              <div className="reverse-topology-group">
                <div className="reverse-group-label">
                  <Server size={14} />
                  <span>{`${t('名下服务器')} (${linkedServers.length})`}</span>
                </div>
                <div className="reverse-group-rows">
                  {linkedServers.map((srv) => {
                    const isOnline = srv.telemetry.agentStatus === 'online';
                    const isStale = srv.telemetry.agentStatus === 'stale';
                    return (
                      <Link
                        key={srv.id}
                        to="/servers/$serverId"
                        params={{ serverId: srv.id }}
                        className="reverse-row-link"
                        onClick={onClose}
                      >
                        <Server size={14} className="text-slate-500 shrink-0" />
                        <span className="reverse-row-title">{srv.name}</span>
                        <span className={`reverse-status-dot ${isOnline ? 'is-online' : isStale ? 'is-danger' : ''}`}>
                          {isOnline ? t('在线') : isStale ? t('失联') : t('在用')}
                        </span>
                        <span className="reverse-row-spec">
                          {`${srv.cpuCores}C/${Math.max(1, Math.round(srv.memoryMb / 1024))}G`}
                        </span>
                        <ArrowRight size={13} className="reverse-row-arrow" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {linkedIps.length > 0 && (
              <div className="reverse-topology-group">
                <div className="reverse-group-label">
                  <Network size={14} />
                  <span>{`${t('关联 IP 节点')} (${linkedIps.length})`}</span>
                </div>
                <div className="reverse-ip-pills">
                  {linkedIps.map(ip => (
                    <Link
                      key={ip.id}
                      to="/ips"
                      search={{ detail: ip.id }}
                      className="reverse-ip-pill"
                      onClick={onClose}
                    >
                      <code>{ip.address}</code>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {linkedConnections.length > 0 && (
              <div className="reverse-topology-group">
                <div className="reverse-group-label">
                  <KeyRound size={14} />
                  <span>{`${t('云同步凭证')} (${linkedConnections.length})`}</span>
                </div>
                <div className="reverse-group-rows">
                  {linkedConnections.map(conn => (
                    <button
                      key={conn.id}
                      type="button"
                      className="reverse-row-link"
                      onClick={() => {
                        onClose();
                        onOpenCloudSettings?.();
                      }}
                    >
                      <KeyRound size={13.5} className="text-emerald-600 shrink-0" />
                      <span className="reverse-row-title">{conn.label || conn.provider}</span>
                      <span className={`reverse-status-dot ${conn.status === 'ok' ? 'is-online' : 'is-danger'}`}>
                        {conn.status === 'ok' ? t('正常') : t('异常')}
                      </span>
                      <ArrowRight size={13} className="reverse-row-arrow" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {days !== null && !value.archived && (
        <div className="detail-progress">
          <span>{t('保活周期剩余')}</span>
          <Progress
            percent={Math.min(100, Math.max(0, days / keepalivePeriodDays(value) * 100))}
            showInfo={false}
            size="small"
          />
        </div>
      )}

      <Descriptions column={1} size="small" items={items} />

      {downstream.length > 0 && (
        <div className="detail-related-block">
          <h4>{`${t('下游关联账号')} (${downstream.length})`}</h4>
          <div className="detail-related-list">
            {downstream.map(item => (
              <button
                key={item.id}
                type="button"
                className="detail-related-item"
                onClick={() => onSelectAccount(item.id)}
              >
                <AccountMark value={item} size="sm" />
                <span>{accountDisplayTitle(item)}</span>
                <code>{item.identifier}</code>
              </button>
            ))}
          </div>
        </div>
      )}

      {downstreamSubscriptions.length > 0 && (
        <div className="detail-related-block">
          <h4>{`${t('下游子账号关联订阅')} (${downstreamSubscriptions.length})`}</h4>
          <div className="detail-related-list">
            {downstreamSubscriptions.map((sub) => {
              const childAcct = (sub.accountId ? allById.get(sub.accountId) : undefined)
                ?? (sub.billingAccountId ? allById.get(sub.billingAccountId) : undefined);
              return (
                <Link
                  key={sub.id}
                  to="/subscriptions"
                  search={{ detail: sub.id }}
                  className="detail-related-item"
                  onClick={onClose}
                >
                  <ServiceMark value={sub} size="sm" />
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{sub.name}</span>
                    {childAcct && (
                      <span className="account-mini-tag shrink-0">{accountDisplayTitle(childAcct)}</span>
                    )}
                  </span>
                  <code>{`${sub.currency} ${(sub.amountMinor / 100).toFixed(2)}`}</code>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {value.securityUrl && (
        <Button className="mt-5" icon={<ArrowUpRight size={14} />} href={value.securityUrl} target="_blank" rel="noopener noreferrer">
          {t('打开安全中心')}
        </Button>
      )}
    </Drawer>
  );
}
