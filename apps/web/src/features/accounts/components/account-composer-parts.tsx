import type { Account, AccountInput } from '@irm/api-client';
import {
  App,
  Button,
  Checkbox,
  DatePicker,
  Dropdown,
  Form,
  type FormInstance,
  Input,
  InputNumber,
  Popover,
  Slider,
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
  Dices,
  FileText,
  Folder,
  KeyRound,
  Link2,
  LockKeyhole,
  Phone,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  UserCheck,
  UserRound,
  X,
} from 'lucide-react';
import { type CSSProperties, useMemo, useState } from 'react';

import type { MessageKey } from '../../../app/messages';
import { usePreferences } from '../../../app/preferences-context';
import {
  type AccountPreset,
  type AccountPresetGroup,
  accountPresetGroups,
  type AccountPresetVariant,
  filterAccountPresets,
  findAccountPreset,
  phoneHintPresets,
  regionPresets,
  resolveAccountPreset,
  vaultPresets,
} from '../presets/account-presets';
import {
  accountCategoryMeta,
  accountDisplayTitle,
  keepaliveCycles,
  nextKeepaliveDate,
} from '../utils/account-metrics';
import { parseTotpInput } from '../vault/totp';
import { useVault } from '../vault/vault-context';
import { generateStrongPassword } from '../vault/vault-crypto';
import { AccountMark } from './account-mark';
import { TotpLiveBadge } from './totp-live-badge';

export type AccountExtraKey = 'identity' | 'phone' | 'recoveryCodes' | 'securityUrl' | 'notes';

function defaultCheckinDate(cycle: AccountInput['keepaliveCycle'], days = 90): Dayjs {
  const today = dayjs().format('YYYY-MM-DD');
  const next = nextKeepaliveDate(today, cycle, days);
  return dayjs(next ?? today);
}

function AccountPresetPopover({
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
  onSelectPreset: (preset: AccountPreset) => void;
  onClearPreset: () => void;
  children: React.ReactNode;
}) {
  const { t, locale } = usePreferences();
  const [group, setGroup] = useState<AccountPresetGroup>('popular');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => filterAccountPresets(query, group), [query, group]);

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
              aria-label={t('搜索平台预设')}
              prefix={<Search size={14} className="text-gray-400" />}
              placeholder={t('搜索预设，如 微信、Gmail、TikHub、OpenRouter、Apple...')}
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </div>

          {!query.trim() && (
            <div className="preset-popover-tabs" role="tablist">
              {accountPresetGroups.map(item => (
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
              const displayName = locale === 'en-US' ? preset.platform.en : preset.platform.zh;
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
                  <AccountMark preset={preset} size="sm" />
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

function RecoveryAccountDropdown({
  accounts,
  recoveryAccountId,
  recoveryEmail,
  onSelectAccount,
  onEmailChange,
  disabled,
}: {
  accounts: Account[];
  recoveryAccountId: string;
  recoveryEmail: string;
  onSelectAccount: (id: string) => void;
  onEmailChange: (email: string) => void;
  disabled?: boolean;
}) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = useMemo(
    () => (recoveryAccountId ? accounts.find(item => item.id === recoveryAccountId) : undefined),
    [accounts, recoveryAccountId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(item =>
      `${item.platform} ${item.label} ${item.identifier}`.toLowerCase().includes(q),
    );
  }, [accounts, search]);

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(next) => {
        if (!disabled) {
          setOpen(next);
          if (!next) setSearch('');
        }
      }}
      placement="bottomRight"
      arrow={false}
      rootClassName="account-dropdown-popover"
      content={(
        <div className="account-dropdown-panel" role="group" aria-label={t('救援账号')}>
          <div className="account-dropdown-search">
            <Input
              size="small"
              variant="borderless"
              allowClear
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              prefix={<Search size={14} className="text-gray-400" />}
              placeholder={t('搜索账号名称、邮箱或标识...')}
            />
          </div>

          <div className="account-dropdown-list" role="listbox">
            {(recoveryAccountId || recoveryEmail.trim()) && (
              <button
                type="button"
                className="account-dropdown-clear"
                onClick={() => {
                  onSelectAccount('');
                  onEmailChange('');
                  setOpen(false);
                }}
              >
                <X size={13} />
                <span>{t('未填写')}</span>
              </button>
            )}

            {filtered.length === 0
              ? (
                  <div className="account-dropdown-empty">
                    <span>{t('未找到匹配的已存账号')}</span>
                  </div>
                )
              : (
                  <div className="account-dropdown-group">
                    {filtered.map((item) => {
                      const active = item.id === recoveryAccountId;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={`account-dropdown-option ${active ? 'is-active' : ''}`}
                          onClick={() => {
                            onSelectAccount(item.id);
                            setOpen(false);
                          }}
                        >
                          <AccountMark value={item} size="sm" />
                          <span className="account-dropdown-meta">
                            <span className="account-dropdown-title-row">
                              <strong>{accountDisplayTitle(item)}</strong>
                            </span>
                            <small>{item.identifier}</small>
                          </span>
                          {active && <Check size={14} className="account-dropdown-check" />}
                        </button>
                      );
                    })}
                  </div>
                )}
          </div>

          <div className="account-dropdown-footer">
            <Input
              size="small"
              variant="borderless"
              aria-label={t('补充外部救援邮箱')}
              placeholder={t('选填，未入库的救援邮箱')}
              value={recoveryEmail}
              maxLength={200}
              onChange={e => onEmailChange(e.target.value)}
              onPressEnter={(e) => {
                e.preventDefault();
                setOpen(false);
              }}
            />
          </div>
        </div>
      )}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={t('救援账号')}
        className={`sub-sheet-value-btn sub-sheet-account-trigger ${selected || recoveryEmail.trim() ? 'has-value' : 'is-empty'}`}
      >
        {selected
          ? (
              <>
                <AccountMark value={selected} size="sm" />
                <span className="sub-sheet-account-name">{accountDisplayTitle(selected)}</span>
                <span className="sub-sheet-account-sep">·</span>
                <span className="sub-sheet-account-id">{selected.identifier}</span>
              </>
            )
          : recoveryEmail.trim()
            ? (
                <span className="sub-sheet-account-id">{recoveryEmail.trim()}</span>
              )
            : (
                <span className="sub-sheet-placeholder">{t('选择救援邮箱或外部邮箱')}</span>
              )}
        <ChevronDown size={14} className="sub-sheet-chevron" />
      </button>
    </Popover>
  );
}

export function AccountPropertySheet({
  form,
  presetKey,
  variantId,
  onSelectPreset,
  onSelectVariant,
  onClearPreset,
  emailAccounts,
  ssoAccounts,
  password,
  totpInput,
  recoveryCodesText,
  onPasswordChange,
  onTotpInputChange,
  onRecoveryCodesTextChange,
  isEditing,
  initialOpenExtras,
  submitting,
  onCancel,
}: {
  form: FormInstance;
  presetKey: string;
  variantId?: string;
  onSelectPreset: (preset: AccountPreset) => void;
  onSelectVariant?: (variant: AccountPresetVariant) => void;
  onClearPreset: () => void;
  emailAccounts: Account[];
  ssoAccounts: Account[];
  password: string;
  totpInput: string;
  recoveryCodesText: string;
  onPasswordChange: (next: string) => void;
  onTotpInputChange: (next: string) => void;
  onRecoveryCodesTextChange: (next: string) => void;
  isEditing?: boolean;
  initialOpenExtras?: AccountExtraKey[];
  submitting?: boolean;
  onCancel: () => void;
}) {
  const { t, locale } = usePreferences();
  const { message } = App.useApp();
  const vault = useVault();

  const [presetOpen, setPresetOpen] = useState(false);
  const [openExtras, setOpenExtras] = useState<AccountExtraKey[]>(() => initialOpenExtras ?? []);
  const [genLength, setGenLength] = useState(20);
  const [genSymbols, setGenSymbols] = useState(true);

  const watchedPlatform = (Form.useWatch('platform') as string | undefined) ?? '';
  const watchedLabel = (Form.useWatch('label') as string | undefined) ?? '';
  const watchedUid = (Form.useWatch('uid') as string | undefined) ?? '';
  const watchedCategory = (Form.useWatch('category') as AccountInput['category'] | undefined) ?? 'other';
  const watchedRegion = (Form.useWatch('region') as string | undefined) ?? 'GLOBAL';
  const watchedRole = (Form.useWatch('role') as AccountInput['role'] | undefined) ?? 'primary';
  const watchedStatus = (Form.useWatch('status') as AccountInput['status'] | undefined) ?? 'active';
  const watchedAuthMethod = (Form.useWatch('authMethod') as AccountInput['authMethod'] | undefined) ?? 'password';
  const watchedSsoId = (Form.useWatch('ssoAccountId') as string | undefined) ?? '';
  const watchedRecoveryId = (Form.useWatch('recoveryAccountId') as string | undefined) ?? '';
  const watchedRecoveryEmail = (Form.useWatch('recoveryEmail') as string | undefined) ?? '';
  const watchedPhoneHint = (Form.useWatch('phoneHint') as string | undefined) ?? '';
  const watchedTwoFactor = (Form.useWatch('twoFactor') as AccountInput['twoFactor'] | undefined) ?? 'none';
  const watchedRecoveryCodes = (Form.useWatch('recoveryCodes') as AccountInput['recoveryCodes'] | undefined) ?? 'not_applicable';
  const watchedKycStatus = (Form.useWatch('kycStatus') as AccountInput['kycStatus'] | undefined) ?? 'none';
  const watchedKeepaliveCycle = (Form.useWatch('keepaliveCycle') as AccountInput['keepaliveCycle'] | undefined) ?? 'none';
  const watchedKeepaliveDays = (Form.useWatch('keepaliveDays') as number | undefined) ?? 90;
  const watchedNextCheckin = Form.useWatch('nextCheckinDate') as Dayjs | undefined;
  const watchedSecurityUrl = (Form.useWatch('securityUrl') as string | undefined) ?? '';
  const watchedVaultRef = (Form.useWatch('vaultReference') as string | undefined) ?? '';
  const watchedNotes = (Form.useWatch('notes') as string | undefined) ?? '';

  const explicitPreset = findAccountPreset(presetKey);
  const activePreset = explicitPreset ?? resolveAccountPreset({ presetKey, platform: watchedPlatform });
  const catMeta = accountCategoryMeta[watchedCategory];

  const parsedTotp = useMemo(() => {
    const trimmed = totpInput.trim();
    if (!trimmed) return { config: undefined, valid: true };
    try {
      return { config: parseTotpInput(trimmed), valid: true };
    }
    catch {
      return { config: undefined, valid: false };
    }
  }, [totpInput]);

  const fillGeneratedPassword = async (len = genLength, symbols = genSymbols) => {
    const generated = generateStrongPassword({ length: len, symbols });
    onPasswordChange(generated);
    try {
      await navigator.clipboard.writeText(generated);
    }
    catch {
      /* Clipboard may be restricted in non-HTTPS contexts. */
    }
    void message.success(t('已生成随机强密码'));
  };

  const regionShortLabel = useMemo(() => {
    const clean = watchedRegion.trim().toUpperCase() || 'GLOBAL';
    const found = regionPresets.find(item => item.code === clean);
    if (!found) return clean;
    if (locale === 'en-US') return clean;
    const shortZh = found.zh.replace(/\s*\([A-Z]+\)$/, '');
    return clean === 'GLOBAL' ? shortZh : `${clean} ${shortZh}`;
  }, [watchedRegion, locale]);

  const roleLabel = watchedRole === 'hub'
    ? t('核心枢纽')
    : watchedRole === 'alt'
      ? t('备用小号')
      : t('主力日常');

  const selectedSsoAccount = useMemo(
    () => (watchedSsoId ? ssoAccounts.find(item => item.id === watchedSsoId) : undefined),
    [ssoAccounts, watchedSsoId],
  );

  const isExtraVisible = (key: AccountExtraKey) => openExtras.includes(key);
  const toggleExtra = (key: AccountExtraKey) => {
    setOpenExtras(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };

  const extraFooterLinks: { key: AccountExtraKey; label: string; hasValue: boolean }[] = [
    { key: 'identity', label: t('区分标签 / UID'), hasValue: Boolean(watchedLabel.trim() || watchedUid.trim()) },
    { key: 'phone', label: t('手机尾号'), hasValue: Boolean(watchedPhoneHint.trim()) },
    { key: 'recoveryCodes', label: t('恢复码'), hasValue: Boolean(recoveryCodesText.trim() || watchedRecoveryCodes === 'saved') },
    { key: 'securityUrl', label: t('安全网址'), hasValue: Boolean(watchedSecurityUrl.trim() || watchedVaultRef.trim()) },
    { key: 'notes', label: t('备注'), hasValue: Boolean(watchedNotes.trim()) },
  ];

  const anyExtraOpen = extraFooterLinks.some(item => isExtraVisible(item.key));

  return (
    <div className="sub-sheet">
      {/* Hidden backing fields */}
      <Form.Item name="ecosystem" hidden><Input /></Form.Item>
      <Form.Item name="region" hidden><Input /></Form.Item>
      <Form.Item name="role" hidden><Input /></Form.Item>
      <Form.Item name="status" hidden><Input /></Form.Item>
      <Form.Item name="category" hidden><Input /></Form.Item>
      <Form.Item name="authMethod" hidden><Input /></Form.Item>
      <Form.Item name="ssoAccountId" hidden><Input /></Form.Item>
      <Form.Item name="recoveryAccountId" hidden><Input /></Form.Item>
      <Form.Item name="recoveryEmail" hidden><Input /></Form.Item>
      <Form.Item name="twoFactor" hidden><Input /></Form.Item>
      <Form.Item name="recoveryCodes" hidden><Input /></Form.Item>
      <Form.Item name="kycStatus" hidden><Input /></Form.Item>
      <Form.Item name="keepaliveCycle" hidden><Input /></Form.Item>

      {/* Hero: Digital Identity Passport */}
      <div className="sub-sheet-hero">
        <div className="sub-sheet-identity">
          <AccountPresetPopover
            open={presetOpen}
            onOpenChange={setPresetOpen}
            presetKey={presetKey}
            onSelectPreset={onSelectPreset}
            onClearPreset={onClearPreset}
          >
            <button
              type="button"
              aria-label={t('更换平台')}
              className="sub-sheet-mark-btn"
            >
              <AccountMark
                preset={activePreset}
                value={activePreset ? undefined : { presetKey: '', platform: watchedPlatform || '?', category: watchedCategory }}
                size="lg"
              />
            </button>
          </AccountPresetPopover>

          <div className="sub-sheet-title-col">
            <div className="account-title-inline">
              <Form.Item
                name="platform"
                className="sub-sheet-name-item"
                rules={[
                  { required: true, whitespace: true, message: t('请输入平台名称') },
                  { max: 100, message: t('最多 100 个字符') },
                ]}
              >
                <Input
                  variant="borderless"
                  aria-label={t('平台名称')}
                  placeholder={t('例如 Gmail、微信、Apple 账户')}
                  maxLength={100}
                  autoComplete="off"
                  className="sub-sheet-title-input"
                />
              </Form.Item>

              <Dropdown
                trigger={['click']}
                menu={{
                  selectedKeys: [variantId ? `variant:${variantId}` : watchedRegion],
                  items: [
                    ...(activePreset?.variants && onSelectVariant
                      ? [
                          {
                            type: 'group' as const,
                            label: t('常用区服选择'),
                            children: activePreset.variants.map(v => ({
                              key: `variant:${v.id}`,
                              label: locale === 'en-US' ? v.label.en : v.label.zh,
                            })),
                          },
                          { type: 'divider' as const },
                        ]
                      : []),
                    ...regionPresets.map(r => ({
                      key: r.code,
                      label: locale === 'en-US' ? r.en : r.zh,
                    })),
                  ],
                  onClick: ({ key }) => {
                    if (key.startsWith('variant:') && activePreset?.variants && onSelectVariant) {
                      const target = activePreset.variants.find(v => `variant:${v.id}` === key);
                      if (target) onSelectVariant(target);
                      return;
                    }
                    form.setFieldsValue({
                      region: key,
                      ecosystem: key === 'CN' ? 'domestic' : 'overseas',
                    });
                  },
                }}
              >
                <button
                  type="button"
                  aria-label={t('区服 / 地区')}
                  className="sub-sheet-cycle-pill"
                >
                  <span>{regionShortLabel}</span>
                  <ChevronDown size={13} />
                </button>
              </Dropdown>
            </div>

            <div className="sub-sheet-subtitle-row">
              <button
                type="button"
                className="sub-sheet-preset-link"
                onClick={() => setPresetOpen(true)}
              >
                {t('点击切换平台预设')}
              </button>

              <Dropdown
                trigger={['click']}
                menu={{
                  selectedKeys: [watchedRole],
                  items: [
                    { key: 'hub', label: t('核心枢纽') },
                    { key: 'primary', label: t('主力日常') },
                    { key: 'alt', label: t('备用小号') },
                  ],
                  onClick: ({ key }) => form.setFieldValue('role', key),
                }}
              >
                <button type="button" className="sub-sheet-plan-switch">
                  <span>{roleLabel}</span>
                  <ChevronDown size={12} />
                </button>
              </Dropdown>
            </div>
          </div>
        </div>

        <div className="sheet-hero-right">
          <Form.Item
            name="identifier"
            className="sheet-hero-mono-item"
            rules={[{ required: true, whitespace: true, message: t('请输入主登录标识') }]}
          >
            <Input
              variant="borderless"
              aria-label={t('主登录标识')}
              placeholder="alex.work@gmail.com"
              maxLength={200}
              autoComplete="off"
              className="sheet-hero-mono-input"
            />
          </Form.Item>
          <span className="sheet-hero-caption">
            {watchedLabel.trim()
              ? `${t('主登录标识')} · ${watchedLabel.trim()}`
              : t('主登录标识')}
          </span>
        </div>
      </div>

      {/* Signature Strip: Zero-Knowledge Dual-Slot Credential Bar */}
      <div className="sheet-signature-strip">
        <div className="account-cred-head">
          <span className="account-cred-badge">
            <LockKeyhole size={13} />
            <span>{t('端到端加密凭据')}</span>
          </span>
          <div className="inline-flex items-center gap-2">
            {vault.unlocked && parsedTotp.config && (
              <TotpLiveBadge
                totp={parsedTotp.config}
                hasTotp
                accountName={watchedPlatform.trim() || t('新建账号')}
              />
            )}
            <Dropdown
              trigger={['click']}
              menu={{
                selectedKeys: [watchedTwoFactor],
                items: [
                  { key: 'none', label: `${t('两步验证')} · ${t('未开启')}` },
                  { key: 'totp', label: t('验证器 App (TOTP)') },
                  { key: 'passkey', label: t('Passkey 通行密钥') },
                  { key: 'hardware', label: t('硬件密钥') },
                  { key: 'sms', label: t('短信验证') },
                  { key: 'email', label: t('邮件验证') },
                ],
                onClick: ({ key }) => form.setFieldValue('twoFactor', key),
              }}
            >
              <button type="button" className="sub-sheet-plan-switch">
                <span>
                  {watchedTwoFactor === 'none'
                    ? t('未开 2FA')
                    : watchedTwoFactor.toUpperCase()}
                </span>
                <ChevronDown size={11} />
              </button>
            </Dropdown>
          </div>
        </div>

        {!vault.initialized
          ? (
              <div className="account-cred-locked-bar">
                <span>{t('尚未初始化加密保险箱，初始化后即可在此直接托管密码、实时 2FA 动态码与恢复码。')}</span>
                <Button
                  type="primary"
                  size="small"
                  icon={<KeyRound size={13} />}
                  onClick={() => vault.openModal('setup')}
                >
                  {t('初始化保险箱')}
                </Button>
              </div>
            )
          : !vault.unlocked
              ? (
                  <div className="account-cred-locked-bar">
                    <span>{t('加密保险箱当前已锁定，解锁后可录入、查看或修改密码与 2FA 密钥（不解锁也可正常保存普通台账信息）。')}</span>
                    <Button
                      size="small"
                      icon={<LockKeyhole size={13} />}
                      onClick={() => vault.openModal('unlock')}
                    >
                      {t('解锁保险箱')}
                    </Button>
                  </div>
                )
              : (
                  <>
                    <div className="account-cred-slots">
                      <div className="account-cred-slot">
                        <span className="account-cred-slot-label">{t('密码')}</span>
                        <Input.Password
                          variant="borderless"
                          aria-label={t('账号密码（加密存储）')}
                          value={password}
                          onChange={e => onPasswordChange(e.target.value)}
                          placeholder={t('留空不存密码')}
                          maxLength={500}
                          autoComplete="new-password"
                          className="account-cred-pwd"
                        />
                        <button
                          type="button"
                          aria-label={t('生成强密码')}
                          title={t('生成强密码')}
                          className="account-cred-icon-btn"
                          onClick={() => {
                            void fillGeneratedPassword();
                          }}
                        >
                          <Dices size={13} />
                        </button>
                        <Popover
                          trigger="click"
                          placement="bottomRight"
                          arrow={false}
                          rootClassName="sheet-detail-popover"
                          content={(
                            <div className="sheet-detail-panel">
                              <div className="sheet-detail-title">
                                <span>{t('密码长度')}</span>
                                <strong>{genLength}</strong>
                              </div>
                              <Slider min={12} max={48} value={genLength} onChange={setGenLength} />
                              <Checkbox checked={genSymbols} onChange={e => setGenSymbols(e.target.checked)}>
                                {t('包含特殊符号')}
                              </Checkbox>
                              <Button
                                size="small"
                                type="primary"
                                onClick={() => {
                                  void fillGeneratedPassword(genLength, genSymbols);
                                }}
                              >
                                {t('随机生成并填入强密码')}
                              </Button>
                            </div>
                          )}
                        >
                          <button
                            type="button"
                            aria-label={t('密码生成设置')}
                            className="account-cred-icon-btn"
                          >
                            <Settings2 size={13} />
                          </button>
                        </Popover>
                      </div>

                      <div className="account-cred-slot">
                        <span className="account-cred-slot-label">{t('2FA 动态码')}</span>
                        <Input
                          variant="borderless"
                          aria-label={t('2FA 动态密钥 (TOTP / otpauth://)')}
                          value={totpInput}
                          onChange={e => onTotpInputChange(e.target.value)}
                          status={parsedTotp.valid ? undefined : 'error'}
                          placeholder={t('粘贴 TOTP 密钥')}
                          maxLength={1000}
                          allowClear
                          className="account-cred-totp-input"
                        />
                      </div>
                    </div>

                    {!parsedTotp.valid && (
                      <div className="account-quick-error mt-2" role="alert">
                        {t('TOTP 密钥格式无效，请输入有效的 Base32 密钥或 otpauth://totp 链接')}
                      </div>
                    )}
                  </>
                )}
      </div>

      <div className="sub-sheet-divider" />

      {/* Frameless Property Rows */}
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
                items: Object.entries(accountCategoryMeta).map(([key, meta]) => ({
                  key,
                  label: (
                    <span className="inline-flex items-center gap-2">
                      <i className="sub-cat-dot" style={{ backgroundColor: meta.color }} />
                      <span>{t(meta.label)}</span>
                    </span>
                  ),
                })),
                onClick: ({ key }) => form.setFieldValue('category', key),
              }}
            >
              <button
                type="button"
                aria-label={t('所属分类')}
                className="sub-sheet-value-btn"
              >
                <i className="sub-cat-dot" style={{ backgroundColor: catMeta.color }} />
                <span>{t(catMeta.label)}</span>
                <ChevronDown size={14} className="sub-sheet-chevron" />
              </button>
            </Dropdown>
          </div>
        </div>

        {/* 2. Auth Method */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <KeyRound size={16} strokeWidth={1.75} />
            <span>{t('认证方式')}</span>
          </span>
          <div className="sub-sheet-control">
            {watchedAuthMethod === 'sso' && (
              <Dropdown
                trigger={['click']}
                menu={{
                  selectedKeys: [watchedSsoId],
                  items: [
                    { key: '', label: t('未填写') },
                    ...ssoAccounts.map(acc => ({
                      key: acc.id,
                      label: `${accountDisplayTitle(acc)} (${acc.identifier})`,
                    })),
                  ],
                  onClick: ({ key }) => form.setFieldValue('ssoAccountId', key),
                }}
              >
                <button type="button" className="sub-sheet-plan-switch">
                  <span>
                    {selectedSsoAccount
                      ? accountDisplayTitle(selectedSsoAccount)
                      : t('上游 SSO 登录账号')}
                  </span>
                  <ChevronDown size={12} />
                </button>
              </Dropdown>
            )}

            <div className="sub-sheet-segmented" role="radiogroup" aria-label={t('认证方式')}>
              {([
                { key: 'password', label: t('密码直登') },
                { key: 'passkey', label: t('通行密钥') },
                { key: 'sso', label: t('SSO 授权') },
                { key: 'code', label: t('验证码') },
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={watchedAuthMethod === opt.key}
                  className={`sub-sheet-seg-item ${watchedAuthMethod === opt.key ? 'is-active' : ''}`}
                  onClick={() => form.setFieldValue('authMethod', opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Recovery Account */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <UserCheck size={16} strokeWidth={1.75} />
            <span>{t('救援账号')}</span>
          </span>
          <div className="sub-sheet-control">
            <RecoveryAccountDropdown
              accounts={emailAccounts}
              recoveryAccountId={watchedRecoveryId}
              recoveryEmail={watchedRecoveryEmail}
              onSelectAccount={id => form.setFieldValue('recoveryAccountId', id)}
              onEmailChange={email => form.setFieldValue('recoveryEmail', email)}
              disabled={submitting}
            />
          </div>
        </div>

        {/* 4. Keep-Alive */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <Calendar size={16} strokeWidth={1.75} />
            <span>{t('闲置保活')}</span>
          </span>
          <div className="sub-sheet-control">
            {watchedKeepaliveCycle === 'custom' && (
              <span className="sub-sheet-custom-days">
                <Form.Item name="keepaliveDays" noStyle>
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

            {watchedKeepaliveCycle !== 'none' && (
              <Form.Item
                name="nextCheckinDate"
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
                selectedKeys: [watchedKeepaliveCycle],
                items: Object.entries(keepaliveCycles).map(([key, label]) => ({
                  key,
                  label: t(label),
                })),
                onClick: ({ key }) => {
                  const nextCycle = key as AccountInput['keepaliveCycle'];
                  form.setFieldValue('keepaliveCycle', nextCycle);
                  if (nextCycle !== 'none' && !watchedNextCheckin) {
                    form.setFieldValue('nextCheckinDate', defaultCheckinDate(nextCycle, watchedKeepaliveDays || 90));
                  }
                },
              }}
            >
              <button
                type="button"
                aria-label={t('闲置保活')}
                className="sub-sheet-value-btn"
              >
                <span>{t(keepaliveCycles[watchedKeepaliveCycle])}</span>
                <ChevronDown size={14} className="sub-sheet-chevron" />
              </button>
            </Dropdown>

            {watchedKeepaliveCycle !== 'none' && (
              <span className="sub-sheet-due-badge is-warm">{t('防回收提醒')}</span>
            )}
          </div>
        </div>

        {/* 5. KYC Status */}
        <div className="sub-sheet-row">
          <span className="sub-sheet-label">
            <ShieldCheck size={16} strokeWidth={1.75} />
            <span>{t('实名状态')}</span>
          </span>
          <div className="sub-sheet-control">
            {watchedKycStatus === 'verified' && (
              <Form.Item name="kycNote" noStyle>
                <Input
                  variant="borderless"
                  aria-label={t('实名主体备注')}
                  placeholder={t('例如 本人、家人（禁填证件号）')}
                  maxLength={60}
                  className="sub-sheet-extra-input"
                  style={{ width: 196 }}
                />
              </Form.Item>
            )}
            <Dropdown
              trigger={['click']}
              menu={{
                selectedKeys: [watchedKycStatus],
                items: [
                  { key: 'none', label: t('未实名') },
                  { key: 'verified', label: t('已实名') },
                ],
                onClick: ({ key }) => form.setFieldValue('kycStatus', key),
              }}
            >
              <button
                type="button"
                aria-label={t('实名状态')}
                className="sub-sheet-value-btn"
              >
                <span>{watchedKycStatus === 'verified' ? t('已实名') : t('未实名')}</span>
                <ChevronDown size={14} className="sub-sheet-chevron" />
              </button>
            </Dropdown>
          </div>
        </div>

        {/* 6. Edit-Only Account Status & Archive */}
        {isEditing && (
          <>
            <div className="sub-sheet-row">
              <span className="sub-sheet-label">
                <Activity size={16} strokeWidth={1.75} />
                <span>{t('账号状态')}</span>
              </span>
              <div className="sub-sheet-control">
                <Dropdown
                  trigger={['click']}
                  menu={{
                    selectedKeys: [watchedStatus],
                    items: [
                      { key: 'active', label: t('正常在用') },
                      { key: 'retiring', label: t('计划注销') },
                      { key: 'restricted', label: t('风控受限') },
                    ],
                    onClick: ({ key }) => form.setFieldValue('status', key),
                  }}
                >
                  <button type="button" className="sub-sheet-value-btn">
                    <span>
                      {watchedStatus === 'retiring'
                        ? t('计划注销')
                        : watchedStatus === 'restricted'
                          ? t('风控受限')
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
                <span>{t('归档此账号')}</span>
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
          {isExtraVisible('identity') && (
            <div className="sub-sheet-row sub-sheet-extra-row">
              <span className="sub-sheet-label">
                <Tag size={15} strokeWidth={1.75} />
                <span>{t('区分标签 / UID')}</span>
              </span>
              <div className="sub-sheet-control sub-sheet-control-wide">
                <Form.Item name="label" noStyle>
                  <Input
                    variant="borderless"
                    aria-label={t('区分标签')}
                    placeholder={t('区分标签')}
                    maxLength={60}
                    className="sub-sheet-extra-input"
                  />
                </Form.Item>
                <span className="sheet-hero-caption">·</span>
                <Form.Item name="uid" noStyle>
                  <Input
                    variant="borderless"
                    aria-label={t('平台 UID / 编号')}
                    placeholder="UID"
                    maxLength={100}
                    className="sub-sheet-extra-input"
                  />
                </Form.Item>
                <button
                  type="button"
                  aria-label={t('收起此项')}
                  className="sub-sheet-extra-remove"
                  onClick={() => {
                    form.setFieldsValue({ label: '', uid: '' });
                    toggleExtra('identity');
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {isExtraVisible('phone') && (
            <div className="sub-sheet-row sub-sheet-extra-row">
              <span className="sub-sheet-label">
                <Phone size={15} strokeWidth={1.75} />
                <span>{t('手机尾号')}</span>
              </span>
              <div className="sub-sheet-control sub-sheet-control-wide">
                <Form.Item name="phoneHint" noStyle>
                  <Input
                    variant="borderless"
                    aria-label={t('绑定手机提示')}
                    placeholder={t('选填，如 +86 *8812、+44 *9900')}
                    maxLength={80}
                    className="sub-sheet-extra-input"
                  />
                </Form.Item>
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: phoneHintPresets.map((item) => {
                      const text = locale === 'en-US' ? item.en : item.zh;
                      return { key: text, label: text };
                    }),
                    onClick: ({ key }) => form.setFieldValue('phoneHint', key),
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
                  onClick={() => {
                    form.setFieldValue('phoneHint', '');
                    toggleExtra('phone');
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {isExtraVisible('recoveryCodes') && (
            <div className="sub-sheet-row sub-sheet-extra-row">
              <span className="sub-sheet-label">
                <ShieldAlert size={15} strokeWidth={1.75} />
                <span>{t('恢复码')}</span>
              </span>
              <div className="sub-sheet-control sub-sheet-control-wide">
                {vault.unlocked && (
                  <Input
                    variant="borderless"
                    aria-label={t('一次性恢复码全文（加密存储）')}
                    value={recoveryCodesText}
                    onChange={e => onRecoveryCodesTextChange(e.target.value)}
                    placeholder={t('每行一组恢复码，仅密文落库')}
                    maxLength={4000}
                    className="sub-sheet-extra-input"
                  />
                )}
                <Dropdown
                  trigger={['click']}
                  menu={{
                    selectedKeys: [watchedRecoveryCodes],
                    items: [
                      { key: 'not_applicable', label: t('不适用') },
                      { key: 'saved', label: t('已妥善备份') },
                      { key: 'missing', label: t('待备份确认') },
                    ],
                    onClick: ({ key }) => form.setFieldValue('recoveryCodes', key),
                  }}
                >
                  <button type="button" className="sub-sheet-plan-switch">
                    <span>
                      {watchedRecoveryCodes === 'saved'
                        ? t('已妥善备份')
                        : watchedRecoveryCodes === 'missing'
                          ? t('待备份确认')
                          : t('不适用')}
                    </span>
                    <ChevronDown size={11} />
                  </button>
                </Dropdown>
                <button
                  type="button"
                  aria-label={t('收起此项')}
                  className="sub-sheet-extra-remove"
                  onClick={() => {
                    onRecoveryCodesTextChange('');
                    form.setFieldValue('recoveryCodes', 'not_applicable');
                    toggleExtra('recoveryCodes');
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {isExtraVisible('securityUrl') && (
            <>
              <div className="sub-sheet-row sub-sheet-extra-row">
                <span className="sub-sheet-label">
                  <Link2 size={15} strokeWidth={1.75} />
                  <span>{t('安全网址')}</span>
                </span>
                <div className="sub-sheet-control sub-sheet-control-wide">
                  <Form.Item
                    name="securityUrl"
                    className="sub-sheet-inline-form-item"
                    rules={[{
                      validator: (_, urlValue: string) => {
                        if (!urlValue) return Promise.resolve();
                        try {
                          const url = new URL(urlValue);
                          if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) {
                            return Promise.resolve();
                          }
                        }
                        catch {
                          /* Handled below. */
                        }
                        return Promise.reject(new Error(t('请输入有效的 HTTP 或 HTTPS 网址')));
                      },
                    }]}
                  >
                    <Input
                      variant="borderless"
                      aria-label={t('账号安全中心网址')}
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
                      form.setFieldsValue({ securityUrl: '', vaultReference: '' });
                      toggleExtra('securityUrl');
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              <div className="sub-sheet-row sub-sheet-extra-row">
                <span className="sub-sheet-label">
                  <UserRound size={15} strokeWidth={1.75} />
                  <span>{t('密码库位置引用')}</span>
                </span>
                <div className="sub-sheet-control sub-sheet-control-wide">
                  <Form.Item name="vaultReference" noStyle>
                    <Input
                      variant="borderless"
                      aria-label={t('密码库位置引用')}
                      placeholder={t('选填，如 1Password · Google Main')}
                      maxLength={200}
                      className="sub-sheet-extra-input"
                    />
                  </Form.Item>
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: vaultPresets.map((item) => {
                        const text = locale === 'en-US' ? item.en : item.zh;
                        return { key: text, label: text };
                      }),
                      onClick: ({ key }) => form.setFieldValue('vaultReference', key),
                    }}
                  >
                    <button type="button" className="sub-sheet-preset-mini">
                      <ChevronDown size={13} />
                    </button>
                  </Dropdown>
                </div>
              </div>
            </>
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
                    aria-label={t('风控与常规备注')}
                    placeholder={t('选填，如固定美西节点登录、销号前置条件等')}
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
            {t('保存账号')}
          </Button>
        </div>
      </div>
    </div>
  );
}
