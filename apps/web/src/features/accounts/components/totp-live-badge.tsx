import { App, Button, Progress, Tooltip } from 'antd';
import { Check, Copy, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { generateTotpToken, type TotpConfig, type TotpToken } from '../vault/totp';
import { useVault } from '../vault/vault-context';

export function TotpLiveBadge({
  totp,
  hasTotp,
  accountName,
  variant = 'pill',
}: {
  totp?: TotpConfig;
  hasTotp: boolean;
  accountName: string;
  variant?: 'pill' | 'slot' | 'detail';
}) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const { openModal } = useVault();
  const [token, setToken] = useState<TotpToken | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (copyTimerRef.current !== undefined) {
      window.clearTimeout(copyTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!totp) return undefined;
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await generateTotpToken(totp);
        if (!cancelled) setToken(next);
      }
      catch {
        if (!cancelled) setToken(null);
      }
    };
    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [totp]);

  if (!hasTotp && !totp) return null;

  if (!totp) {
    if (variant === 'slot') {
      return (
        <div className="account-cred-slot is-totp is-locked">
          <span className="account-slot-label">2FA</span>
          <button
            type="button"
            className="totp-locked-pill is-slot"
            onClick={(e) => {
              e.stopPropagation();
              openModal('unlock');
            }}
          >
            <LockKeyhole size={12} />
            <span>{t('解锁看 2FA')}</span>
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        className="totp-locked-pill"
        onClick={(e) => {
          e.stopPropagation();
          openModal('unlock');
        }}
      >
        <LockKeyhole size={12} />
        <span>{t('解锁看 2FA')}</span>
      </button>
    );
  }

  const copyCode = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token.code);
      setCopied(true);
      if (copyTimerRef.current !== undefined) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
      void message.success(t('已复制 2FA 动态验证码'));
    }
    catch {
      /* Ignore clipboard denial. */
    }
  };

  if (variant === 'detail') {
    const pct = token ? Math.round(token.remainingSeconds / token.period * 100) : 100;
    const urgent = Boolean(token && token.remainingSeconds <= 5);
    return (
      <div className="totp-detail-box">
        <div className="totp-detail-left">
          <span className="totp-detail-label">
            <ShieldCheck size={14} />
            <span>2FA TOTP</span>
          </span>
          <strong className={`totp-detail-digits ${urgent ? 'is-urgent' : ''}`}>
            {token?.formatted ?? '••• •••'}
          </strong>
          {token && (
            <span className="totp-detail-timer">
              {t('剩余 {count} 秒刷新', { count: token.remainingSeconds })}
            </span>
          )}
        </div>
        <div className="totp-detail-right">
          <Progress
            type="circle"
            size={30}
            strokeWidth={10}
            percent={pct}
            showInfo={false}
            strokeColor={urgent ? '#dc2626' : 'var(--signal)'}
          />
          <Button
            size="small"
            icon={copied ? <Check size={13} /> : <Copy size={13} />}
            aria-label={t('复制 {name} 动态验证码', { name: accountName })}
            onClick={() => { void copyCode(); }}
          >
            {t(copied ? '已复制' : '复制动态码')}
          </Button>
        </div>
      </div>
    );
  }

  const urgent = Boolean(token && token.remainingSeconds <= 5);

  if (variant === 'slot') {
    const circumference = 2 * Math.PI * 9;
    const ratio = token ? Math.max(0, Math.min(1, token.remainingSeconds / token.period)) : 1;
    const strokeOffset = circumference * (1 - ratio);

    return (
      <div className={`account-cred-slot is-totp ${urgent ? 'is-urgent' : ''} ${copied ? 'is-copied' : ''}`}>
        <span className="account-slot-label">2FA</span>
        <Tooltip title={`${t('复制动态码')}${token ? ` · ${t('剩余 {count} 秒刷新', { count: token.remainingSeconds })}` : ''}`}>
          <button
            type="button"
            className={`totp-live-pill is-slot ${urgent ? 'is-urgent' : ''} ${copied ? 'is-copied' : ''}`}
            aria-label={t('复制 {name} 动态验证码', { name: accountName })}
            onClick={(e) => {
              e.stopPropagation();
              void copyCode();
            }}
          >
            <code>{token?.formatted ?? '••• •••'}</code>
            {token && (
              <span className="totp-ring-wrap" aria-hidden="true">
                <svg className="totp-ring-svg" viewBox="0 0 22 22">
                  <circle className="totp-ring-track" cx="11" cy="11" r="9" />
                  <circle
                    className="totp-ring-bar"
                    cx="11"
                    cy="11"
                    r="9"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeOffset}
                  />
                </svg>
                <span className="totp-ring-sec">{`${token.remainingSeconds}s`}</span>
              </span>
            )}
            <span className="account-slot-copy-icon" aria-hidden="true">
              {copied ? <Check size={12.5} /> : <Copy size={12.5} />}
            </span>
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <Tooltip title={`${t('复制动态码')} · ${token ? t('剩余 {count} 秒刷新', { count: token.remainingSeconds }) : ''}`}>
      <button
        type="button"
        className={`totp-live-pill ${urgent ? 'is-urgent' : ''}`}
        aria-label={t('复制 {name} 动态验证码', { name: accountName })}
        onClick={(e) => {
          e.stopPropagation();
          void copyCode();
        }}
      >
        <code>{token?.formatted ?? '••• •••'}</code>
        {token && <span className="totp-countdown">{`${token.remainingSeconds}s`}</span>}
      </button>
    </Tooltip>
  );
}
