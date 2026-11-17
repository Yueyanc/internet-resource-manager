import type { Account, AccountInput, SubscriptionInput } from '@irm/api-client';

import type { Locale } from '../../../app/messages';
import { findAccountPreset } from '../../accounts/presets/account-presets';
import { accountDisplayTitle } from '../../accounts/utils/account-metrics';
import { findPreset, type PresetGroup } from '../presets/subscription-presets';

const SUBSCRIPTION_TO_ACCOUNT_PRESETS: Record<string, string[]> = {
  chatgpt: ['openai_account', 'apple', 'gmail'],
  claude: ['claude_account', 'apple', 'gmail'],
  cursor: ['cursor_account', 'github', 'gmail'],
  gemini: ['google', 'gmail'],
  apple_developer: ['apple', 'icloud_mail'],
  google_developer: ['google', 'gmail'],
  grok: ['x_twitter', 'apple', 'gmail'],
  deepseek: ['wechat', 'gmail'],
  kimi: ['wechat'],
  perplexity: ['gmail', 'apple'],
  midjourney: ['discord_account', 'gmail'],
  windsurf: ['github', 'gmail'],
  poe: ['gmail', 'apple'],
  youtube: ['google', 'gmail'],
  icloud: ['apple', 'icloud_mail'],
  apple_music: ['apple', 'icloud_mail'],
  apple_one: ['apple', 'icloud_mail'],
  github_copilot: ['github'],
  microsoft_365: ['outlook'],
  xbox: ['outlook'],
  bilibili: ['bilibili_account'],
  zhihu: ['zhihu_account'],
  weibo: ['weibo_account'],
  qq_svip: ['qq_account', 'qq_mail'],
  qq_music: ['qq_account', 'wechat'],
  tencent_video: ['wechat', 'qq_account'],
  weread: ['wechat', 'qq_account'],
  vip_88: ['taobao', 'alipay'],
  youku: ['taobao', 'alipay'],
  quark: ['taobao', 'alipay'],
  alipan: ['taobao', 'alipay'],
  netease_music: ['netease_mail'],
  cloudflare: ['cloudflare_account'],
  aliyun: ['aliyun_account'],
  tencent_cloud: ['tencent_cloud_account'],
  aws: ['aws_account'],
  porkbun: ['porkbun_account'],
  onepassword: ['onepassword_account'],
  bitwarden: ['bitwarden_account'],
  steam: ['steam_account'],
  ps_plus: ['psn_account'],
  nintendo: ['nintendo_account'],
  discord: ['discord_account'],
  telegram: ['telegram_account'],
  x_premium: ['x_twitter'],
};

const STORE_BILLING_PRESETS = new Set([
  'apple',
  'google',
  'gmail',
  'paypal',
  'alipay',
  'wechat',
  'taobao',
  'wise',
]);

const DOMESTIC_GROUPS = new Set<Exclude<PresetGroup, 'popular'>>([
  'video_cn',
  'music_read',
  'shopping_life',
]);

export type QuickAccountDraft = {
  presetKey: string;
  platform: string;
  label: string;
  identifier: string;
  category: AccountInput['category'];
  region: string;
  ssoAccountId: string;
};

export type SubscriptionAccountFormFields = {
  accountMode?: 'link' | 'create';
  accountId?: string;
  newAccountPresetKey?: string;
  newAccountPlatform?: string;
  newAccountLabel?: string;
  newAccountIdentifier?: string;
  newAccountCategory?: AccountInput['category'];
  newAccountRegion?: string;
  newAccountSsoId?: string;
  showBillingAccount?: boolean;
  billingAccountMode?: 'link' | 'create';
  billingAccountId?: string;
  newBillingPresetKey?: string;
  newBillingPlatform?: string;
  newBillingLabel?: string;
  newBillingIdentifier?: string;
  newBillingCategory?: AccountInput['category'];
  newBillingRegion?: string;
  account?: string;
};

export function extractSubscriptionAccountPayload(values: SubscriptionAccountFormFields): {
  accountId: string;
  createAccount?: AccountInput;
  billingAccountId: string;
  createBillingAccount?: AccountInput;
  account: string;
} {
  const createPrimary = values.accountMode === 'create';
  const showBilling = Boolean(values.showBillingAccount);
  const createBilling = showBilling && values.billingAccountMode === 'create';

  const accountId = createPrimary ? '' : (values.accountId ?? '').trim();
  const createAccount = createPrimary
    ? buildQuickAccountInput({
        presetKey: values.newAccountPresetKey ?? '',
        platform: values.newAccountPlatform ?? '',
        label: values.newAccountLabel ?? '',
        identifier: values.newAccountIdentifier ?? '',
        category: values.newAccountCategory ?? 'other',
        region: values.newAccountRegion ?? 'GLOBAL',
        ssoAccountId: values.newAccountSsoId ?? '',
      })
    : undefined;

  const rawBillingId = showBilling && !createBilling ? (values.billingAccountId ?? '').trim() : '';
  const billingAccountId = rawBillingId && rawBillingId !== accountId ? rawBillingId : '';
  const createBillingAccount = createBilling
    ? buildQuickAccountInput({
        presetKey: values.newBillingPresetKey ?? '',
        platform: values.newBillingPlatform ?? '',
        label: values.newBillingLabel ?? '',
        identifier: values.newBillingIdentifier ?? '',
        category: values.newBillingCategory ?? 'ecosystem',
        region: values.newBillingRegion ?? 'US',
        ssoAccountId: '',
      })
    : undefined;

  return {
    accountId,
    createAccount,
    billingAccountId,
    createBillingAccount,
    account: (values.account ?? '').trim(),
  };
}

export function mapSubCategoryToAccountCategory(category: SubscriptionInput['category']): AccountInput['category'] {
  switch (category) {
    case 'ai':
    case 'software':
      return 'ai_productivity';
    case 'cloud':
    case 'network':
      return 'dev_cloud';
    case 'life':
      return 'media_gaming';
    default:
      return 'other';
  }
}

export function suggestQuickAccountDefaults(opts: {
  presetKey: string;
  subName: string;
  subCategory: SubscriptionInput['category'];
  locale: Locale;
  forBilling?: boolean;
}): QuickAccountDraft {
  const { presetKey, subName, subCategory, locale, forBilling } = opts;

  if (forBilling) {
    const subPreset = findPreset(presetKey);
    const isDomestic = subPreset ? DOMESTIC_GROUPS.has(subPreset.group) : false;
    if (isDomestic) {
      return {
        presetKey: 'wechat',
        platform: locale === 'en-US' ? 'WeChat' : '微信',
        label: '',
        identifier: '',
        category: 'finance_commerce',
        region: 'CN',
        ssoAccountId: '',
      };
    }
    return {
      presetKey: 'apple',
      platform: locale === 'en-US' ? 'Apple Account' : 'Apple 账户',
      label: '',
      identifier: '',
      category: 'ecosystem',
      region: 'US',
      ssoAccountId: '',
    };
  }

  const candidateAccKey = SUBSCRIPTION_TO_ACCOUNT_PRESETS[presetKey]?.[0];
  const accPreset = candidateAccKey ? findAccountPreset(candidateAccKey) : undefined;
  if (accPreset) {
    return {
      presetKey: accPreset.key,
      platform: locale === 'en-US' ? accPreset.platform.en : accPreset.platform.zh,
      label: '',
      identifier: '',
      category: accPreset.category,
      region: accPreset.region,
      ssoAccountId: '',
    };
  }

  const subPreset = findPreset(presetKey);
  if (subPreset) {
    const isDomestic = DOMESTIC_GROUPS.has(subPreset.group);
    return {
      presetKey: '',
      platform: locale === 'en-US' ? subPreset.name.en : subPreset.name.zh,
      label: '',
      identifier: '',
      category: mapSubCategoryToAccountCategory(subPreset.category),
      region: isDomestic ? 'CN' : 'GLOBAL',
      ssoAccountId: '',
    };
  }

  return {
    presetKey: '',
    platform: subName.trim().slice(0, 60),
    label: '',
    identifier: '',
    category: mapSubCategoryToAccountCategory(subCategory),
    region: 'GLOBAL',
    ssoAccountId: '',
  };
}

export function buildQuickAccountInput(draft: QuickAccountDraft): AccountInput {
  const region = (draft.region || 'GLOBAL').trim().toUpperCase();
  const ecosystem: AccountInput['ecosystem'] = region === 'CN' ? 'domestic' : 'overseas';
  const ssoAccountId = draft.ssoAccountId.trim();
  const matchedPreset = draft.presetKey ? findAccountPreset(draft.presetKey) : undefined;
  return {
    presetKey: draft.presetKey.trim(),
    platform: draft.platform.trim(),
    label: draft.label.trim(),
    identifier: draft.identifier.trim(),
    uid: '',
    category: draft.category,
    ecosystem,
    region,
    role: matchedPreset?.defaultRole ?? 'primary',
    status: 'active',
    authMethod: ssoAccountId ? 'sso' : (matchedPreset?.defaultAuthMethod ?? 'password'),
    recoveryAccountId: '',
    recoveryEmail: '',
    ssoAccountId,
    phoneHint: '',
    twoFactor: 'none',
    recoveryCodes: 'not_applicable',
    kycStatus: matchedPreset?.defaultKycStatus ?? 'none',
    kycNote: '',
    keepaliveCycle: 'none',
    keepaliveDays: 0,
    nextCheckinDate: '',
    vaultReference: '',
    securityUrl: matchedPreset?.securityUrl ?? '',
    notes: '',
    archived: false,
  };
}

export function rankAccountsForSubscription(
  accounts: Account[],
  opts: {
    presetKey: string;
    forBilling?: boolean;
    excludeId?: string;
    includeId?: string;
  },
): { recommended: Account[]; others: Account[] } {
  const { presetKey, forBilling, excludeId, includeId } = opts;
  const subPreset = findPreset(presetKey);
  const preferredList = SUBSCRIPTION_TO_ACCOUNT_PRESETS[presetKey] ?? [];
  const preferredKeys = new Set(preferredList);
  const targetDomestic = subPreset ? DOMESTIC_GROUPS.has(subPreset.group) : null;

  const eligible = accounts.filter((item) => {
    if (item.id === includeId) return true;
    if (item.archived) return false;
    if (excludeId && item.id === excludeId) return false;
    return true;
  });

  const recommended: Account[] = [];
  const others: Account[] = [];

  for (const item of eligible) {
    let isMatch = false;
    if (forBilling) {
      isMatch = STORE_BILLING_PRESETS.has(item.presetKey)
        || item.category === 'ecosystem'
        || item.category === 'finance_commerce'
        || item.role === 'hub';
    }
    else if (preferredKeys.has(item.presetKey)) {
      isMatch = true;
    }
    else if (subPreset) {
      const pNorm = item.platform.toLowerCase();
      if (
        pNorm.includes(subPreset.name.zh.toLowerCase())
        || pNorm.includes(subPreset.name.en.toLowerCase())
      ) {
        isMatch = true;
      }
      else if (item.role === 'hub' && targetDomestic !== null) {
        isMatch = (item.ecosystem === 'domestic') === targetDomestic;
      }
    }
    else if (item.role === 'hub') {
      isMatch = true;
    }

    if (isMatch) {
      recommended.push(item);
    }
    else {
      others.push(item);
    }
  }

  const sortFn = (a: Account, b: Account) => {
    if (!forBilling) {
      const aIdx = preferredList.indexOf(a.presetKey);
      const bIdx = preferredList.indexOf(b.presetKey);
      const aOrder = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx;
      const bOrder = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx;
      if (aOrder !== bOrder) return aOrder - bOrder;
    }
    const roleRank = { hub: 0, primary: 1, alt: 2 } as const;
    if (roleRank[a.role] !== roleRank[b.role]) return roleRank[a.role] - roleRank[b.role];
    return accountDisplayTitle(a).localeCompare(accountDisplayTitle(b));
  };

  recommended.sort(sortFn);
  others.sort(sortFn);
  return { recommended, others };
}

export function formatAccountOptionLabel(account: Account): string {
  const regionSuffix = account.region && account.region !== 'GLOBAL' ? ` [${account.region}]` : '';
  return `${accountDisplayTitle(account)}${regionSuffix} (${account.identifier})`;
}

export function suggestedAccountPresetKeys(presetKey: string, forBilling?: boolean): string[] {
  if (forBilling) {
    return ['apple', 'google', 'paypal', 'wechat', 'alipay', 'taobao'];
  }
  const matched = SUBSCRIPTION_TO_ACCOUNT_PRESETS[presetKey];
  if (matched && matched.length > 0) {
    return matched;
  }
  return ['gmail', 'apple', 'outlook', 'github', 'wechat', 'qq_account'];
}
