import { rotateVaultMasterKey, setupVault, type VaultConfig } from '@irm/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Form, Input, Modal } from 'antd';
import { Check, Copy, Download, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { errorMessage } from '../../../shared/errors';
import type { VaultModalMode } from '../vault/vault-context';
import {
  createVaultBundle,
  resetPasswordWithRecoveryKey,
  rotateMasterPassword,
  unlockVaultWithPassword,
  VaultUnlockError,
} from '../vault/vault-crypto';

interface SetupFormValues {
  masterPassword: string;
  confirmPassword: string;
}

interface UnlockFormValues {
  masterPassword: string;
}

interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface RecoverValues {
  recoveryKey: string;
  newPassword: string;
  confirmPassword: string;
}

export function VaultModal({
  mode,
  config,
  onSwitchMode,
  onClose,
  onUnlocked,
}: {
  mode: VaultModalMode;
  config: VaultConfig | null;
  onSwitchMode: (next: VaultModalMode) => void;
  onClose: () => void;
  onUnlocked: (key: CryptoKey, keyVersion: number) => void | Promise<void>;
}) {
  const { t, locale } = usePreferences();
  const { message } = App.useApp();
  const client = useQueryClient();

  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState('');
  const [pendingUnlock, setPendingUnlock] = useState<{ key: CryptoKey; keyVersion: number }>();
  const [confirmedBackup, setConfirmedBackup] = useState(false);

  const handleSetup = async (values: SetupFormValues) => {
    setBusy(true);
    setErrorText('');
    try {
      const bundle = await createVaultBundle(values.masterPassword);
      const savedConfig = await setupVault(bundle.setupInput);
      await client.invalidateQueries({ queryKey: ['vault'] });
      setGeneratedRecoveryKey(bundle.recoveryKey);
      setPendingUnlock({ key: bundle.runtimeKey, keyVersion: savedConfig.keyVersion });
    }
    catch (error) {
      setErrorText(errorMessage(error, locale));
    }
    finally {
      setBusy(false);
    }
  };

  const finishSetup = async () => {
    if (!pendingUnlock) return;
    void message.success(t('保险箱已初始化并解锁'));
    await onUnlocked(pendingUnlock.key, pendingUnlock.keyVersion);
    onClose();
  };

  const handleUnlock = async (values: UnlockFormValues) => {
    if (!config) return;
    setBusy(true);
    setErrorText('');
    try {
      const key = await unlockVaultWithPassword(values.masterPassword, config);
      void message.success(t('保险箱已解锁'));
      await onUnlocked(key, config.keyVersion);
      onClose();
    }
    catch (error) {
      setErrorText(error instanceof VaultUnlockError ? t('主密码错误，无法解密保险箱') : errorMessage(error, locale));
    }
    finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (values: ChangePasswordValues) => {
    if (!config) return;
    setBusy(true);
    setErrorText('');
    try {
      const rotated = await rotateMasterPassword(values.currentPassword, values.newPassword, config);
      const updated = await rotateVaultMasterKey(rotated.rotateInput);
      await client.invalidateQueries({ queryKey: ['vault'] });
      void message.success(t('保险箱主密码已更新'));
      await onUnlocked(rotated.runtimeKey, updated.keyVersion);
      onClose();
    }
    catch (error) {
      setErrorText(error instanceof VaultUnlockError ? t('主密码错误，无法解密保险箱') : errorMessage(error, locale));
    }
    finally {
      setBusy(false);
    }
  };

  const handleRecover = async (values: RecoverValues) => {
    if (!config) return;
    setBusy(true);
    setErrorText('');
    try {
      const recovered = await resetPasswordWithRecoveryKey(values.recoveryKey, values.newPassword, config);
      const updated = await rotateVaultMasterKey(recovered.rotateInput);
      await client.invalidateQueries({ queryKey: ['vault'] });
      void message.success(t('保险箱主密码已更新'));
      await onUnlocked(recovered.runtimeKey, updated.keyVersion);
      onClose();
    }
    catch (error) {
      setErrorText(error instanceof VaultUnlockError ? t('应急恢复密钥无效，请核对后重试') : errorMessage(error, locale));
    }
    finally {
      setBusy(false);
    }
  };

  const copyRecovery = async () => {
    try {
      await navigator.clipboard.writeText(generatedRecoveryKey);
      void message.success(t('已复制应急恢复密钥'));
    }
    catch {
      /* Ignore clipboard denial. */
    }
  };

  const downloadRecovery = () => {
    const content = [
      'Internet Resource Manager — Encrypted Vault Emergency Recovery Key',
      `Generated At: ${new Date().toISOString()}`,
      '',
      `Recovery Key: ${generatedRecoveryKey}`,
      '',
      'Keep this file offline in a safe place. Anyone with this recovery key and access to your local database can decrypt your stored account passwords and 2FA codes.',
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'irm-vault-recovery-key.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  const titles: Record<VaultModalMode, string> = {
    setup: generatedRecoveryKey ? t('请妥善保存应急恢复密钥') : t('初始化端到端加密保险箱'),
    unlock: t('解锁保险箱'),
    change_password: t('修改保险箱主密码'),
    recover: t('使用恢复密钥重置'),
  };

  return (
    <Modal
      open
      title={titles[mode]}
      onCancel={() => {
        if (!busy && !generatedRecoveryKey) onClose();
      }}
      closable={!busy && !generatedRecoveryKey}
      maskClosable={!busy && !generatedRecoveryKey}
      footer={null}
      width={480}
      centered
      destroyOnHidden
    >
      {errorText && <Alert type="error" showIcon title={errorText} className="mb-4" />}

      {mode === 'setup' && !generatedRecoveryKey && (
        <>
          <div className="vault-info-banner">
            <ShieldCheck size={16} />
            <span>{t('主密码仅在浏览器本地派生 AES-256-GCM 密钥，服务端与数据库永不保存明文密码、2FA 种子或主密码。')}</span>
          </div>
          <Form<SetupFormValues> layout="vertical" requiredMark={false} onFinish={(v) => { void handleSetup(v); }} disabled={busy}>
            <Form.Item
              label={t('保险箱主密码')}
              name="masterPassword"
              rules={[
                { required: true, message: t('请输入保险箱主密码') },
                { min: 8, message: t('主密码至少 8 位') },
              ]}
            >
              <Input.Password autoFocus placeholder={t('主密码至少 8 位')} maxLength={128} />
            </Form.Item>
            <Form.Item
              label={t('确认保险箱主密码')}
              name="confirmPassword"
              dependencies={['masterPassword']}
              rules={[
                { required: true, message: t('请再次输入主密码') },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('masterPassword') === value) return Promise.resolve();
                    return Promise.reject(new Error(t('两次密码不一致')));
                  },
                }),
              ]}
            >
              <Input.Password maxLength={128} />
            </Form.Item>
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={onClose} disabled={busy}>{t('取消')}</Button>
              <Button type="primary" htmlType="submit" icon={<KeyRound size={15} />} loading={busy}>
                {t('创建保险箱并生成恢复密钥')}
              </Button>
            </div>
          </Form>
        </>
      )}

      {mode === 'setup' && generatedRecoveryKey && (
        <div className="vault-recovery-step">
          <p className="vault-recovery-desc">
            {t('如果忘记保险箱主密码，这是唯一能解开已存密码与 2FA 的凭证。换浏览器登录只需主密码，无需此密钥。')}
          </p>
          <div className="vault-recovery-code-box">
            <code>{generatedRecoveryKey}</code>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            <Button icon={<Copy size={14} />} onClick={() => { void copyRecovery(); }}>
              {t('复制恢复密钥')}
            </Button>
            <Button icon={<Download size={14} />} onClick={downloadRecovery}>
              {t('下载恢复密钥 (.txt)')}
            </Button>
          </div>
          <Checkbox checked={confirmedBackup} onChange={e => setConfirmedBackup(e.target.checked)}>
            {t('我已离线妥善备份该应急恢复密钥')}
          </Checkbox>
          <div className="flex justify-end pt-4">
            <Button
              type="primary"
              icon={<Check size={15} />}
              disabled={!confirmedBackup}
              onClick={() => { void finishSetup(); }}
            >
              {t('完成并进入保险箱')}
            </Button>
          </div>
        </div>
      )}

      {mode === 'unlock' && (
        <>
          <p className="vault-modal-hint">
            {t('输入保险箱主密码以在浏览器内存解密密码与实时 2FA 验证码（15 分钟无操作自动锁定）。')}
          </p>
          <Form<UnlockFormValues> layout="vertical" requiredMark={false} onFinish={(v) => { void handleUnlock(v); }} disabled={busy}>
            <Form.Item
              label={t('保险箱主密码')}
              name="masterPassword"
              rules={[{ required: true, message: t('请输入保险箱主密码') }]}
            >
              <Input.Password autoFocus maxLength={128} />
            </Form.Item>
            <div className="vault-unlock-footer">
              <button
                type="button"
                className="vault-text-link"
                onClick={() => {
                  setErrorText('');
                  onSwitchMode('recover');
                }}
              >
                {t('忘记主密码？用应急恢复密钥重置')}
              </button>
              <div className="flex gap-2">
                <Button onClick={onClose} disabled={busy}>{t('取消')}</Button>
                <Button type="primary" htmlType="submit" icon={<LockKeyhole size={15} />} loading={busy}>
                  {t('立即解锁')}
                </Button>
              </div>
            </div>
          </Form>
        </>
      )}

      {mode === 'change_password' && (
        <Form<ChangePasswordValues> layout="vertical" requiredMark={false} onFinish={(v) => { void handleChangePassword(v); }} disabled={busy}>
          <Form.Item
            label={t('当前主密码')}
            name="currentPassword"
            rules={[{ required: true, message: t('请输入当前主密码') }]}
          >
            <Input.Password autoFocus maxLength={128} />
          </Form.Item>
          <Form.Item
            label={t('新保险箱主密码')}
            name="newPassword"
            rules={[
              { required: true, message: t('请输入新主密码') },
              { min: 8, message: t('主密码至少 8 位') },
            ]}
          >
            <Input.Password maxLength={128} />
          </Form.Item>
          <Form.Item
            label={t('确认新主密码')}
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: t('请再次输入主密码') },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error(t('两次密码不一致')));
                },
              }),
            ]}
          >
            <Input.Password maxLength={128} />
          </Form.Item>
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={onClose} disabled={busy}>{t('取消')}</Button>
            <Button type="primary" htmlType="submit" loading={busy}>{t('保存新主密码')}</Button>
          </div>
        </Form>
      )}

      {mode === 'recover' && (
        <Form<RecoverValues> layout="vertical" requiredMark={false} onFinish={(v) => { void handleRecover(v); }} disabled={busy}>
          <Form.Item
            label={t('应急恢复密钥')}
            name="recoveryKey"
            rules={[{ required: true, message: t('请输入 32 位应急恢复密钥') }]}
          >
            <Input autoFocus placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" maxLength={64} />
          </Form.Item>
          <Form.Item
            label={t('新保险箱主密码')}
            name="newPassword"
            rules={[
              { required: true, message: t('请输入新主密码') },
              { min: 8, message: t('主密码至少 8 位') },
            ]}
          >
            <Input.Password maxLength={128} />
          </Form.Item>
          <Form.Item
            label={t('确认新主密码')}
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: t('请再次输入主密码') },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error(t('两次密码不一致')));
                },
              }),
            ]}
          >
            <Input.Password maxLength={128} />
          </Form.Item>
          <div className="vault-unlock-footer">
            <button
              type="button"
              className="vault-text-link"
              onClick={() => {
                setErrorText('');
                onSwitchMode('unlock');
              }}
            >
              {t('返回主密码解锁')}
            </button>
            <div className="flex gap-2">
              <Button onClick={onClose} disabled={busy}>{t('取消')}</Button>
              <Button type="primary" htmlType="submit" loading={busy}>{t('重置主密码并解锁')}</Button>
            </div>
          </div>
        </Form>
      )}
    </Modal>
  );
}
