import {
  type Account,
  type AccountInput,
  saveAccount,
  type SubscriptionInput,
} from '@irm/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Popover, Select } from 'antd';
import { ArrowLeft, Check, ChevronDown, Plus, Search, UserPlus, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { errorMessage } from '../../../shared/errors';
import { AccountMark } from '../../accounts/components/account-mark';
import { findAccountPreset, regionPresets } from '../../accounts/presets/account-presets';
import { accountDisplayTitle } from '../../accounts/utils/account-metrics';
import {
  buildQuickAccountInput,
  type QuickAccountDraft,
  rankAccountsForSubscription,
  suggestedAccountPresetKeys,
  suggestQuickAccountDefaults,
} from '../utils/subscription-accounts';

export function AccountQuickDropdown({
  kind,
  value,
  onChange,
  accounts,
  presetKey,
  subName,
  subCategory,
  excludeAccountId,
  hasPrimaryAccount,
  initialIncludeId,
  disabled,
}: {
  kind: 'primary' | 'billing';
  value?: string;
  onChange?: (nextId: string) => void;
  accounts: Account[];
  presetKey: string;
  subName: string;
  subCategory: SubscriptionInput['category'];
  excludeAccountId?: string;
  hasPrimaryAccount?: boolean;
  initialIncludeId?: string;
  disabled?: boolean;
}) {
  const { t, locale } = usePreferences();
  const client = useQueryClient();
  const { message } = App.useApp();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [search, setSearch] = useState('');
  const [validationError, setValidationError] = useState('');
  const [draft, setDraft] = useState<QuickAccountDraft>({
    presetKey: '',
    platform: '',
    label: '',
    identifier: '',
    category: 'other',
    region: 'GLOBAL',
    ssoAccountId: '',
  });

  const forBilling = kind === 'billing';
  const selectedId = value ?? '';

  const selectedAccount = useMemo(
    () => (selectedId ? accounts.find(item => item.id === selectedId) : undefined),
    [accounts, selectedId],
  );

  const ranked = useMemo(
    () =>
      rankAccountsForSubscription(accounts, {
        presetKey,
        forBilling,
        excludeId: forBilling ? excludeAccountId : undefined,
        includeId: initialIncludeId || selectedId || undefined,
      }),
    [accounts, presetKey, forBilling, excludeAccountId, initialIncludeId, selectedId],
  );

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (item: Account) => {
      if (!q) return true;
      const hay = `${item.platform} ${item.label} ${item.identifier} ${item.region} ${item.presetKey}`.toLowerCase();
      return hay.includes(q);
    };
    return {
      recommended: ranked.recommended.filter(matches),
      others: ranked.others.filter(matches),
    };
  }, [ranked, search]);

  const totalMatches = filteredGroups.recommended.length + filteredGroups.others.length;

  const quickPresetKeys = useMemo(
    () => suggestedAccountPresetKeys(presetKey, forBilling),
    [presetKey, forBilling],
  );

  const regionOptions = useMemo(
    () => regionPresets.map(r => ({ value: r.code, label: locale === 'en-US' ? r.en : r.zh })),
    [locale],
  );

  const createMutation = useMutation({
    mutationFn: (input: AccountInput) => saveAccount(input),
    onSuccess: (created) => {
      client.setQueryData<{ items: Account[] }>(['accounts'], old =>
        old
          ? { items: [created, ...old.items.filter(item => item.id !== created.id)] }
          : { items: [created] },
      );
      void client.invalidateQueries({ queryKey: ['accounts'] });
      void client.invalidateQueries({ queryKey: ['nav-counts'] });
      onChange?.(created.id);
      void message.success(t('账号已创建并关联'));
      setOpen(false);
      setMode('list');
      setSearch('');
      setValidationError('');
    },
  });

  const openQuickCreate = () => {
    const defaults = suggestQuickAccountDefaults({
      presetKey,
      subName,
      subCategory,
      locale,
      forBilling,
    });
    const trimmedSearch = search.trim();
    setDraft({
      ...defaults,
      identifier: trimmedSearch || defaults.identifier,
    });
    setValidationError('');
    createMutation.reset();
    setMode('create');
  };

  const applyQuickPreset = (accPresetKey: string) => {
    const preset = findAccountPreset(accPresetKey);
    if (!preset) return;
    setDraft(prev => ({
      ...prev,
      presetKey: preset.key,
      platform: locale === 'en-US' ? preset.platform.en : preset.platform.zh,
      category: preset.category,
      region: preset.region,
    }));
    setValidationError('');
  };

  const submitCreate = () => {
    if (!draft.platform.trim()) {
      setValidationError(t('请输入平台名称'));
      return;
    }
    if (!draft.identifier.trim()) {
      setValidationError(t('请输入主登录标识'));
      return;
    }
    setValidationError('');
    createMutation.mutate(buildQuickAccountInput(draft));
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (disabled) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setMode('list');
      setSearch('');
      setValidationError('');
      createMutation.reset();
    }
  };

  const renderAccountItem = (item: Account) => {
    const active = selectedId === item.id;
    return (
      <button
        key={item.id}
        type="button"
        role="option"
        aria-selected={active}
        className={`account-dropdown-option ${active ? 'is-active' : ''}`}
        onClick={() => {
          onChange?.(item.id);
          handleOpenChange(false);
        }}
      >
        <AccountMark value={item} size="sm" />
        <span className="account-dropdown-meta">
          <span className="account-dropdown-title-row">
            <strong>{accountDisplayTitle(item)}</strong>
            {item.region && item.region !== 'GLOBAL' && (
              <span className="account-dropdown-region">{item.region}</span>
            )}
          </span>
          <small>{item.identifier}</small>
        </span>
        {active && <Check size={14} className="account-dropdown-check" />}
      </button>
    );
  };

  const quickCreateLabel = forBilling ? t('快速新建代扣账号') : t('快速新建归属账号');
  const trimmedQuery = search.trim();
  const quickFooterText = trimmedQuery && totalMatches === 0 && trimmedQuery.length <= 48
    ? t('快速添加「{query}」', { query: trimmedQuery })
    : quickCreateLabel;

  const popoverContent = (
    <div
      className="account-dropdown-panel"
      role="group"
      aria-label={mode === 'create' ? quickCreateLabel : (forBilling ? t('扣款账号') : t('归属账号'))}
    >
      {mode === 'list'
        ? (
            <>
              <div className="account-dropdown-search">
                <Input
                  size="small"
                  variant="borderless"
                  allowClear
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  prefix={<Search size={14} className="text-gray-400" />}
                  aria-label={forBilling ? t('搜索扣款账号') : t('搜索归属账号')}
                  placeholder={t('搜索账号名称、邮箱或标识...')}
                />
              </div>

              <div className="account-dropdown-list" role="listbox" aria-label={forBilling ? t('扣款账号') : t('归属账号')}>
                {!trimmedQuery && selectedId && (
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="account-dropdown-clear"
                    onClick={() => {
                      onChange?.('');
                      handleOpenChange(false);
                    }}
                  >
                    <X size={13} />
                    <span>{forBilling ? t('同归属账号（不单独指定代扣）') : t('不关联归属账号')}</span>
                  </button>
                )}

                {totalMatches === 0
                  ? (
                      <div className="account-dropdown-empty">
                        <span>{t('未找到匹配的已存账号')}</span>
                      </div>
                    )
                  : (
                      <>
                        {filteredGroups.recommended.length > 0 && (
                          <div className="account-dropdown-group">
                            <div className="account-dropdown-group-title">{t('推荐匹配')}</div>
                            {filteredGroups.recommended.map(renderAccountItem)}
                          </div>
                        )}
                        {filteredGroups.others.length > 0 && (
                          <div className="account-dropdown-group">
                            {filteredGroups.recommended.length > 0 && (
                              <div className="account-dropdown-group-title">{t('全部在用账号')}</div>
                            )}
                            {filteredGroups.others.map(renderAccountItem)}
                          </div>
                        )}
                      </>
                    )}
              </div>

              <div className="account-dropdown-footer">
                <button
                  type="button"
                  aria-label={quickCreateLabel}
                  className="account-dropdown-create-trigger"
                  onClick={openQuickCreate}
                >
                  <UserPlus size={14} />
                  <span>{quickFooterText}</span>
                </button>
              </div>
            </>
          )
        : (
            <div className="account-quick-create">
              <div className="account-quick-head">
                <button
                  type="button"
                  className="account-quick-back"
                  onClick={() => {
                    setMode('list');
                    setValidationError('');
                    createMutation.reset();
                  }}
                >
                  <ArrowLeft size={13} />
                  <span>{t('返回列表')}</span>
                </button>
                <strong>{quickCreateLabel}</strong>
              </div>

              {quickPresetKeys.length > 0 && (
                <div className="account-quick-presets">
                  {quickPresetKeys.map((key) => {
                    const preset = findAccountPreset(key);
                    if (!preset) return null;
                    const text = locale === 'en-US' ? preset.platform.en : preset.platform.zh;
                    const active = draft.presetKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`account-quick-pill ${active ? 'is-active' : ''}`}
                        onClick={() => applyQuickPreset(key)}
                      >
                        {text}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="account-quick-fields">
                <div className="account-quick-platform-row">
                  <AccountMark
                    value={{
                      presetKey: draft.presetKey,
                      platform: draft.platform || '?',
                      category: draft.category,
                    }}
                    size="sm"
                  />
                  <Input
                    size="small"
                    aria-label={t('平台名称')}
                    placeholder={t('例如 Gmail、微信、Apple 账户')}
                    value={draft.platform}
                    maxLength={100}
                    onChange={(e) => {
                      setDraft(prev => ({ ...prev, platform: e.target.value }));
                      if (validationError) setValidationError('');
                    }}
                    onPressEnter={(e) => {
                      e.preventDefault();
                      submitCreate();
                    }}
                  />
                </div>

                <Input
                  size="small"
                  autoFocus
                  aria-label={t('主登录标识')}
                  placeholder={t('邮箱 / 手机号掩码 / @用户名')}
                  value={draft.identifier}
                  maxLength={200}
                  onChange={(e) => {
                    setDraft(prev => ({ ...prev, identifier: e.target.value }));
                    if (validationError) setValidationError('');
                  }}
                  onPressEnter={(e) => {
                    e.preventDefault();
                    submitCreate();
                  }}
                />

                <div className="account-quick-subgrid">
                  <Input
                    size="small"
                    aria-label={t('区分标签')}
                    placeholder={t('区分标签')}
                    value={draft.label}
                    maxLength={60}
                    onChange={e => setDraft(prev => ({ ...prev, label: e.target.value }))}
                    onPressEnter={(e) => {
                      e.preventDefault();
                      submitCreate();
                    }}
                  />
                  <Select
                    size="small"
                    showSearch
                    optionFilterProp="label"
                    aria-label={t('区服 / 地区')}
                    value={draft.region}
                    options={regionOptions}
                    popupMatchSelectWidth={false}
                    onChange={region => setDraft(prev => ({ ...prev, region }))}
                  />
                </div>

                {(validationError || createMutation.isError) && (
                  <div className="account-quick-error" role="alert">
                    {validationError || errorMessage(createMutation.error, locale)}
                  </div>
                )}

                <Button
                  type="primary"
                  size="small"
                  block
                  icon={<Plus size={14} />}
                  loading={createMutation.isPending}
                  onClick={submitCreate}
                >
                  {t('添加并选中')}
                </Button>
              </div>
            </div>
          )}
    </div>
  );

  const placeholderText = forBilling
    ? (hasPrimaryAccount ? t('同归属账号') : t('选择或添加扣款账号'))
    : t('选择或添加账号');

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={handleOpenChange}
      placement="bottomRight"
      arrow={false}
      rootClassName="account-dropdown-popover"
      content={popoverContent}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={forBilling ? t('扣款账号') : t('归属账号')}
        aria-expanded={open}
        className={`sub-sheet-value-btn sub-sheet-account-trigger ${selectedAccount ? 'has-value' : 'is-empty'}`}
      >
        {selectedAccount
          ? (
              <>
                <AccountMark value={selectedAccount} size="sm" />
                <span className="sub-sheet-account-name">{accountDisplayTitle(selectedAccount)}</span>
                <span className="sub-sheet-account-sep">·</span>
                <span className="sub-sheet-account-id">{selectedAccount.identifier}</span>
              </>
            )
          : (
              <span className="sub-sheet-placeholder">{placeholderText}</span>
            )}
        <ChevronDown size={14} className="sub-sheet-chevron" />
      </button>
    </Popover>
  );
}
