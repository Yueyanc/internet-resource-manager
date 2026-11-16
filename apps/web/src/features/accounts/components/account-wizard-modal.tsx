import { type Account, type AccountInput, accountsOptions, saveAccount } from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Form, Input, Modal } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { errorMessage } from '../../../shared/errors';
import type { AccountPreset, AccountPresetVariant } from '../presets/account-presets';
import { nextKeepaliveDate } from '../utils/account-metrics';
import { parseTotpInput } from '../vault/totp';
import { useVault } from '../vault/vault-context';
import {
  buildSecretPayload,
  formatRecoveryCodesText,
  formatTotpConfigInput,
} from '../vault/vault-crypto';
import { type AccountExtraKey, AccountPropertySheet } from './account-composer-parts';

type AccountFormValues = Omit<AccountInput, 'nextCheckinDate' | 'lastCheckedAt'> & {
  nextCheckinDate?: Dayjs;
};

function defaultCheckinDate(cycle: AccountInput['keepaliveCycle'], days = 90): Dayjs {
  const today = dayjs().format('YYYY-MM-DD');
  const next = nextKeepaliveDate(today, cycle, days);
  return dayjs(next ?? today);
}

function AccountWizardBody({
  value,
  existingAccounts,
  onClose,
}: {
  value?: Account;
  existingAccounts?: Account[];
  onClose: () => void;
}) {
  const { t, locale } = usePreferences();
  const [form] = Form.useForm<AccountFormValues>();
  const client = useQueryClient();
  const { message } = App.useApp();
  const vault = useVault();
  const { activate: activateVault } = vault;

  const accountsQuery = useQuery({ ...accountsOptions, enabled: !existingAccounts });
  const allAccounts = existingAccounts ?? (accountsQuery.isSuccess ? accountsQuery.data.items : []);

  const [presetKey, setPresetKey] = useState(() => value?.presetKey ?? '');
  const [variantId, setVariantId] = useState('');

  const existingSecret = value ? vault.secretsById.get(value.id) : undefined;
  const [passwordDraft, setPasswordDraft] = useState<string>();
  const [totpDraft, setTotpDraft] = useState<string>();
  const [recoveryDraft, setRecoveryDraft] = useState<string>();

  const effectivePassword = passwordDraft ?? existingSecret?.password ?? '';
  const effectiveTotp = totpDraft ?? formatTotpConfigInput(existingSecret?.totp);
  const effectiveRecovery = recoveryDraft ?? formatRecoveryCodesText(existingSecret?.recoveryCodes ?? []);
  const secretDirty = passwordDraft !== undefined || totpDraft !== undefined || recoveryDraft !== undefined;

  useEffect(() => {
    activateVault();
  }, [activateVault]);

  const otherAccounts = allAccounts.filter(item => !item.archived && item.id !== value?.id);
  const emailAccounts = otherAccounts.filter(item => item.category === 'email' || item.role === 'hub');
  const ssoAccounts = otherAccounts.filter(item =>
    item.role === 'hub' || item.category === 'ecosystem' || item.category === 'social' || item.category === 'dev_cloud',
  );

  const initialOpenExtras = useMemo(() => {
    const keys: AccountExtraKey[] = [];
    if (!value) return keys;
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
      const shouldSaveSecret = vault.unlocked && (
        value
          ? secretDirty
          : Boolean(effectivePassword || effectiveTotp.trim() || effectiveRecovery.trim())
      );
      const secretPayload = shouldSaveSecret
        ? buildSecretPayload(effectivePassword, effectiveTotp, effectiveRecovery, existingSecret?.recoveryCodes)
        : undefined;
      const saved = await saveAccount(input, value?.id);
      if (secretPayload) {
        await vault.saveSecretForAccount(saved.id, secretPayload);
      }
      return saved;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['accounts'] });
      await client.invalidateQueries({ queryKey: ['nav-counts'] });
      void message.success(t(value ? '账号已更新' : '账号已添加'));
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
    form.setFieldValue('presetKey', preset.key);
    if (value) {
      const currentPlatform = String(form.getFieldValue('platform') ?? '').trim();
      if (!currentPlatform) {
        form.setFieldsValue({
          platform: locale === 'en-US' ? preset.platform.en : preset.platform.zh,
          category: preset.category,
          ecosystem: preset.ecosystem,
          region: preset.region,
        });
      }
      return;
    }

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
    form.setFieldValue('presetKey', '');
  };

  const initialValues: AccountFormValues = value
    ? {
        ...value,
        keepaliveDays: value.keepaliveDays || 90,
        nextCheckinDate: value.nextCheckinDate ? dayjs(value.nextCheckinDate) : undefined,
      }
    : {
        presetKey: '',
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
        archived: false,
      };

  const submit = (values: AccountFormValues) => {
    const shouldCheckTotp = vault.unlocked && (value ? secretDirty : true) && Boolean(effectiveTotp.trim());
    if (shouldCheckTotp) {
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
      ...(value ? { lastCheckedAt: value.lastCheckedAt } : {}),
      vaultReference: (values.vaultReference ?? '').trim(),
      securityUrl: (values.securityUrl ?? '').trim(),
      notes: (values.notes ?? '').trim(),
      archived: value ? Boolean(values.archived) : false,
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
          onClearPreset={clearPreset}
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
          isEditing={Boolean(value)}
          initialOpenExtras={initialOpenExtras}
          submitting={mutation.isPending}
          onCancel={onClose}
        />
      </Form>
    </>
  );
}

export function AccountWizardModal({
  open,
  value,
  existingAccounts,
  onClose,
}: {
  open: boolean;
  value?: Account;
  existingAccounts?: Account[];
  onClose: () => void;
}) {
  const { t } = usePreferences();

  return (
    <Modal
      open={open}
      title={t(value ? '编辑账号' : '新建账号')}
      onCancel={onClose}
      width={612}
      centered
      destroyOnHidden
      footer={null}
      className="subscription-sheet-modal"
    >
      {open && (
        <AccountWizardBody
          key={value?.id ?? 'new'}
          value={value}
          existingAccounts={existingAccounts}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}
