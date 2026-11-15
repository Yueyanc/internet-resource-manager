import {
  accountsOptions,
  domainsOptions,
  integrationsOptions,
  type IpInput,
  previewIpLookup,
  saveIp,
  subscriptionsOptions,
} from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Form, Modal } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { ArrowLeft, Cloud } from 'lucide-react';
import { type CSSProperties, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { errorMessage } from '../../../shared/errors';
import {
  type CloudSyncProviderKey,
  PROVIDER_BRIEFS,
} from '../../integrations/provider-matching';
import { ProviderSyncPanel } from '../../integrations/provider-sync-modal';
import type { IpPreset, IpPresetVariant } from '../presets/ip-presets';
import { nextReviewDate } from '../utils/ip-metrics';
import { type IpLockableField, IpPropertySheet } from './ip-composer-parts';

type WizardValues = Omit<IpInput, 'presetKey' | 'nextReviewDate' | 'lastReviewedAt' | 'archived' | 'lookupSource'> & {
  nextReviewDate?: Dayjs;
};

type IpEntryMode = 'manual' | CloudSyncProviderKey;

function defaultReviewDate(cycle: IpInput['reviewCycle'], days = 90): Dayjs {
  const today = dayjs().format('YYYY-MM-DD');
  const next = nextReviewDate(today, cycle, days);
  return dayjs(next ?? today);
}

function IpWizardBody({
  mode,
  onModeChange,
  onClose,
}: {
  mode: IpEntryMode;
  onModeChange: (mode: IpEntryMode) => void;
  onClose: () => void;
}) {
  const { t, locale } = usePreferences();
  const [form] = Form.useForm<WizardValues>();
  const client = useQueryClient();
  const { message } = App.useApp();

  const subsQuery = useQuery(subscriptionsOptions);
  const domainsQuery = useQuery(domainsOptions);
  const accountsQuery = useQuery(accountsOptions);
  const integrationsQuery = useQuery(integrationsOptions);

  const activeSubscriptions = subsQuery.isSuccess ? subsQuery.data.items.filter(item => !item.archived) : [];
  const allDomains = domainsQuery.isSuccess ? domainsQuery.data.items : [];
  const activeAccounts = accountsQuery.isSuccess ? accountsQuery.data.items.filter(item => !item.archived) : [];
  const providerConnections = integrationsQuery.isSuccess ? integrationsQuery.data.items : [];

  const [presetKey, setPresetKey] = useState('');
  const [variantId, setVariantId] = useState('');
  const [lookupSource, setLookupSource] = useState('manual');

  const lookupMutation = useMutation({
    mutationFn: (addr: string) => previewIpLookup(addr),
    onSuccess: (res) => {
      const locks = new Set<IpLockableField>(form.getFieldValue('manualLocks') ?? []);
      const curProvider = String(form.getFieldValue('provider') ?? '').trim();
      form.setFieldsValue({
        address: res.address,
        ...(!locks.has('region') && res.region ? { region: res.region } : {}),
        ...(!locks.has('city') && res.city ? { city: res.city } : {}),
        ...(!locks.has('asn') && res.asn > 0 ? { asn: res.asn } : {}),
        ...(!locks.has('asnOrg') && res.asnOrg ? { asnOrg: res.asnOrg } : {}),
        ...(!locks.has('ptrRecord') && res.ptrRecord ? { ptrRecord: res.ptrRecord } : {}),
        ...(!curProvider && res.asnOrg ? { provider: res.asnOrg.slice(0, 100) } : {}),
      });
      setLookupSource(res.source || 'rdap');
      void message.success(t('已填入归属信息'));
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const mutation = useMutation({
    mutationFn: (input: IpInput) => saveIp(input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['ips'] });
      await client.invalidateQueries({ queryKey: ['nav-counts'] });
      void message.success(t('IP 节点已添加'));
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
      ...(variant.tags ? { tags: variant.tags } : {}),
    });
  };

  const selectPreset = (preset: IpPreset) => {
    setPresetKey(preset.key);
    setLookupSource('manual');
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
  };

  const submit = (values: WizardValues) => {
    const cleanAddress = values.address.trim();
    const cleanProvider = (values.provider ?? '').trim()
      || (values.asnOrg ?? '').trim().slice(0, 100)
      || cleanAddress;
    const cleanRegion = (values.region ?? 'US').trim().toUpperCase();

    mutation.mutate({
      presetKey,
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
      lookupSource,
      role: values.role,
      status: values.status,
      reviewCycle: values.reviewCycle,
      reviewDays: values.reviewCycle === 'custom' ? (values.reviewDays || 90) : 0,
      nextReviewDate: values.reviewCycle === 'none' || !values.nextReviewDate
        ? ''
        : values.nextReviewDate.format('YYYY-MM-DD'),
      probeMode: values.probeMode,
      probePort: values.probeMode === 'none' ? 0 : (values.probePort || 443),
      subscriptionId: values.subscriptionId ?? '',
      hostLabel: (values.hostLabel ?? '').trim(),
      domainIds: values.domainIds ?? [],
      accountIds: values.accountIds ?? [],
      consoleUrl: (values.consoleUrl ?? '').trim(),
      notes: (values.notes ?? '').trim(),
      archived: false,
    });
  };

  if (mode !== 'manual') {
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
        initialValues={{
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
        }}
        onFinish={submit}
        disabled={mutation.isPending}
      >
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
          providerConnections={providerConnections}
          onOpenProviderSync={prov => onModeChange(prov)}
          submitting={mutation.isPending}
          onCancel={onClose}
        />
      </Form>
    </>
  );
}

export function IpWizardModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, locale } = usePreferences();
  const [mode, setMode] = useState<IpEntryMode>('manual');

  const handleClose = () => {
    setMode('manual');
    onClose();
  };

  const activeBrief = mode !== 'manual' ? PROVIDER_BRIEFS[mode] : undefined;
  const providerTitle = activeBrief ? (locale === 'en-US' ? activeBrief.en : activeBrief.zh) : '';

  return (
    <Modal
      open={open}
      title={mode !== 'manual'
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
        : t('新建 IP')}
      onCancel={handleClose}
      width={mode !== 'manual' ? 660 : 616}
      centered
      destroyOnHidden
      footer={null}
      className={mode !== 'manual' ? 'cf-sync-modal' : 'subscription-sheet-modal'}
    >
      {open && <IpWizardBody mode={mode} onModeChange={setMode} onClose={handleClose} />}
    </Modal>
  );
}
