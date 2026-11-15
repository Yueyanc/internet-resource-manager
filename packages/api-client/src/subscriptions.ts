import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { accountInputSchema } from './accounts';
import { request } from './client';
export const currencies = ['CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY'] as const;
const subscriptionBaseSchema = z.object({
  presetKey: z.string().optional(),
  name: z.string(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.enum(currencies),
  cycle: z.enum(['monthly', 'quarterly', 'halfyear', 'yearly', 'biennial', 'triennial', 'once', 'custom']),
  intervalDays: z.number().int(),
  dueDate: z.iso.date(),
  category: z.enum(['ai', 'cloud', 'network', 'software', 'life', 'telecom', 'other']),
  renewalMode: z.enum(['auto', 'manual']),
  intention: z.enum(['normal', 'cancel', 'keep']),
  renewalAmountMinor: z.number().int().nonnegative(),
  accountId: z.string().optional(),
  billingAccountId: z.string().optional(),
  account: z.string(),
  paymentMethod: z.string(),
  managementUrl: z.string(),
  notes: z.string(),
  archived: z.boolean(),
});
export const subscriptionInputSchema = subscriptionBaseSchema.extend({
  createAccount: accountInputSchema.optional(),
  createBillingAccount: accountInputSchema.optional(),
});
export const subscriptionSchema = subscriptionBaseSchema.extend({
  id: z.string(),
  presetKey: z.string(),
  accountId: z.string(),
  billingAccountId: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;
export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>;
const preferencesSchema = z.object({ baseCurrency: z.enum(currencies), rates: z.object({ CNY: z.literal(1), USD: z.number().positive(), HKD: z.number().positive(), EUR: z.number().positive(), GBP: z.number().positive(), JPY: z.number().positive() }) });
export type Preferences = z.infer<typeof preferencesSchema>;
export const subscriptionsOptions = queryOptions({ queryKey: ['subscriptions'], queryFn: ({ signal }) => request('/subscriptions', z.object({ items: z.array(subscriptionSchema) }), { signal }), retry: false });
export const preferencesOptions = queryOptions({ queryKey: ['preferences'], queryFn: ({ signal }) => request('/preferences', preferencesSchema, { signal }), retry: false });
export const countsOptions = queryOptions({ queryKey: ['nav-counts'], queryFn: ({ signal }) => request('/nav-counts', z.object({ subscriptions: z.number().int(), accounts: z.number().int(), domains: z.number().int(), ips: z.number().int(), servers: z.number().int() }), { signal }), retry: false, refetchInterval: 30_000 });
export function saveSubscription(input: SubscriptionInput, id?: string) {
  return request(id ? `/subscriptions/${encodeURIComponent(id)}` : '/subscriptions', subscriptionSchema, { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) });
}
export function renewSubscription(value: Subscription) {
  return request(`/subscriptions/${encodeURIComponent(value.id)}/renew`, subscriptionSchema, { method: 'POST', body: JSON.stringify({ dueDate: value.dueDate }) });
}
export function deleteSubscription(id: string) {
  return request(`/subscriptions/${encodeURIComponent(id)}`, z.object({ deleted: z.literal(true) }), { method: 'DELETE' });
}
export function savePreferences(input: Preferences) {
  return request('/preferences', preferencesSchema, { method: 'PUT', body: JSON.stringify(input) });
}
