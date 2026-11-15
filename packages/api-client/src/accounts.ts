import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { request } from './client';

export const accountCategories = [
  'email',
  'social',
  'ecosystem',
  'dev_cloud',
  'ai_productivity',
  'media_gaming',
  'finance_commerce',
  'other',
] as const;

export const accountEcosystems = ['domestic', 'overseas'] as const;
export const accountRoles = ['hub', 'primary', 'alt'] as const;
export const accountStatuses = ['active', 'retiring', 'restricted'] as const;
export const accountAuthMethods = ['password', 'passkey', 'sso', 'code'] as const;
export const accountTwoFactorMethods = ['none', 'sms', 'email', 'totp', 'passkey', 'hardware'] as const;
export const accountRecoveryCodeStates = ['not_applicable', 'saved', 'missing'] as const;
export const accountKycStatuses = ['none', 'verified'] as const;
export const accountKeepaliveCycles = ['none', 'monthly', 'quarterly', 'halfyear', 'yearly', 'custom'] as const;

const optionalDateSchema = z.union([z.literal(''), z.iso.date()]);

export const accountInputSchema = z.object({
  presetKey: z.string().optional(),
  platform: z.string(),
  label: z.string(),
  identifier: z.string(),
  uid: z.string(),
  category: z.enum(accountCategories),
  ecosystem: z.enum(accountEcosystems),
  region: z.string(),
  role: z.enum(accountRoles),
  status: z.enum(accountStatuses),
  authMethod: z.enum(accountAuthMethods),
  recoveryAccountId: z.string(),
  recoveryEmail: z.string(),
  ssoAccountId: z.string(),
  phoneHint: z.string(),
  twoFactor: z.enum(accountTwoFactorMethods),
  recoveryCodes: z.enum(accountRecoveryCodeStates),
  kycStatus: z.enum(accountKycStatuses),
  kycNote: z.string(),
  keepaliveCycle: z.enum(accountKeepaliveCycles),
  keepaliveDays: z.number().int().nonnegative(),
  nextCheckinDate: optionalDateSchema,
  lastCheckedAt: optionalDateSchema.optional(),
  vaultReference: z.string(),
  securityUrl: z.string(),
  notes: z.string(),
  archived: z.boolean(),
});

export const accountSchema = accountInputSchema.extend({
  id: z.string(),
  presetKey: z.string(),
  lastCheckedAt: optionalDateSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Account = z.infer<typeof accountSchema>;
export type AccountInput = z.infer<typeof accountInputSchema>;

export const accountsOptions = queryOptions({
  queryKey: ['accounts'],
  queryFn: ({ signal }) => request('/accounts', z.object({ items: z.array(accountSchema) }), { signal }),
  retry: false,
});

export function saveAccount(input: AccountInput, id?: string) {
  return request(id ? `/accounts/${encodeURIComponent(id)}` : '/accounts', accountSchema, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  });
}

export function checkinAccount(value: Account, checkedOn: string) {
  return request(`/accounts/${encodeURIComponent(value.id)}/checkin`, accountSchema, {
    method: 'POST',
    body: JSON.stringify({ nextCheckinDate: value.nextCheckinDate, checkedOn }),
  });
}

export function deleteAccount(id: string) {
  return request(`/accounts/${encodeURIComponent(id)}`, z.object({ deleted: z.literal(true) }), { method: 'DELETE' });
}
