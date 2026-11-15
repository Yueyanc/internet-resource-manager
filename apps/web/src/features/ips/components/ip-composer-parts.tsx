import {
  type Account,
  type Domain,
  type IpInput,
  type IpUnlockEntry,
  ipUnlockServices,
  type ProviderConnection,
  type Subscription,
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
  Calendar,
  Check,
  ChevronDown,
  Cloud,
  FileText,
  Globe,
  Layers,
  Lock,
  LockOpen,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Tv,
  UserRound,
  X,
} from 'lucide-react';
import { type CSSProperties, useMemo, useState } from 'react';

import type { MessageKey } from '../../../app/messages';
import { usePreferences } from '../../../app/preferences-context';
import { accountDisplayTitle } from '../../accounts/utils/account-metrics';
import {
  type CloudSyncProviderKey,
  PROVIDER_BRIEFS,
  resolveIpSyncProvider,
} from '../../integrations/provider-matching';
import {
  filterIpPresets,
  findIpPreset,
  type IpPreset,
  type IpPresetGroup,
  ipPresetGroups,
  type IpPresetVariant,
  ipRegionPresets,
  ipTagPresets,
  resolveIpPreset,
} from '../presets/ip-presets';
import {
  ipAsnTypeMeta,
  ipCategoryMeta,
  ipUnlockMeta,
  nextReviewDate,
  reviewCycles,
} from '../utils/ip-metrics';
import { IpMark } from './ip-mark';
import { IpUnlockEditor } from './ip-unlock-editor';

export type IpLockableField = IpInput['manualLocks'][number];
export type IpExtraKey = 'alias' | 'ptr' | 'domains' | 'accounts' | 'purity';

function defaultReviewDate(cycle: IpInput['reviewCycle'], days = 90): Dayjs {
  const today = dayjs().format('YYYY-MM-DD');
  const next = nextReviewDate(today, cycle, days);
  return dayjs(next ?? today);
}

function IpPresetPopover({
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
  onSelectPreset: (preset: IpPreset) => void;
  onClearPreset: () => void;
  children: React.ReactNode;
}) {
  const { t, locale } = usePreferences();
  const [group, setGroup] = useState<IpPresetGroup>('popular');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => filterIpPresets(query, group), [query, group]);

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
              aria-label={t('搜索商家或线路预设')}
              prefix={<Search size={14} className="text-gray-400" />}
              placeholder={t('搜索预设，如 AT&T、DMIT、Cloudflare、Tailscale...')}
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </div>

          {!query.trim() && (
            <div className="preset-popover-tabs" role="tablist">
              {ipPresetGroups.map(item => (
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
                  <IpMark preset={preset} size="sm" />
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

export function IpPropertySheet({
  form,
  presetKey,
  variantId,
  onSelectPreset,
  onSelectVariant,
  onClearPreset,
  onLookup,
  lookingUp,
  subscriptions,
  domains,
  accounts,
  providerConnections = [],
  onOpenProviderSync,
  isEditing,
  initialOpenExtras,
  submitting,
  onCancel,
}: {
  form: FormInstance;
  presetKey: string;
  variantId?: string;
  onSelectPreset: (preset: IpPreset) => void;
  onSelectVariant?: (variant: IpPresetVariant) => void;
  onClearPreset: () => void;
  onLookup: (address: string) => void;
  lookingUp?: boolean;
  subscriptions: Subscription[];
  domains: Domain[];
  accounts: Account[];
  providerConnections?: ProviderConnection[];
  onOpenProviderSync?: (provider: CloudSyncProviderKey) => void;
  isEditing?: boolean;
  initialOpenExtras?: IpExtraKey[];
  submitting?: boolean;
  onCancel: () => void;
}) {
  const { t, locale } = usePreferences();
  const [presetOpen, setPresetOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [openExtras, setOpenExtras] = useState<IpExtraKey[]>(() => initialOpenExtras ?? []);

  const watchedAddress = (Form.useWatch('address') as string | undefined) ?? '';
  const watchedProvider = (Form.useWatch('provider') as string | undefined) ?? '';
  const watchedLabel = (Form.useWatch('label') as string | undefined) ?? '';
  const watchedCategory = (Form.useWatch('category') as IpInput['category'] | undefined) ?? 'cloud_vps';
  const watchedScope = (Form.useWatch('networkScope') as IpInput['networkScope'] | undefined) ?? 'overseas_exit';
  const watchedRegion = (Form.useWatch('region') as string | undefined) ?? 'US';
  const watchedCity = (Form.useWatch('city') as string | undefined) ?? '';
  const watchedAsn = (Form.useWatch('asn') as number | undefined) ?? 0;
  const watchedAsnOrg = (Form.useWatch('asnOrg') as string | undefined) ?? '';
  const watchedAsnType = (Form.useWatch('asnType') as IpInput['asnType'] | undefined) ?? 'hosting';
  const watchedOriginType = (Form.useWatch('originType') as IpInput['originType'] | undefined) ?? 'unknown';
  const watchedRiskLevel = (Form.useWatch('riskLevel') as IpInput['riskLevel'] | undefined) ?? 'unassessed';
  const watchedRole = (Form.useWatch('role') as IpInput['role'] | undefined) ?? 'primary';
  const watchedStatus = (Form.useWatch('status') as IpInput['status'] | undefined) ?? 'active';
  const watchedProbeMode = (Form.useWatch('probeMode') as IpInput['probeMode'] | undefined) ?? 'none';
  const watchedProbePort = (Form.useWatch('probePort') as number | undefined) ?? 443;
  const watchedHostLabel = (Form.useWatch('hostLabel') as string | undefined) ?? '';
  const watchedSubId = (Form.useWatch('subscriptionId') as string | undefined) ?? '';
  const watchedReviewCycle = (Form.useWatch('reviewCycle') as IpInput['reviewCycle'] | undefined) ?? 'none';
  const watchedReviewDays = (Form.useWatch('reviewDays') as number | undefined) ?? 90;
  const watchedNextReview = Form.useWatch('nextReviewDate') as Dayjs | undefined;
  const watchedPtr = (Form.useWatch('ptrRecord') as string | undefined) ?? '';
  const watchedPurityNote = (Form.useWatch('purityNote') as string | undefined) ?? '';
  const watchedConsoleUrl = (Form.useWatch('consoleUrl') as string | undefined) ?? '';
  const watchedNotes = (Form.useWatch('notes') as string | undefined) ?? '';
  const watchedUnlocks = Form.useWatch('unlocks') as Record<string, IpUnlockEntry> | undefined;
  const watchedTags = Form.useWatch('tags') as string[] | undefined;
  const watchedDomainIds = Form.useWatch('domainIds') as string[] | undefined;
  const watchedAccountIds = Form.useWatch('accountIds') as string[] | undefined;
  const watchedLocks = Form.useWatch('manualLocks') as IpLockableField[] | undefined;

  const explicitPreset = findIpPreset(presetKey);
  const activePreset = explicitPreset ?? resolveIpPreset({ presetKey, provider: watchedProvider });

  const syncProviderKey = useMemo(
    () => resolveIpSyncProvider({
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

  const lockSet = useMemo(() => new Set<IpLockableField>(watchedLocks ?? []), [watchedLocks]);

  const toggleLockGroup = (fields: IpLockableField[]) => {
    const current = new Set<IpLockableField>(watchedLocks ?? []);
    const allLocked = fields.every(f => current.has(f));
    if (allLocked) {
      for (const f of fields) current.delete(f);
    }
    else {
      for (const f of fields) current.add(f);
    }
    form.setFieldValue('manualLocks', Array.from(current));
  };

  const asnLocked = lockSet.has('asn') || lockSet.has('asnOrg');
  const geoLocked = lockSet.has('region') || lockSet.has('city');
  const ptrLocked = lockSet.has('ptrRecord');

  const puritySummary = useMemo(() => {
    const originText = watchedOriginType === 'native'
      ? t('原生住宅')
      : watchedOriginType === 'broadcast'
        ? t('广播商业')
        : t('未核验');
    const riskText = watchedRiskLevel === 'clean' || watchedRiskLevel === 'low'
      ? t('低风险')
      : watchedRiskLevel === 'medium'
        ? t('中风险')
        : watchedRiskLevel === 'high'
          ? t('高风险')
          : t('风险未评');
    return `${originText} · ${riskText}`;
  }, [watchedOriginType, watchedRiskLevel, t]);

  const purityTone = watchedRiskLevel === 'high' || watchedRiskLevel === 'medium'
    ? 'is-warn'
    : watchedOriginType === 'native' || watchedRiskLevel === 'clean' || watchedRiskLevel === 'low'
      ? 'is-ready'
      : 'is-idle';

  const asnSegmentText = useMemo(() => {
    const parts: string[] = [];
    if (watchedAsn > 0) parts.push(`AS${watchedAsn}`);
    if (watchedAsnOrg.trim()) parts.push(watchedAsnOrg.trim());
    else if (watchedProvider.trim()) parts.push(watchedProvider.trim());
    return parts.join(' · ') || 'AS — · RDAP';
  }, [watchedAsn, watchedAsnOrg, watchedProvider]);

  const geoSegmentText = useMemo(() => {
    const code = watchedRegion.trim().toUpperCase() || 'US';
    const found = ipRegionPresets.find(r => r.code === code);
    const regionShort = found && locale !== 'en-US'
      ? found.zh.replace(/\s*\([A-Z0-9]+\)$/, '')
      : code;
    return watchedCity.trim() ? `${regionShort} · ${watchedCity.trim()}` : regionShort;
  }, [watchedRegion, watchedCity, locale]);

  const categorySegmentText = `${t(ipCategoryMeta[watchedCategory].short)} · ${t(ipAsnTypeMeta[watchedAsnType].short)}`;

  const activeUnlockEntries = useMemo(() => {
    const map = watchedUnlocks ?? {};
    return ipUnlockServices
      .filter(svc => map[svc]?.status && map[svc]?.status !== 'unknown')
      .map(svc => ({
        service: svc,
        label: ipUnlockMeta[svc].label,
        status: map[svc]!.status,
      }));
  }, [watchedUnlocks]);

  const linkedSub = useMemo(
    () => (watchedSubId ? subscriptions.find(s => s.id === watchedSubId) : undefined),
    [subscriptions, watchedSubId],
  );

  const hostSummary = useMemo(() => {
    const parts = [watchedHostLabel.trim(), linkedSub?.name].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : t('未关联宿主或订阅');
  }, [watchedHostLabel, linkedSub, t]);

  const probeSummary = watchedProbeMode === 'none'
    ? t('关闭探测')
    : `${watchedProbeMode.toUpperCase()} · ${watchedProbePort || 443}`;

  const toggleTag = (tagText: string) => {
    const current = watchedTags ?? [];
    const next = current.includes(tagText)
      ? current.filter(item => item !== tagText)
      : [...current, tagText];
    form.setFieldValue('tags', next);
  };

  const isExtraVisible = (key: IpExtraKey) => openExtras.includes(key);
  const toggleExtra = (key: IpExtraKey) => {
    setOpenExtras(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };

  const extraFooterLinks: { key: IpExtraKey; label: string; hasValue: boolean }[] = [
    { key: 'alias', label: t('节点别名'), hasValue: Boolean(watchedLabel.trim()) },
    { key: 'ptr', label: t('反向解析 PTR'), hasValue: Boolean(watchedPtr.trim()) },
    { key: 'domains', label: t('绑定域名'), hasValue: (watchedDomainIds?.length ?? 0) > 0 },
    { key: 'accounts', label: t('关联账号'), hasValue: (watchedAccountIds?.length ?? 0) > 0 },
    {
      key: 'purity',
      label: t('纯净度备注'),
      hasValue: Boolean(watchedPurityNote.trim() || watchedNotes.trim() || watchedConsoleUrl.trim() || (watchedTags?.length ?? 0) > 0),
    },
  ];

  const anyExtraOpen = extraFooterLinks.some(item => isExtraVisible(item.key));

  return (
    <div className="sub-sheet">
      {/* Hidden backing fields */}
      <Form.Item name="provider" hidden><Input /></Form.Item>
      <Form.Item name="networkScope" hidden><Input /></Form.Item>
      <Form.Item name="category" hidden><Input /></Form.Item>
      <Form.Item name="region" hidden><Input /></Form.Item>
      <Form.Item name="city" hidden><Input /></Form.Item>
      <Form.Item name="asn" hidden><InputNumber /></Form.Item>
      <Form.Item name="asnOrg" hidden><Input /></Form.Item>
      <Form.Item name="asnType" hidden><Input /></Form.Item>
      <Form.Item name="originType" hidden><Input /></Form.Item>
      <Form.Item name="riskLevel" hidden><Input /></Form.Item>
      <Form.Item name="role" hidden><Input /></Form.Item>
      <Form.Item name="status" hidden><Input /></Form.Item>
      <Form.Item name="probeMode" hidden><Input /></Form.Item>
      <Form.Item name="probePort" hidden><InputNumber /></Form.Item>
      <Form.Item name="subscriptionId" hidden><Input /></Form.Item>
      <Form.Item name="hostLabel" hidden><Input /></Form.Item>
      <Form.Item name="reviewCycle" hidden><Input /></Form.Item>
      <Form.Item name="manualLocks" hidden><Select mode="multiple" /></Form.Item>
      <Form.Item name="tags" hidden><Select mode="multiple" /></Form.Item>
      <Form.Item name="domainIds" hidden><Select mode="multiple" /></Form.Item>
      <Form.Item name="accountIds" hidden><Select mode="multiple" /></Form.Item>
      <Form.Item name="unlocks" hidden><Input /></Form.Item>

      {/* Hero: Monospace IP Identity + Auto RDAP Trigger */}
      <div className="sub-sheet-hero">
        <div className="sub-sheet-identity">
          <IpPresetPopover
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
              <IpMark
                preset={activePreset}
                value={activePreset ? undefined : { presetKey: '', provider: watchedProvider || '?', category: watchedCategory }}
                size="lg"
              />
            </button>
          </IpPresetPopover>

          <div className="sub-sheet-title-col">
            <Form.Item
              name="address"
              className="sub-sheet-name-item"
              rules={[{ required: true, whitespace: true, message: t('请输入 IP 地址或 CIDR') }]}
            >
              <Input
                variant="borderless"
                aria-label={t('IP 地址或 CIDR')}
                placeholder="154.21.88.142"
                maxLength={64}
                autoComplete="off"
                className="sub-sheet-title-input sheet-mono-title-input"
              />
            </Form.Item>

            <div className="sub-sheet-subtitle-row">
              <button
                type="button"
                className="sub-sheet-preset-link"
                onClick={() => setPresetOpen(true)}
              >
                {watchedProvider.trim()
                  ? [watchedProvider.trim(), watchedLabel.trim()].filter(Boolean).join(' · ')
                  : t('点击选择线路预设或输入 IP 自动解析')}
              </button>

              {activePreset && (activePreset.variants?.length ?? 0) > 0 && onSelectVariant && (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    selectedKeys: variantId ? [variantId] : [],
                    items: (activePreset.variants ?? []).map(v => ({
                      key: v.id,
                      label: locale === 'en-US' ? v.label.en : v.label.zh,
                      onClick: () => onSelectVariant(v),
                    })),
                  }}
                >
                  <button type="button" className="sub-sheet-plan-switch">
                    <span>{t('常见地区与线路')}</span>
                    <ChevronDown size={12} />
                  </button>
                </Dropdown>
              )}
            </div>
          </div>
        </div>

        <div className="sheet-hero-right">
          <button
            type="button"
            disabled={!watchedAddress.trim() || Boolean(lookingUp) || Boolean(submitting)}
            className="sheet-action-pill"
            onClick={() => onLookup(watchedAddress.trim())}
          >
            <RefreshCw size={12} className={lookingUp ? 'animate-spin' : ''} />
            <span>{t('自动查询 RDAP')}</span>
          </button>

          <Popover
            trigger="click"
            placement="bottomRight"
            arrow={false}
            rootClassName="sheet-detail-popover"
            content={(
              <div className="sheet-detail-panel">
                <div className="sheet-detail-field">
                  <label>{t('原生 / 广播')}</label>
                  <div className="sheet-detail-pills">
                    {([
                      { key: 'native', label: t('原生 IP') },
                      { key: 'broadcast', label: t('广播 IP') },
                      { key: 'unknown', label: t('未核验') },
                    ] as const).map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        className={`account-quick-pill ${watchedOriginType === opt.key ? 'is-active' : ''}`}
                        onClick={() => form.setFieldValue('originType', opt.key)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sheet-detail-field">
                  <label>{t('纯净度风控')}</label>
                  <div className="sheet-detail-pills">
                    {([
                      { key: 'clean', label: t('极度纯净') },
                      { key: 'low', label: t('低风险') },
                      { key: 'medium', label: t('中度验证码') },
                      { key: 'high', label: t('高危 / 黑名单') },
                      { key: 'unassessed', label: t('未评估') },
                    ] as const).map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        className={`account-quick-pill ${watchedRiskLevel === opt.key ? 'is-active' : ''}`}
                        onClick={() => form.setFieldValue('riskLevel', opt.key)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          >
            <button
              type="button"
              className={`sheet-status-pill is-clickable ${purityTone}`}
            >
              <span>{puritySummary}</span>
              <ChevronDown size={12} />
            </button>
          </Popover>
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
                    ? '无需逐条手填，可一键从已绑定的 {provider} 账号同步公网 IP、Tailscale 组网地址与宿主节点。'
                    : '无需逐条手填，通过 {provider} 只读鉴权一键批量导入名下公网 IP、组网地址与实例归属。',
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

      {/* Signature Strip: 3-Segment Lockable RDAP Geo-ASN Ribbon */}
      <div className="sheet-signature-strip ip-rdap-strip">
        {/* Segment 1: ASN & Organization */}
        <div className="ip-rdap-seg">
          <button
            type="button"
            title={asnLocked ? t('已锁定防覆盖') : t('点击锁定防覆盖')}
            aria-label={asnLocked ? t('已锁定防覆盖') : t('点击锁定防覆盖')}
            className={`ip-lock-btn ${asnLocked ? 'is-locked' : ''}`}
            onClick={() => toggleLockGroup(['asn', 'asnOrg'])}
          >
            {asnLocked ? <Lock size={12} /> : <LockOpen size={12} />}
          </button>

          <Popover
            trigger="click"
            placement="bottomLeft"
            arrow={false}
            rootClassName="sheet-detail-popover"
            content={(
              <div className="sheet-detail-panel">
                <div className="sheet-detail-grid">
                  <div className="sheet-detail-field">
                    <label>ASN</label>
                    <InputNumber
                      size="small"
                      min={0}
                      max={4294967295}
                      precision={0}
                      value={watchedAsn}
                      onChange={val => form.setFieldValue('asn', val ?? 0)}
                      className="w-full"
                    />
                  </div>
                  <div className="sheet-detail-field">
                    <label>{t('商家 / 运营商')}</label>
                    <Input
                      size="small"
                      value={watchedProvider}
                      maxLength={100}
                      onChange={e => form.setFieldValue('provider', e.target.value)}
                    />
                  </div>
                </div>
                <div className="sheet-detail-field">
                  <label>{t('ASN 组织 / 运营商')}</label>
                  <Input
                    size="small"
                    value={watchedAsnOrg}
                    maxLength={160}
                    onChange={e => form.setFieldValue('asnOrg', e.target.value)}
                  />
                </div>
              </div>
            )}
          >
            <button type="button" className="ip-rdap-trigger">
              {asnSegmentText}
            </button>
          </Popover>
        </div>

        {/* Segment 2: Region & City */}
        <div className="ip-rdap-seg">
          <button
            type="button"
            title={geoLocked ? t('已锁定防覆盖') : t('点击锁定防覆盖')}
            aria-label={geoLocked ? t('已锁定防覆盖') : t('点击锁定防覆盖')}
            className={`ip-lock-btn ${geoLocked ? 'is-locked' : ''}`}
            onClick={() => toggleLockGroup(['region', 'city'])}
          >
            {geoLocked ? <Lock size={12} /> : <LockOpen size={12} />}
          </button>

          <Popover
            trigger="click"
            placement="bottom"
            arrow={false}
            rootClassName="sheet-detail-popover"
            content={(
              <div className="sheet-detail-panel">
                <div className="sheet-detail-pills">
                  {([
                    { key: 'overseas_exit', label: t('海外出口') },
                    { key: 'domestic_entry', label: t('国内入口') },
                    { key: 'overlay_private', label: t('组网内网') },
                  ] as const).map(sc => (
                    <button
                      key={sc.key}
                      type="button"
                      className={`account-quick-pill ${watchedScope === sc.key ? 'is-active' : ''}`}
                      onClick={() => {
                        form.setFieldValue('networkScope', sc.key);
                        if (sc.key === 'domestic_entry') form.setFieldValue('region', 'CN');
                        if (sc.key === 'overlay_private') {
                          form.setFieldValue('region', 'LAN');
                          form.setFieldValue('asnType', 'private');
                          form.setFieldValue('probeMode', 'none');
                        }
                      }}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
                <div className="sheet-detail-grid">
                  <div className="sheet-detail-field">
                    <label>{t('国家 / 地区')}</label>
                    <Select
                      size="small"
                      showSearch
                      optionFilterProp="label"
                      value={watchedRegion}
                      options={ipRegionPresets.map(r => ({
                        value: r.code,
                        label: locale === 'en-US' ? r.en : r.zh,
                      }))}
                      onChange={val => form.setFieldValue('region', val)}
                    />
                  </div>
                  <div className="sheet-detail-field">
                    <label>{t('城市 / 机房')}</label>
                    <Input
                      size="small"
                      placeholder="Tokyo / LAX"
                      value={watchedCity}
                      maxLength={80}
                      onChange={e => form.setFieldValue('city', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          >
            <button type="button" className="ip-rdap-trigger">
              {geoSegmentText}
            </button>
          </Popover>
        </div>

        {/* Segment 3: Category & ASN Type */}
        <div className="ip-rdap-seg">
          <Popover
            trigger="click"
            placement="bottomRight"
            arrow={false}
            rootClassName="sheet-detail-popover"
            content={(
              <div className="sheet-detail-panel">
                <div className="sheet-detail-field">
                  <label>{t('所属分类')}</label>
                  <Select
                    size="small"
                    value={watchedCategory}
                    options={Object.entries(ipCategoryMeta).map(([k, item]) => ({
                      value: k,
                      label: t(item.label),
                    }))}
                    onChange={val => form.setFieldValue('category', val)}
                  />
                </div>
                <div className="sheet-detail-field">
                  <label>{t('ASN 属性')}</label>
                  <Select
                    size="small"
                    value={watchedAsnType}
                    options={Object.entries(ipAsnTypeMeta).map(([k, item]) => ({
                      value: k,
                      label: t(item.label),
                    }))}
                    onChange={val => form.setFieldValue('asnType', val)}
                  />
                </div>
              </div>
            )}
          >
            <button type="button" className="ip-rdap-trigger">
              {categorySegmentText}
            </button>
          </Popover>
        </div>
      </div>

      <div className="sub-sheet-divider" />

      {/* Frameless Property Rows */}
      <div className="sub-sheet-rows">
        {/* 1. Streaming & AI Unlock Micro-Pills */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <Tv size={16} strokeWidth={1.75} />
            <span>{t('流媒体解锁')}</span>
          </span>
          <div className="sub-sheet-control">
            <div className="ip-unlock-inline">
              {activeUnlockEntries.map(entry => (
                <button
                  key={entry.service}
                  type="button"
                  className={`ip-unlock-micro-pill is-${entry.status}`}
                  onClick={() => setUnlockOpen(true)}
                >
                  <span>{entry.label}</span>
                </button>
              ))}

              <Popover
                trigger="click"
                open={unlockOpen}
                onOpenChange={setUnlockOpen}
                placement="bottomRight"
                arrow={false}
                rootClassName="sheet-detail-popover"
                content={(
                  <div className="sheet-detail-panel is-wide">
                    <div className="sheet-detail-title">
                      <span>{t('AI 与流媒体解锁')}</span>
                    </div>
                    <IpUnlockEditor
                      value={watchedUnlocks ?? {}}
                      defaultRegion={watchedRegion}
                      onChange={next => form.setFieldValue('unlocks', next)}
                    />
                  </div>
                )}
              >
                <button
                  type="button"
                  aria-label={t('配置解锁矩阵')}
                  className="ip-unlock-add-btn"
                >
                  <Plus size={12} />
                  {activeUnlockEntries.length === 0 && <span>{t('配置解锁矩阵')}</span>}
                </button>
              </Popover>
            </div>
          </div>
        </div>

        {/* 2. Node Role */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <MapPin size={16} strokeWidth={1.75} />
            <span>{t('节点定位')}</span>
          </span>
          <div className="sub-sheet-control">
            <div className="sub-sheet-segmented" role="radiogroup" aria-label={t('节点定位')}>
              {([
                { key: 'primary', label: t('主力出口') },
                { key: 'dedicated', label: t('专线独享') },
                { key: 'service', label: t('流媒体落地') },
                { key: 'standby', label: t('备用') },
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={watchedRole === opt.key}
                  className={`sub-sheet-seg-item ${watchedRole === opt.key ? 'is-active' : ''}`}
                  onClick={() => form.setFieldValue('role', opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Reachability Probe */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <Activity size={16} strokeWidth={1.75} />
            <span>{t('连通探测')}</span>
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
                      { key: 'none', label: t('关闭探测') },
                      { key: 'tcp', label: 'TCP' },
                      { key: 'https', label: 'HTTPS' },
                      { key: 'http', label: 'HTTP' },
                    ] as const).map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        className={`account-quick-pill ${watchedProbeMode === opt.key ? 'is-active' : ''}`}
                        onClick={() => {
                          form.setFieldValue('probeMode', opt.key);
                          if (opt.key !== 'none' && !watchedProbePort) {
                            form.setFieldValue('probePort', opt.key === 'http' ? 80 : 443);
                          }
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {watchedProbeMode !== 'none' && (
                    <div className="sheet-detail-field">
                      <label>{t('探测端口')}</label>
                      <InputNumber
                        size="small"
                        min={1}
                        max={65535}
                        precision={0}
                        value={watchedProbePort}
                        onChange={val => form.setFieldValue('probePort', val ?? 443)}
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              )}
            >
              <button
                type="button"
                aria-label={t('连通探测')}
                className="sub-sheet-value-btn"
              >
                <span>{probeSummary}</span>
                <ChevronDown size={14} className="sub-sheet-chevron" />
              </button>
            </Popover>
          </div>
        </div>

        {/* 4. Host & Linked Subscription */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <Layers size={16} strokeWidth={1.75} />
            <span>{t('承载宿主')}</span>
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
                    <label>{t('所属主机 / 设备标识')}</label>
                    <Input
                      size="small"
                      placeholder="Tokyo-Edge-01"
                      value={watchedHostLabel}
                      maxLength={100}
                      onChange={e => form.setFieldValue('hostLabel', e.target.value)}
                    />
                  </div>
                  <div className="sheet-detail-field">
                    <label>{t('关联在用订阅（成本与到期）')}</label>
                    <Select
                      size="small"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      value={watchedSubId || undefined}
                      options={subscriptions.map(sub => ({
                        value: sub.id,
                        label: `${sub.name} (${sub.currency} ${(sub.amountMinor / 100).toFixed(2)})`,
                      }))}
                      onChange={val => form.setFieldValue('subscriptionId', val ?? '')}
                    />
                  </div>
                </div>
              )}
            >
              <button
                type="button"
                aria-label={t('承载宿主')}
                className="sub-sheet-value-btn"
              >
                <span className={watchedHostLabel.trim() || linkedSub ? '' : 'sub-sheet-placeholder'}>
                  {hostSummary}
                </span>
                <ChevronDown size={14} className="sub-sheet-chevron" />
              </button>
            </Popover>
          </div>
        </div>

        {/* 5. Purity Review Schedule */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <Calendar size={16} strokeWidth={1.75} />
            <span>{t('定期复检')}</span>
          </span>
          <div className="sub-sheet-control">
            {watchedReviewCycle === 'custom' && (
              <span className="sub-sheet-custom-days">
                <Form.Item name="reviewDays" noStyle>
                  <InputNumber
                    variant="borderless"
                    min={1}
                    max={3650}
                    precision={0}
                    controls={false}
                    className="sub-sheet-days-input"
                  />
                </Form.Item>
                <span>{t('天')}</span>
              </span>
            )}
            {watchedReviewCycle !== 'none' && (
              <Form.Item
                name="nextReviewDate"
                noStyle
                rules={[{ required: true, message: t('请选择日期') }]}
              >
                <DatePicker
                  variant="borderless"
                  allowClear={false}
                  suffixIcon={null}
                  inputReadOnly
                  format="YYYY-MM-DD"
                  className="sub-sheet-datepicker"
                />
              </Form.Item>
            )}
            <Dropdown
              trigger={['click']}
              menu={{
                selectedKeys: [watchedReviewCycle],
                items: Object.entries(reviewCycles).map(([key, label]) => ({
                  key,
                  label: t(label),
                })),
                onClick: ({ key }) => {
                  const nextCycle = key as IpInput['reviewCycle'];
                  form.setFieldValue('reviewCycle', nextCycle);
                  if (nextCycle !== 'none' && !watchedNextReview) {
                    form.setFieldValue('nextReviewDate', defaultReviewDate(nextCycle, watchedReviewDays || 90));
                  }
                },
              }}
            >
              <button type="button" className="sub-sheet-value-btn">
                <span>{t(reviewCycles[watchedReviewCycle])}</span>
                <ChevronDown size={14} className="sub-sheet-chevron" />
              </button>
            </Dropdown>
          </div>
        </div>

        {/* 6. Edit-Only Status & Archive */}
        {isEditing && (
          <>
            <div className="sub-sheet-row">
              <span className="sub-sheet-label">
                <Activity size={16} strokeWidth={1.75} />
                <span>{t('节点状态')}</span>
              </span>
              <div className="sub-sheet-control">
                <Dropdown
                  trigger={['click']}
                  menu={{
                    selectedKeys: [watchedStatus],
                    items: [
                      { key: 'active', label: t('正常在用') },
                      { key: 'degraded', label: t('质量降级') },
                      { key: 'blocked', label: t('被墙 / 封禁') },
                      { key: 'retiring', label: t('计划迁移') },
                    ],
                    onClick: ({ key }) => form.setFieldValue('status', key),
                  }}
                >
                  <button type="button" className="sub-sheet-value-btn">
                    <span>
                      {watchedStatus === 'degraded'
                        ? t('质量降级')
                        : watchedStatus === 'blocked'
                          ? t('被墙 / 封禁')
                          : watchedStatus === 'retiring'
                            ? t('计划迁移')
                            : t('正常在用')}
                    </span>
                    <ChevronDown size={14} className="sub-sheet-chevron" />
                  </button>
                </Dropdown>
              </div>
            </div>

            <div className="sub-sheet-row">
              <span className="sub-sheet-label">
                <Archive size={16} strokeWidth={1.75} />
                <span>{t('归档此节点')}</span>
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
          {isExtraVisible('alias') && (
            <div className="sub-sheet-row sub-sheet-extra-row">
              <span className="sub-sheet-label">
                <Tag size={15} strokeWidth={1.75} />
                <span>{t('节点别名')}</span>
              </span>
              <div className="sub-sheet-control sub-sheet-control-wide">
                <Form.Item name="provider" noStyle>
                  <Input
                    variant="borderless"
                    aria-label={t('商家 / 运营商')}
                    placeholder={t('商家 / 运营商')}
                    maxLength={100}
                    className="sub-sheet-extra-input"
                  />
                </Form.Item>
                <span className="sheet-hero-caption">·</span>
                <Form.Item name="label" noStyle>
                  <Input
                    variant="borderless"
                    aria-label={t('节点备注名')}
                    placeholder={t('节点备注名')}
                    maxLength={60}
                    className="sub-sheet-extra-input"
                  />
                </Form.Item>
                <button
                  type="button"
                  aria-label={t('收起此项')}
                  className="sub-sheet-extra-remove"
                  onClick={() => {
                    form.setFieldValue('label', '');
                    toggleExtra('alias');
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {isExtraVisible('ptr') && (
            <div className="sub-sheet-row sub-sheet-extra-row">
              <span className="sub-sheet-label">
                <Globe size={15} strokeWidth={1.75} />
                <span>{t('反向解析 PTR')}</span>
              </span>
              <div className="sub-sheet-control sub-sheet-control-wide">
                <button
                  type="button"
                  className={`ip-lock-btn ${ptrLocked ? 'is-locked' : ''}`}
                  onClick={() => toggleLockGroup(['ptrRecord'])}
                >
                  {ptrLocked ? <Lock size={12} /> : <LockOpen size={12} />}
                </button>
                <Form.Item name="ptrRecord" noStyle>
                  <Input
                    variant="borderless"
                    aria-label={t('反向解析 (PTR)')}
                    placeholder="host.example.net"
                    maxLength={255}
                    className="sub-sheet-extra-input"
                  />
                </Form.Item>
                <button
                  type="button"
                  aria-label={t('收起此项')}
                  className="sub-sheet-extra-remove"
                  onClick={() => {
                    form.setFieldValue('ptrRecord', '');
                    toggleExtra('ptr');
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {isExtraVisible('domains') && (
            <div className="sub-sheet-row sub-sheet-extra-row">
              <span className="sub-sheet-label">
                <Globe size={15} strokeWidth={1.75} />
                <span>{t('绑定域名')}</span>
              </span>
              <div className="sub-sheet-control sub-sheet-control-wide">
                <Select
                  mode="multiple"
                  size="small"
                  className="flex-1"
                  placeholder={t('选择解析到此 IP 的域名')}
                  value={watchedDomainIds ?? []}
                  options={domains.map(dom => ({ value: dom.id, label: dom.name }))}
                  onChange={vals => form.setFieldValue('domainIds', vals)}
                />
                <button
                  type="button"
                  aria-label={t('收起此项')}
                  className="sub-sheet-extra-remove"
                  onClick={() => {
                    form.setFieldValue('domainIds', []);
                    toggleExtra('domains');
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {isExtraVisible('accounts') && (
            <div className="sub-sheet-row sub-sheet-extra-row">
              <span className="sub-sheet-label">
                <UserRound size={15} strokeWidth={1.75} />
                <span>{t('关联账号')}</span>
              </span>
              <div className="sub-sheet-control sub-sheet-control-wide">
                <Select
                  mode="multiple"
                  size="small"
                  className="flex-1"
                  placeholder={t('选择固定使用此出口的账号')}
                  value={watchedAccountIds ?? []}
                  options={accounts.map(acct => ({
                    value: acct.id,
                    label: `${accountDisplayTitle(acct)} (${acct.identifier})`,
                  }))}
                  onChange={vals => form.setFieldValue('accountIds', vals)}
                />
                <button
                  type="button"
                  aria-label={t('收起此项')}
                  className="sub-sheet-extra-remove"
                  onClick={() => {
                    form.setFieldValue('accountIds', []);
                    toggleExtra('accounts');
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {isExtraVisible('purity') && (
            <>
              <div className="sub-sheet-row sub-sheet-extra-row">
                <span className="sub-sheet-label">
                  <FileText size={15} strokeWidth={1.75} />
                  <span>{t('纯净度备注')}</span>
                </span>
                <div className="sub-sheet-control sub-sheet-control-wide">
                  <Form.Item name="purityNote" noStyle>
                    <Input
                      variant="borderless"
                      aria-label={t('纯净度备注')}
                      placeholder={t('选填，如 Scamalytics 0 分、双ISP原生')}
                      maxLength={120}
                      className="sub-sheet-extra-input"
                    />
                  </Form.Item>
                  <button
                    type="button"
                    aria-label={t('收起此项')}
                    className="sub-sheet-extra-remove"
                    onClick={() => {
                      form.setFieldsValue({ purityNote: '', notes: '', consoleUrl: '', tags: [] });
                      toggleExtra('purity');
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              <div className="sub-sheet-row sub-sheet-extra-row">
                <span className="sub-sheet-label">
                  <Tag size={15} strokeWidth={1.75} />
                  <span>{t('标签')}</span>
                </span>
                <div className="sub-sheet-control sub-sheet-control-wide">
                  <div className="sheet-detail-pills justify-end">
                    {ipTagPresets.map((item) => {
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
                </div>
              </div>

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
                  <Form.Item name="consoleUrl" hidden><Input /></Form.Item>
                </div>
              </div>
            </>
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
            {t('保存节点')}
          </Button>
        </div>
      </div>
    </div>
  );
}
