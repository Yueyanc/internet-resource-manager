import {
  type Account,
  currencies,
  type Domain,
  type IpNode,
  type ProviderConnection,
  type ServerInput,
  type Subscription,
  type SubscriptionInput,
} from '@irm/api-client';
import {
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
  Box,
  Check,
  ChevronDown,
  Cloud,
  FileText,
  Globe,
  Link2,
  MapPin,
  Network,
  Search,
  Sparkles,
  Tag,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { type CSSProperties, useMemo, useState } from 'react';

import type { MessageKey } from '../../../app/messages';
import { usePreferences } from '../../../app/preferences-context';
import {
  type CloudSyncProviderKey,
  PROVIDER_BRIEFS,
  resolveServerSyncProvider,
} from '../../integrations/provider-matching';
import { ipDisplayTitle } from '../../ips/utils/ip-metrics';
import { AccountQuickDropdown } from '../../subscriptions/components/subscription-account-fields';
import { cycles } from '../../subscriptions/utils/subscription-metrics';
import {
  filterServerPresets,
  findServerPreset,
  osPresets,
  resolveServerPreset,
  type ServerPreset,
  type ServerPresetGroup,
  serverPresetGroups,
  type ServerPresetPlan,
  serverRegionPresets,
  serverTagPresets,
} from '../presets/server-presets';
import {
  extractUserAndPortFromEndpoint,
  formatDisk,
  formatTrafficQuota,
  parseSmartEndpoint,
  serverKindMeta,
} from '../utils/server-metrics';
import { ServerMark } from './server-mark';

export type ServerBillingMode = 'none' | 'link' | 'create';
export type ServerExtraKey = 'network' | 'consoleUrl' | 'tags' | 'notes';

const ramQuickSizes = [512, 1024, 2048, 4096, 8192, 16384, 32768] as const;
const cpuQuickCores = [1, 2, 4, 8, 12, 16, 32] as const;
const diskQuickSizes = [20, 40, 80, 160, 320, 512, 1000] as const;
const trafficQuickQuotas = [500, 1024, 2048, 4096, 10240] as const;

const currencySymbols: Record<SubscriptionInput['currency'], string> = {
  CNY: '¥',
  USD: 'US$',
  HKD: 'HK$',
  EUR: '€',
  GBP: '£',
  JPY: 'JP¥',
};

function formatCompactMemory(memoryMb: number): string {
  if (memoryMb <= 0) return '0 GB';
  if (memoryMb >= 1024) {
    const gb = memoryMb / 1024;
    return Number.isInteger(gb) ? `${gb} GB` : `${Number(gb.toFixed(1))} GB`;
  }
  return `${memoryMb} MB`;
}

function ServerPresetPopover({
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
  onSelectPreset: (preset: ServerPreset) => void;
  onClearPreset: () => void;
  children: React.ReactNode;
}) {
  const { t, locale } = usePreferences();
  const [group, setGroup] = useState<ServerPresetGroup>('popular');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => filterServerPresets(query, group), [query, group]);

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
              aria-label={t('搜索云厂商或设备预设')}
              prefix={<Search size={14} className="text-gray-400" />}
              placeholder={t('搜索预设，如 DMIT、搬瓦工、AWS、阿里云、群晖...')}
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </div>

          {!query.trim() && (
            <div className="preset-popover-tabs" role="tablist">
              {serverPresetGroups.map(item => (
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
              const displayName = locale === 'en-US' ? preset.provider.en : preset.provider.zh;
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
                  <ServerMark preset={preset} size="sm" />
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

export function ServerPropertySheet({
  form,
  presetKey,
  planId,
  onSelectPreset,
  onSelectPlan,
  onClearPreset,
  subscriptions,
  accounts,
  domains,
  ips,
  providerConnections = [],
  onOpenProviderSync,
  isEditing,
  initialAccountId,
  initialOpenExtras,
  submitting,
  onCancel,
}: {
  form: FormInstance;
  presetKey: string;
  planId?: string;
  onSelectPreset: (preset: ServerPreset) => void;
  onSelectPlan?: (plan: ServerPresetPlan) => void;
  onClearPreset: () => void;
  subscriptions: Subscription[];
  accounts: Account[];
  domains: Domain[];
  ips: IpNode[];
  providerConnections?: ProviderConnection[];
  onOpenProviderSync?: (provider: CloudSyncProviderKey) => void;
  isEditing?: boolean;
  initialAccountId?: string;
  initialOpenExtras?: ServerExtraKey[];
  submitting?: boolean;
  onCancel: () => void;
}) {
  const { t, locale } = usePreferences();
  const [presetOpen, setPresetOpen] = useState(false);
  const [openExtras, setOpenExtras] = useState<ServerExtraKey[]>(() => initialOpenExtras ?? []);

  const watchedName = (Form.useWatch('name') as string | undefined) ?? '';
  const watchedProvider = (Form.useWatch('provider') as string | undefined) ?? '';
  const watchedKind = (Form.useWatch('kind') as ServerInput['kind'] | undefined) ?? 'vps';
  const watchedStatus = (Form.useWatch('status') as ServerInput['status'] | undefined) ?? 'active';
  const watchedRegion = (Form.useWatch('region') as string | undefined) ?? 'HK';
  const watchedDatacenter = (Form.useWatch('datacenter') as string | undefined) ?? '';
  const watchedOs = (Form.useWatch('os') as string | undefined) ?? 'Debian 12';
  const watchedArch = (Form.useWatch('arch') as ServerInput['arch'] | undefined) ?? 'amd64';
  const watchedCpu = (Form.useWatch('cpuCores') as number | undefined) ?? 2;
  const watchedMemory = (Form.useWatch('memoryMb') as number | undefined) ?? 2048;
  const watchedDisk = (Form.useWatch('diskGb') as number | undefined) ?? 40;
  const watchedDiskType = (Form.useWatch('diskType') as ServerInput['diskType'] | undefined) ?? 'nvme';
  const watchedTrafficGb = (Form.useWatch('trafficGb') as number | undefined) ?? 1000;
  const watchedTrafficRule = (Form.useWatch('trafficRule') as ServerInput['trafficRule'] | undefined) ?? 'both';
  const watchedIpv4 = (Form.useWatch('ipv4') as string | undefined) ?? '';
  const watchedIpv6 = (Form.useWatch('ipv6') as string | undefined) ?? '';
  const watchedPrivateIp = (Form.useWatch('privateIp') as string | undefined) ?? '';
  const watchedHostname = (Form.useWatch('hostname') as string | undefined) ?? '';
  const watchedConsoleUrl = (Form.useWatch('consoleUrl') as string | undefined) ?? '';
  const watchedDomainIds = Form.useWatch('domainIds') as string[] | undefined;
  const watchedIpIds = Form.useWatch('ipIds') as string[] | undefined;
  const watchedTags = Form.useWatch('tags') as string[] | undefined;
  const watchedNotes = (Form.useWatch('notes') as string | undefined) ?? '';
  const watchedBillingMode = (Form.useWatch('billingMode') as ServerBillingMode | undefined) ?? 'none';
  const watchedSubscriptionId = (Form.useWatch('subscriptionId') as string | undefined) ?? '';
  const watchedExpireDate = Form.useWatch('expireDate') as Dayjs | undefined;
  const watchedSubAmount = (Form.useWatch('subAmount') as number | undefined) ?? 0;
  const watchedSubCurrency = (Form.useWatch('subCurrency') as SubscriptionInput['currency'] | undefined) ?? 'USD';
  const watchedSubCycle = (Form.useWatch('subCycle') as SubscriptionInput['cycle'] | undefined) ?? 'yearly';

  const explicitPreset = findServerPreset(presetKey);
  const activePreset = explicitPreset ?? resolveServerPreset({ presetKey, provider: watchedProvider, name: watchedName });
  const kindMeta = serverKindMeta[watchedKind];

  const syncProviderKey = useMemo(
    () => resolveServerSyncProvider({
      presetKey: presetKey || activePreset?.key,
      provider: watchedProvider,
    }),
    [presetKey, activePreset?.key, watchedProvider],
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

  const regionDisplay = useMemo(() => {
    const clean = watchedRegion.trim().toUpperCase() || 'HK';
    const found = serverRegionPresets.find(r => r.code === clean);
    const base = found
      ? (locale === 'en-US' ? found.en : found.zh.replace(/\s*\([A-Z]+\)$/, ''))
      : clean;
    return watchedDatacenter.trim() ? `${base} · ${watchedDatacenter.trim()}` : base;
  }, [watchedRegion, watchedDatacenter, locale]);

  const linkedSub = useMemo(
    () => (watchedSubscriptionId ? subscriptions.find(s => s.id === watchedSubscriptionId) : undefined),
    [subscriptions, watchedSubscriptionId],
  );

  const billingSummary = useMemo(() => {
    if (watchedBillingMode === 'link') {
      if (linkedSub) {
        return `${currencySymbols[linkedSub.currency]} ${(linkedSub.amountMinor / 100).toFixed(linkedSub.amountMinor % 100 === 0 ? 0 : 2)} · ${linkedSub.name}`;
      }
      return t('关联已有订阅');
    }
    if (watchedBillingMode === 'create') {
      return `${currencySymbols[watchedSubCurrency]} ${watchedSubAmount || 0} / ${t(cycles[watchedSubCycle])}`;
    }
    if (watchedExpireDate) {
      return watchedExpireDate.format('YYYY-MM-DD');
    }
    return t('不关联账单');
  }, [watchedBillingMode, linkedSub, watchedSubCurrency, watchedSubAmount, watchedSubCycle, watchedExpireDate, t]);

  const diskSummary = formatDisk(watchedDisk, watchedDiskType).replace('GiB', 'GB').replace('TiB', 'TB') || `${watchedDisk || 0} GB`;
  const trafficSummary = watchedTrafficRule === 'unlimited'
    ? t('不限流量')
    : `${formatTrafficQuota(watchedTrafficGb) || `${watchedTrafficGb || 0} GB`} ${watchedTrafficRule === 'out_only' ? t('单向出站') : t('双向')}`;

  const isExtraVisible = (key: ServerExtraKey) => openExtras.includes(key);
  const toggleExtra = (key: ServerExtraKey) => {
    setOpenExtras(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };

  const toggleTag = (tagText: string) => {
    const current = watchedTags ?? [];
    const next = current.includes(tagText)
      ? current.filter(item => item !== tagText)
      : [...current, tagText];
    form.setFieldValue('tags', next);
  };

  const extraFooterLinks: { key: ServerExtraKey; label: string; hasValue: boolean }[] = [
    {
      key: 'network',
      label: t('IPv6 / 内网'),
      hasValue: Boolean(watchedIpv6.trim() || watchedPrivateIp.trim() || watchedHostname.trim()),
    },
    {
      key: 'consoleUrl',
      label: t('控制台网址'),
      hasValue: Boolean(watchedConsoleUrl.trim() || (watchedDomainIds?.length ?? 0) > 0 || (watchedIpIds?.length ?? 0) > 0),
    },
    {
      key: 'tags',
      label: t('标签'),
      hasValue: (watchedTags?.length ?? 0) > 0,
    },
    {
      key: 'notes',
      label: t('备注'),
      hasValue: Boolean(watchedNotes.trim()),
    },
  ];

  const anyExtraOpen = extraFooterLinks.some(item => isExtraVisible(item.key));

  return (
    <div className="sub-sheet">
      {/* Hidden backing fields */}
      <Form.Item name="provider" hidden><Input /></Form.Item>
      <Form.Item name="kind" hidden><Input /></Form.Item>
      <Form.Item name="status" hidden><Input /></Form.Item>
      <Form.Item name="region" hidden><Input /></Form.Item>
      <Form.Item name="datacenter" hidden><Input /></Form.Item>
      <Form.Item name="os" hidden><Input /></Form.Item>
      <Form.Item name="arch" hidden><Input /></Form.Item>
      <Form.Item name="cpuCores" hidden><InputNumber /></Form.Item>
      <Form.Item name="memoryMb" hidden><InputNumber /></Form.Item>
      <Form.Item name="diskGb" hidden><InputNumber /></Form.Item>
      <Form.Item name="diskType" hidden><Input /></Form.Item>
      <Form.Item name="bandwidthMbps" hidden><InputNumber /></Form.Item>
      <Form.Item name="trafficGb" hidden><InputNumber /></Form.Item>
      <Form.Item name="trafficRule" hidden><Input /></Form.Item>
      <Form.Item name="trafficResetDay" hidden><InputNumber /></Form.Item>
      <Form.Item name="billingMode" hidden><Input /></Form.Item>
      <Form.Item name="subscriptionId" hidden><Input /></Form.Item>
      <Form.Item name="expireDate" hidden><DatePicker /></Form.Item>
      <Form.Item name="subName" hidden><Input /></Form.Item>
      <Form.Item name="subAmount" hidden><InputNumber /></Form.Item>
      <Form.Item name="subCurrency" hidden><Input /></Form.Item>
      <Form.Item name="subCycle" hidden><Input /></Form.Item>
      <Form.Item name="subIntervalDays" hidden><InputNumber /></Form.Item>
      <Form.Item name="subDueDate" hidden><DatePicker /></Form.Item>
      <Form.Item name="subRenewalMode" hidden><Input /></Form.Item>
      <Form.Item name="subIntention" hidden><Input /></Form.Item>
      <Form.Item name="subPaymentMethod" hidden><Input /></Form.Item>
      <Form.Item name="tags" hidden><Select mode="multiple" /></Form.Item>
      <Form.Item name="domainIds" hidden><Select mode="multiple" /></Form.Item>
      <Form.Item name="ipIds" hidden><Select mode="multiple" /></Form.Item>

      {/* Hero: Server Identity + SSH Endpoint */}
      <div className="sub-sheet-hero">
        <div className="sub-sheet-identity">
          <ServerPresetPopover
            open={presetOpen}
            onOpenChange={setPresetOpen}
            presetKey={presetKey}
            onSelectPreset={onSelectPreset}
            onClearPreset={onClearPreset}
          >
            <button
              type="button"
              aria-label={t('更换图标')}
              className="sub-sheet-mark-btn"
            >
              <ServerMark
                preset={activePreset}
                value={activePreset ? undefined : { presetKey: '', provider: watchedProvider, name: watchedName || '?', kind: watchedKind }}
                size="lg"
              />
            </button>
          </ServerPresetPopover>

          <div className="sub-sheet-title-col">
            <Form.Item
              name="name"
              className="sub-sheet-name-item"
              rules={[
                { required: true, whitespace: true, message: t('请输入服务器名称') },
                { max: 100, message: t('最多 100 个字符') },
              ]}
            >
              <Input
                variant="borderless"
                aria-label={t('服务器名称')}
                placeholder="Tokyo-Edge-01"
                maxLength={100}
                autoComplete="off"
                className="sub-sheet-title-input"
              />
            </Form.Item>

            <div className="sub-sheet-subtitle-row">
              <button
                type="button"
                className="sub-sheet-preset-link"
                onClick={() => setPresetOpen(true)}
              >
                {watchedProvider.trim()
                  ? `${t('点击更换云厂商预设')} · ${watchedProvider.trim()}`
                  : t('点击更换云厂商预设')}
              </button>

              {activePreset && (activePreset.plans?.length ?? 0) > 0 && onSelectPlan && (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    selectedKeys: planId ? [planId] : [],
                    items: (activePreset.plans ?? []).map(plan => ({
                      key: plan.id,
                      label: locale === 'en-US' ? plan.label.en : plan.label.zh,
                      onClick: () => onSelectPlan(plan),
                    })),
                  }}
                >
                  <button type="button" className="sub-sheet-plan-switch">
                    <span>{t('切换套餐')}</span>
                    <ChevronDown size={12} />
                  </button>
                </Dropdown>
              )}
            </div>
          </div>
        </div>

        <div className="sheet-hero-right">
          {!isEditing
            ? (
                <Form.Item name="smartEndpoint" className="sheet-hero-mono-item">
                  <Input
                    variant="borderless"
                    aria-label={t('连接端点')}
                    placeholder="root@45.76.210.18:22"
                    maxLength={255}
                    autoComplete="off"
                    className="sheet-hero-mono-input"
                    onBlur={(e) => {
                      const raw = e.target.value;
                      const extracted = extractUserAndPortFromEndpoint(raw);
                      if (extracted.sshUser) form.setFieldValue('sshUser', extracted.sshUser);
                      if (extracted.sshPort) form.setFieldValue('sshPort', extracted.sshPort);
                      const parsed = parseSmartEndpoint(raw);
                      if (parsed.ipv4 && !watchedIpv4) form.setFieldValue('ipv4', parsed.ipv4);
                    }}
                  />
                </Form.Item>
              )
            : (
                <Form.Item name="ipv4" className="sheet-hero-mono-item">
                  <Input
                    variant="borderless"
                    aria-label={t('连接端点')}
                    placeholder="45.76.210.18"
                    maxLength={100}
                    autoComplete="off"
                    className="sheet-hero-mono-input"
                  />
                </Form.Item>
              )}

          <Dropdown
            trigger={['click']}
            menu={{
              selectedKeys: [watchedKind],
              items: Object.entries(serverKindMeta).map(([key, item]) => ({
                key,
                label: t(item.label),
              })),
              onClick: ({ key }) => form.setFieldValue('kind', key),
            }}
          >
            <button
              type="button"
              aria-label={t('服务器类型')}
              className="sub-sheet-plan-switch"
            >
              <i className="sub-cat-dot" style={{ backgroundColor: kindMeta.color }} />
              <span>{t(kindMeta.label)}</span>
              <ChevronDown size={12} />
            </button>
          </Dropdown>
        </div>
      </div>

      {!isEditing && onOpenProviderSync && syncProviderKey && (
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
                    ? '无需逐台手填，可一键从已绑定的 {provider} 账号同步实例规格、IP 地址与官方流量配额。'
                    : '无需逐台手填，通过 {provider} 只读鉴权一键批量导入名下实例规格、公私网 IP 与流量周期。',
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

      {/* Signature Strip: 4-Cell Hardware Spec Telemetry Bar */}
      <div className="sheet-signature-strip server-spec-strip">
        {/* Cell 1: CPU */}
        <div className="server-spec-cell-wrap">
          <Popover
            trigger="click"
            placement="bottomLeft"
            arrow={false}
            rootClassName="sheet-detail-popover"
            content={(
              <div className="sheet-detail-panel">
                <div className="sheet-detail-title">
                  <span>{t('处理器')}</span>
                  <span>vCPU</span>
                </div>
                <div className="sheet-detail-pills">
                  {cpuQuickCores.map(cores => (
                    <button
                      key={cores}
                      type="button"
                      className={`account-quick-pill ${watchedCpu === cores ? 'is-active' : ''}`}
                      onClick={() => form.setFieldValue('cpuCores', cores)}
                    >
                      {`${cores} vCPU`}
                    </button>
                  ))}
                </div>
                <div className="sheet-detail-field">
                  <InputNumber
                    size="small"
                    min={0}
                    max={1024}
                    precision={0}
                    value={watchedCpu}
                    onChange={val => form.setFieldValue('cpuCores', val ?? 0)}
                    className="w-full"
                  />
                </div>
              </div>
            )}
          >
            <button type="button" className="server-spec-cell">
              <span className="server-spec-label">{t('处理器')}</span>
              <strong className="server-spec-val">{`${watchedCpu || 0} vCPU`}</strong>
            </button>
          </Popover>
        </div>

        {/* Cell 2: Memory */}
        <div className="server-spec-cell-wrap">
          <Popover
            trigger="click"
            placement="bottom"
            arrow={false}
            rootClassName="sheet-detail-popover"
            content={(
              <div className="sheet-detail-panel">
                <div className="sheet-detail-title">
                  <span>{t('内存')}</span>
                  <span>MB</span>
                </div>
                <div className="sheet-detail-pills">
                  {ramQuickSizes.map(mb => (
                    <button
                      key={mb}
                      type="button"
                      className={`account-quick-pill ${watchedMemory === mb ? 'is-active' : ''}`}
                      onClick={() => form.setFieldValue('memoryMb', mb)}
                    >
                      {formatCompactMemory(mb)}
                    </button>
                  ))}
                </div>
                <div className="sheet-detail-field">
                  <InputNumber
                    size="small"
                    min={0}
                    max={1048576}
                    precision={0}
                    value={watchedMemory}
                    onChange={val => form.setFieldValue('memoryMb', val ?? 0)}
                    className="w-full"
                  />
                </div>
              </div>
            )}
          >
            <button type="button" className="server-spec-cell">
              <span className="server-spec-label">{t('内存')}</span>
              <strong className="server-spec-val">{formatCompactMemory(watchedMemory)}</strong>
            </button>
          </Popover>
        </div>

        {/* Cell 3: Storage */}
        <div className="server-spec-cell-wrap">
          <Popover
            trigger="click"
            placement="bottom"
            arrow={false}
            rootClassName="sheet-detail-popover"
            content={(
              <div className="sheet-detail-panel">
                <div className="sheet-detail-title">
                  <span>{t('存储')}</span>
                  <span>GB</span>
                </div>
                <div className="sheet-detail-pills">
                  {(['nvme', 'ssd', 'hdd'] as const).map(dtype => (
                    <button
                      key={dtype}
                      type="button"
                      className={`account-quick-pill ${watchedDiskType === dtype ? 'is-active' : ''}`}
                      onClick={() => form.setFieldValue('diskType', dtype)}
                    >
                      {dtype.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="sheet-detail-pills">
                  {diskQuickSizes.map(gb => (
                    <button
                      key={gb}
                      type="button"
                      className={`account-quick-pill ${watchedDisk === gb ? 'is-active' : ''}`}
                      onClick={() => form.setFieldValue('diskGb', gb)}
                    >
                      {`${gb} GB`}
                    </button>
                  ))}
                </div>
                <div className="sheet-detail-field">
                  <InputNumber
                    size="small"
                    min={0}
                    max={1000000}
                    precision={0}
                    value={watchedDisk}
                    onChange={val => form.setFieldValue('diskGb', val ?? 0)}
                    className="w-full"
                  />
                </div>
              </div>
            )}
          >
            <button type="button" className="server-spec-cell">
              <span className="server-spec-label">{t('存储')}</span>
              <strong className="server-spec-val">{diskSummary}</strong>
            </button>
          </Popover>
        </div>

        {/* Cell 4: Monthly Traffic */}
        <div className="server-spec-cell-wrap">
          <Popover
            trigger="click"
            placement="bottomRight"
            arrow={false}
            rootClassName="sheet-detail-popover"
            content={(
              <div className="sheet-detail-panel">
                <div className="sheet-detail-title">
                  <span>{t('月流量')}</span>
                  <span>GB / Mbps</span>
                </div>
                <div className="sheet-detail-pills">
                  {([
                    { key: 'both', label: t('双向') },
                    { key: 'out_only', label: t('单向出站') },
                    { key: 'unlimited', label: t('不限流量') },
                  ] as const).map(rule => (
                    <button
                      key={rule.key}
                      type="button"
                      className={`account-quick-pill ${watchedTrafficRule === rule.key ? 'is-active' : ''}`}
                      onClick={() => form.setFieldValue('trafficRule', rule.key)}
                    >
                      {rule.label}
                    </button>
                  ))}
                </div>
                {watchedTrafficRule !== 'unlimited' && (
                  <div className="sheet-detail-pills">
                    {trafficQuickQuotas.map(gb => (
                      <button
                        key={gb}
                        type="button"
                        className={`account-quick-pill ${watchedTrafficGb === gb ? 'is-active' : ''}`}
                        onClick={() => form.setFieldValue('trafficGb', gb)}
                      >
                        {formatTrafficQuota(gb)}
                      </button>
                    ))}
                  </div>
                )}
                <div className="sheet-detail-grid">
                  <div className="sheet-detail-field">
                    <label>{`${t('月流量')} (GB)`}</label>
                    <InputNumber
                      size="small"
                      min={0}
                      max={10000000}
                      precision={0}
                      disabled={watchedTrafficRule === 'unlimited'}
                      value={watchedTrafficGb}
                      onChange={val => form.setFieldValue('trafficGb', val ?? 0)}
                      className="w-full"
                    />
                  </div>
                  <div className="sheet-detail-field">
                    <label>Mbps</label>
                    <InputNumber
                      size="small"
                      min={0}
                      max={1000000}
                      precision={0}
                      value={form.getFieldValue('bandwidthMbps') as number | undefined}
                      onChange={val => form.setFieldValue('bandwidthMbps', val ?? 0)}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            )}
          >
            <button type="button" className="server-spec-cell">
              <span className="server-spec-label">{t('月流量')}</span>
              <strong className="server-spec-val">{trafficSummary}</strong>
            </button>
          </Popover>
        </div>
      </div>

      <div className="sub-sheet-divider" />

      {/* Frameless Property Rows */}
      <div className="sub-sheet-rows">
        {/* 1. Region & Datacenter */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <MapPin size={16} strokeWidth={1.75} />
            <span>{t('机房地区')}</span>
          </span>
          <div className="sub-sheet-control">
            <Popover
              trigger="click"
              placement="bottomRight"
              arrow={false}
              rootClassName="sheet-detail-popover"
              content={(
                <div className="sheet-detail-panel">
                  <div className="sheet-detail-field">
                    <label>{t('机房地区')}</label>
                    <Select
                      size="small"
                      showSearch
                      optionFilterProp="label"
                      value={watchedRegion}
                      options={serverRegionPresets.map(r => ({
                        value: r.code,
                        label: locale === 'en-US' ? r.en : r.zh,
                      }))}
                      onChange={val => form.setFieldValue('region', val)}
                    />
                  </div>
                  <div className="sheet-detail-grid">
                    <div className="sheet-detail-field">
                      <label>DC / Zone</label>
                      <Input
                        size="small"
                        placeholder="TYO / LAX"
                        value={watchedDatacenter}
                        maxLength={60}
                        onChange={e => form.setFieldValue('datacenter', e.target.value)}
                      />
                    </div>
                    <div className="sheet-detail-field">
                      <label>{t('服务商 / 品牌')}</label>
                      <Input
                        size="small"
                        placeholder="DMIT / AWS"
                        value={watchedProvider}
                        maxLength={100}
                        onChange={e => form.setFieldValue('provider', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            >
              <button
                type="button"
                aria-label={t('机房地区')}
                className="sub-sheet-value-btn"
              >
                <span>{regionDisplay}</span>
                <ChevronDown size={14} className="sub-sheet-chevron" />
              </button>
            </Popover>
          </div>
        </div>

        {/* 2. OS & Arch */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <Box size={16} strokeWidth={1.75} />
            <span>{t('系统镜像')}</span>
          </span>
          <div className="sub-sheet-control">
            <Popover
              trigger="click"
              placement="bottomRight"
              arrow={false}
              rootClassName="sheet-detail-popover"
              content={(
                <div className="sheet-detail-panel">
                  <div className="sheet-detail-pills">
                    {osPresets.map(osName => (
                      <button
                        key={osName}
                        type="button"
                        className={`account-quick-pill ${watchedOs === osName ? 'is-active' : ''}`}
                        onClick={() => form.setFieldValue('os', osName)}
                      >
                        {osName}
                      </button>
                    ))}
                  </div>
                  <div className="sheet-detail-grid">
                    <div className="sheet-detail-field">
                      <label>OS</label>
                      <Input
                        size="small"
                        value={watchedOs}
                        maxLength={100}
                        onChange={e => form.setFieldValue('os', e.target.value)}
                      />
                    </div>
                    <div className="sheet-detail-field">
                      <label>Arch</label>
                      <Select
                        size="small"
                        value={watchedArch}
                        options={[
                          { value: 'amd64', label: 'amd64 (x86_64)' },
                          { value: 'arm64', label: 'arm64 (aarch64)' },
                          { value: 'other', label: 'other' },
                        ]}
                        onChange={val => form.setFieldValue('arch', val)}
                      />
                    </div>
                  </div>
                </div>
              )}
            >
              <button
                type="button"
                aria-label={t('系统镜像')}
                className="sub-sheet-value-btn"
              >
                <span>{`${watchedOs || 'Linux'} · ${watchedArch}`}</span>
                <ChevronDown size={14} className="sub-sheet-chevron" />
              </button>
            </Popover>
          </div>
        </div>

        {/* 3. Billing & Renewal */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <Wallet size={16} strokeWidth={1.75} />
            <span>{t('续费账单')}</span>
          </span>
          <div className="sub-sheet-control">
            <Popover
              trigger="click"
              placement="bottomRight"
              arrow={false}
              rootClassName="sheet-detail-popover"
              content={(
                <div className="sheet-detail-panel">
                  <div className="sheet-detail-pills">
                    {([
                      { key: 'none', label: t('不关联账单') },
                      { key: 'link', label: t('关联已有订阅') },
                      { key: 'create', label: t('同步新建订阅') },
                    ] as const).map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        className={`account-quick-pill ${watchedBillingMode === opt.key ? 'is-active' : ''}`}
                        onClick={() => form.setFieldValue('billingMode', opt.key)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {watchedBillingMode === 'none' && (
                    <div className="sheet-detail-field">
                      <label>{t('下次扣款')}</label>
                      <DatePicker
                        size="small"
                        value={watchedExpireDate}
                        onChange={d => form.setFieldValue('expireDate', d ?? undefined)}
                        className="w-full"
                      />
                    </div>
                  )}

                  {watchedBillingMode === 'link' && (
                    <div className="sheet-detail-field">
                      <label>{t('关联已有订阅')}</label>
                      <Select
                        size="small"
                        showSearch
                        allowClear
                        optionFilterProp="label"
                        value={watchedSubscriptionId || undefined}
                        options={subscriptions.map(sub => ({
                          value: sub.id,
                          label: `${sub.name} (${currencySymbols[sub.currency]}${(sub.amountMinor / 100).toFixed(2)})`,
                        }))}
                        onChange={val => form.setFieldValue('subscriptionId', val ?? '')}
                      />
                    </div>
                  )}

                  {watchedBillingMode === 'create' && (
                    <>
                      <div className="sheet-detail-grid">
                        <div className="sheet-detail-field">
                          <label>Currency</label>
                          <Select
                            size="small"
                            value={watchedSubCurrency}
                            options={currencies.map(c => ({ value: c, label: c }))}
                            onChange={val => form.setFieldValue('subCurrency', val)}
                          />
                        </div>
                        <div className="sheet-detail-field">
                          <label>Amount</label>
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
                          <label>Cycle</label>
                          <Select
                            size="small"
                            value={watchedSubCycle}
                            options={Object.entries(cycles).map(([k, lbl]) => ({ value: k, label: t(lbl) }))}
                            onChange={val => form.setFieldValue('subCycle', val)}
                          />
                        </div>
                        <div className="sheet-detail-field">
                          <label>{t('下次扣款')}</label>
                          <DatePicker
                            size="small"
                            allowClear={false}
                            value={form.getFieldValue('subDueDate') as Dayjs | undefined}
                            onChange={d => form.setFieldValue('subDueDate', d ?? dayjs())}
                            className="w-full"
                          />
                        </div>
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

        {/* 4. Service Account */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <UserRound size={16} strokeWidth={1.75} />
            <span>{t('归属账号')}</span>
          </span>
          <div className="sub-sheet-control">
            <Form.Item name="accountId" noStyle>
              <AccountQuickDropdown
                kind="primary"
                accounts={accounts}
                presetKey={presetKey}
                subName={watchedProvider || watchedName || 'VPS'}
                subCategory="cloud"
                initialIncludeId={initialAccountId}
                disabled={submitting}
              />
            </Form.Item>
          </div>
        </div>

        {/* 5. Edit-Only Status & Archive */}
        {isEditing && (
          <>
            <div className="sub-sheet-row">
              <span className="sub-sheet-label">
                <Activity size={16} strokeWidth={1.75} />
                <span>{t('运行状态')}</span>
              </span>
              <div className="sub-sheet-control">
                <Dropdown
                  trigger={['click']}
                  menu={{
                    selectedKeys: [watchedStatus],
                    items: [
                      { key: 'active', label: t('主力在役') },
                      { key: 'standby', label: t('冷备待命') },
                      { key: 'maintenance', label: t('维护调试') },
                      { key: 'retiring', label: t('计划退订') },
                    ],
                    onClick: ({ key }) => form.setFieldValue('status', key),
                  }}
                >
                  <button type="button" className="sub-sheet-value-btn">
                    <span>
                      {watchedStatus === 'standby'
                        ? t('冷备待命')
                        : watchedStatus === 'maintenance'
                          ? t('维护调试')
                          : watchedStatus === 'retiring'
                            ? t('计划退订')
                            : t('主力在役')}
                    </span>
                    <ChevronDown size={14} className="sub-sheet-chevron" />
                  </button>
                </Dropdown>
              </div>
            </div>

            <div className="sub-sheet-row">
              <span className="sub-sheet-label">
                <Archive size={16} strokeWidth={1.75} />
                <span>{t('归档此服务器')}</span>
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
          {isExtraVisible('network') && (
            <>
              {!isEditing && (
                <div className="sub-sheet-row sub-sheet-extra-row">
                  <span className="sub-sheet-label">
                    <Globe size={15} strokeWidth={1.75} />
                    <span>IPv4</span>
                  </span>
                  <div className="sub-sheet-control sub-sheet-control-wide">
                    <Form.Item name="ipv4" noStyle>
                      <Input
                        variant="borderless"
                        placeholder="45.76.210.18"
                        maxLength={100}
                        className="sub-sheet-extra-input"
                      />
                    </Form.Item>
                  </div>
                </div>
              )}

              <div className="sub-sheet-row sub-sheet-extra-row">
                <span className="sub-sheet-label">
                  <Network size={15} strokeWidth={1.75} />
                  <span>{t('IPv6 / 内网')}</span>
                </span>
                <div className="sub-sheet-control sub-sheet-control-wide">
                  <Form.Item name="ipv6" noStyle>
                    <Input
                      variant="borderless"
                      placeholder="IPv6"
                      maxLength={120}
                      className="sub-sheet-extra-input"
                    />
                  </Form.Item>
                  <span className="sheet-hero-caption">·</span>
                  <Form.Item name="privateIp" noStyle>
                    <Input
                      variant="borderless"
                      placeholder="100.x / 10.x"
                      maxLength={100}
                      className="sub-sheet-extra-input"
                    />
                  </Form.Item>
                  <button
                    type="button"
                    aria-label={t('收起此项')}
                    className="sub-sheet-extra-remove"
                    onClick={() => {
                      form.setFieldsValue({ ipv6: '', privateIp: '', hostname: '', portNote: '' });
                      toggleExtra('network');
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              <div className="sub-sheet-row sub-sheet-extra-row">
                <span className="sub-sheet-label">
                  <Globe size={15} strokeWidth={1.75} />
                  <span>{t('主机与连接')}</span>
                </span>
                <div className="sub-sheet-control sub-sheet-control-wide">
                  <Form.Item name="hostname" noStyle>
                    <Input
                      variant="borderless"
                      placeholder="hostname"
                      maxLength={120}
                      className="sub-sheet-extra-input"
                    />
                  </Form.Item>
                  <Form.Item name="sshUser" noStyle>
                    <Input
                      variant="borderless"
                      placeholder="root"
                      maxLength={60}
                      className="sub-sheet-extra-input"
                      style={{ width: 68 }}
                    />
                  </Form.Item>
                  <Form.Item name="sshPort" noStyle>
                    <InputNumber
                      variant="borderless"
                      min={1}
                      max={65535}
                      precision={0}
                      controls={false}
                      placeholder="22"
                      className="sub-sheet-days-input"
                    />
                  </Form.Item>
                  <Form.Item name="portNote" hidden><Input /></Form.Item>
                </div>
              </div>
            </>
          )}

          {isExtraVisible('consoleUrl') && (
            <>
              <div className="sub-sheet-row sub-sheet-extra-row">
                <span className="sub-sheet-label">
                  <Link2 size={15} strokeWidth={1.75} />
                  <span>{t('控制台网址')}</span>
                </span>
                <div className="sub-sheet-control sub-sheet-control-wide">
                  <Form.Item
                    name="consoleUrl"
                    className="sub-sheet-inline-form-item"
                    rules={[{ type: 'url', message: t('请输入有效的 HTTP 或 HTTPS 网址') }]}
                  >
                    <Input
                      variant="borderless"
                      aria-label={t('控制台网址')}
                      placeholder="https://..."
                      maxLength={2000}
                      className="sub-sheet-extra-input"
                    />
                  </Form.Item>
                  <button
                    type="button"
                    aria-label={t('收起此项')}
                    className="sub-sheet-extra-remove"
                    onClick={() => {
                      form.setFieldsValue({ consoleUrl: '', domainIds: [], ipIds: [] });
                      toggleExtra('consoleUrl');
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              {(domains.length > 0 || ips.length > 0) && (
                <div className="sub-sheet-row sub-sheet-extra-row">
                  <span className="sub-sheet-label">
                    <Globe size={15} strokeWidth={1.75} />
                    <span>{t('绑定资源')}</span>
                  </span>
                  <div className="sub-sheet-control sub-sheet-control-wide">
                    <Popover
                      trigger="click"
                      placement="bottomRight"
                      arrow={false}
                      rootClassName="sheet-detail-popover"
                      content={(
                        <div className="sheet-detail-panel">
                          {domains.length > 0 && (
                            <div className="sheet-detail-field">
                              <label>{t('绑定域名')}</label>
                              <Select
                                mode="multiple"
                                size="small"
                                value={watchedDomainIds ?? []}
                                options={domains.map(d => ({ value: d.id, label: d.name }))}
                                onChange={vals => form.setFieldValue('domainIds', vals)}
                              />
                            </div>
                          )}
                          {ips.length > 0 && (
                            <div className="sheet-detail-field">
                              <label>IP</label>
                              <Select
                                mode="multiple"
                                size="small"
                                value={watchedIpIds ?? []}
                                options={ips.map(ip => ({ value: ip.id, label: `${ip.address} (${ipDisplayTitle(ip)})` }))}
                                onChange={vals => form.setFieldValue('ipIds', vals)}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    >
                      <button type="button" className="sub-sheet-value-btn">
                        <span>
                          {t('已选 {count} 项', {
                            count: (watchedDomainIds?.length ?? 0) + (watchedIpIds?.length ?? 0),
                          })}
                        </span>
                        <ChevronDown size={13} className="sub-sheet-chevron" />
                      </button>
                    </Popover>
                  </div>
                </div>
              )}
            </>
          )}

          {isExtraVisible('tags') && (
            <div className="sub-sheet-row sub-sheet-extra-row">
              <span className="sub-sheet-label">
                <Tag size={15} strokeWidth={1.75} />
                <span>{t('标签')}</span>
              </span>
              <div className="sub-sheet-control sub-sheet-control-wide">
                <div className="sheet-detail-pills justify-end">
                  {serverTagPresets.map((item) => {
                    const text = locale === 'en-US' ? item.en : item.zh;
                    const active = (watchedTags ?? []).includes(text);
                    return (
                      <button
                        key={item.en}
                        type="button"
                        className={`account-quick-pill ${active ? 'is-active' : ''}`}
                        onClick={() => toggleTag(text)}
                      >
                        {text}
                      </button>
                    );
                  })}
                </div>
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
                <Form.Item name="notes" noStyle>
                  <Input
                    variant="borderless"
                    aria-label={t('备注')}
                    placeholder={t('备注')}
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
          {extraFooterLinks.map((item) => {
            const active = isExtraVisible(item.key);
            return (
              <button
                key={item.key}
                type="button"
                className={`sub-sheet-footer-link ${active ? 'is-active' : ''}`}
                onClick={() => toggleExtra(item.key)}
              >
                <span>{item.label}</span>
                {item.hasValue && !active && <i className="sub-sheet-footer-dot" />}
              </button>
            );
          })}
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
            {t('保存服务器')}
          </Button>
        </div>
      </div>
    </div>
  );
}
