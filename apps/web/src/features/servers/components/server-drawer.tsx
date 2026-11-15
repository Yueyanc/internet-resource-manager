import {
  type Account,
  type Domain,
  type IpNode,
  saveServer,
  type ServerHost,
  type ServerInput,
  type Subscription,
  type SubscriptionInput,
} from '@irm/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Drawer, Form, Input } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { errorMessage } from '../../../shared/errors';
import type { ServerPreset, ServerPresetPlan } from '../presets/server-presets';
import {
  type ServerBillingMode,
  type ServerExtraKey,
  ServerPropertySheet,
} from './server-composer-parts';

type FormValues = Omit<ServerInput, 'expireDate' | 'createSubscription'> & {
  billingMode: ServerBillingMode;
  expireDate?: Dayjs;
  subName?: string;
  subAmount?: number;
  subCurrency: SubscriptionInput['currency'];
  subCycle: SubscriptionInput['cycle'];
  subIntervalDays?: number;
  subDueDate?: Dayjs;
  subRenewalMode: SubscriptionInput['renewalMode'];
  subIntention: SubscriptionInput['intention'];
  subRenewalAmount?: number;
  subPaymentMethod?: string;
};

function ServerDrawerBody({
  value,
  subscriptions,
  accounts,
  domains,
  ips,
  onClose,
}: {
  value: ServerHost;
  subscriptions: Subscription[];
  accounts: Account[];
  domains: Domain[];
  ips: IpNode[];
  onClose: () => void;
}) {
  const { t, locale } = usePreferences();
  const [form] = Form.useForm<FormValues>();
  const client = useQueryClient();
  const { message } = App.useApp();

  const [presetKey, setPresetKey] = useState(() => value.presetKey ?? '');
  const [planId, setPlanId] = useState('');

  const activeSubscriptions = subscriptions.filter(sub => !sub.archived || sub.id === value.subscriptionId);
  const activeAccounts = accounts.filter(acct => !acct.archived || acct.id === value.accountId);
  const availableIps = ips.filter(ip => !ip.archived || value.ipIds.includes(ip.id));

  const initialOpenExtras = useMemo(() => {
    const keys: ServerExtraKey[] = [];
    if (value.ipv6.trim() || value.privateIp.trim() || value.hostname.trim()) keys.push('network');
    if (value.consoleUrl.trim() || value.domainIds.length > 0 || value.ipIds.length > 0) keys.push('consoleUrl');
    if (value.tags.length > 0) keys.push('tags');
    if (value.notes.trim()) keys.push('notes');
    return keys;
  }, [value]);

  const mutation = useMutation({
    mutationFn: (input: ServerInput) => saveServer(input, value.id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['servers'] });
      await client.invalidateQueries({ queryKey: ['subscriptions'] });
      await client.invalidateQueries({ queryKey: ['ips'] });
      await client.invalidateQueries({ queryKey: ['nav-counts'] });
      void message.success(t('服务器已更新'));
      onClose();
    },
  });

  const initialValues: FormValues = {
    ...value,
    billingMode: value.subscriptionId ? 'link' : 'none',
    expireDate: value.expireDate ? dayjs(value.expireDate) : undefined,
    subName: value.name,
    subAmount: 0,
    subCurrency: 'USD',
    subCycle: 'yearly',
    subIntervalDays: 30,
    subDueDate: dayjs().add(1, 'year'),
    subRenewalMode: 'manual',
    subIntention: 'normal',
    subPaymentMethod: '',
  };

  const selectPreset = (preset: ServerPreset) => {
    setPresetKey(preset.key);
    form.setFieldValue('presetKey', preset.key);
    const providerName = locale === 'en-US' ? preset.provider.en : preset.provider.zh;
    if (!String(form.getFieldValue('provider') ?? '').trim()) {
      form.setFieldValue('provider', providerName);
    }
  };

  const applyPlan = (plan: ServerPresetPlan) => {
    setPlanId(plan.id);
    form.setFieldsValue({
      region: plan.region,
      datacenter: plan.datacenter ?? '',
      cpuCores: plan.cpuCores,
      memoryMb: plan.memoryMb,
      diskGb: plan.diskGb,
      diskType: plan.diskType ?? 'nvme',
      bandwidthMbps: plan.bandwidthMbps,
      trafficGb: plan.trafficGb,
      trafficRule: plan.trafficRule ?? 'both',
    });
  };

  const submit = (values: FormValues) => {
    const createSubscription: SubscriptionInput | undefined = values.billingMode === 'create'
      ? {
          presetKey: values.presetKey ?? presetKey,
          name: (values.subName ?? '').trim() || values.name.trim(),
          amountMinor: Math.round((values.subAmount ?? 0) * 100),
          currency: values.subCurrency,
          cycle: values.subCycle,
          intervalDays: values.subCycle === 'custom' ? (values.subIntervalDays || 30) : 0,
          dueDate: (values.subDueDate ?? dayjs()).format('YYYY-MM-DD'),
          category: 'cloud',
          renewalMode: values.subRenewalMode,
          intention: values.subIntention,
          renewalAmountMinor: Math.round((values.subRenewalAmount ?? 0) * 100),
          accountId: values.accountId ?? '',
          account: '',
          paymentMethod: (values.subPaymentMethod ?? '').trim(),
          managementUrl: (values.consoleUrl ?? '').trim(),
          notes: '',
          archived: false,
        }
      : undefined;

    mutation.mutate({
      presetKey: values.presetKey ?? presetKey,
      name: values.name.trim(),
      hostname: (values.hostname ?? '').trim(),
      provider: (values.provider ?? '').trim(),
      kind: values.kind,
      status: values.status,
      region: (values.region ?? 'HK').trim().toUpperCase(),
      datacenter: (values.datacenter ?? '').trim(),
      os: (values.os ?? '').trim(),
      arch: values.arch,
      cpuCores: values.cpuCores ?? 0,
      memoryMb: values.memoryMb ?? 0,
      diskGb: values.diskGb ?? 0,
      diskType: values.diskType ?? '',
      bandwidthMbps: values.bandwidthMbps ?? 0,
      trafficGb: values.trafficRule === 'unlimited' ? 0 : (values.trafficGb ?? 0),
      trafficRule: values.trafficRule,
      trafficResetDay: values.trafficResetDay ?? 0,
      ipv4: (values.ipv4 ?? '').trim(),
      ipv6: (values.ipv6 ?? '').trim(),
      privateIp: (values.privateIp ?? '').trim(),
      portNote: (values.portNote ?? '').trim(),
      sshPort: values.sshPort ?? 22,
      sshUser: (values.sshUser ?? 'root').trim(),
      consoleUrl: (values.consoleUrl ?? '').trim(),
      subscriptionId: values.billingMode === 'link' ? (values.subscriptionId ?? '') : '',
      accountId: values.accountId ?? '',
      expireDate: values.billingMode === 'none' && values.expireDate
        ? values.expireDate.format('YYYY-MM-DD')
        : '',
      domainIds: values.domainIds ?? [],
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

        <ServerPropertySheet
          form={form}
          presetKey={presetKey}
          planId={planId}
          onSelectPreset={selectPreset}
          onSelectPlan={applyPlan}
          onClearPreset={() => {
            setPresetKey('');
            setPlanId('');
            form.setFieldValue('presetKey', '');
          }}
          subscriptions={activeSubscriptions}
          accounts={activeAccounts}
          domains={domains}
          ips={availableIps}
          isEditing
          initialAccountId={value.accountId}
          initialOpenExtras={initialOpenExtras}
          submitting={mutation.isPending}
          onCancel={onClose}
        />
      </Form>
    </>
  );
}

export function ServerDrawer({
  open,
  value,
  subscriptions,
  accounts,
  domains,
  ips,
  onClose,
}: {
  open: boolean;
  value: ServerHost;
  subscriptions: Subscription[];
  accounts: Account[];
  domains: Domain[];
  ips: IpNode[];
  onClose: () => void;
}) {
  const { t } = usePreferences();

  return (
    <Drawer
      title={t('编辑服务器')}
      open={open}
      onClose={onClose}
      size={596}
      destroyOnHidden
      footer={null}
      className="subscription-sheet-drawer"
    >
      {open && (
        <ServerDrawerBody
          key={value.id}
          value={value}
          subscriptions={subscriptions}
          accounts={accounts}
          domains={domains}
          ips={ips}
          onClose={onClose}
        />
      )}
    </Drawer>
  );
}
