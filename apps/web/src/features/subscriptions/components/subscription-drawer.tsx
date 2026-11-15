import {
  accountsOptions,
  preferencesOptions,
  saveSubscription,
  type Subscription,
  type SubscriptionInput,
} from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Drawer, Form, Input } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { errorMessage } from '../../../shared/errors';
import type { PresetPlan, SubscriptionPreset } from '../presets/subscription-presets';
import { SubscriptionPropertySheet } from './subscription-composer-parts';

type EditFormValues = Omit<SubscriptionInput, 'amountMinor' | 'renewalAmountMinor' | 'dueDate' | 'createAccount' | 'createBillingAccount'> & {
  amount: number;
  renewalAmount?: number;
  dueDate: Dayjs;
};

function SubscriptionDrawerBody({ onClose, value }: {
  onClose: () => void;
  value?: Subscription;
}) {
  const { t, locale } = usePreferences();
  const [form] = Form.useForm<EditFormValues>();
  const client = useQueryClient();
  const { message } = App.useApp();

  const [presetKey, setPresetKey] = useState(() => value?.presetKey ?? '');

  const accountsQuery = useQuery(accountsOptions);
  const prefsQuery = useQuery(preferencesOptions);
  const savedAccounts = accountsQuery.isSuccess ? accountsQuery.data.items : [];
  const prefs = prefsQuery.isSuccess ? prefsQuery.data : undefined;

  const mutation = useMutation({
    mutationFn: (input: SubscriptionInput) => saveSubscription(input, value?.id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['subscriptions'] });
      await client.invalidateQueries({ queryKey: ['accounts'] });
      await client.invalidateQueries({ queryKey: ['nav-counts'] });
      void message.success(value ? t('订阅已更新') : t('订阅已添加'));
      onClose();
    },
  });

  const initialOpenExtras = useMemo(() => {
    const keys: ('renewalAmount' | 'managementUrl' | 'paymentMethod' | 'notes' | 'accountNote')[] = [];
    if (!value) return keys;
    if (value.renewalAmountMinor > 0) keys.push('renewalAmount');
    if (value.paymentMethod.trim()) keys.push('paymentMethod');
    if (value.notes.trim()) keys.push('notes');
    if (value.account.trim()) keys.push('accountNote');
    return keys;
  }, [value]);

  const initialValues = value
    ? {
        ...value,
        presetKey: value.presetKey ?? '',
        accountId: value.accountId || '',
        billingAccountId: value.billingAccountId || '',
        amount: value.amountMinor / 100,
        renewalAmount: value.renewalAmountMinor ? value.renewalAmountMinor / 100 : undefined,
        dueDate: dayjs(value.dueDate),
      }
    : {
        presetKey: '',
        accountId: '',
        billingAccountId: '',
        amount: 0,
        currency: 'CNY' as const,
        cycle: 'monthly' as const,
        category: 'other' as const,
        renewalMode: 'auto' as const,
        intention: 'normal' as const,
        intervalDays: 30,
        dueDate: dayjs(),
        account: '',
        paymentMethod: '',
        managementUrl: '',
        notes: '',
        archived: false,
      };

  const selectPreset = (preset: SubscriptionPreset) => {
    setPresetKey(preset.key);
    form.setFieldValue('presetKey', preset.key);
    const currentName = String(form.getFieldValue('name') ?? '').trim();
    if (!currentName) {
      const firstPlan = preset.plans[0];
      if (firstPlan) {
        form.setFieldsValue({
          name: locale === 'en-US' ? firstPlan.itemName.en : firstPlan.itemName.zh,
          amount: firstPlan.amount,
          currency: firstPlan.currency,
          cycle: firstPlan.cycle,
          category: preset.category,
        });
      }
      else {
        form.setFieldsValue({
          name: locale === 'en-US' ? preset.name.en : preset.name.zh,
          category: preset.category,
        });
      }
    }
  };

  const applyPlan = (preset: SubscriptionPreset, plan: PresetPlan) => {
    setPresetKey(preset.key);
    const interval = plan.cycle === 'custom' ? (plan.intervalDays ?? 30) : 30;
    form.setFieldsValue({
      presetKey: preset.key,
      name: locale === 'en-US' ? plan.itemName.en : plan.itemName.zh,
      amount: plan.amount,
      currency: plan.currency,
      cycle: plan.cycle,
      intervalDays: interval,
      category: preset.category,
    });
  };

  const submit = (values: EditFormValues) => {
    const primaryId = (values.accountId ?? '').trim();
    const rawBillingId = (values.billingAccountId ?? '').trim();
    const billingId = rawBillingId && rawBillingId !== primaryId ? rawBillingId : '';

    mutation.mutate({
      presetKey: values.presetKey ?? presetKey,
      name: values.name.trim(),
      amountMinor: Math.round((values.amount || 0) * 100),
      currency: values.currency,
      cycle: values.cycle,
      intervalDays: values.cycle === 'custom' ? (values.intervalDays || 30) : 0,
      dueDate: values.dueDate.format('YYYY-MM-DD'),
      category: values.category,
      renewalMode: values.renewalMode,
      intention: values.intention,
      renewalAmountMinor: Math.round((values.renewalAmount ?? 0) * 100),
      accountId: primaryId,
      billingAccountId: billingId,
      account: (values.account ?? '').trim(),
      paymentMethod: (values.paymentMethod ?? '').trim(),
      managementUrl: (values.managementUrl ?? '').trim(),
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

        <SubscriptionPropertySheet
          form={form}
          presetKey={presetKey}
          onSelectPreset={selectPreset}
          onSelectPlan={applyPlan}
          onClearPreset={() => {
            setPresetKey('');
            form.setFieldValue('presetKey', '');
          }}
          accounts={savedAccounts}
          prefs={prefs}
          isEditing={Boolean(value)}
          initialAccountId={value?.accountId}
          initialBillingAccountId={value?.billingAccountId}
          initialOpenExtras={initialOpenExtras}
          submitting={mutation.isPending}
          onCancel={onClose}
        />
      </Form>
    </>
  );
}

export function SubscriptionDrawer({ open, onClose, value }: {
  open: boolean;
  onClose: () => void;
  value?: Subscription;
}) {
  const { t } = usePreferences();

  return (
    <Drawer
      title={value ? t('编辑订阅') : t('新建订阅')}
      open={open}
      onClose={onClose}
      size={548}
      destroyOnHidden
      footer={null}
      className="subscription-sheet-drawer"
    >
      {open && <SubscriptionDrawerBody key={value?.id ?? 'new'} value={value} onClose={onClose} />}
    </Drawer>
  );
}
