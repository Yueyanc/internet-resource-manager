import {
  accountsOptions,
  createDomain,
  type DomainInput,
  ipsOptions,
  serversOptions,
  type SubscriptionInput,
  subscriptionsOptions,
} from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Form, Input, Modal } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';

import { usePreferences } from '../../app/preferences-context';
import { errorMessage } from '../../shared/errors';
import {
  type DomainComposerValues,
  DomainPropertySheet,
} from './components/domain-composer-parts';
import type { DomainPreset } from './presets/domain-presets';
import { normalizeDomainDraft } from './utils/domain-metrics';

function DomainModalBody({ onClose }: { onClose: () => void }) {
  const { t, locale } = usePreferences();
  const [form] = Form.useForm<DomainComposerValues>();
  const client = useQueryClient();
  const { message } = App.useApp();

  const [presetKey, setPresetKey] = useState('');

  const accountsQuery = useQuery(accountsOptions);
  const subscriptionsQuery = useQuery(subscriptionsOptions);
  const serversQuery = useQuery(serversOptions);
  const ipsQuery = useQuery(ipsOptions);

  const activeAccounts = (accountsQuery.isSuccess ? accountsQuery.data.items : []).filter(a => !a.archived);
  const activeSubscriptions = (subscriptionsQuery.isSuccess ? subscriptionsQuery.data.items : []).filter(s => !s.archived);
  const activeServers = (serversQuery.isSuccess ? serversQuery.data.items : []).filter(s => !s.archived);
  const activeIps = (ipsQuery.isSuccess ? ipsQuery.data.items : []).filter(ip => !ip.archived);

  const mutation = useMutation({
    mutationFn: (input: DomainInput) => createDomain(input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['domains'] });
      await client.invalidateQueries({ queryKey: ['servers'] });
      await client.invalidateQueries({ queryKey: ['ips'] });
      await client.invalidateQueries({ queryKey: ['subscriptions'] });
      await client.invalidateQueries({ queryKey: ['nav-counts'] });
      void message.success(t('域名已添加'));
      onClose();
    },
  });

  const selectPreset = (preset: DomainPreset) => {
    setPresetKey(preset.key);
    form.setFieldValue('presetKey', preset.key);
    const regName = locale === 'en-US' ? preset.registrar.en : preset.registrar.zh;
    const dnsName = locale === 'en-US' ? preset.dnsProvider.en : preset.dnsProvider.zh;
    form.setFieldsValue({
      registrar: regName,
      dnsProvider: dnsName,
      whoisPrivacy: preset.defaultWhoisPrivacy,
      managementUrl: preset.defaultManagementUrl,
      ...(preset.defaultIcpStatus ? { icpStatus: preset.defaultIcpStatus } : {}),
    });
  };

  const initialValues: DomainComposerValues = {
    presetKey: '',
    name: '',
    registrar: '',
    dnsProvider: '',
    purpose: 'prod',
    status: 'active',
    billingMode: 'none',
    expireDate: dayjs().add(1, 'year'),
    autoRenew: true,
    whoisPrivacy: true,
    icpStatus: 'none',
    icpNumber: '',
    managementUrl: '',
    subscriptionId: '',
    registrarAccountId: '',
    serverIds: [],
    ipIds: [],
    tags: [],
    notes: '',
    archived: false,
    subName: '',
    subAmount: 0,
    subCurrency: 'USD',
    subCycle: 'yearly',
    subIntervalDays: 365,
    subDueDate: dayjs().add(1, 'year'),
    subRenewalMode: 'auto',
    subIntention: 'normal',
    subPaymentMethod: '',
  };

  const submit = (values: DomainComposerValues) => {
    const cleanName = normalizeDomainDraft(values.name) || values.name.trim();
    const createSubscription: SubscriptionInput | undefined = values.billingMode === 'create'
      ? {
          presetKey: values.presetKey ?? presetKey,
          name: (values.subName ?? '').trim() || cleanName,
          amountMinor: Math.round((values.subAmount ?? 0) * 100),
          currency: values.subCurrency,
          cycle: values.subCycle,
          intervalDays: values.subCycle === 'custom' ? (values.subIntervalDays || 365) : 0,
          dueDate: (values.subDueDate ?? dayjs().add(1, 'year')).format('YYYY-MM-DD'),
          category: 'cloud',
          renewalMode: values.subRenewalMode,
          intention: values.subIntention,
          renewalAmountMinor: Math.round((values.subRenewalAmount ?? 0) * 100),
          accountId: values.registrarAccountId ?? '',
          account: '',
          paymentMethod: (values.subPaymentMethod ?? '').trim(),
          managementUrl: (values.managementUrl ?? '').trim(),
          notes: '',
          archived: false,
        }
      : undefined;

    mutation.mutate({
      presetKey: values.presetKey ?? presetKey,
      name: cleanName,
      registrar: (values.registrar ?? '').trim(),
      dnsProvider: (values.dnsProvider ?? '').trim(),
      purpose: values.purpose ?? 'prod',
      status: values.status ?? 'active',
      expireDate: values.billingMode === 'none' && values.expireDate
        ? values.expireDate.format('YYYY-MM-DD')
        : '',
      autoRenew: Boolean(values.autoRenew),
      whoisPrivacy: Boolean(values.whoisPrivacy),
      icpStatus: values.icpStatus ?? 'none',
      icpNumber: values.icpStatus === 'none' ? '' : (values.icpNumber ?? '').trim(),
      managementUrl: (values.managementUrl ?? '').trim(),
      subscriptionId: values.billingMode === 'link' ? (values.subscriptionId ?? '') : '',
      registrarAccountId: values.registrarAccountId ?? '',
      serverIds: values.serverIds ?? [],
      ipIds: values.ipIds ?? [],
      tags: values.tags ?? [],
      notes: (values.notes ?? '').trim(),
      archived: false,
      createSubscription,
    });
  };

  return (
    <>
      {mutation.isError && (
        <Alert
          type="error"
          showIcon
          className="mb-3"
          title={errorMessage(mutation.error, locale)}
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

        <DomainPropertySheet
          form={form}
          presetKey={presetKey}
          onSelectPreset={selectPreset}
          onClearPreset={() => {
            setPresetKey('');
            form.setFieldValue('presetKey', '');
          }}
          subscriptions={activeSubscriptions}
          accounts={activeAccounts}
          servers={activeServers}
          ips={activeIps}
          submitting={mutation.isPending}
          onCancel={onClose}
        />
      </Form>
    </>
  );
}

export function DomainModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = usePreferences();

  return (
    <Modal
      title={t('新建域名')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={576}
      centered
      destroyOnHidden
      className="subscription-sheet-modal"
    >
      {open && <DomainModalBody onClose={onClose} />}
    </Modal>
  );
}
