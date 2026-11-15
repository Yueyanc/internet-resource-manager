import {
  type Account,
  type Domain,
  type DomainInput,
  type IpNode,
  type ServerHost,
  type Subscription,
  type SubscriptionInput,
  updateDomain,
} from '@irm/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Drawer, Form, Input } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { errorMessage } from '../../../shared/errors';
import type { DomainPreset } from '../presets/domain-presets';
import { normalizeDomainDraft } from '../utils/domain-metrics';
import {
  type DomainComposerValues,
  type DomainExtraKey,
  DomainPropertySheet,
} from './domain-composer-parts';

function DomainDrawerBody({
  value,
  subscriptions,
  accounts,
  servers,
  ips,
  onClose,
}: {
  value: Domain;
  subscriptions: Subscription[];
  accounts: Account[];
  servers: ServerHost[];
  ips: IpNode[];
  onClose: () => void;
}) {
  const { t, locale } = usePreferences();
  const [form] = Form.useForm<DomainComposerValues>();
  const client = useQueryClient();
  const { message } = App.useApp();

  const [presetKey, setPresetKey] = useState(() => value.presetKey ?? '');

  const activeSubscriptions = subscriptions.filter(sub => !sub.archived || sub.id === value.subscriptionId);
  const activeAccounts = accounts.filter(acct => !acct.archived || acct.id === value.registrarAccountId);
  const availableServers = servers.filter(srv => !srv.archived || value.serverIds.includes(srv.id));
  const availableIps = ips.filter(ip => !ip.archived || value.ipIds.includes(ip.id));

  const initialOpenExtras = useMemo(() => {
    const keys: DomainExtraKey[] = [];
    if (value.serverIds.length > 0 || value.ipIds.length > 0) keys.push('topology');
    if (value.icpStatus !== 'none' || value.icpNumber.trim()) keys.push('icp');
    if (value.managementUrl.trim()) keys.push('consoleUrl');
    if (value.tags.length > 0) keys.push('tags');
    if (value.notes.trim()) keys.push('notes');
    return keys;
  }, [value]);

  const mutation = useMutation({
    mutationFn: (input: DomainInput) => updateDomain(value.id, input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['domains'] });
      await client.invalidateQueries({ queryKey: ['servers'] });
      await client.invalidateQueries({ queryKey: ['ips'] });
      await client.invalidateQueries({ queryKey: ['subscriptions'] });
      await client.invalidateQueries({ queryKey: ['nav-counts'] });
      void message.success(t('域名已更新'));
      onClose();
    },
  });

  const initialValues: DomainComposerValues = {
    ...value,
    billingMode: value.subscriptionId ? 'link' : 'none',
    expireDate: value.expireDate ? dayjs(value.expireDate) : undefined,
    subName: value.name,
    subAmount: 0,
    subCurrency: 'USD',
    subCycle: 'yearly',
    subIntervalDays: 365,
    subDueDate: value.expireDate ? dayjs(value.expireDate) : dayjs().add(1, 'year'),
    subRenewalMode: value.autoRenew ? 'auto' : 'manual',
    subIntention: 'normal',
    subPaymentMethod: '',
  };

  const selectPreset = (preset: DomainPreset) => {
    setPresetKey(preset.key);
    form.setFieldValue('presetKey', preset.key);
    const regName = locale === 'en-US' ? preset.registrar.en : preset.registrar.zh;
    const dnsName = locale === 'en-US' ? preset.dnsProvider.en : preset.dnsProvider.zh;
    if (!String(form.getFieldValue('registrar') ?? '').trim()) {
      form.setFieldValue('registrar', regName);
    }
    if (!String(form.getFieldValue('dnsProvider') ?? '').trim()) {
      form.setFieldValue('dnsProvider', dnsName);
    }
    if (!String(form.getFieldValue('managementUrl') ?? '').trim() && preset.defaultManagementUrl) {
      form.setFieldValue('managementUrl', preset.defaultManagementUrl);
    }
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
      purpose: values.purpose,
      status: values.status,
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
      archived: Boolean(values.archived),
      createSubscription,
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
          servers={availableServers}
          ips={availableIps}
          isEditing
          initialAccountId={value.registrarAccountId}
          initialOpenExtras={initialOpenExtras}
          submitting={mutation.isPending}
          onCancel={onClose}
        />
      </Form>
    </>
  );
}

export function DomainDrawer({
  open,
  value,
  subscriptions,
  accounts,
  servers,
  ips,
  onClose,
}: {
  open: boolean;
  value: Domain;
  subscriptions: Subscription[];
  accounts: Account[];
  servers: ServerHost[];
  ips: IpNode[];
  onClose: () => void;
}) {
  const { t } = usePreferences();

  return (
    <Drawer
      title={t('编辑域名')}
      open={open}
      onClose={onClose}
      size={596}
      destroyOnHidden
      footer={null}
      className="subscription-sheet-drawer"
    >
      {open && (
        <DomainDrawerBody
          key={value.id}
          value={value}
          subscriptions={subscriptions}
          accounts={accounts}
          servers={servers}
          ips={ips}
          onClose={onClose}
        />
      )}
    </Drawer>
  );
}
