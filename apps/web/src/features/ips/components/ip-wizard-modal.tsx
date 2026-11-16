import {
  type Account,
  accountsOptions,
  type Domain,
  domainsOptions,
  integrationsOptions,
  type IpInput,
  type IpNode,
  previewIpLookup,
  saveIp,
  type Subscription,
  subscriptionsOptions,
} from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Form, Input, Modal } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { ArrowLeft, Cloud } from 'lucide-react';
import { type CSSProperties, useMemo, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { errorMessage } from '../../../shared/errors';
import {
  type CloudSyncProviderKey,
  PROVIDER_BRIEFS,
} from '../../integrations/provider-matching';
import { ProviderSyncPanel } from '../../integrations/provider-sync-modal';
import type { IpPreset, IpPresetVariant } from '../presets/ip-presets';
import { nextReviewDate } from '../utils/ip-metrics';
import { type IpExtraKey, type IpLockableField, IpPropertySheet } from './ip-composer-parts';

type IpFormValues = Omit<IpInput, 'nextReviewDate' | 'lastReviewedAt'> & {
  nextReviewDate?: Dayjs;
};

type IpEntryMode = 'manual' | CloudSyncProviderKey;

function defaultReviewDate(cycle: IpInput['reviewCycle'], days = 90): Dayjs {
  const today = dayjs().format('YYYY-MM-DD');
  const next = nextReviewDate(today, cycle, days);
  return dayjs(next ?? today);
}

function IpWizardBody({
  value,
  subscriptions,
  domains,
  accounts,
  mode,
  onModeChange,
  onClose,
}: {
  value?: IpNode;
  subscriptions?: Subscription[];
  domains?: Domain[];
  accounts?: Account[];
  mode: IpEntryMode;
  onModeChange: (mode: IpEntryMode) => void;
  onClose: () => void;
}) {
  const { t, locale } = usePreferences();
  const [form] = Form.useForm<IpFormValues>();
  const client = useQueryClient();
  const { message } = App.useApp();

  const subsQuery = useQuery({ ...subscriptionsOptions, enabled: !subscriptions });
  const domainsQuery = useQuery({ ...domainsOptions, enabled: !domains });
  const accountsQuery = useQuery({ ...accountsOptions, enabled: !accounts });
  const integrationsQuery = useQuery({ ...integrationsOptions, enabled: !value });

  const rawSubscriptions = subscriptions ?? (subsQuery.isSuccess ? subsQuery.data.items : []);
  const allDomains = domains ?? (domainsQuery.isSuccess ? domainsQuery.data.items : []);
  const rawAccounts = accounts ?? (accountsQuery.isSuccess ? accountsQuery.data.items : []);

  const activeSubscriptions = rawSubscriptions.filter(item => !item.archived || item.id === value?.subscriptionId);
  const activeAccounts = rawAccounts.filter(item => !item.archived || Boolean(value?.accountIds.includes(item.id)));
  const providerConnections = integrationsQuery.isSuccess ? integrationsQuery.data.items : [];

  const [presetKey, setPresetKey] = useState(() => value?.presetKey ?? '');
  const [variantId, setVariantId] = useState('');
  const [lookupSource, setLookupSource] = useState(() => value?.lookupSource ?? 'manual');

  const initialOpenExtras = useMemo(() => {
    const keys: IpExtraKey[] = [];
    if (!value) return keys;
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
      const curProvider = String(form.getFieldValue('provider') ?? '').trim();
      const nextSource = res.source || 'rdap';
      form.setFieldsValue({
        address: res.address,
        lookupSource: nextSource,
        ...(!locks.has('region') && res.region ? { region: res.region } : {}),
        ...(!locks.has('city') && res.city ? { city: res.city } : {}),
        ...(!locks.has('asn') && res.asn > 0 ? { asn: res.asn } : {}),
        ...(!locks.has('asnOrg') && res.asnOrg ? { asnOrg: res.asnOrg } : {}),
        ...(!locks.has('ptrRecord') && res.ptrRecord ? { ptrRecord: res.ptrRecord } : {}),
        ...(!curProvider && res.asnOrg ? { provider: res.asnOrg.slice(0, 100) } : {}),
      });
      setLookupSource(nextSource);
      void message.success(t('已填入归属信息'));
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const mutation = useMutation({
    mutationFn: (input: IpInput) => saveIp(input, value?.id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['ips'] });
      await client.invalidateQueries({ queryKey: ['nav-counts'] });
      void message.success(t(value ? 'IP 节点已更新' : 'IP 节点已添加'));
      onClose();
    },
  });

  const applyVariant = (variant: IpPresetVariant) => {
    setVariantId(variant.id);
    form.setFieldsValue({
      label: locale === 'en-US' ? variant.nodeLabel.en : variant.nodeLabel.zh,
      networkScope: variant.networkScope,
      region: variant.region,
      city: variant.city,
      ...(variant.asnType ? { asnType: variant.asnType } : {}),
      ...(variant.originType ? { originType: variant.originType } : {}),
      ...(!value && variant.tags ? { tags: variant.tags } : {}),
    });
  };

  const selectPreset = (preset: IpPreset) => {
    setPresetKey(preset.key);
    form.setFieldValue('presetKey', preset.key);
    if (value) {
      if (!String(form.getFieldValue('provider') ?? '').trim()) {
        form.setFieldValue('provider', locale === 'en-US' ? preset.provider.en : preset.provider.zh);
      }
      return;
    }

    setLookupSource('manual');
    form.setFieldValue('lookupSource', 'manual');
    const firstVariant = preset.variants?.[0];
    const review = preset.recommendedReview ?? 'none';
    form.setFieldsValue({
      provider: locale === 'en-US' ? preset.provider.en : preset.provider.zh,
      label: firstVariant ? (locale === 'en-US' ? firstVariant.nodeLabel.en : firstVariant.nodeLabel.zh) : '',
      category: preset.category,
      networkScope: firstVariant?.networkScope ?? preset.networkScope,
      region: firstVariant?.region ?? preset.region,
      city: firstVariant?.city ?? preset.city ?? '',
      asn: preset.asn ?? 0,
      asnOrg: preset.asnOrg ?? '',
      asnType: firstVariant?.asnType ?? preset.asnType,
      originType: firstVariant?.originType ?? preset.originType,
      riskLevel: preset.asnType === 'residential' ? 'clean' : 'unassessed',
      role: preset.defaultRole ?? 'primary',
      tags: firstVariant?.tags ?? preset.defaultTags ?? [],
      reviewCycle: review,
      reviewDays: 90,
      nextReviewDate: review === 'none' ? undefined : defaultReviewDate(review, 90),
      probeMode: 'none',
      probePort: 443,
      consoleUrl: preset.consoleUrl ?? '',
    });
    setVariantId(firstVariant?.id ?? '');
  };

  const clearPreset = () => {
    setPresetKey('');
    setVariantId('');
    form.setFieldValue('presetKey', '');
  };

  const initialValues: IpFormValues = value
    ? {
        ...value,
        manualLocks: value.manualLocks as IpFormValues['manualLocks'],
        reviewDays: value.reviewDays || 90,
        probePort: value.probePort || 443,
        nextReviewDate: value.nextReviewDate ? dayjs(value.nextReviewDate) : undefined,
      }
    : {
        presetKey: '',
        lookupSource: 'manual',
        address: '',
        provider: '',
        label: '',
        category: 'cloud_vps',
        networkScope: 'overseas_exit',
        region: 'US',
        city: '',
        asn: 0,
        asnOrg: '',
        ptrRecord: '',
        asnType: 'hosting',
        originType: 'unknown',
        riskLevel: 'unassessed',
        purityNote: '',
        unlocks: {},
        tags: [],
        manualLocks: [],
        role: 'primary',
        status: 'active',
        reviewCycle: 'none',
        reviewDays: 90,
        probeMode: 'none',
        probePort: 443,
        subscriptionId: '',
        hostLabel: '',
        domainIds: [],
        accountIds: [],
        consoleUrl: '',
        notes: '',
        archived: false,
      };

  const submit = (values: IpFormValues) => {
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
      lookupSource: values.lookupSource ?? lookupSource,
      role: values.role,
      status: values.status,
      reviewCycle: values.reviewCycle,
      reviewDays: values.reviewCycle === 'custom' ? (values.reviewDays || 90) : 0,
      nextReviewDate: values.reviewCycle === 'none' || !values.nextReviewDate
        ? ''
        : values.nextReviewDate.format('YYYY-MM-DD'),
      ...(value ? { lastReviewedAt: value.lastReviewedAt } : {}),
      probeMode: values.probeMode,
      probePort: values.probeMode === 'none' ? 0 : (values.probePort || 443),
      subscriptionId: values.subscriptionId ?? '',
      hostLabel: (values.hostLabel ?? '').trim(),
      domainIds: values.domainIds ?? [],
      accountIds: values.accountIds ?? [],
      consoleUrl: (values.consoleUrl ?? '').trim(),
      notes: (values.notes ?? '').trim(),
      archived: value ? Boolean(values.archived) : false,
    });
  };

  if (!value && mode !== 'manual') {
    const accountIds = (form.getFieldValue('accountIds') as string[] | undefined) ?? [];
    return (
      <ProviderSyncPanel
        key={mode}
        active
        scope="ips"
        initialProvider={mode}
        accounts={activeAccounts}
        initialAccountId={accountIds[0] ?? ''}
        cancelLabel={t('返回手动录入')}
        onCancel={() => onModeChange('manual')}
        onSynced={onClose}
      />
    );
  }

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
          onClearPreset={clearPreset}
          onLookup={addr => lookupMutation.mutate(addr)}
          lookingUp={lookupMutation.isPending}
          subscriptions={activeSubscriptions}
          domains={allDomains}
          accounts={activeAccounts}
          providerConnections={value ? undefined : providerConnections}
          onOpenProviderSync={value ? undefined : prov => onModeChange(prov)}
          isEditing={Boolean(value)}
          initialOpenExtras={initialOpenExtras}
          submitting={mutation.isPending}
          onCancel={onClose}
        />
      </Form>
    </>
  );
}

export function IpWizardModal({
  open,
  value,
  subscriptions,
  domains,
  accounts,
  onClose,
}: {
  open: boolean;
  value?: IpNode;
  subscriptions?: Subscription[];
  domains?: Domain[];
  accounts?: Account[];
  onClose: () => void;
}) {
  const { t, locale } = usePreferences();
  const [mode, setMode] = useState<IpEntryMode>('manual');
  const effectiveMode: IpEntryMode = value ? 'manual' : mode;

  const handleClose = () => {
    setMode('manual');
    onClose();
  };

  const activeBrief = effectiveMode !== 'manual' ? PROVIDER_BRIEFS[effectiveMode] : undefined;
  const providerTitle = activeBrief ? (locale === 'en-US' ? activeBrief.en : activeBrief.zh) : '';

  return (
    <Modal
      open={open}
      title={effectiveMode !== 'manual'
        ? (
            <div className="cf-modal-title">
              <span
                className="cf-modal-title-mark"
                style={activeBrief ? { '--callout-tint': activeBrief.color } as CSSProperties : undefined}
                aria-hidden="true"
              >
                <Cloud size={18} />
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
                <p>{t('通过最小只读权限 API 自动导入名下公网 IP、Tailscale 组网地址与宿主实例关联。')}</p>
              </div>
            </div>
          )
        : t(value ? '编辑节点' : '新建 IP')}
      onCancel={handleClose}
      width={effectiveMode !== 'manual' ? 660 : 616}
      centered
      destroyOnHidden
      footer={null}
      className={effectiveMode !== 'manual' ? 'cf-sync-modal' : 'subscription-sheet-modal'}
    >
      {open && (
        <IpWizardBody
          key={value?.id ?? 'new'}
          value={value}
          subscriptions={subscriptions}
          domains={domains}
          accounts={accounts}
          mode={effectiveMode}
          onModeChange={setMode}
          onClose={handleClose}
        />
      )}
    </Modal>
  );
}
