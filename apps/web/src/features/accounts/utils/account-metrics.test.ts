import type { Account } from '@irm/api-client';
import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import { computeAccountMetrics, maskIdentifier, securityIssues } from './account-metrics';

function buildAccount(overrides: Partial<Account> & Pick<Account, 'id' | 'platform' | 'identifier'>): Account {
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
    twoFactor: 'totp',
    recoveryCodes: 'saved',
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
    createdAt: '2026-11-13T00:00:00Z',
    updatedAt: '2026-11-13T00:00:00Z',
    ...overrides,
  };
}

describe('account-metrics', () => {
  it('computes hub blast radius, keep-alive windows, security warnings, and ecosystem split', () => {
    const today = dayjs('2026-11-13');
    const gmail = buildAccount({
      id: 'hub-gmail',
      platform: 'Gmail',
      identifier: 'alex.chen@gmail.com',
      category: 'email',
      ecosystem: 'overseas',
      role: 'hub',
      twoFactor: 'none',
    });
    const appleUs = buildAccount({
      id: 'apple-us',
      platform: 'Apple 账户',
      label: '美区主力',
      identifier: 'us@example.invalid',
      category: 'ecosystem',
      ecosystem: 'overseas',
      region: 'US',
      recoveryAccountId: 'hub-gmail',
      twoFactor: 'totp',
      recoveryCodes: 'missing',
    });
    const gv = buildAccount({
      id: 'gv-1',
      platform: 'Google Voice',
      identifier: '+1 *3310',
      category: 'email',
      ecosystem: 'overseas',
      region: 'US',
      ssoAccountId: 'hub-gmail',
      keepaliveCycle: 'quarterly',
      nextCheckinDate: '2026-11-20',
    });
    const retiringCn = buildAccount({
      id: 'old-weibo',
      platform: '微博',
      identifier: 'old_weibo',
      category: 'social',
      ecosystem: 'domestic',
      region: 'CN',
      status: 'retiring',
      kycStatus: 'verified',
    });

    const data = computeAccountMetrics([gmail, appleUs, gv, retiringCn], today);
    expect(data.activeCount).toBe(4);
    expect(data.domesticCount).toBe(1);
    expect(data.overseasCount).toBe(3);
    expect(data.hubCount).toBe(1);
    expect(data.linkedDownstreamTotal).toBe(2);
    expect(data.hubs[0]?.account.id).toBe('hub-gmail');
    expect(data.hubs[0]?.downstreamCount).toBe(2);
    expect(data.weakSecurityCount).toBe(2);
    expect(data.hubNo2faCount).toBe(1);
    expect(data.checkinSoonCount).toBe(1);
    expect(data.retiringCount).toBe(1);
    expect(data.kycVerifiedCount).toBe(1);
    expect(securityIssues(gmail)).toContain('hub_no_2fa');
    expect(securityIssues(appleUs)).toContain('missing_recovery_codes');
  });

  it('masks email, @handle, and plain identifiers cleanly for privacy mode', () => {
    expect(maskIdentifier('alex.chen@gmail.com')).toBe('al***@gmail.com');
    expect(maskIdentifier('a@x.io')).toBe('a***@x.io');
    expect(maskIdentifier('@alex_dev')).toBe('@al***');
    expect(maskIdentifier('13800138812')).toBe('13***12');
  });
});
