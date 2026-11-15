import type { Account } from '@irm/api-client';
import { describe, expect, it } from 'vitest';

import {
  buildQuickAccountInput,
  rankAccountsForSubscription,
  suggestQuickAccountDefaults,
} from './subscription-accounts';

function makeAccount(partial: Partial<Account> & Pick<Account, 'id' | 'platform' | 'identifier'>): Account {
  return {
    presetKey: '',
    label: '',
    uid: '',
    category: 'other',
    ecosystem: 'overseas',
    region: 'GLOBAL',
    role: 'primary',
    status: 'active',
    authMethod: 'password',
    recoveryAccountId: '',
    recoveryEmail: '',
    ssoAccountId: '',
    phoneHint: '',
    twoFactor: 'none',
    recoveryCodes: 'not_applicable',
    kycStatus: 'none',
    kycNote: '',
    keepaliveCycle: 'none',
    keepaliveDays: 0,
    nextCheckinDate: '',
    lastCheckedAt: '',
    vaultReference: '',
    securityUrl: '',
    notes: '',
    archived: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('subscription upstream account helpers', () => {
  it('prefills quick-add defaults from matching account preset or subscription preset', () => {
    const gpt = suggestQuickAccountDefaults({
      presetKey: 'chatgpt',
      subName: 'ChatGPT Plus',
      subCategory: 'ai',
      locale: 'zh-CN',
    });
    expect(gpt.presetKey).toBe('openai_account');
    expect(gpt.category).toBe('ai_productivity');

    const billing = suggestQuickAccountDefaults({
      presetKey: 'chatgpt',
      subName: 'ChatGPT Plus',
      subCategory: 'ai',
      locale: 'zh-CN',
      forBilling: true,
    });
    expect(billing.presetKey).toBe('apple');
    expect(billing.region).toBe('US');

    const cnBilling = suggestQuickAccountDefaults({
      presetKey: 'bilibili',
      subName: '哔哩哔哩大会员',
      subCategory: 'life',
      locale: 'zh-CN',
      forBilling: true,
    });
    expect(cnBilling.presetKey).toBe('wechat');
    expect(cnBilling.region).toBe('CN');
  });

  it('ranks matching service accounts and store billing accounts first while excluding primary from billing', () => {
    const apple = makeAccount({ id: 'a1', presetKey: 'apple', platform: 'Apple 账户', label: '美区', identifier: 'us@apple.invalid', category: 'ecosystem', role: 'hub', region: 'US' });
    const openai = makeAccount({ id: 'a2', presetKey: 'openai_account', platform: 'ChatGPT', identifier: 'ai@example.invalid', category: 'ai_productivity' });
    const steam = makeAccount({ id: 'a3', presetKey: 'steam_account', platform: 'Steam', identifier: 'gamer', category: 'media_gaming' });

    const primaryRank = rankAccountsForSubscription([steam, apple, openai], { presetKey: 'chatgpt' });
    expect(primaryRank.recommended.map(a => a.id)).toEqual(['a2', 'a1']);
    expect(primaryRank.others.map(a => a.id)).toEqual(['a3']);

    const billingRank = rankAccountsForSubscription([steam, apple, openai], {
      presetKey: 'chatgpt',
      forBilling: true,
      excludeId: 'a2',
    });
    expect(billingRank.recommended.map(a => a.id)).toEqual(['a1']);
    expect(billingRank.others.map(a => a.id)).toEqual(['a3']);
  });

  it('builds a complete AccountInput from quick draft', () => {
    const input = buildQuickAccountInput({
      presetKey: 'openai_account',
      platform: ' ChatGPT ',
      label: ' 主力 ',
      identifier: ' user@example.invalid ',
      category: 'ai_productivity',
      region: 'us',
      ssoAccountId: 'hub-1',
    });
    expect(input.platform).toBe('ChatGPT');
    expect(input.label).toBe('主力');
    expect(input.identifier).toBe('user@example.invalid');
    expect(input.region).toBe('US');
    expect(input.ecosystem).toBe('overseas');
    expect(input.authMethod).toBe('sso');
    expect(input.ssoAccountId).toBe('hub-1');
  });

  it('returns context-aware preset pills for primary and billing account dropdowns', async () => {
    const { suggestedAccountPresetKeys } = await import('./subscription-accounts');
    expect(suggestedAccountPresetKeys('chatgpt', false)).toEqual(['openai_account', 'apple', 'gmail']);
    expect(suggestedAccountPresetKeys('chatgpt', true)).toContain('apple');
    expect(suggestedAccountPresetKeys('chatgpt', true)).toContain('paypal');
  });
});
