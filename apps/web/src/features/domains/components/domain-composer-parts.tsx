import {
  type Account,
  currencies,
  type DomainIcpStatus,
  type DomainInput,
  type DomainPurpose,
  type DomainStatus,
  type IpNode,
  lookupDomainPreview,
  type ProviderConnection,
  type ServerHost,
  type Subscription,
  type SubscriptionInput,
} from '@irm/api-client';
import { useMutation } from '@tanstack/react-query';
import {
  App,
  Button,
  DatePicker,
  Dropdown,
  Form,
  type FormInstance,
  Input,
  InputNumber,
  Popover,
  Select,
  Switch,
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import {
  Activity,
  Archive,
  Check,
  ChevronDown,
  Cloud,
  FileBadge2,
  FileText,
  Globe,
  Layers,
  Link2,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { type CSSProperties, useMemo, useState } from 'react';

import type { MessageKey } from '../../../app/messages';
import { usePreferences } from '../../../app/preferences-context';
import { errorMessage } from '../../../shared/errors';
import {
  type CloudSyncProviderKey,
  PROVIDER_BRIEFS,
  resolveDomainSyncProvider,
} from '../../integrations/provider-matching';
import { ipDisplayTitle } from '../../ips/utils/ip-metrics';
import { AccountQuickDropdown } from '../../subscriptions/components/subscription-account-fields';
import { cycles } from '../../subscriptions/utils/subscription-metrics';
import {
  type DomainPreset,
  type DomainPresetGroup,
  domainPresetGroups,
  domainTagPresets,
  filterDomainPresets,
  findDomainPreset,
  resolveDomainPreset,
} from '../presets/domain-presets';
import {
  domainIcpMeta,
  domainPurposeMeta,
  domainStatusMeta,
  inspectDomain,
} from '../utils/domain-metrics';
import { DomainMark } from './domain-mark';

export type DomainBillingMode = 'none' | 'link' | 'create';
export type DomainExtraKey = 'topology' | 'icp' | 'consoleUrl' | 'tags' | 'notes';

export type DomainComposerValues = Omit<DomainInput, 'expireDate' | 'createSubscription'> & {
  billingMode: DomainBillingMode;
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

const currencySymbols: Record<SubscriptionInput['currency'], string> = {
  CNY: '¥',
  USD: 'US$',
  HKD: 'HK$',
  EUR: '€',
  GBP: '£',
  JPY: 'JP¥',
};

function DomainPresetPopover({
  open,
  onOpenChange,
  presetKey,
  onSelectPreset,
  onClearPreset,
  children,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  presetKey: string;
  onSelectPreset: (preset: DomainPreset) => void;
  onClearPreset: () => void;
  children: React.ReactNode;
}) {
  const { t, locale } = usePreferences();
  const [group, setGroup] = useState<DomainPresetGroup>('popular');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => filterDomainPresets(query, group), [query, group]);

  const handleOpen = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setQuery('');
    }
  };

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={handleOpen}
      placement="bottomLeft"
      arrow={false}
      rootClassName="preset-picker-popover"
      content={(
        <div className="preset-popover-panel">
          <div className="preset-popover-search">
            <Input
              size="small"
              variant="borderless"
              allowClear
              autoFocus
              aria-label={t('搜索注册商或解析商预设')}
              prefix={<Search size={14} className="text-gray-400" />}
              placeholder={t('搜索预设，如 Cloudflare、Porkbun、阿里云、DNSPod...')}
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </div>

          {!query.trim() && (
            <div className="preset-popover-tabs" role="tablist">
              {domainPresetGroups.map(item => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={group === item.key}
                  className={`preset-popover-tab ${group === item.key ? 'is-active' : ''}`}
                  onClick={() => setGroup(item.key)}
                >
                  {t(item.zh as MessageKey)}
                </button>
              ))}
            </div>
          )}

          <div className="preset-popover-grid">
            {filtered.map((preset) => {
              const displayName = locale === 'en-US' ? preset.registrar.en : preset.registrar.zh;
              const displaySub = locale === 'en-US' ? preset.subtitle.en : preset.subtitle.zh;
              const active = presetKey === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  style={{ '--tile-tint': preset.color } as CSSProperties}
                  className={`preset-popover-item ${active ? 'is-active' : ''}`}
                  onClick={() => {
                    onSelectPreset(preset);
                    handleOpen(false);
                  }}
                >
                  <DomainMark preset={preset} size="sm" />
                  <span className="preset-popover-meta">
                    <strong>{displayName}</strong>
                    <small>{displaySub}</small>
                  </span>
                  {active && <Check size={13} className="preset-popover-check" />}
                </button>
              );
            })}
          </div>

          <div className="preset-popover-footer">
            <button
              type="button"
              className={`preset-popover-auto ${!presetKey ? 'is-active' : ''}`}
              onClick={() => {
                onClearPreset();
                handleOpen(false);
              }}
            >
              <Sparkles size={13} />
              <span>{t('自动识别图标')}</span>
              {!presetKey && <Check size={13} className="ml-auto" />}
            </button>
          </div>
        </div>
      )}
    >
      {children}
    </Popover>
  );
}

export function DomainPropertySheet({
  form,
  presetKey,
  onSelectPreset,
  onClearPreset,
  subscriptions,
  accounts,
  servers,
  ips,
  isEditing = false,
  initialAccountId,
  initialOpenExtras = [],
  providerConnections = [],
  onOpenProviderSync,
  submitting,
  onCancel,
}: {
  form: FormInstance<DomainComposerValues>;
  presetKey: string;
  onSelectPreset: (preset: DomainPreset) => void;
  onClearPreset: () => void;
  subscriptions: Subscription[];
  accounts: Account[];
  servers: ServerHost[];
  ips: IpNode[];
  isEditing?: boolean;
  initialAccountId?: string;
  initialOpenExtras?: DomainExtraKey[];
  providerConnections?: ProviderConnection[];
  onOpenProviderSync?: (provider: CloudSyncProviderKey) => void;
  submitting: boolean;
  onCancel: () => void;
}) {
  const { t, locale } = usePreferences();
  const { message } = App.useApp();
  const [presetPopoverOpen, setPresetPopoverOpen] = useState(false);
  const [billingPopoverOpen, setBillingPopoverOpen] = useState(false);
  const [openExtras, setOpenExtras] = useState<Set<DomainExtraKey>>(() => new Set(initialOpenExtras));

  const lookupMutation = useMutation({
    mutationFn: (fqdn: string) => lookupDomainPreview(fqdn),
    onSuccess: (res) => {
      if (res.presetKey) {
        const matched = findDomainPreset(res.presetKey);
        if (matched) {
          onSelectPreset(matched);
        }
        else {
          form.setFieldValue('presetKey', res.presetKey);
        }
      }
      if (res.registrar) {
        form.setFieldValue('registrar', res.registrar);
      }
      if (res.dnsProvider) {
        form.setFieldValue('dnsProvider', res.dnsProvider);
      }
      if (res.expireDate) {
        const exp = dayjs(res.expireDate);
        if (exp.isValid()) {
          form.setFieldValue('expireDate', exp);
          form.setFieldValue('subDueDate', exp);
        }
        void message.success(t('已自动回填注册商与到期日（{source}）', { source: res.source.toUpperCase() }));
      }
      else {
        void message.info(t('已查询域名信息（注册商暂未公开到期日）'));
      }
    },
    onError: (err) => {
      void message.error(errorMessage(err, locale));
    },
  });

  const watchedName = (Form.useWatch('name', form) as string | undefined) ?? '';
  const watchedRegistrar = (Form.useWatch('registrar', form) as string | undefined) ?? '';
  const watchedDns = (Form.useWatch('dnsProvider', form) as string | undefined) ?? '';
  const watchedPurpose = (Form.useWatch('purpose', form) as DomainPurpose | undefined) ?? 'prod';
  const watchedStatus = (Form.useWatch('status', form) as DomainStatus | undefined) ?? 'active';
  const watchedWhois = Boolean(Form.useWatch('whoisPrivacy', form));
  const watchedAutoRenew = Boolean(Form.useWatch('autoRenew', form));
  const watchedIcpStatus = (Form.useWatch('icpStatus', form) as DomainIcpStatus | undefined) ?? 'none';
  const watchedIcpNumber = (Form.useWatch('icpNumber', form) as string | undefined) ?? '';
  const watchedBillingMode = (Form.useWatch('billingMode', form) as DomainBillingMode | undefined) ?? 'none';
  const watchedExpireDate = Form.useWatch('expireDate', form) as Dayjs | undefined;
  const watchedSubscriptionId = (Form.useWatch('subscriptionId', form) as string | undefined) ?? '';
  const watchedSubCurrency = (Form.useWatch('subCurrency', form) as SubscriptionInput['currency'] | undefined) ?? 'USD';
  const watchedSubAmount = (Form.useWatch('subAmount', form) as number | undefined) ?? 0;
  const watchedSubCycle = (Form.useWatch('subCycle', form) as SubscriptionInput['cycle'] | undefined) ?? 'yearly';
  const watchedSubDueDate = Form.useWatch('subDueDate', form) as Dayjs | undefined;
  const watchedSubRenewalMode = (Form.useWatch('subRenewalMode', form) as SubscriptionInput['renewalMode'] | undefined) ?? 'auto';
  const watchedManagementUrl = (Form.useWatch('managementUrl', form) as string | undefined) ?? '';
  const watchedServerIds = (Form.useWatch('serverIds', form) as string[] | undefined) ?? [];
  const watchedIpIds = (Form.useWatch('ipIds', form) as string[] | undefined) ?? [];
  const watchedTags = (Form.useWatch('tags', form) as string[] | undefined) ?? [];
  const watchedNotes = (Form.useWatch('notes', form) as string | undefined) ?? '';

  const parsed = useMemo(() => inspectDomain(watchedName), [watchedName]);
  const explicitPreset = presetKey ? findDomainPreset(presetKey) : undefined;
  const inferredPreset = useMemo(
    () => explicitPreset ?? resolveDomainPreset({
      presetKey,
      registrar: watchedRegistrar,
      dnsProvider: watchedDns,
      name: watchedName,
    }),
    [explicitPreset, presetKey, watchedRegistrar, watchedDns, watchedName],
  );
  const syncProviderKey = useMemo(
    () => resolveDomainSyncProvider({
      presetKey: presetKey || inferredPreset?.key,
      registrar: watchedRegistrar,
      dnsProvider: watchedDns,
    }),
    [presetKey, inferredPreset?.key, watchedRegistrar, watchedDns],
  );
  const matchedConnections = useMemo(
    () => (syncProviderKey ? providerConnections.filter(c => c.provider === syncProviderKey) : []),
    [providerConnections, syncProviderKey],
  );
  const matchedHasError = matchedConnections.some(c => c.status === 'error');
  const syncProviderBrief = syncProviderKey ? PROVIDER_BRIEFS[syncProviderKey] : undefined;
  const syncProviderLabel = syncProviderBrief
    ? (locale === 'en-US' ? syncProviderBrief.en : syncProviderBrief.zh)
    : '';

  const toggleExtra = (key: DomainExtraKey) => {
    setOpenExtras((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isExtraVisible = (key: DomainExtraKey) => openExtras.has(key);
  const anyExtraOpen = openExtras.size > 0;

  let billingSummary = t('未设到期日');
  if (watchedBillingMode === 'none') {
    if (watchedExpireDate) {
      billingSummary = `${watchedExpireDate.format('YYYY-MM-DD')} · ${t(watchedAutoRenew ? '自动续费' : '手动续费')}`;
    }
  }
  else if (watchedBillingMode === 'link') {
    const linked = subscriptions.find(sub => sub.id === watchedSubscriptionId);
    billingSummary = linked
      ? `${linked.name} · ${linked.dueDate}`
      : t('选择已有订阅');
  }
  else {
    const sym = currencySymbols[watchedSubCurrency];
    const amt = watchedSubAmount > 0 ? `${sym}${watchedSubAmount}` : t('填写金额');
    billingSummary = `${amt} / ${t(cycles[watchedSubCycle])} · ${(watchedSubDueDate ?? dayjs()).format('YYYY-MM-DD')}`;
  }

  return (
    <div className="sub-sheet">
      {/* Spotlight Hero */}
      <div className="sub-sheet-hero">
        <div className="sub-sheet-identity">
          <DomainPresetPopover
            open={presetPopoverOpen}
            onOpenChange={setPresetPopoverOpen}
            presetKey={presetKey}
            onSelectPreset={onSelectPreset}
            onClearPreset={onClearPreset}
          >
            <button
              type="button"
              className="sub-sheet-mark-btn"
              aria-label={t('更换图标')}
            >
              <DomainMark
                preset={inferredPreset}
                value={{
                  presetKey,
                  registrar: watchedRegistrar,
                  dnsProvider: watchedDns,
                  name: watchedName,
                  purpose: watchedPurpose,
                }}
                size="lg"
              />
            </button>
          </DomainPresetPopover>

          <div className="sub-sheet-title-col">
            <Form.Item
              name="name"
              className="sub-sheet-name-item"
              rules={[
                { required: true, whitespace: true, message: t('请输入域名') },
                { max: 253, message: t('域名过长') },
              ]}
            >
              <Input
                variant="borderless"
                aria-label={t('域名')}
                placeholder="craftstudio.io"
                maxLength={253}
                autoComplete="off"
                autoFocus={!isEditing}
                className="sub-sheet-title-input sheet-mono-title-input"
              />
            </Form.Item>
            <div className="sub-sheet-subtitle-row">
              <span className="sheet-hero-caption">
                {t('点击左侧图标选择注册商预设，自动带出解析与隐私配置')}
              </span>
            </div>
          </div>
        </div>

        <div className="sheet-hero-right">
          <button
            type="button"
            disabled={parsed.state !== 'valid' || lookupMutation.isPending || submitting}
            className="sheet-action-pill"
            onClick={() => lookupMutation.mutate(parsed.clean)}
          >
            <RefreshCw size={12} className={lookupMutation.isPending ? 'animate-spin' : ''} />
            <span>{t('自动查询 RDAP')}</span>
          </button>

          <span
            className={`sheet-status-pill ${
              parsed.state === 'valid'
                ? 'is-ready'
                : parsed.state === 'incomplete'
                  ? 'is-warn'
                  : 'is-idle'
            }`}
          >
            <span className="sheet-status-dot" />
            <span>
              {parsed.state === 'valid'
                ? t('FQDN 格式有效')
                : parsed.state === 'incomplete'
                  ? t('域名格式待完善')
                  : t('等待输入域名')}
            </span>
          </span>
        </div>
      </div>

      {onOpenProviderSync && syncProviderKey && (
        <div className="cf-composer-callout">
          <div className="cf-composer-callout-meta">
            <span
              className="cf-composer-callout-icon"
              style={syncProviderBrief ? { '--callout-tint': syncProviderBrief.color } as CSSProperties : undefined}
              aria-hidden="true"
            >
              <Cloud size={16} />
            </span>
            <div className="cf-composer-callout-copy">
              <strong>
                {t(
                  matchedConnections.length > 0
                    ? '已接入 {provider} 只读同步'
                    : '支持 {provider} 只读自动同步',
                  { provider: syncProviderLabel },
                )}
              </strong>
              <p>
                {t(
                  matchedConnections.length > 0
                    ? '无需逐个手填，可一键从已绑定的 {provider} 账号拉取最新域名、到期日与解析拓扑。'
                    : '无需逐个手填，通过 {provider} 只读鉴权一键批量导入名下托管域名、到期日与服务器关联。',
                  { provider: syncProviderLabel },
                )}
              </p>
            </div>
          </div>
          <Button
            size="small"
            onClick={() => onOpenProviderSync(syncProviderKey)}
            className="cf-sync-trigger-btn is-compact"
            icon={<Cloud size={13} />}
          >
            <span>{t('{provider} 同步', { provider: syncProviderLabel })}</span>
            {matchedConnections.length > 0 && (
              <span className={`cf-live-dot ${matchedHasError ? 'is-error' : ''}`} />
            )}
          </Button>
        </div>
      )}

      {/* Signature Strip: Live Domain Metadata + WHOIS Privacy Quick Pill */}
      <div className="sheet-signature-strip">
        <div className="domain-preview-strip">
          <div className="domain-preview-top">
            <div className="domain-preview-badges">
              <strong>{parsed.apex || 'craftstudio.io'}</strong>
              <span className="domain-preview-tld">{parsed.tld || '.IO'}</span>
              <span className="sheet-hero-caption">
                {parsed.isSubdomain ? t('子域名') : t('根域名')}
              </span>
              {parsed.isIdn && (
                <span className="sub-sheet-due-badge is-warm">{t('国际化域名')}</span>
              )}
            </div>

            <Form.Item name="whoisPrivacy" valuePropName="checked" hidden><Switch /></Form.Item>
            <button
              type="button"
              aria-pressed={watchedWhois}
              className={`domain-whois-toggle-pill ${watchedWhois ? 'is-on' : ''}`}
              onClick={() => form.setFieldValue('whoisPrivacy', !watchedWhois)}
            >
              <ShieldCheck size={12.5} />
              <span>{t(watchedWhois ? 'WHOIS 隐私已开' : 'WHOIS 隐私未开')}</span>
            </button>
          </div>
          <div className="domain-preview-sub">
            {parsed.clean ? `FQDN · ${parsed.clean}` : 'FQDN · craftstudio.io'}
          </div>
        </div>
      </div>

      <div className="sub-sheet-divider" />

      {/* Calm Frameless Property Rows */}
      <div className="sub-sheet-rows">
        {/* 1. Registrar & DNS Provider */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <Globe size={16} strokeWidth={1.75} />
            <span>{t('注册商与解析')}</span>
          </span>
          <div className="sub-sheet-control domain-dual-inline-inputs">
            <Form.Item name="registrar" noStyle>
              <Input
                variant="borderless"
                aria-label={t('域名注册商')}
                placeholder={t('注册商 (如 Cloudflare)')}
                maxLength={120}
                className="sub-sheet-extra-input text-right"
              />
            </Form.Item>
            <span className="sheet-hero-caption">/</span>
            <Form.Item name="dnsProvider" noStyle>
              <Input
                variant="borderless"
                aria-label={t('权威 DNS 托管')}
                placeholder={t('DNS 托管 (如 CF DNS)')}
                maxLength={120}
                className="sub-sheet-extra-input text-right"
              />
            </Form.Item>
          </div>
        </div>

        {/* 2. Domain Purpose */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <Layers size={16} strokeWidth={1.75} />
            <span>{t('域名用途')}</span>
          </span>
          <div className="sub-sheet-control">
            <Form.Item name="purpose" hidden><Input /></Form.Item>
            <Dropdown
              trigger={['click']}
              menu={{
                selectedKeys: [watchedPurpose],
                items: (Object.keys(domainPurposeMeta) as DomainPurpose[]).map(key => ({
                  key,
                  label: t(domainPurposeMeta[key].label),
                })),
                onClick: ({ key }) => form.setFieldValue('purpose', key as DomainPurpose),
              }}
            >
              <button
                type="button"
                aria-label={t('域名用途')}
                className="sub-sheet-value-btn"
              >
                <span>{t(domainPurposeMeta[watchedPurpose].label)}</span>
                <ChevronDown size={14} className="sub-sheet-chevron" />
              </button>
            </Dropdown>
          </div>
        </div>

        {/* 3. Expiry & Billing */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <Wallet size={16} strokeWidth={1.75} />
            <span>{t('续费账单')}</span>
          </span>
          <div className="sub-sheet-control">
            <Form.Item name="billingMode" hidden><Input /></Form.Item>
            <Form.Item name="expireDate" hidden><Input /></Form.Item>
            <Form.Item name="autoRenew" valuePropName="checked" hidden><Switch /></Form.Item>
            <Form.Item name="subscriptionId" hidden><Input /></Form.Item>
            <Form.Item name="subCurrency" hidden><Input /></Form.Item>
            <Form.Item name="subAmount" hidden><InputNumber /></Form.Item>
            <Form.Item name="subCycle" hidden><Input /></Form.Item>
            <Form.Item name="subDueDate" hidden><Input /></Form.Item>
            <Form.Item name="subRenewalMode" hidden><Input /></Form.Item>
            <Form.Item name="subIntention" hidden><Input /></Form.Item>

            <Popover
              trigger="click"
              open={billingPopoverOpen}
              onOpenChange={setBillingPopoverOpen}
              placement="bottomRight"
              arrow={false}
              rootClassName="sheet-detail-popover"
              content={(
                <div className="sheet-detail-panel" style={{ width: 320 }}>
                  <div className="sheet-detail-field">
                    <label>{t('计费管理方式')}</label>
                    <div className="sheet-chip-row">
                      {([
                        { key: 'none', label: '独立到期日' },
                        { key: 'link', label: '关联已有订阅' },
                        { key: 'create', label: '同步新建订阅' },
                      ] as const).map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          className={`sheet-mini-chip ${watchedBillingMode === opt.key ? 'is-active' : ''}`}
                          onClick={() => form.setFieldValue('billingMode', opt.key)}
                        >
                          {t(opt.label)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {watchedBillingMode === 'none' && (
                    <>
                      <div className="sheet-detail-field">
                        <label>{t('域名到期日')}</label>
                        <DatePicker
                          size="small"
                          value={watchedExpireDate}
                          onChange={d => form.setFieldValue('expireDate', d ?? undefined)}
                          className="w-full"
                        />
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[12.5px] text-[var(--muted)]">{t('注册商自动续费')}</span>
                        <Switch
                          size="small"
                          checked={watchedAutoRenew}
                          onChange={checked => form.setFieldValue('autoRenew', checked)}
                        />
                      </div>
                    </>
                  )}

                  {watchedBillingMode === 'link' && (
                    <div className="sheet-detail-field">
                      <label>{t('选择关联订阅')}</label>
                      <Select
                        size="small"
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder={t('搜索或选择订阅账单')}
                        value={watchedSubscriptionId || undefined}
                        options={subscriptions.map(sub => ({
                          value: sub.id,
                          label: `${sub.name} (${sub.currency} ${(sub.amountMinor / 100).toFixed(2)} · ${sub.dueDate})`,
                        }))}
                        onChange={val => form.setFieldValue('subscriptionId', val ?? '')}
                        className="w-full"
                      />
                    </div>
                  )}

                  {watchedBillingMode === 'create' && (
                    <>
                      <div className="sheet-detail-grid">
                        <div className="sheet-detail-field">
                          <label>{t('币种')}</label>
                          <Select
                            size="small"
                            value={watchedSubCurrency}
                            options={currencies.map(c => ({ value: c, label: c }))}
                            onChange={val => form.setFieldValue('subCurrency', val)}
                          />
                        </div>
                        <div className="sheet-detail-field">
                          <label>{t('续费金额')}</label>
                          <InputNumber
                            size="small"
                            min={0}
                            precision={2}
                            value={watchedSubAmount}
                            onChange={val => form.setFieldValue('subAmount', val ?? 0)}
                            className="w-full"
                          />
                        </div>
                      </div>
                      <div className="sheet-detail-grid">
                        <div className="sheet-detail-field">
                          <label>{t('续费周期')}</label>
                          <Select
                            size="small"
                            value={watchedSubCycle}
                            options={Object.entries(cycles).map(([k, lbl]) => ({ value: k, label: t(lbl) }))}
                            onChange={val => form.setFieldValue('subCycle', val)}
                          />
                        </div>
                        <div className="sheet-detail-field">
                          <label>{t('下次续费日')}</label>
                          <DatePicker
                            size="small"
                            allowClear={false}
                            value={watchedSubDueDate}
                            onChange={d => form.setFieldValue('subDueDate', d ?? dayjs())}
                            className="w-full"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[12.5px] text-[var(--muted)]">{t('自动扣款续费')}</span>
                        <Switch
                          size="small"
                          checked={watchedSubRenewalMode === 'auto'}
                          onChange={checked => form.setFieldValue('subRenewalMode', checked ? 'auto' : 'manual')}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            >
              <button
                type="button"
                aria-label={t('续费账单')}
                className="sub-sheet-value-btn"
              >
                <span>{billingSummary}</span>
                {watchedBillingMode !== 'none' && (
                  <span className="sub-sheet-due-badge is-warm">
                    {watchedBillingMode === 'link' ? t('关联已有订阅') : t('同步新建订阅')}
                  </span>
                )}
                <ChevronDown size={14} className="sub-sheet-chevron" />
              </button>
            </Popover>
          </div>
        </div>

        {/* 4. Registrar Account */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <UserRound size={16} strokeWidth={1.75} />
            <span>{t('注册商账号')}</span>
          </span>
          <div className="sub-sheet-control">
            <Form.Item name="registrarAccountId" noStyle>
              <AccountQuickDropdown
                kind="primary"
                accounts={accounts}
                presetKey={inferredPreset?.accountPresetKey ?? 'cloudflare_account'}
                subName={watchedRegistrar || parsed.apex || 'Cloudflare'}
                subCategory="cloud"
                initialIncludeId={initialAccountId}
                disabled={submitting}
              />
            </Form.Item>
          </div>
        </div>

        {/* 5. Edit-only Status & Archive */}
        {isEditing && (
          <>
            <div className="sub-sheet-row">
              <span className="sub-sheet-label">
                <Activity size={16} strokeWidth={1.75} />
                <span>{t('域名状态')}</span>
              </span>
              <div className="sub-sheet-control">
                <Form.Item name="status" hidden><Input /></Form.Item>
                <Dropdown
                  trigger={['click']}
                  menu={{
                    selectedKeys: [watchedStatus],
                    items: (Object.keys(domainStatusMeta) as DomainStatus[]).map(key => ({
                      key,
                      label: t(domainStatusMeta[key].label),
                    })),
                    onClick: ({ key }) => form.setFieldValue('status', key as DomainStatus),
                  }}
                >
                  <button type="button" aria-label={t('当前状态')} className="sub-sheet-value-btn">
                    <span>{t(domainStatusMeta[watchedStatus].label)}</span>
                    <ChevronDown size={14} className="sub-sheet-chevron" />
                  </button>
                </Dropdown>
              </div>
            </div>

            <div className="sub-sheet-row">
              <span className="sub-sheet-label">
                <Archive size={16} strokeWidth={1.75} />
                <span>{t('归档此域名')}</span>
              </span>
              <div className="sub-sheet-control">
                <Form.Item name="archived" valuePropName="checked" noStyle>
                  <Switch
                    size="small"
                    aria-label={t('已停用归档')}
                    checkedChildren={<Check size={11} />}
                  />
                </Form.Item>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Expandable Progressive Extras */}
      {anyExtraOpen && (
        <div className="sub-sheet-extras">
          {isExtraVisible('topology') && (
            <>
              <div className="sub-sheet-row sub-sheet-extra-row">
                <span className="sub-sheet-label">
                  <Network size={15} strokeWidth={1.75} />
                  <span>{t('承载服务器')}</span>
                </span>
                <div className="sub-sheet-control sub-sheet-control-wide">
                  <Form.Item name="serverIds" className="sub-sheet-inline-form-item">
                    <Select
                      mode="multiple"
                      size="small"
                      variant="borderless"
                      maxTagCount="responsive"
                      placeholder={t('关联解析指向的服务器')}
                      options={servers.map(srv => ({
                        value: srv.id,
                        label: `${srv.name} (${srv.ipv4 || srv.region})`,
                      }))}
                    />
                  </Form.Item>
                  <button
                    type="button"
                    aria-label={t('收起此项')}
                    className="sub-sheet-extra-remove"
                    onClick={() => {
                      form.setFieldsValue({ serverIds: [], ipIds: [] });
                      toggleExtra('topology');
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              <div className="sub-sheet-row sub-sheet-extra-row">
                <span className="sub-sheet-label">
                  <Globe size={15} strokeWidth={1.75} />
                  <span>{t('解析节点')}</span>
                </span>
                <div className="sub-sheet-control sub-sheet-control-wide">
                  <Form.Item name="ipIds" className="sub-sheet-inline-form-item">
                    <Select
                      mode="multiple"
                      size="small"
                      variant="borderless"
                      maxTagCount="responsive"
                      placeholder={t('关联绑定的 IP 节点')}
                      options={ips.map(ip => ({
                        value: ip.id,
                        label: `${ipDisplayTitle(ip)} (${ip.address})`,
                      }))}
                    />
                  </Form.Item>
                </div>
              </div>
            </>
          )}

          {isExtraVisible('icp') && (
            <div className="sub-sheet-row sub-sheet-extra-row">
              <span className="sub-sheet-label">
                <FileBadge2 size={15} strokeWidth={1.75} />
                <span>{t('ICP 备案')}</span>
              </span>
              <div className="sub-sheet-control sub-sheet-control-wide">
                <Form.Item name="icpStatus" noStyle>
                  <Select
                    size="small"
                    variant="borderless"
                    aria-label={t('ICP 备案状态')}
                    style={{ width: 148 }}
                    options={(Object.keys(domainIcpMeta) as DomainIcpStatus[]).map(k => ({
                      value: k,
                      label: t(domainIcpMeta[k].short),
                    }))}
                  />
                </Form.Item>
                {watchedIcpStatus !== 'none' && (
                  <Form.Item name="icpNumber" noStyle>
                    <Input
                      variant="borderless"
                      aria-label={t('ICP 备案号')}
                      placeholder={t('如 京ICP备20260001号-1')}
                      maxLength={80}
                      className="sub-sheet-extra-input"
                    />
                  </Form.Item>
                )}
                <button
                  type="button"
                  aria-label={t('收起此项')}
                  className="sub-sheet-extra-remove"
                  onClick={() => {
                    form.setFieldsValue({ icpStatus: 'none', icpNumber: '' });
                    toggleExtra('icp');
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {isExtraVisible('consoleUrl') && (
            <div className="sub-sheet-row sub-sheet-extra-row">
              <span className="sub-sheet-label">
                <Link2 size={15} strokeWidth={1.75} />
                <span>{t('控制台网址')}</span>
              </span>
              <div className="sub-sheet-control sub-sheet-control-wide">
                <Form.Item
                  name="managementUrl"
                  className="sub-sheet-inline-form-item"
                  rules={[{ type: 'url', message: t('请输入有效的 HTTP 或 HTTPS 网址') }]}
                >
                  <Input
                    variant="borderless"
                    aria-label={t('控制台网址')}
                    placeholder="https://dash.cloudflare.com"
                    maxLength={2000}
                    className="sub-sheet-extra-input"
                  />
                </Form.Item>
                <button
                  type="button"
                  aria-label={t('收起此项')}
                  className="sub-sheet-extra-remove"
                  onClick={() => {
                    form.setFieldValue('managementUrl', '');
                    toggleExtra('consoleUrl');
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {isExtraVisible('tags') && (
            <div className="sub-sheet-row sub-sheet-extra-row">
              <span className="sub-sheet-label">
                <Tag size={15} strokeWidth={1.75} />
                <span>{t('标签')}</span>
              </span>
              <div className="sub-sheet-control sub-sheet-control-wide">
                <Form.Item name="tags" className="sub-sheet-inline-form-item">
                  <Select
                    mode="tags"
                    size="small"
                    variant="borderless"
                    maxTagCount="responsive"
                    placeholder={t('输入或选择标签')}
                    options={domainTagPresets.map(tag => ({ value: tag, label: tag }))}
                  />
                </Form.Item>
                <button
                  type="button"
                  aria-label={t('收起此项')}
                  className="sub-sheet-extra-remove"
                  onClick={() => {
                    form.setFieldValue('tags', []);
                    toggleExtra('tags');
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {isExtraVisible('notes') && (
            <div className="sub-sheet-row sub-sheet-extra-row">
              <span className="sub-sheet-label">
                <FileText size={15} strokeWidth={1.75} />
                <span>{t('备注')}</span>
              </span>
              <div className="sub-sheet-control sub-sheet-control-wide">
                <Form.Item
                  name="notes"
                  noStyle
                  rules={[{ max: 2000, message: t('备注不能超过 2000 个字符') }]}
                >
                  <Input
                    variant="borderless"
                    aria-label={t('备注')}
                    placeholder={t('备注说明')}
                    maxLength={2000}
                    className="sub-sheet-extra-input"
                  />
                </Form.Item>
                <button
                  type="button"
                  aria-label={t('收起此项')}
                  className="sub-sheet-extra-remove"
                  onClick={() => {
                    form.setFieldValue('notes', '');
                    toggleExtra('notes');
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quiet Footer */}
      <div className="sub-sheet-footer">
        <div className="sub-sheet-footer-links">
          <button
            type="button"
            className={`sub-sheet-footer-link ${isExtraVisible('topology') ? 'is-active' : ''}`}
            onClick={() => toggleExtra('topology')}
          >
            <span>{t('解析拓扑')}</span>
            {(watchedServerIds.length > 0 || watchedIpIds.length > 0) && !isExtraVisible('topology') && (
              <i className="sub-sheet-footer-dot" />
            )}
          </button>

          <button
            type="button"
            className={`sub-sheet-footer-link ${isExtraVisible('icp') ? 'is-active' : ''}`}
            onClick={() => toggleExtra('icp')}
          >
            <span>{t('ICP 备案')}</span>
            {(watchedIcpStatus !== 'none' || Boolean(watchedIcpNumber.trim())) && !isExtraVisible('icp') && (
              <i className="sub-sheet-footer-dot" />
            )}
          </button>

          <button
            type="button"
            className={`sub-sheet-footer-link ${isExtraVisible('consoleUrl') ? 'is-active' : ''}`}
            onClick={() => toggleExtra('consoleUrl')}
          >
            <span>{t('控制台网址')}</span>
            {Boolean(watchedManagementUrl.trim()) && !isExtraVisible('consoleUrl') && (
              <i className="sub-sheet-footer-dot" />
            )}
          </button>

          <button
            type="button"
            className={`sub-sheet-footer-link ${isExtraVisible('tags') ? 'is-active' : ''}`}
            onClick={() => toggleExtra('tags')}
          >
            <span>{t('标签')}</span>
            {watchedTags.length > 0 && !isExtraVisible('tags') && (
              <i className="sub-sheet-footer-dot" />
            )}
          </button>

          <button
            type="button"
            className={`sub-sheet-footer-link ${isExtraVisible('notes') ? 'is-active' : ''}`}
            onClick={() => toggleExtra('notes')}
          >
            <span>{t('备注说明')}</span>
            {Boolean(watchedNotes.trim()) && !isExtraVisible('notes') && (
              <i className="sub-sheet-footer-dot" />
            )}
          </button>
        </div>

        <div className="sub-sheet-footer-actions">
          <button
            type="button"
            disabled={submitting}
            className="sub-sheet-cancel-btn"
            onClick={onCancel}
          >
            {t('取消')}
          </button>
          <Button
            type="primary"
            htmlType="submit"
            loading={submitting}
            className="sub-sheet-save-btn"
          >
            {t('保存域名')}
          </Button>
        </div>
      </div>
    </div>
  );
}
