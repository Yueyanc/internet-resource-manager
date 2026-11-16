import {
  type Account,
  accountsOptions,
  createDomain,
  type Domain,
  type DomainInput,
  integrationsOptions,
  type IpNode,
  ipsOptions,
  type ServerHost,
  serversOptions,
  type Subscription,
  type SubscriptionInput,
  subscriptionsOptions,
  updateDomain,
} from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Form, Input, Modal } from 'antd';
import dayjs from 'dayjs';
import { ArrowLeft, Cloud } from 'lucide-react';
import { useMemo, useState } from 'react';

import { usePreferences } from '../../app/preferences-context';
import { errorMessage } from '../../shared/errors';
import {
  type CloudSyncProviderKey,
  PROVIDER_BRIEFS,
} from '../integrations/provider-matching';
import { ProviderSyncPanel } from '../integrations/provider-sync-modal';
import {
  type DomainComposerValues,
  type DomainExtraKey,
  DomainPropertySheet,
} from './components/domain-composer-parts';
import type { DomainPreset } from './presets/domain-presets';
import { normalizeDomainDraft } from './utils/domain-metrics';

export type DomainModalMode = 'manual' | CloudSyncProviderKey;

function DomainModalBody({
  value,
  subscriptions,
  accounts,
  servers,
  ips,
  mode,
  onModeChange,
  onClose,
}: {
  value?: Domain;
  subscriptions?: Subscription[];
  accounts?: Account[];
  servers?: ServerHost[];
  ips?: IpNode[];
  mode: DomainModalMode;
  onModeChange: (next: DomainModalMode) => void;
  onClose: () => void;
}) {
  const { t, locale } = usePreferences();
  const [form] = Form.useForm<DomainComposerValues>();
  const client = useQueryClient();
  const { message } = App.useApp();

  const [presetKey, setPresetKey] = useState(() => value?.presetKey ?? '');

  const accountsQuery = useQuery({ ...accountsOptions, enabled: !accounts });
  const subscriptionsQuery = useQuery({ ...subscriptionsOptions, enabled: !subscriptions });
  const serversQuery = useQuery({ ...serversOptions, enabled: !servers });
  const ipsQuery = useQuery({ ...ipsOptions, enabled: !ips });
  const integrationsQuery = useQuery({ ...integrationsOptions, enabled: !value });

  const rawAccounts = accounts ?? (accountsQuery.isSuccess ? accountsQuery.data.items : []);
  const rawSubscriptions = subscriptions ?? (subscriptionsQuery.isSuccess ? subscriptionsQuery.data.items : []);
  const rawServers = servers ?? (serversQuery.isSuccess ? serversQuery.data.items : []);
  const rawIps = ips ?? (ipsQuery.isSuccess ? ipsQuery.data.items : []);

  const activeAccounts = rawAccounts.filter(a => !a.archived || a.id === value?.registrarAccountId);
  const activeSubscriptions = rawSubscriptions.filter(s => !s.archived || s.id === value?.subscriptionId);
  const activeServers = rawServers.filter(s => !s.archived || Boolean(value?.serverIds.includes(s.id)));
  const activeIps = rawIps.filter(ip => !ip.archived || Boolean(value?.ipIds.includes(ip.id)));
  const providerConnections = integrationsQuery.data?.items ?? [];
  const watchedAccountId = (Form.useWatch('registrarAccountId', form) as string | undefined) ?? '';

  const initialOpenExtras = useMemo(() => {
    const keys: DomainExtraKey[] = [];
    if (!value) return keys;
    if (value.serverIds.length > 0 || value.ipIds.length > 0) keys.push('topology');
    if (value.icpStatus !== 'none' || value.icpNumber.trim()) keys.push('icp');
    if (value.managementUrl.trim()) keys.push('consoleUrl');
    if (value.tags.length > 0) keys.push('tags');
    if (value.notes.trim()) keys.push('notes');
    return keys;
  }, [value]);

  const mutation = useMutation({
    mutationFn: (input: DomainInput) => (value ? updateDomain(value.id, input) : createDomain(input)),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['domains'] });
      await client.invalidateQueries({ queryKey: ['servers'] });
      await client.invalidateQueries({ queryKey: ['ips'] });
      await client.invalidateQueries({ queryKey: ['subscriptions'] });
      await client.invalidateQueries({ queryKey: ['nav-counts'] });
      void message.success(t(value ? '域名已更新' : '域名已添加'));
      onClose();
    },
  });

  const selectPreset = (preset: DomainPreset) => {
    setPresetKey(preset.key);
    form.setFieldValue('presetKey', preset.key);
    const regName = locale === 'en-US' ? preset.registrar.en : preset.registrar.zh;
    const dnsName = locale === 'en-US' ? preset.dnsProvider.en : preset.dnsProvider.zh;
    if (value) {
      if (!String(form.getFieldValue('registrar') ?? '').trim()) {
        form.setFieldValue('registrar', regName);
      }
      if (!String(form.getFieldValue('dnsProvider') ?? '').trim()) {
        form.setFieldValue('dnsProvider', dnsName);
      }
      if (!String(form.getFieldValue('managementUrl') ?? '').trim() && preset.defaultManagementUrl) {
        form.setFieldValue('managementUrl', preset.defaultManagementUrl);
      }
      return;
    }
    form.setFieldsValue({
      registrar: regName,
      dnsProvider: dnsName,
      whoisPrivacy: preset.defaultWhoisPrivacy,
      managementUrl: preset.defaultManagementUrl,
      ...(preset.defaultIcpStatus ? { icpStatus: preset.defaultIcpStatus } : {}),
    });
  };

  const initialValues: DomainComposerValues = value
    ? {
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
      }
    : {
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
      archived: value ? Boolean(values.archived) : false,
      createSubscription,
    });
  };

  return (
    <>
      <div hidden={mode !== 'manual'}>
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
            providerConnections={value ? undefined : providerConnections}
            onOpenProviderSync={value ? undefined : prov => onModeChange(prov)}
            isEditing={Boolean(value)}
            initialAccountId={value?.registrarAccountId}
            initialOpenExtras={initialOpenExtras}
            submitting={mutation.isPending}
            onCancel={onClose}
          />
        </Form>
      </div>

      {!value && mode !== 'manual' && (
        <ProviderSyncPanel
          key={mode}
          active
          scope="domains"
          initialProvider={mode}
          accounts={activeAccounts}
          initialAccountId={watchedAccountId}
          onCancel={onClose}
          onSynced={onClose}
        />
      )}
    </>
  );
}

export function DomainModal({
  open,
  value,
  subscriptions,
  accounts,
  servers,
  ips,
  onClose,
}: {
  open: boolean;
  value?: Domain;
  subscriptions?: Subscription[];
  accounts?: Account[];
  servers?: ServerHost[];
  ips?: IpNode[];
  onClose: () => void;
}) {
  const { t, locale } = usePreferences();
  const [mode, setMode] = useState<DomainModalMode>('manual');
  const effectiveMode: DomainModalMode = value ? 'manual' : mode;

  const handleClose = () => {
    setMode('manual');
    onClose();
  };

  const activeBrief = effectiveMode !== 'manual' ? PROVIDER_BRIEFS[effectiveMode] : undefined;
  const providerTitle = activeBrief
    ? (locale === 'en-US' ? activeBrief.en : activeBrief.zh)
    : '';

  return (
    <Modal
      title={effectiveMode !== 'manual'
        ? (
            <div className="cf-modal-title">
              <span className="cf-brand-badge" aria-hidden="true">
                <Cloud size={17} />
              </span>
              <div className="cf-modal-title-body">
                <div className="cf-modal-title-top">
                  <h3>{t('{provider} 只读资产同步', { provider: providerTitle })}</h3>
                  <button
                    type="button"
                    className="cf-back-manual-btn"
                    onClick={() => setMode('manual')}
                  >
                    <ArrowLeft size={13} />
                    <span>{t('返回手动录入')}</span>
                  </button>
                </div>
                <p>{t('通过最小只读权限 API 自动导入名下托管域名、到期日与 DNS 解析记录，并自动串联名下服务器与 IP 节点。')}</p>
              </div>
            </div>
          )
        : t(value ? '编辑域名' : '新建域名')}
      open={open}
      onCancel={handleClose}
      footer={null}
      width={effectiveMode !== 'manual' ? 660 : 616}
      centered
      destroyOnHidden
      className={effectiveMode !== 'manual' ? 'cf-sync-modal' : 'subscription-sheet-modal'}
    >
      {open && (
        <DomainModalBody
          key={value?.id ?? 'new'}
          value={value}
          subscriptions={subscriptions}
          accounts={accounts}
          servers={servers}
          ips={ips}
          mode={effectiveMode}
          onModeChange={setMode}
          onClose={handleClose}
        />
      )}
    </Modal>
  );
}
