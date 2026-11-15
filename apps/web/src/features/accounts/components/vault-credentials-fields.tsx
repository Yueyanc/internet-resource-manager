import { App, Button, Checkbox, Input, Popover, Slider } from 'antd';
import { Dices, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { parseTotpInput } from '../vault/totp';
import { useVault } from '../vault/vault-context';
import { generateStrongPassword } from '../vault/vault-crypto';
import { TotpLiveBadge } from './totp-live-badge';

export function VaultCredentialsFields({
  accountLabel,
  password,
  totpInput,
  recoveryCodesText,
  onPasswordChange,
  onTotpInputChange,
  onRecoveryCodesTextChange,
}: {
  accountLabel: string;
  password: string;
  totpInput: string;
  recoveryCodesText: string;
  onPasswordChange: (next: string) => void;
  onTotpInputChange: (next: string) => void;
  onRecoveryCodesTextChange: (next: string) => void;
}) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const vault = useVault();

  const [genLength, setGenLength] = useState(20);
  const [genSymbols, setGenSymbols] = useState(true);

  const parsedTotp = useMemo(() => {
    const trimmed = totpInput.trim();
    if (!trimmed) return { config: undefined, valid: true };
    try {
      return { config: parseTotpInput(trimmed), valid: true };
    }
    catch {
      return { config: undefined, valid: false };
    }
  }, [totpInput]);

  const fillGeneratedPassword = async (len = genLength, symbols = genSymbols) => {
    const generated = generateStrongPassword({ length: len, symbols });
    onPasswordChange(generated);
    try {
      await navigator.clipboard.writeText(generated);
    }
    catch {
      /* Ignore clipboard denial. */
    }
    void message.success(t('已生成随机强密码'));
  };

  return (
    <div className="vault-credentials-panel">
      <div className="vault-credentials-header">
        <div className="vault-credentials-title">
          <ShieldCheck size={16} />
          <div>
            <strong>{t('端到端加密凭据（密码与 2FA）')}</strong>
            <span>{t('浏览器本地 AES-256-GCM 加密，换任意浏览器凭主密码即可解锁。')}</span>
          </div>
        </div>
        {vault.unlocked && (
          <span className="vault-state-pill is-unlocked">{t('保险箱已解锁')}</span>
        )}
      </div>

      {!vault.initialized
        ? (
            <div className="vault-locked-callout">
              <p>{t('尚未初始化加密保险箱，初始化后即可在此直接托管密码、实时 2FA 动态码与恢复码。')}</p>
              <Button type="primary" size="small" icon={<KeyRound size={14} />} onClick={() => vault.openModal('setup')}>
                {t('初始化保险箱')}
              </Button>
            </div>
          )
        : !vault.unlocked
            ? (
                <div className="vault-locked-callout">
                  <p>{t('加密保险箱当前已锁定，解锁后可录入、查看或修改密码与 2FA 密钥（不解锁也可正常保存普通台账信息）。')}</p>
                  <Button size="small" icon={<LockKeyhole size={14} />} onClick={() => vault.openModal('unlock')}>
                    {t('解锁保险箱')}
                  </Button>
                </div>
              )
            : (
                <div className="vault-fields-stack">
                  <div className="vault-field-block">
                    <div className="vault-field-label-row">
                      <label htmlFor="vault-password-input">{t('账号密码（加密存储）')}</label>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="small"
                          type="link"
                          className="px-1 h-auto"
                          icon={<Dices size={13} />}
                          onClick={() => { void fillGeneratedPassword(); }}
                        >
                          {t('生成强密码')}
                        </Button>
                        <Popover
                          trigger="click"
                          placement="bottomRight"
                          content={(
                            <div className="w-56 flex flex-col gap-2.5 p-1">
                              <div className="flex justify-between text-xs">
                                <span>{t('密码长度')}</span>
                                <strong>{genLength}</strong>
                              </div>
                              <Slider min={12} max={48} value={genLength} onChange={setGenLength} />
                              <Checkbox checked={genSymbols} onChange={e => setGenSymbols(e.target.checked)}>
                                {t('包含特殊符号')}
                              </Checkbox>
                              <Button size="small" type="primary" onClick={() => { void fillGeneratedPassword(genLength, genSymbols); }}>
                                {t('随机生成并填入强密码')}
                              </Button>
                            </div>
                          )}
                        >
                          <Button size="small" type="text" className="px-1.5 h-6 text-xs text-gray-500">
                            {`${genLength}`}
                          </Button>
                        </Popover>
                      </div>
                    </div>
                    <Input.Password
                      id="vault-password-input"
                      aria-label={t('账号密码（加密存储）')}
                      value={password}
                      onChange={e => onPasswordChange(e.target.value)}
                      placeholder={t('留空则不保存密码')}
                      maxLength={500}
                      autoComplete="new-password"
                    />
                  </div>

                  <div className="vault-field-block">
                    <div className="vault-field-label-row">
                      <label htmlFor="vault-totp-input">{t('2FA 动态密钥 (TOTP / otpauth://)')}</label>
                      {parsedTotp.config && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-400">{t('实时预览')}</span>
                          <TotpLiveBadge totp={parsedTotp.config} hasTotp accountName={accountLabel} />
                        </div>
                      )}
                    </div>
                    <Input
                      id="vault-totp-input"
                      aria-label={t('2FA 动态密钥 (TOTP / otpauth://)')}
                      value={totpInput}
                      onChange={e => onTotpInputChange(e.target.value)}
                      status={parsedTotp.valid ? undefined : 'error'}
                      placeholder={t('粘贴 Base32 密钥或 otpauth://totp/... 链接')}
                      maxLength={1000}
                      allowClear
                    />
                    {!parsedTotp.valid && (
                      <span className="vault-field-error">{t('TOTP 密钥格式无效，请输入有效的 Base32 密钥或 otpauth://totp 链接')}</span>
                    )}
                  </div>

                  <div className="vault-field-block">
                    <label htmlFor="vault-recovery-codes-input">{t('一次性恢复码全文（加密存储）')}</label>
                    <Input.TextArea
                      id="vault-recovery-codes-input"
                      aria-label={t('一次性恢复码全文（加密存储）')}
                      rows={2}
                      value={recoveryCodesText}
                      onChange={e => onRecoveryCodesTextChange(e.target.value)}
                      placeholder={t('每行一组恢复码，仅密文落库')}
                      maxLength={4000}
                    />
                  </div>
                </div>
              )}
    </div>
  );
}
