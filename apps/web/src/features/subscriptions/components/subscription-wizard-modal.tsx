import {
  accountsOptions,
  preferencesOptions,
  saveSubscription,
  type SubscriptionInput,
} from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Form, Modal } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { errorMessage } from '../../../shared/errors';
import type { PresetPlan, SubscriptionPreset } from '../presets/subscription-presets';
import { nextDate } from '../utils/subscription-metrics';
import { SubscriptionPropertySheet } from './subscription-composer-parts';

type CreateFormValues = Omit<SubscriptionInput, 'amountMinor' | 'renewalAmountMinor' | 'dueDate' | 'presetKey' | 'archived' | 'createAccount' | 'createBillingAccount'> & {
  amount: number;
  renewalAmount?: number;
  dueDate: Dayjs;
};

function defaultDueDate(cycle: SubscriptionInput['cycle'], intervalDays = 30): Dayjs {
  const today = dayjs().format('YYYY-MM-DD');
  const next = nextDate(today, cycle, intervalDays);
  return dayjs(next ?? today);
}

function SubscriptionWizardBody({ onClose }: { onClose: () => void }) {
  const { t, locale } = usePreferences();
  const [form] = Form.useForm<CreateFormValues>();
  const client = useQueryClient();
  const { message } = App.useApp();

  const [presetKey, setPresetKey] = useState('');
  const [planId, setPlanId] = useState('');

  const accountsQuery = useQuery(accountsOptions);
  const prefsQuery = useQuery(preferencesOptions);
  const savedAccounts = accountsQuery.isSuccess ? accountsQuery.data.items : [];
  const prefs = prefsQuery.isSuccess ? prefsQuery.data : undefined;

  const mutation = useMutation({
    mutationFn: (input: SubscriptionInput) => saveSubscription(input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['subscriptions'] });
      await client.invalidateQueries({ queryKey: ['accounts'] });
      await client.invalidateQueries({ queryKey: ['nav-counts'] });
      void message.success(t('订阅已添加'));
      onClose();
    },
  });

  const applyPlan = (preset: SubscriptionPreset, plan: PresetPlan) => {
    setPlanId(plan.id);
    const interval = plan.cycle === 'custom' ? (plan.intervalDays ?? 30) : 30;
    form.setFieldsValue({
      name: locale === 'en-US' ? plan.itemName.en : plan.itemName.zh,
      amount: plan.amount,
      currency: plan.currency,
      cycle: plan.cycle,
      intervalDays: interval,
      category: preset.category,
      dueDate: defaultDueDate(plan.cycle, interval),
      managementUrl: preset.managementUrl ?? '',
    });
  };

  const selectPreset = (preset: SubscriptionPreset) => {
    setPresetKey(preset.key);
    const firstPlan = preset.plans[0];
    if (firstPlan) {
      applyPlan(preset, firstPlan);
    }
    else {
      form.setFieldsValue({
        name: locale === 'en-US' ? preset.name.en : preset.name.zh,
        category: preset.category,
        managementUrl: preset.managementUrl ?? '',
      });
    }
  };

  const clearPreset = () => {
    setPresetKey('');
    setPlanId('');
  };

  const submit = (values: CreateFormValues) => {
    const primaryId = (values.accountId ?? '').trim();
    const rawBillingId = (values.billingAccountId ?? '').trim();
    const billingId = rawBillingId && rawBillingId !== primaryId ? rawBillingId : '';

    mutation.mutate({
      presetKey,
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
          name: '',
          amount: 0,
          currency: 'CNY',
          cycle: 'monthly',
          intervalDays: 30,
          category: 'other',
          dueDate: defaultDueDate('monthly', 30),
          renewalMode: 'auto',
          intention: 'normal',
          accountId: '',
          billingAccountId: '',
          account: '',
          paymentMethod: '',
          managementUrl: '',
          notes: '',
        }}
        onFinish={submit}
        disabled={mutation.isPending}
      >
        <SubscriptionPropertySheet
          form={form}
          presetKey={presetKey}
          planId={planId}
          onSelectPreset={selectPreset}
          onSelectPlan={applyPlan}
          onClearPreset={clearPreset}
          accounts={savedAccounts}
          prefs={prefs}
          submitting={mutation.isPending}
          onCancel={onClose}
        />
      </Form>
    </>
  );
}

export function SubscriptionWizardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = usePreferences();

  return (
    <Modal
      open={open}
      title={t('新建订阅')}
      onCancel={onClose}
      width={588}
      centered
      destroyOnHidden
      footer={null}
      className="subscription-sheet-modal"
    >
      {open && <SubscriptionWizardBody onClose={onClose} />}
    </Modal>
  );
}
