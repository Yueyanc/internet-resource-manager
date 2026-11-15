import { type Account, type AccountInput, accountsOptions, saveAccount } from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Form, Modal } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { errorMessage } from '../../../shared/errors';
import type { AccountPreset, AccountPresetVariant } from '../presets/account-presets';
import { nextKeepaliveDate } from '../utils/account-metrics';
import { parseTotpInput } from '../vault/totp';
import { useVault } from '../vault/vault-context';
import { buildSecretPayload } from '../vault/vault-crypto';
import { AccountPropertySheet } from './account-composer-parts';

type WizardValues = Omit<AccountInput, 'presetKey' | 'nextCheckinDate' | 'lastCheckedAt' | 'archived'> & {
  nextCheckinDate?: Dayjs;
};

function defaultCheckinDate(cycle: AccountInput['keepaliveCycle'], days = 90): Dayjs {
  const today = dayjs().format('YYYY-MM-DD');
  const next = nextKeepaliveDate(today, cycle, days);
  return dayjs(next ?? today);
}

function AccountWizardBody({
  existingAccounts,
  onClose,
}: {
  existingAccounts?: Account[];
  onClose: () => void;
}) {
  const { t, locale } = usePreferences();
  const [form] = Form.useForm<WizardValues>();
  const client = useQueryClient();
  const { message } = App.useApp();
  const vault = useVault();
  const { activate: activateVault } = vault;

  const accountsQuery = useQuery({ ...accountsOptions, enabled: !existingAccounts });
  const allAccounts = existingAccounts ?? (accountsQuery.isSuccess ? accountsQuery.data.items : []);

  const [presetKey, setPresetKey] = useState('');
  const [variantId, setVariantId] = useState('');
  const [secretPassword, setSecretPassword] = useState('');
  const [secretTotp, setSecretTotp] = useState('');
  const [secretRecoveryText, setSecretRecoveryText] = useState('');

  useEffect(() => {
    activateVault();
  }, [activateVault]);

  const emailAccounts = allAccounts.filter(item => !item.archived && (item.category === 'email' || item.role === 'hub'));
  const ssoAccounts = allAccounts.filter(item =>
    !item.archived && (item.role === 'hub' || item.category === 'ecosystem' || item.category === 'social' || item.category === 'dev_cloud'),
  );

  const mutation = useMutation({
    mutationFn: async (input: AccountInput) => {
      const hasAnySecret = vault.unlocked && Boolean(secretPassword || secretTotp.trim() || secretRecoveryText.trim());
      const secretPayload = hasAnySecret ? buildSecretPayload(secretPassword, secretTotp, secretRecoveryText) : undefined;
      const created = await saveAccount(input);
      if (secretPayload) {
        await vault.saveSecretForAccount(created.id, secretPayload);
      }
      return created;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['accounts'] });
      await client.invalidateQueries({ queryKey: ['nav-counts'] });
      void message.success(t('账号已添加'));
      onClose();
    },
  });

  const applyVariant = (variant: AccountPresetVariant) => {
    setVariantId(variant.id);
    form.setFieldsValue({
      label: locale === 'en-US' ? variant.accountLabel.en : variant.accountLabel.zh,
      ecosystem: variant.ecosystem,
      region: variant.region,
      ...(variant.kycStatus ? { kycStatus: variant.kycStatus } : {}),
    });
  };

  const selectPreset = (preset: AccountPreset) => {
    setPresetKey(preset.key);
    const firstVariant = preset.variants?.[0];
    const keepalive = preset.recommendedKeepalive ?? 'none';
    form.setFieldsValue({
      platform: locale === 'en-US' ? preset.platform.en : preset.platform.zh,
      label: firstVariant ? (locale === 'en-US' ? firstVariant.accountLabel.en : firstVariant.accountLabel.zh) : '',
      category: preset.category,
      ecosystem: firstVariant?.ecosystem ?? preset.ecosystem,
      region: firstVariant?.region ?? preset.region,
      role: preset.defaultRole ?? 'primary',
      authMethod: preset.defaultAuthMethod ?? 'password',
      kycStatus: firstVariant?.kycStatus ?? preset.defaultKycStatus ?? 'none',
      keepaliveCycle: keepalive,
      keepaliveDays: 90,
      nextCheckinDate: keepalive === 'none' ? undefined : defaultCheckinDate(keepalive, 90),
      securityUrl: preset.securityUrl ?? '',
    });
    setVariantId(firstVariant?.id ?? '');
  };

  const clearPreset = () => {
    setPresetKey('');
    setVariantId('');
  };

  const submit = (values: WizardValues) => {
    if (vault.unlocked && secretTotp.trim()) {
      try {
        parseTotpInput(secretTotp);
      }
      catch {
        void message.error(t('TOTP 密钥格式无效，请输入有效的 Base32 密钥或 otpauth://totp 链接'));
        return;
      }
    }

    const cleanRegion = (values.region ?? 'GLOBAL').trim().toUpperCase();
    mutation.mutate({
      presetKey,
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
      vaultReference: (values.vaultReference ?? '').trim(),
      securityUrl: (values.securityUrl ?? '').trim(),
      notes: (values.notes ?? '').trim(),
      archived: false,
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
        initialValues={{
          platform: '',
          label: '',
          identifier: '',
          uid: '',
          category: 'other',
          ecosystem: 'overseas',
          region: 'GLOBAL',
          role: 'primary',
          status: 'active',
          authMethod: 'password',
          recoveryAccountId: '',
          recoveryEmail: '',
          ssoAccountId: '',
          phoneHint: '',
          twoFactor: 'none',
          recoveryCodes: 'not_applicable',
          kycStatus: 'none',
          kycNote: '',
          keepaliveCycle: 'none',
          keepaliveDays: 90,
          vaultReference: '',
          securityUrl: '',
          notes: '',
        }}
        onFinish={submit}
        disabled={mutation.isPending}
      >
        <AccountPropertySheet
          form={form}
          presetKey={presetKey}
          variantId={variantId}
          onSelectPreset={selectPreset}
          onSelectVariant={applyVariant}
          onClearPreset={clearPreset}
          emailAccounts={emailAccounts}
          ssoAccounts={ssoAccounts}
          password={secretPassword}
          totpInput={secretTotp}
          recoveryCodesText={secretRecoveryText}
          onPasswordChange={setSecretPassword}
          onTotpInputChange={(next) => {
            setSecretTotp(next);
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
            setSecretRecoveryText(next);
            if (next.trim() && form.getFieldValue('recoveryCodes') !== 'saved') {
              form.setFieldValue('recoveryCodes', 'saved');
            }
          }}
          submitting={mutation.isPending}
          onCancel={onClose}
        />
      </Form>
    </>
  );
}

export function AccountWizardModal({
  open,
  existingAccounts,
  onClose,
}: {
  open: boolean;
  existingAccounts?: Account[];
  onClose: () => void;
}) {
  const { t } = usePreferences();

  return (
    <Modal
      open={open}
      title={t('新建账号')}
      onCancel={onClose}
      width={612}
      centered
      destroyOnHidden
      footer={null}
      className="subscription-sheet-modal"
    >
      {open && <AccountWizardBody existingAccounts={existingAccounts} onClose={onClose} />}
    </Modal>
  );
}
