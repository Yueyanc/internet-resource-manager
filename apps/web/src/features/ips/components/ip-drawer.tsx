import {
  type Account,
  type Domain,
  type IpInput,
  type IpNode,
  previewIpLookup,
  saveIp,
  type Subscription,
} from '@irm/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Drawer, Form, Input } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { errorMessage } from '../../../shared/errors';
import type { IpPreset, IpPresetVariant } from '../presets/ip-presets';
import { type IpExtraKey, type IpLockableField, IpPropertySheet } from './ip-composer-parts';

type FormValues = Omit<IpInput, 'nextReviewDate' | 'lastReviewedAt'> & {
  nextReviewDate?: Dayjs;
};

function IpDrawerBody({
  value,
  subscriptions,
  domains,
  accounts,
  onClose,
}: {
  value: IpNode;
  subscriptions: Subscription[];
  domains: Domain[];
  accounts: Account[];
  onClose: () => void;
}) {
  const { t, locale } = usePreferences();
  const [form] = Form.useForm<FormValues>();
  const client = useQueryClient();
  const { message } = App.useApp();

  const [presetKey, setPresetKey] = useState(() => value.presetKey ?? '');
  const [variantId, setVariantId] = useState('');

  const activeSubscriptions = subscriptions.filter(sub => !sub.archived || sub.id === value.subscriptionId);
  const activeAccounts = accounts.filter(acct => !acct.archived || value.accountIds.includes(acct.id));

  const initialOpenExtras = useMemo(() => {
    const keys: IpExtraKey[] = [];
    if (value.label.trim()) keys.push('alias');
    if (value.ptrRecord.trim()) keys.push('ptr');
    if (value.domainIds.length > 0) keys.push('domains');
    if (value.accountIds.length > 0) keys.push('accounts');
    if (value.purityNote.trim() || value.notes.trim() || value.tags.length > 0) keys.push('purity');
    return keys;
  }, [value]);

  const lookupMutation = useMutation({
    mutationFn: (addr: string) => previewIpLookup(addr),
    onSuccess: (res) => {
      const locks = new Set<IpLockableField>(form.getFieldValue('manualLocks') ?? []);
      form.setFieldsValue({
        address: res.address,
        lookupSource: res.source || 'rdap',
        ...(!locks.has('region') && res.region ? { region: res.region } : {}),
        ...(!locks.has('city') && res.city ? { city: res.city } : {}),
        ...(!locks.has('asn') && res.asn > 0 ? { asn: res.asn } : {}),
        ...(!locks.has('asnOrg') && res.asnOrg ? { asnOrg: res.asnOrg } : {}),
        ...(!locks.has('ptrRecord') && res.ptrRecord ? { ptrRecord: res.ptrRecord } : {}),
      });
      void message.success(t('已填入归属信息'));
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const mutation = useMutation({
    mutationFn: (input: IpInput) => saveIp(input, value.id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['ips'] });
      await client.invalidateQueries({ queryKey: ['nav-counts'] });
      void message.success(t('IP 节点已更新'));
      onClose();
    },
  });

  const initialValues: FormValues = {
    ...value,
    manualLocks: value.manualLocks as FormValues['manualLocks'],
    reviewDays: value.reviewDays || 90,
    probePort: value.probePort || 443,
    nextReviewDate: value.nextReviewDate ? dayjs(value.nextReviewDate) : undefined,
  };

  const selectPreset = (preset: IpPreset) => {
    setPresetKey(preset.key);
    form.setFieldValue('presetKey', preset.key);
    if (!String(form.getFieldValue('provider') ?? '').trim()) {
      form.setFieldValue('provider', locale === 'en-US' ? preset.provider.en : preset.provider.zh);
    }
  };

  const applyVariant = (variant: IpPresetVariant) => {
    setVariantId(variant.id);
    form.setFieldsValue({
      label: locale === 'en-US' ? variant.nodeLabel.en : variant.nodeLabel.zh,
      networkScope: variant.networkScope,
      region: variant.region,
      city: variant.city,
      ...(variant.asnType ? { asnType: variant.asnType } : {}),
      ...(variant.originType ? { originType: variant.originType } : {}),
    });
  };

  const submit = (values: FormValues) => {
    const cleanAddress = values.address.trim();
    const cleanProvider = (values.provider ?? '').trim()
      || (values.asnOrg ?? '').trim().slice(0, 100)
      || cleanAddress;
    const cleanRegion = (values.region ?? 'US').trim().toUpperCase();

    mutation.mutate({
      presetKey: values.presetKey ?? presetKey,
      address: cleanAddress,
      networkScope: values.networkScope,
      category: values.category,
      provider: cleanProvider,
      label: (values.label ?? '').trim(),
      region: /^[A-Z0-9]{2,8}$/.test(cleanRegion) ? cleanRegion : 'US',
      city: (values.city ?? '').trim(),
      asn: values.asn ?? 0,
      asnOrg: (values.asnOrg ?? '').trim(),
      ptrRecord: (values.ptrRecord ?? '').trim(),
      asnType: values.asnType,
      originType: values.originType,
      riskLevel: values.riskLevel,
      purityNote: (values.purityNote ?? '').trim(),
      unlocks: values.unlocks ?? {},
      tags: values.tags ?? [],
      manualLocks: values.manualLocks ?? [],
      lookupSource: values.lookupSource ?? value.lookupSource,
      role: values.role,
      status: values.status,
      reviewCycle: values.reviewCycle,
      reviewDays: values.reviewCycle === 'custom' ? (values.reviewDays || 90) : 0,
      nextReviewDate: values.reviewCycle === 'none' || !values.nextReviewDate
        ? ''
        : values.nextReviewDate.format('YYYY-MM-DD'),
      lastReviewedAt: value.lastReviewedAt,
      probeMode: values.probeMode,
      probePort: values.probeMode === 'none' ? 0 : (values.probePort || 443),
      subscriptionId: values.subscriptionId ?? '',
      hostLabel: (values.hostLabel ?? '').trim(),
      domainIds: values.domainIds ?? [],
      accountIds: values.accountIds ?? [],
      consoleUrl: (values.consoleUrl ?? '').trim(),
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
        <Form.Item name="lookupSource" hidden><Input /></Form.Item>

        <IpPropertySheet
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
          onLookup={addr => lookupMutation.mutate(addr)}
          lookingUp={lookupMutation.isPending}
          subscriptions={activeSubscriptions}
          domains={domains}
          accounts={activeAccounts}
          isEditing
          initialOpenExtras={initialOpenExtras}
          submitting={mutation.isPending}
          onCancel={onClose}
        />
      </Form>
    </>
  );
}

export function IpDrawer({
  open,
  value,
  subscriptions,
  domains,
  accounts,
  onClose,
}: {
  open: boolean;
  value: IpNode;
  subscriptions: Subscription[];
  domains: Domain[];
  accounts: Account[];
  onClose: () => void;
}) {
  const { t } = usePreferences();

  return (
    <Drawer
      title={t('编辑节点')}
      open={open}
      onClose={onClose}
      size={596}
      destroyOnHidden
      footer={null}
      className="subscription-sheet-drawer"
    >
      {open && (
        <IpDrawerBody
          key={value.id}
          value={value}
          subscriptions={subscriptions}
          domains={domains}
          accounts={accounts}
          onClose={onClose}
        />
      )}
    </Drawer>
  );
}
