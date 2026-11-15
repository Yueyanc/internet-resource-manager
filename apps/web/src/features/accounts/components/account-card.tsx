import type { Account, Subscription } from '@irm/api-client';
import { App, Button, Card, Dropdown, Tooltip } from 'antd';
import dayjs from 'dayjs';
import {
  Archive,
  ArrowUpRight,
  Ban,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  KeyRound,
  MoreHorizontal,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

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

const PHONE_LIKE_RE = /^\+?\d[\d\s()*#-]{5,}$/;

export function AccountCard({
  value,
  downstreamCount,
  allById,
  linkedSubscriptions = [],
  masked,
  onDetails,
  onSelectAccount,
  onEdit,
  onCheckin,
  onDelete,
  checkingIn,
}: {
  value: Account;
  downstreamCount: number;
  allById?: Map<string, Account>;
  linkedSubscriptions?: Subscription[];
  masked: boolean;
  onDetails: () => void;
  onSelectAccount?: (accountId: string) => void;
  onEdit: () => void;
  onCheckin: () => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  checkingIn: boolean;
}) {
  const { t } = usePreferences();
  const { modal, message } = App.useApp();
  const vault = useVault();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
    }
  }, []);

  const flashCopied = (key: string) => {
    setCopiedKey(key);
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setCopiedKey(prev => (prev === key ? null : prev));
    }, 1800);
  };

  const secretSummary = vault.summariesById.get(value.id);
  const decryptedSecret = vault.secretsById.get(value.id);
  const hasPassword = Boolean(secretSummary?.hasPassword);
  const hasTotp = Boolean(secretSummary?.hasTotp);
  const hasRecoveryCodes = Boolean(secretSummary?.hasRecoveryCodes);

  const ssoAccount = value.ssoAccountId ? allById?.get(value.ssoAccountId) : undefined;
  const recoveryAccount = value.recoveryAccountId ? allById?.get(value.recoveryAccountId) : undefined;

  const title = accountDisplayTitle(value);
  const days = checkinRemaining(value);
  const issues = securityIssues(value);
  const displayIdentifier = masked ? maskIdentifier(value.identifier) : value.identifier;

  const isPhoneIdentifier = PHONE_LIKE_RE.test(value.identifier.trim());
  const identifierLabel = isPhoneIdentifier
    ? t(/voice|gv|sim/i.test(value.platform) ? '号码' : '手机')
    : t('账号');
  const uidLabel = /steam/i.test(value.platform) ? t('好友码') : 'UID';

  const confirmCheckin = () => {
    void modal.confirm({
      title: t('确认已完成登录保活？'),
      content: t('下次保活提醒日期将按周期顺延。'),
      okText: t('确定'),
      cancelText: t('取消'),
      onOk: onCheckin,
    });
  };

  const copyPlain = async (key: string, text: string, toastMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flashCopied(key);
      void message.success(toastMessage);
    }
    catch {
      /* Clipboard may be unavailable in restricted contexts. */
    }
  };

  const handleCopyPassword = async () => {
    const ok = await vault.copyAccountPassword(value.id);
    if (ok) flashCopied('pwd');
  };

  const handleCopyRecoveryCodes = async () => {
    const ok = await vault.copyAccountRecoveryCodes(value.id);
    if (ok) flashCopied('recovery_codes');
  };

  const keepaliveShortText = days !== null
    ? (days < 0
        ? t('逾期保活')
        : days === 0
          ? t('今天需保活')
          : t('{date} 保活', { date: dayjs(value.nextCheckinDate).format('MM/DD') }))
    : '';

  const keepaliveTooltip = days !== null
    ? `${value.nextCheckinDate} · ${days < 0 ? t('已逾期 {count} 天', { count: -days }) : days === 0 ? t('今天到期') : t('剩 {count} 天', { count: days })}`
    : '';

  // Build Row 2 Left Slot (Password / SSO / Passkey / External Vault Ref)
  let leftSlot: ReactNode = null;
  if (hasPassword) {
    leftSlot = (
      <div className={`account-cred-slot ${copiedKey === 'pwd' ? 'is-copied' : ''}`}>
        <span className="account-slot-label">{t('密码')}</span>
        <span className="account-pwd-dots" aria-hidden="true">••••••••••</span>
        <Tooltip title={t('复制密码')}>
          <button
            type="button"
            className={`account-slot-icon-btn ${copiedKey === 'pwd' ? 'is-copied' : ''}`}
            aria-label={t('复制 {name} 密码', { name: title })}
            onClick={() => { void handleCopyPassword(); }}
          >
            {copiedKey === 'pwd' ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </Tooltip>
      </div>
    );
  }
  else if (ssoAccount || value.authMethod === 'sso') {
    const shortSsoPlatform = ssoAccount?.platform.replace(/\s*(账户|账号|Account)$/i, '').trim() ?? '';
    leftSlot = (
      <button
        type="button"
        className="account-cred-slot is-sso-btn"
        onClick={() => (ssoAccount && onSelectAccount ? onSelectAccount(ssoAccount.id) : onDetails())}
      >
        {ssoAccount ? <AccountMark value={ssoAccount} size="xs" /> : <KeyRound size={13} className="shrink-0" />}
        <span className="account-sso-text">
          {ssoAccount
            ? t('通过 {name} SSO', { name: shortSsoPlatform || ssoAccount.platform })
            : t('SSO 快捷登录')}
        </span>
        <ArrowUpRight size={13} className="account-sso-arrow" />
      </button>
    );
  }
  else if (value.authMethod === 'passkey') {
    leftSlot = (
      <button type="button" className="account-cred-slot is-sso-btn" onClick={onDetails}>
        <KeyRound size={13} className="text-emerald-600 shrink-0" />
        <span className="account-sso-text">{t('Passkey 通行密钥')}</span>
      </button>
    );
  }
  else if (value.vaultReference) {
    leftSlot = (
      <button type="button" className="account-cred-slot is-sso-btn" onClick={onDetails}>
        <KeyRound size={13} className="shrink-0" />
        <span className="account-sso-text">{value.vaultReference}</span>
      </button>
    );
  }

  // Build Row 2 Right Slot (Live 2FA -> UID -> Keep-alive Check-in)
  let rightSlot: ReactNode = null;
  let uidInRow2 = false;
  let keepaliveInRow2 = false;

  if (hasTotp) {
    rightSlot = (
      <TotpLiveBadge
        totp={decryptedSecret?.totp}
        hasTotp={hasTotp}
        accountName={title}
        variant="slot"
      />
    );
  }
  else if (value.uid) {
    uidInRow2 = true;
    rightSlot = (
      <div className={`account-cred-slot ${copiedKey === 'uid' ? 'is-copied' : ''}`}>
        <span className="account-slot-label">{uidLabel}</span>
        <code className="account-slot-code" title={masked ? undefined : value.uid}>
          {masked ? maskIdentifier(value.uid) : value.uid}
        </code>
        <Tooltip title={`${t('复制')} ${uidLabel}`}>
          <button
            type="button"
            className={`account-slot-icon-btn ${copiedKey === 'uid' ? 'is-copied' : ''}`}
            aria-label={`${t('复制')} ${title} ${uidLabel}`}
            onClick={() => { void copyPlain('uid', value.uid, t('已复制 UID')); }}
          >
            {copiedKey === 'uid' ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </Tooltip>
      </div>
    );
  }
  else if (days !== null && !value.archived) {
    keepaliveInRow2 = true;
    rightSlot = (
      <div className={`account-cred-slot is-keepalive ${days < 0 ? 'is-overdue' : ''}`}>
        <Tooltip title={keepaliveTooltip}>
          <span className="account-keepalive-label">
            <CalendarClock size={13} />
            <span>{keepaliveShortText}</span>
          </span>
        </Tooltip>
        <button
          type="button"
          className="account-checkin-pill"
          disabled={checkingIn}
          onClick={confirmCheckin}
        >
          <Check size={11.5} />
          <span>{t('已保活')}</span>
        </button>
      </div>
    );
  }

  // Build Row 3 Footer Meta & Micro-Copy Chips
  const footerNodes: { key: string; node: ReactNode }[] = [];

  if (value.uid && !uidInRow2) {
    footerNodes.push({
      key: 'uid',
      node: (
        <button
          type="button"
          className={`account-meta-chip is-copyable ${copiedKey === 'uid' ? 'is-copied' : ''}`}
          onClick={() => { void copyPlain('uid', value.uid, t('已复制 UID')); }}
        >
          <span>{`${uidLabel}: `}</span>
          <code>{masked ? maskIdentifier(value.uid) : value.uid}</code>
          {copiedKey === 'uid' ? <Check size={11.5} /> : <Copy size={11.5} />}
        </button>
      ),
    });
  }

  if (value.phoneHint) {
    footerNodes.push({
      key: 'phone',
      node: (
        <button
          type="button"
          className={`account-meta-chip is-copyable ${copiedKey === 'phone' ? 'is-copied' : ''}`}
          onClick={() => { void copyPlain('phone', value.phoneHint, t('已复制手机提示')); }}
        >
          <span>{t('手机: {phone}', { phone: value.phoneHint })}</span>
          {copiedKey === 'phone' ? <Check size={11.5} /> : <Copy size={11.5} />}
        </button>
      ),
    });
  }

  if (hasRecoveryCodes) {
    const totalCodes = decryptedSecret?.recoveryCodes.length ?? 0;
    const unusedCodes = decryptedSecret?.recoveryCodes.filter(entry => !entry.used).length ?? 0;
    footerNodes.push({
      key: 'recovery-codes',
      node: (
        <button
          type="button"
          className={`account-meta-chip is-copyable ${copiedKey === 'recovery_codes' ? 'is-copied' : ''}`}
          onClick={() => { void handleCopyRecoveryCodes(); }}
        >
          <span>
            {totalCodes > 0
              ? t('恢复码 {unused}/{total}', { unused: unusedCodes, total: totalCodes })
              : t('恢复码已加密')}
          </span>
          {copiedKey === 'recovery_codes' ? <Check size={11.5} /> : <Copy size={11.5} />}
        </button>
      ),
    });
  }
  else if (value.recoveryCodes === 'saved') {
    footerNodes.push({
      key: 'recovery-saved',
      node: <span className="account-meta-text">{t('恢复码已备')}</span>,
    });
  }

  if (linkedSubscriptions.length > 0) {
    const firstSub = linkedSubscriptions[0]!;
    footerNodes.push({
      key: 'subs',
      node: (
        <button type="button" className="account-meta-chip is-interactive" onClick={onDetails}>
          <span>
            {linkedSubscriptions.length === 1
              ? t('关联订阅: {name}', { name: firstSub.name })
              : t('关联订阅 {count} 笔', { count: linkedSubscriptions.length })}
          </span>
        </button>
      ),
    });
  }

  if (recoveryAccount) {
    const shortRecPlatform = recoveryAccount.platform.replace(/\s*(账户|账号|Account)$/i, '').trim() || recoveryAccount.platform;
    const shortRecName = recoveryAccount.label ? `${shortRecPlatform} · ${recoveryAccount.label}` : shortRecPlatform;
    footerNodes.push({
      key: 'recovery-acc',
      node: (
        <button
          type="button"
          className="account-meta-chip is-interactive"
          onClick={() => (onSelectAccount ? onSelectAccount(recoveryAccount.id) : onDetails())}
        >
          <span>{t('救援: {name}', { name: shortRecName })}</span>
        </button>
      ),
    });
  }
  else if (value.recoveryEmail) {
    footerNodes.push({
      key: 'recovery-email',
      node: (
        <button
          type="button"
          className={`account-meta-chip is-copyable ${copiedKey === 'recovery_email' ? 'is-copied' : ''}`}
          onClick={() => { void copyPlain('recovery_email', value.recoveryEmail, t('已复制救援邮箱')); }}
        >
          <span>{t('救援: {name}', { name: masked ? maskIdentifier(value.recoveryEmail) : value.recoveryEmail })}</span>
          {copiedKey === 'recovery_email' ? <Check size={11.5} /> : <Copy size={11.5} />}
        </button>
      ),
    });
  }

  if (days !== null && !keepaliveInRow2 && !value.archived) {
    footerNodes.push({
      key: 'keepalive',
      node: (
        <Tooltip title={keepaliveTooltip}>
          <button
            type="button"
            className={`account-meta-chip is-keepalive ${days < 0 ? 'is-danger' : 'is-warn'}`}
            onClick={confirmCheckin}
          >
            <CalendarClock size={11.5} />
            <span>{keepaliveShortText}</span>
          </button>
        </Tooltip>
      ),
    });
  }

  if (issues.length > 0) {
    footerNodes.push({
      key: 'issue',
      node: (
        <Tooltip title={t(issues[0] === 'hub_no_2fa' ? '核心账号未开启两步验证' : '已开启两步验证但未确认恢复码备份')}>
          <span className="account-meta-pill is-danger" aria-label={t('安全待加固')}>
            <ShieldAlert size={11.5} />
            <span>{t(issues[0] === 'hub_no_2fa' ? '未开 2FA' : '待备恢复码')}</span>
          </span>
        </Tooltip>
      ),
    });
  }
  else if (value.twoFactor === 'passkey' || value.twoFactor === 'hardware') {
    footerNodes.push({
      key: '2fa-hw',
      node: (
        <span className="account-meta-text is-safe">
          <ShieldCheck size={12.5} />
          <span>{t(value.twoFactor === 'passkey' ? 'Passkey 已开启' : '硬件密钥')}</span>
        </span>
      ),
    });
  }
  else if (!hasTotp && (value.twoFactor === 'sms' || value.twoFactor === 'email')) {
    footerNodes.push({
      key: '2fa-code',
      node: <span className="account-meta-text">{t(value.twoFactor === 'sms' ? '短信验证' : '邮件验证')}</span>,
    });
  }

  if (value.kycStatus === 'verified') {
    footerNodes.push({
      key: 'kyc',
      node: <span className="account-meta-pill is-safe">{t('已实名')}</span>,
    });
    if (value.kycNote) {
      footerNodes.push({
        key: 'kyc-note',
        node: <span className="account-meta-text">{value.kycNote}</span>,
      });
    }
  }

  if (value.archived) {
    footerNodes.push({
      key: 'archived',
      node: (
        <span className="account-meta-pill" aria-label={t('已归档')}>
          <Archive size={11.5} />
          <span>{t('已归档')}</span>
        </span>
      ),
    });
  }
  else if (value.status === 'restricted') {
    footerNodes.push({
      key: 'restricted',
      node: (
        <span className="account-meta-pill is-danger" aria-label={t('风控受限')}>
          <Ban size={11.5} />
          <span>{t('风控受限')}</span>
        </span>
      ),
    });
  }
  else if (value.status === 'retiring') {
    footerNodes.push({
      key: 'retiring',
      node: <span className="account-meta-pill is-warn">{t('计划注销')}</span>,
    });
  }
  else if (value.role === 'primary' && footerNodes.length <= 2) {
    footerNodes.push({
      key: 'role-primary',
      node: <span className="account-meta-pill is-safe">{t('主力日常')}</span>,
    });
  }

  const showHubBadge = !value.archived && (value.role === 'hub' || downstreamCount > 0);
  const hubBadgeText = value.role === 'hub' && downstreamCount > 0
    ? t('核心枢纽 · {count} 关联', { count: downstreamCount })
    : value.role === 'hub'
      ? t('核心枢纽')
      : t('{count} 关联', { count: downstreamCount });

  const hasBothRow2Slots = Boolean(leftSlot && rightSlot);
  const hasAnyRow2Slot = Boolean(leftSlot || rightSlot);

  return (
    <Card className={`subscription-card account-card is-slot-card ${value.archived ? 'is-archived' : ''}`}>
      <div className="account-slot-header">
        <button
          type="button"
          className="account-slot-face"
          aria-label={t('查看 {name}', { name: title })}
          onClick={onDetails}
        >
          <AccountMark value={value} />
          <div className="account-slot-heading">
            <div className="account-title-line">
              <h2 title={title}>{title}</h2>
              <span className={`account-region-pill ${value.ecosystem === 'domestic' ? 'is-domestic' : ''}`}>
                {value.region}
              </span>
            </div>
            <div className="account-subtitle-row">
              <span className="subscription-subtitle">{t(accountCategoryMeta[value.category].label)}</span>
              {showHubBadge && (
                <span className="account-hub-pill">{hubBadgeText}</span>
              )}
            </div>
          </div>
        </button>

        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          menu={{
            items: [
              { key: 'details', label: t('查看详情'), icon: <Eye size={14} /> },
              { key: 'edit', label: t('编辑账号'), icon: <Pencil size={14} /> },
              ...(hasPassword ? [{ key: 'copy_pwd', label: t('复制密码'), icon: <KeyRound size={14} /> }] : []),
              ...(value.keepaliveCycle !== 'none'
                ? [{
                    key: 'checkin',
                    label: t('确认已保活'),
                    icon: <CheckCircle2 size={14} />,
                    disabled: value.archived || checkingIn,
                  }]
                : []),
              ...(value.securityUrl
                ? [{
                    key: 'security',
                    label: <a href={value.securityUrl} target="_blank" rel="noopener noreferrer">{t('打开安全中心')}</a>,
                    icon: <ArrowUpRight size={14} />,
                  }]
                : []),
              ...(value.archived ? [{ key: 'delete', label: t('永久删除'), danger: true, icon: <Trash2 size={14} /> }] : []),
            ],
            onClick: ({ key }) => {
              if (key === 'details') onDetails();
              if (key === 'edit') onEdit();
              if (key === 'copy_pwd') void handleCopyPassword();
              if (key === 'checkin') confirmCheckin();
              if (key === 'delete') {
                modal.confirm({
                  title: t('永久删除这个账号？'),
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
              aria-label={t('操作 {name}', { name: title })}
              icon={<MoreHorizontal size={17} />}
              loading={checkingIn}
            />
          </Tooltip>
        </Dropdown>
      </div>

      <div className="account-slot-stack">
        <div className={`account-cred-slot is-primary ${copiedKey === 'id' ? 'is-copied' : ''}`}>
          <span className="account-slot-label">{identifierLabel}</span>
          <code className="account-slot-code" title={masked ? undefined : value.identifier}>
            {displayIdentifier}
          </code>
          <button
            type="button"
            className={`account-copy-pill ${copiedKey === 'id' ? 'is-copied' : ''}`}
            aria-label={t('复制 {name} 登录标识', { name: title })}
            onClick={() => { void copyPlain('id', value.identifier, t('已复制登录标识')); }}
          >
            {copiedKey === 'id' ? <Check size={12.5} /> : <Copy size={12.5} />}
            <span>{t(copiedKey === 'id' ? '已复制' : '复制')}</span>
          </button>
        </div>

        {hasAnyRow2Slot && (
          <div className={`account-cred-grid ${hasBothRow2Slots ? '' : 'is-single'}`}>
            {leftSlot}
            {rightSlot}
          </div>
        )}

        {footerNodes.length > 0 && (
          <div className="account-meta-footer">
            {footerNodes.slice(0, 4).map(item => (
              <span key={item.key} className="account-meta-entry">
                {item.node}
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
