import type { Account, Preferences, SubscriptionInput } from '@irm/api-client';
import { currencies } from '@irm/api-client';
import {
  Button,
  DatePicker,
  Dropdown,
  Form,
  type FormInstance,
  Input,
  InputNumber,
  Popover,
  Switch,
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import {
  Archive,
  Calendar,
  Check,
  ChevronDown,
  CreditCard,
  FileText,
  Folder,
  Link2,
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
import {
  filterPresets,
  findPreset,
  paymentMethodPresets,
  type PresetGroup,
  presetGroups,
  type PresetPlan,
  resolvePreset,
  type SubscriptionPreset,
} from '../presets/subscription-presets';
import { displayMoney } from '../utils/subscription-display';
import { categories, convert, cycles, nextDate } from '../utils/subscription-metrics';
import { ServiceMark } from './service-mark';
import { AccountQuickDropdown } from './subscription-account-fields';

const currencySymbols: Record<SubscriptionInput['currency'], string> = {
  CNY: '¥',
  USD: 'US$',
  HKD: 'HK$',
  EUR: '€',
  GBP: '£',
  JPY: 'JP¥',
};

const cycleOrder: SubscriptionInput['cycle'][] = [
  'monthly',
  'quarterly',
  'halfyear',
  'yearly',
  'biennial',
  'triennial',
  'once',
  'custom',
];

const cycleMonthMap = {
  monthly: 1,
  quarterly: 3,
  halfyear: 6,
  yearly: 12,
  biennial: 24,
  triennial: 36,
} as const;

function calcMonthlyBase(
  amountMinor: number,
  currency: SubscriptionInput['currency'],
  cycle: SubscriptionInput['cycle'],
  intervalDays: number,
  prefs: Preferences,
): number {
  const baseAmount = convert(amountMinor, currency, prefs);
  if (cycle === 'once') return 0;
  if (cycle === 'custom') {
    const safeDays = intervalDays > 0 ? intervalDays : 30;
    return baseAmount * 365.2425 / 12 / safeDays;
  }
  return baseAmount / cycleMonthMap[cycle];
}

function defaultCycleDueDate(cycle: SubscriptionInput['cycle'], intervalDays = 30): Dayjs {
  const today = dayjs().format('YYYY-MM-DD');
  const next = nextDate(today, cycle, intervalDays);
  return dayjs(next ?? today);
}

function ServicePresetPopover({
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
  onSelectPreset: (preset: SubscriptionPreset) => void;
  onClearPreset: () => void;
  children: React.ReactNode;
}) {
  const { t, locale } = usePreferences();
  const [group, setGroup] = useState<PresetGroup>('popular');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => filterPresets(query, group), [query, group]);

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
              aria-label={t('搜索预设服务')}
              prefix={<Search size={14} className="text-gray-400" />}
              placeholder={t('搜索预设，如 B站、QQ音乐、ChatGPT、iCloud...')}
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </div>

          {!query.trim() && (
            <div className="preset-popover-tabs" role="tablist">
              {presetGroups.map(item => (
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
              const displayName = locale === 'en-US' ? preset.name.en : preset.name.zh;
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
                  <ServiceMark preset={preset} size="sm" />
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

type ExtraKey = 'renewalAmount' | 'managementUrl' | 'paymentMethod' | 'notes' | 'accountNote';

export function SubscriptionPropertySheet({
  form,
  presetKey,
  planId,
  onSelectPreset,
  onSelectPlan,
  onClearPreset,
  accounts,
  prefs,
  isEditing,
  initialAccountId,
  initialBillingAccountId,
  initialOpenExtras,
  submitting,
  onCancel,
}: {
  form: FormInstance;
  presetKey: string;
  planId?: string;
  onSelectPreset: (preset: SubscriptionPreset) => void;
  onSelectPlan?: (preset: SubscriptionPreset, plan: PresetPlan) => void;
  onClearPreset: () => void;
  accounts: Account[];
  prefs?: Preferences;
  isEditing?: boolean;
  initialAccountId?: string;
  initialBillingAccountId?: string;
  initialOpenExtras?: ExtraKey[];
  submitting?: boolean;
  onCancel: () => void;
}) {
  const { t, locale } = usePreferences();
  const [presetOpen, setPresetOpen] = useState(false);
  const [editingAmountText, setEditingAmountText] = useState<string | null>(null);
  const [openExtras, setOpenExtras] = useState<ExtraKey[]>(() => initialOpenExtras ?? []);

  const watchedName = (Form.useWatch('name') as string | undefined) ?? '';
  const rawAmount = Form.useWatch('amount') as number | null | undefined;
  const watchedAmount = typeof rawAmount === 'number' && Number.isFinite(rawAmount) ? rawAmount : 0;
  const watchedCurrency = (Form.useWatch('currency') as SubscriptionInput['currency'] | undefined) ?? 'CNY';
  const watchedCycle = (Form.useWatch('cycle') as SubscriptionInput['cycle'] | undefined) ?? 'monthly';
  const watchedInterval = Number(Form.useWatch('intervalDays') ?? 30);
  const watchedCategory = (Form.useWatch('category') as SubscriptionInput['category'] | undefined) ?? 'other';
  const watchedDueDate = Form.useWatch('dueDate') as Dayjs | undefined;
  const watchedRenewalMode = (Form.useWatch('renewalMode') as SubscriptionInput['renewalMode'] | undefined) ?? 'auto';
  const watchedIntention = (Form.useWatch('intention') as SubscriptionInput['intention'] | undefined) ?? 'normal';
  const watchedAccountId = (Form.useWatch('accountId') as string | undefined) ?? '';

  const watchedRenewalAmount = Form.useWatch('renewalAmount') as number | undefined;
  const watchedManagementUrl = (Form.useWatch('managementUrl') as string | undefined) ?? '';
  const watchedPaymentMethod = (Form.useWatch('paymentMethod') as string | undefined) ?? '';
  const watchedNotes = (Form.useWatch('notes') as string | undefined) ?? '';
  const watchedLegacyAccount = (Form.useWatch('account') as string | undefined) ?? '';

  const explicitPreset = findPreset(presetKey);
  const resolvedPreset = explicitPreset
    ?? (watchedName.trim() ? resolvePreset({ presetKey: '', name: watchedName }) : undefined);

  const amountInputWidth = useMemo(() => {
    const displayed = editingAmountText ?? (rawAmount === null || rawAmount === undefined ? '' : String(rawAmount));
    const chars = Math.min(10, Math.max(1, displayed.length || 1));
    return `calc(${chars}ch + 18px)`;
  }, [editingAmountText, rawAmount]);

  const cycleShortLabel = useMemo(() => {
    switch (watchedCycle) {
      case 'monthly':
        return `/ ${t('月')}`;
      case 'quarterly':
        return `/ ${t('季')}`;
      case 'halfyear':
        return t(cycles.halfyear);
      case 'yearly':
        return `/ ${t('年')}`;
      case 'biennial':
        return t(cycles.biennial);
      case 'triennial':
        return t(cycles.triennial);
      case 'once':
        return t('一次性买断');
      case 'custom':
        return t('自定义间隔');
    }
  }, [watchedCycle, t]);

  const conversionText = useMemo(() => {
    if (watchedCycle === 'once') {
      return t('一次性买断 · 不计入周期月均');
    }
    if (!prefs || watchedAmount <= 0) {
      return '';
    }
    const minor = Math.round(watchedAmount * 100);
    const monthly = calcMonthlyBase(minor, watchedCurrency, watchedCycle, watchedInterval, prefs);
    if (watchedCurrency !== prefs.baseCurrency || watchedCycle !== 'monthly') {
      return t('≈ {amount} / 月', { amount: displayMoney(monthly, prefs.baseCurrency, locale) });
    }
    return t('≈ {amount} / 年', { amount: displayMoney(monthly * 12, prefs.baseCurrency, locale, true) });
  }, [watchedCycle, prefs, watchedAmount, watchedCurrency, watchedInterval, locale, t]);

  const countdownBadge = useMemo(() => {
    if (!watchedDueDate?.isValid()) return null;
    const diff = watchedDueDate.startOf('day').diff(dayjs().startOf('day'), 'day');
    const text = diff < 0
      ? t('已逾期 {count} 天', { count: -diff })
      : diff === 0
        ? t('今天到期')
        : t('{count} 天后', { count: diff });
    const tone = diff < 0 ? 'is-overdue' : diff <= 30 ? 'is-warm' : 'is-calm';
    return { text, tone };
  }, [watchedDueDate, t]);

  const isExtraVisible = (key: ExtraKey) => openExtras.includes(key);

  const toggleExtra = (key: ExtraKey) => {
    setOpenExtras(prev => (prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]));
  };

  const clearAndCloseExtra = (key: ExtraKey) => {
    if (key === 'renewalAmount') form.setFieldValue('renewalAmount', undefined);
    if (key === 'managementUrl') form.setFieldValue('managementUrl', '');
    if (key === 'paymentMethod') form.setFieldValue('paymentMethod', '');
    if (key === 'notes') form.setFieldValue('notes', '');
    if (key === 'accountNote') form.setFieldValue('account', '');
    setOpenExtras(prev => prev.filter(item => item !== key));
  };

  const anyExtraOpen = openExtras.length > 0;

  const extraFooterLinks: { key: Exclude<ExtraKey, 'accountNote'>; label: string; hasValue: boolean }[] = [
    {
      key: 'renewalAmount',
      label: t('续费原价'),
      hasValue: typeof watchedRenewalAmount === 'number' && watchedRenewalAmount > 0,
    },
    {
      key: 'managementUrl',
      label: t('退订网址'),
      hasValue: Boolean(watchedManagementUrl.trim()),
    },
    {
      key: 'paymentMethod',
      label: t('支付方式'),
      hasValue: Boolean(watchedPaymentMethod.trim()),
    },
    {
      key: 'notes',
      label: t('备注'),
      hasValue: Boolean(watchedNotes.trim()),
    },
  ];

  const intentionToneClass = watchedIntention === 'cancel'
    ? 'is-danger'
    : watchedIntention === 'keep'
      ? 'is-keep'
      : '';

  return (
    <div className="sub-sheet">
      <Form.Item name="currency" hidden><Input /></Form.Item>
      <Form.Item name="cycle" rules={[{ required: true }]} hidden><Input /></Form.Item>
      <Form.Item name="category" hidden><Input /></Form.Item>
      <Form.Item name="renewalMode" hidden><Input /></Form.Item>
      <Form.Item name="intention" hidden><Input /></Form.Item>
      {watchedCycle !== 'custom' && <Form.Item name="intervalDays" hidden><InputNumber /></Form.Item>}
      {!isExtraVisible('renewalAmount') && <Form.Item name="renewalAmount" hidden><InputNumber /></Form.Item>}
      {!isExtraVisible('managementUrl') && <Form.Item name="managementUrl" hidden><Input /></Form.Item>}
      {!isExtraVisible('paymentMethod') && <Form.Item name="paymentMethod" hidden><Input /></Form.Item>}
      {!isExtraVisible('notes') && <Form.Item name="notes" hidden><Input /></Form.Item>}
      {!isExtraVisible('accountNote') && <Form.Item name="account" hidden><Input /></Form.Item>}

      {/* Hero: Brand Icon + Borderless Title on Left, Inline Amount + Cycle on Right */}
      <div className="sub-sheet-hero">
        <div className="sub-sheet-identity">
          <ServicePresetPopover
            open={presetOpen}
            onOpenChange={setPresetOpen}
            presetKey={presetKey}
            onSelectPreset={(preset) => {
              setEditingAmountText(null);
              onSelectPreset(preset);
            }}
            onClearPreset={onClearPreset}
          >
            <button
              type="button"
              className="sub-sheet-mark-btn"
              aria-label={t('选择品牌图标')}
              title={t('选择预设服务')}
            >
              <ServiceMark
                preset={explicitPreset ?? resolvedPreset}
                value={(explicitPreset ?? resolvedPreset) ? undefined : { presetKey: '', name: watchedName || '?', category: watchedCategory }}
                size="lg"
              />
            </button>
          </ServicePresetPopover>

          <div className="sub-sheet-title-col">
            <Form.Item
              name="name"
              className="sub-sheet-name-item"
              rules={[
                { required: true, whitespace: true, message: t('请输入订阅名称') },
                { max: 100, message: t('最多 100 个字符') },
              ]}
            >
              <Input
                variant="borderless"
                aria-label={t('订阅名称')}
                placeholder={t('输入订阅名称，如 Claude Pro...')}
                maxLength={100}
                autoFocus={!isEditing}
                className="sub-sheet-title-input"
              />
            </Form.Item>

            <div className="sub-sheet-subtitle-row">
              <button
                type="button"
                aria-label={t('选择预设服务')}
                className="sub-sheet-preset-link"
                onClick={() => setPresetOpen(true)}
              >
                {t('点击更换预设或直接输入名称')}
              </button>

              {explicitPreset && explicitPreset.plans.length > 1 && onSelectPlan && (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    selectedKeys: planId ? [planId] : [],
                    items: explicitPreset.plans.map(plan => ({
                      key: plan.id,
                      label: locale === 'en-US' ? plan.label.en : plan.label.zh,
                    })),
                    onClick: ({ key }) => {
                      const found = explicitPreset.plans.find(p => p.id === key);
                      if (found) {
                        setEditingAmountText(null);
                        onSelectPlan(explicitPreset, found);
                      }
                    },
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

        <div className="sub-sheet-pricing">
          <div className="sub-sheet-price-inline">
            <Dropdown
              trigger={['click']}
              menu={{
                selectedKeys: [watchedCurrency],
                items: currencies.map(code => ({
                  key: code,
                  label: `${currencySymbols[code]} · ${code}`,
                })),
                onClick: ({ key }) => {
                  form.setFieldValue('currency', key);
                },
              }}
            >
              <button
                type="button"
                aria-label={t('币种')}
                className="sub-sheet-currency-trigger"
              >
                {currencySymbols[watchedCurrency]}
              </button>
            </Dropdown>

            <Form.Item
              name="amount"
              className="sub-sheet-amount-item"
              rules={[{ required: true, message: t('请输入金额') }]}
            >
              <InputNumber
                variant="borderless"
                aria-label={t('金额')}
                min={0}
                max={1000000000}
                controls={false}
                placeholder="0"
                onInput={text => setEditingAmountText(text)}
                onBlur={() => setEditingAmountText(null)}
                style={{ width: amountInputWidth }}
                className="sub-sheet-amount-input"
              />
            </Form.Item>

            <Dropdown
              trigger={['click']}
              menu={{
                selectedKeys: [watchedCycle],
                items: cycleOrder.map(cyc => ({
                  key: cyc,
                  label: t(cycles[cyc]),
                })),
                onClick: ({ key }) => {
                  form.setFieldValue('cycle', key);
                },
              }}
            >
              <button
                type="button"
                aria-label={t('计费周期')}
                className="sub-sheet-cycle-pill"
              >
                <span>{cycleShortLabel}</span>
                <ChevronDown size={12} />
              </button>
            </Dropdown>

            {watchedCycle === 'custom' && (
              <span className="sub-sheet-custom-days">
                <Form.Item
                  name="intervalDays"
                  noStyle
                  rules={[{ required: true, message: t('请输入间隔天数') }]}
                >
                  <InputNumber
                    variant="borderless"
                    aria-label={t('间隔天数')}
                    min={1}
                    max={3650}
                    precision={0}
                    controls={false}
                    className="sub-sheet-days-input"
                  />
                </Form.Item>
                <span>{locale === 'en-US' ? 'd' : '天'}</span>
              </span>
            )}
          </div>

          {conversionText && (
            <div className="sub-sheet-conversion">{conversionText}</div>
          )}
        </div>
      </div>

      <div className="sub-sheet-divider" />

      {/* Frameless Key-Value Property Rows */}
      <div className="sub-sheet-rows">
        {/* 1. Category */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <Folder size={16} strokeWidth={1.75} />
            <span>{t('所属分类')}</span>
          </span>
          <div className="sub-sheet-control">
            <Dropdown
              trigger={['click']}
              menu={{
                selectedKeys: [watchedCategory],
                items: (Object.entries(categories) as [SubscriptionInput['category'], (typeof categories)[SubscriptionInput['category']]][]).map(([key, meta]) => ({
                  key,
                  label: (
                    <span className="inline-flex items-center gap-2">
                      <i
                        className="sub-cat-dot"
                        style={{ background: meta.color }}
                      />
                      <span>{t(meta.label)}</span>
                    </span>
                  ),
                })),
                onClick: ({ key }) => {
                  form.setFieldValue('category', key);
                },
              }}
            >
              <button
                type="button"
                aria-label={t('所属分类')}
                className="sub-sheet-value-btn"
              >
                <i
                  className="sub-cat-dot"
                  style={{ background: categories[watchedCategory].color }}
                />
                <span>{t(categories[watchedCategory].label)}</span>
                <ChevronDown size={14} className="sub-sheet-chevron" />
              </button>
            </Dropdown>
          </div>
        </div>

        {/* 2. Next Billing Date */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <Calendar size={16} strokeWidth={1.75} />
            <span>{watchedCycle === 'once' ? t('购买日期') : t('下次扣款')}</span>
          </span>
          <div className="sub-sheet-control">
            <Form.Item
              name="dueDate"
              noStyle
              rules={[{ required: true, message: t('请选择日期') }]}
            >
              <DatePicker
                variant="borderless"
                suffixIcon={null}
                allowClear={false}
                inputReadOnly
                aria-label={t('下次到期 / 扣款日期')}
                className="sub-sheet-datepicker"
                renderExtraFooter={watchedCycle === 'once'
                  ? undefined
                  : () => (
                      <div className="sub-datepicker-shortcuts">
                        <button
                          type="button"
                          onClick={() => form.setFieldValue('dueDate', defaultCycleDueDate(watchedCycle, watchedInterval))}
                        >
                          {t('顺延一周期')}
                        </button>
                        <button
                          type="button"
                          onClick={() => form.setFieldValue('dueDate', dayjs().add(7, 'day'))}
                        >
                          {t('7天试用')}
                        </button>
                        <button
                          type="button"
                          onClick={() => form.setFieldValue('dueDate', dayjs().add(1, 'month'))}
                        >
                          {t('1个月后')}
                        </button>
                        <button
                          type="button"
                          onClick={() => form.setFieldValue('dueDate', dayjs().add(1, 'year'))}
                        >
                          {t('1年后')}
                        </button>
                      </div>
                    )}
              />
            </Form.Item>
            {countdownBadge && (
              <span className={`sub-sheet-due-badge ${countdownBadge.tone}`}>
                {countdownBadge.text}
              </span>
            )}
          </div>
        </div>

        {/* 3. Renewal Method Segmented */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <RefreshCw size={16} strokeWidth={1.75} />
            <span>{t('续费方式')}</span>
          </span>
          <div className="sub-sheet-control">
            <div className="sub-sheet-segmented" role="radiogroup" aria-label={t('续费方式')}>
              <button
                type="button"
                role="radio"
                aria-checked={watchedRenewalMode === 'auto'}
                className={`sub-sheet-seg-item ${watchedRenewalMode === 'auto' ? 'is-active' : ''}`}
                onClick={() => form.setFieldValue('renewalMode', 'auto')}
              >
                {t('自动扣款')}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={watchedRenewalMode === 'manual'}
                className={`sub-sheet-seg-item ${watchedRenewalMode === 'manual' ? 'is-active' : ''}`}
                onClick={() => form.setFieldValue('renewalMode', 'manual')}
              >
                {t('手动')}
              </button>
            </div>
          </div>
        </div>

        {/* 4. Renewal Intention */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <ShieldCheck size={16} strokeWidth={1.75} />
            <span>{t('续退意向')}</span>
          </span>
          <div className="sub-sheet-control">
            <Dropdown
              trigger={['click']}
              menu={{
                selectedKeys: [watchedIntention],
                items: [
                  { key: 'normal', label: t('正常续用') },
                  { key: 'cancel', label: t('到期必退') },
                  { key: 'keep', label: t('绝版必留') },
                ],
                onClick: ({ key }) => {
                  form.setFieldValue('intention', key);
                },
              }}
            >
              <button
                type="button"
                aria-label={t('续退意向')}
                className={`sub-sheet-value-btn ${intentionToneClass}`}
              >
                <span>
                  {watchedIntention === 'cancel'
                    ? t('到期必退')
                    : watchedIntention === 'keep'
                      ? t('绝版必留')
                      : t('正常续用')}
                </span>
                <ChevronDown size={14} className="sub-sheet-chevron" />
              </button>
            </Dropdown>
          </div>
        </div>

        {/* 5. Service Account (归属账号 — Searchable Dropdown + Quick Add) */}
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
                subName={watchedName}
                subCategory={watchedCategory}
                initialIncludeId={initialAccountId}
                disabled={submitting}
              />
            </Form.Item>
          </div>
        </div>

        {/* 6. Billing Account (扣款账号 — Searchable Dropdown + Quick Add) */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <CreditCard size={16} strokeWidth={1.75} />
            <span>{t('扣款账号')}</span>
          </span>
          <div className="sub-sheet-control">
            <Form.Item name="billingAccountId" noStyle>
              <AccountQuickDropdown
                kind="billing"
                accounts={accounts}
                presetKey={presetKey}
                subName={watchedName}
                subCategory={watchedCategory}
                excludeAccountId={watchedAccountId || undefined}
                hasPrimaryAccount={Boolean(watchedAccountId)}
                initialIncludeId={initialBillingAccountId}
                disabled={submitting}
              />
            </Form.Item>
          </div>
        </div>

        {/* 7. Archive Toggle (Edit Mode Only) */}
        {isEditing && (
          <div className="sub-sheet-row">
            <span className="sub-sheet-label">
              <Archive size={16} strokeWidth={1.75} />
              <span>{t('归档此订阅')}</span>
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
        )}
      </div>

      {/* Optional Expandable Inline Rows */}
      {anyExtraOpen && (
        <div className="sub-sheet-extras">
          {isExtraVisible('renewalAmount') && (
            <div className="sub-sheet-row sub-sheet-extra-row">
              <span className="sub-sheet-label">
                <Tag size={15} strokeWidth={1.75} />
                <span>{t('续费原价')}</span>
              </span>
              <div className="sub-sheet-control">
                <span className="sub-sheet-extra-prefix">{currencySymbols[watchedCurrency]}</span>
                <Form.Item name="renewalAmount" noStyle>
                  <InputNumber
                    variant="borderless"
                    aria-label={t('续费原价')}
                    min={0}
                    max={1000000000}
                    precision={2}
                    controls={false}
                    placeholder={t('选填，同当前币种')}
                    className="sub-sheet-extra-number"
                  />
                </Form.Item>
                <button
                  type="button"
                  aria-label={t('收起此项')}
                  className="sub-sheet-extra-remove"
                  onClick={() => clearAndCloseExtra('renewalAmount')}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {isExtraVisible('managementUrl') && (
            <div className="sub-sheet-row sub-sheet-extra-row">
              <span className="sub-sheet-label">
                <Link2 size={15} strokeWidth={1.75} />
                <span>{t('退订网址')}</span>
              </span>
              <div className="sub-sheet-control sub-sheet-control-wide">
                <Form.Item
                  name="managementUrl"
                  className="sub-sheet-inline-form-item"
                  rules={[{ type: 'url', message: t('请输入有效的 HTTP 或 HTTPS 网址') }]}
                >
                  <Input
                    variant="borderless"
                    aria-label={t('退订网址')}
                    placeholder="https://..."
                    maxLength={2000}
                    className="sub-sheet-extra-input"
                  />
                </Form.Item>
                <button
                  type="button"
                  aria-label={t('收起此项')}
                  className="sub-sheet-extra-remove"
                  onClick={() => clearAndCloseExtra('managementUrl')}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {isExtraVisible('paymentMethod') && (
            <div className="sub-sheet-row sub-sheet-extra-row">
              <span className="sub-sheet-label">
                <Wallet size={15} strokeWidth={1.75} />
                <span>{t('支付方式')}</span>
              </span>
              <div className="sub-sheet-control sub-sheet-control-wide">
                <Form.Item name="paymentMethod" noStyle>
                  <Input
                    variant="borderless"
                    aria-label={t('支付方式')}
                    placeholder={t('选填，例如 Visa *8812')}
                    maxLength={200}
                    className="sub-sheet-extra-input"
                  />
                </Form.Item>
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: paymentMethodPresets.map((item) => {
                      const text = locale === 'en-US' ? item.en : item.zh;
                      return { key: text, label: text };
                    }),
                    onClick: ({ key }) => form.setFieldValue('paymentMethod', key),
                  }}
                >
                  <button type="button" className="sub-sheet-preset-mini">
                    <ChevronDown size={13} />
                  </button>
                </Dropdown>
                <button
                  type="button"
                  aria-label={t('收起此项')}
                  className="sub-sheet-extra-remove"
                  onClick={() => clearAndCloseExtra('paymentMethod')}
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
                  onClick={() => clearAndCloseExtra('notes')}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {isExtraVisible('accountNote') && Boolean(watchedLegacyAccount.trim()) && (
            <div className="sub-sheet-row sub-sheet-extra-row">
              <span className="sub-sheet-label">
                <UserRound size={15} strokeWidth={1.75} />
                <span>{t('补充账号备注')}</span>
              </span>
              <div className="sub-sheet-control sub-sheet-control-wide">
                <Form.Item name="account" noStyle>
                  <Input
                    variant="borderless"
                    aria-label={t('补充账号备注')}
                    placeholder={t('选填，如家庭车位备注、帮家人代付或未建档外部号')}
                    maxLength={200}
                    className="sub-sheet-extra-input"
                  />
                </Form.Item>
                <button
                  type="button"
                  aria-label={t('收起此项')}
                  className="sub-sheet-extra-remove"
                  onClick={() => clearAndCloseExtra('accountNote')}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quiet Footer Bar: Optional Links on Left, Cancel + Pill Save on Right */}
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
            {t('保存订阅')}
          </Button>
        </div>
      </div>
    </div>
  );
}
