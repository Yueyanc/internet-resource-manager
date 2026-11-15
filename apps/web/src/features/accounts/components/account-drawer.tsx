import { type Account, type AccountInput, saveAccount } from '@irm/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Drawer, Form, Input } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { errorMessage } from '../../../shared/errors';
import type { AccountPreset, AccountPresetVariant } from '../presets/account-presets';
import { parseTotpInput } from '../vault/totp';
import { useVault } from '../vault/vault-context';
import {
  buildSecretPayload,
  formatRecoveryCodesText,
  formatTotpConfigInput,
} from '../vault/vault-crypto';
import { type AccountExtraKey, AccountPropertySheet } from './account-composer-parts';

type FormValues = Omit<AccountInput, 'nextCheckinDate' | 'lastCheckedAt'> & {
  nextCheckinDate?: Dayjs;
};

function AccountDrawerBody({
  value,
  existingAccounts,
  onClose,
}: {
  value: Account;
  existingAccounts: Account[];
  onClose: () => void;
}) {
  const { t, locale } = usePreferences();
  const [form] = Form.useForm<FormValues>();
  const client = useQueryClient();
  const { message } = App.useApp();
  const vault = useVault();
  const { activate: activateVault } = vault;

  useEffect(() => {
    activateVault();
  }, [activateVault]);

  const [presetKey, setPresetKey] = useState(() => value.presetKey ?? '');
  const [variantId, setVariantId] = useState('');

  const existingSecret = vault.secretsById.get(value.id);
  const [passwordDraft, setPasswordDraft] = useState<string>();
  const [totpDraft, setTotpDraft] = useState<string>();
  const [recoveryDraft, setRecoveryDraft] = useState<string>();

  const effectivePassword = passwordDraft ?? existingSecret?.password ?? '';
  const effectiveTotp = totpDraft ?? formatTotpConfigInput(existingSecret?.totp);
  const effectiveRecovery = recoveryDraft ?? formatRecoveryCodesText(existingSecret?.recoveryCodes ?? []);
  const secretDirty = passwordDraft !== undefined || totpDraft !== undefined || recoveryDraft !== undefined;

  const otherAccounts = existingAccounts.filter(item => item.id !== value.id && !item.archived);
  const emailAccounts = otherAccounts.filter(item => item.category === 'email' || item.role === 'hub');
  const ssoAccounts = otherAccounts.filter(item =>
    item.role === 'hub' || item.category === 'ecosystem' || item.category === 'social' || item.category === 'dev_cloud',
  );

  const initialOpenExtras = useMemo(() => {
    const keys: AccountExtraKey[] = [];
    if (value.label.trim() || value.uid.trim()) keys.push('identity');
    if (value.phoneHint.trim()) keys.push('phone');
    if ((existingSecret?.recoveryCodes?.length ?? 0) > 0 || value.recoveryCodes !== 'not_applicable') {
      keys.push('recoveryCodes');
    }
    if (value.vaultReference.trim()) keys.push('securityUrl');
    if (value.notes.trim()) keys.push('notes');
    return keys;
  }, [value, existingSecret]);

  const mutation = useMutation({
    mutationFn: async (input: AccountInput) => {
      const secretPayload = vault.unlocked && secretDirty
        ? buildSecretPayload(effectivePassword, effectiveTotp, effectiveRecovery, existingSecret?.recoveryCodes)
        : undefined;
      const updated = await saveAccount(input, value.id);
      if (secretPayload) {
        await vault.saveSecretForAccount(updated.id, secretPayload);
      }
      return updated;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['accounts'] });
      await client.invalidateQueries({ queryKey: ['nav-counts'] });
      void message.success(t('账号已更新'));
      onClose();
    },
  });

  const initialValues: FormValues = {
    ...value,
    keepaliveDays: value.keepaliveDays || 90,
    nextCheckinDate: value.nextCheckinDate ? dayjs(value.nextCheckinDate) : undefined,
  };

  const selectPreset = (preset: AccountPreset) => {
    setPresetKey(preset.key);
    form.setFieldValue('presetKey', preset.key);
    const currentPlatform = String(form.getFieldValue('platform') ?? '').trim();
    if (!currentPlatform) {
      form.setFieldsValue({
        platform: locale === 'en-US' ? preset.platform.en : preset.platform.zh,
        category: preset.category,
        ecosystem: preset.ecosystem,
        region: preset.region,
      });
    }
  };

  const applyVariant = (variant: AccountPresetVariant) => {
    setVariantId(variant.id);
    form.setFieldsValue({
      label: locale === 'en-US' ? variant.accountLabel.en : variant.accountLabel.zh,
      ecosystem: variant.ecosystem,
      region: variant.region,
      ...(variant.kycStatus ? { kycStatus: variant.kycStatus } : {}),
    });
  };

  const submit = (values: FormValues) => {
    if (vault.unlocked && secretDirty && effectiveTotp.trim()) {
      try {
        parseTotpInput(effectiveTotp);
      }
      catch {
        void message.error(t('TOTP 密钥格式无效，请输入有效的 Base32 密钥或 otpauth://totp 链接'));
        return;
      }
    }

    const cleanRegion = (values.region ?? 'GLOBAL').trim().toUpperCase();
    mutation.mutate({
      presetKey: values.presetKey ?? presetKey,
      platform: values.platform.trim(),
      label: (values.label ?? '').trim(),
      identifier: values.identifier.trim(),
      uid: (values.uid ?? '').trim(),
      category: values.category,
      ecosystem: values.ecosystem,
      region: /^[A-Z]{2,6}$/.test(cleanRegion) ? cleanRegion : 'GLOBAL',
      role: values.role,
      status: values.status,
      authMethod: values.authMethod,
      recoveryAccountId: values.recoveryAccountId ?? '',
      recoveryEmail: (values.recoveryEmail ?? '').trim(),
      ssoAccountId: values.ssoAccountId ?? '',
      phoneHint: (values.phoneHint ?? '').trim(),
      twoFactor: values.twoFactor,
      recoveryCodes: values.recoveryCodes,
      kycStatus: values.kycStatus,
      kycNote: values.kycStatus === 'verified' ? (values.kycNote ?? '').trim() : '',
      keepaliveCycle: values.keepaliveCycle,
      keepaliveDays: values.keepaliveCycle === 'custom' ? (values.keepaliveDays || 90) : 0,
      nextCheckinDate: values.keepaliveCycle === 'none' || !values.nextCheckinDate
        ? ''
        : values.nextCheckinDate.format('YYYY-MM-DD'),
      lastCheckedAt: value.lastCheckedAt,
      vaultReference: (values.vaultReference ?? '').trim(),
      securityUrl: (values.securityUrl ?? '').trim(),
      notes: (values.notes ?? '').trim(),
      archived: Boolean(values.archived),
    });
  };

  return (
    <>
      {mutation.isError && (
        <Alert
          type="error"
          showIcon
          title={errorMessage(mutation.error, locale)}
          className="mb-3"
        />
      )}

      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={initialValues}
        onFinish={submit}
        disabled={mutation.isPending}
      >
        <Form.Item name="presetKey" hidden><Input /></Form.Item>

        <AccountPropertySheet
          form={form}
          presetKey={presetKey}
          variantId={variantId}
          onSelectPreset={selectPreset}
          onSelectVariant={applyVariant}
          onClearPreset={() => {
            setPresetKey('');
            setVariantId('');
            form.setFieldValue('presetKey', '');
          }}
          emailAccounts={emailAccounts}
          ssoAccounts={ssoAccounts}
          password={effectivePassword}
          totpInput={effectiveTotp}
          recoveryCodesText={effectiveRecovery}
          onPasswordChange={setPasswordDraft}
          onTotpInputChange={(next) => {
            setTotpDraft(next);
            if (next.trim()) {
              try {
                parseTotpInput(next);
                if (form.getFieldValue('twoFactor') === 'none') {
                  form.setFieldValue('twoFactor', 'totp');
                }
              }
              catch {
                /* Wait until valid TOTP secret before switching twoFactor. */
              }
            }
          }}
          onRecoveryCodesTextChange={(next) => {
            setRecoveryDraft(next);
            if (next.trim() && form.getFieldValue('recoveryCodes') !== 'saved') {
              form.setFieldValue('recoveryCodes', 'saved');
            }
          }}
          isEditing
          initialOpenExtras={initialOpenExtras}
          submitting={mutation.isPending}
          onCancel={onClose}
        />
      </Form>
    </>
  );
}

export function AccountDrawer({
  open,
  value,
  existingAccounts,
  onClose,
}: {
  open: boolean;
  value: Account;
  existingAccounts: Account[];
  onClose: () => void;
}) {
  const { t } = usePreferences();

  return (
    <Drawer
      title={t('编辑账号')}
      open={open}
      onClose={onClose}
      size={580}
      destroyOnHidden
      footer={null}
      className="subscription-sheet-drawer"
    >
      {open && (
        <AccountDrawerBody
          key={value.id}
          value={value}
          existingAccounts={existingAccounts}
          onClose={onClose}
        />
      )}
    </Drawer>
  );
}
