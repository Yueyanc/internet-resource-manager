import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { request } from './client';
import { subscriptionInputSchema } from './subscriptions';

export const domainPurposes = ['prod', 'personal', 'mail', 'cdn', 'parked'] as const;
export const domainStatuses = ['active', 'parked', 'transferring', 'retiring'] as const;
export const domainIcpStatuses = ['none', 'verified', 'pending'] as const;

export type DomainPurpose = (typeof domainPurposes)[number];
export type DomainStatus = (typeof domainStatuses)[number];
export type DomainIcpStatus = (typeof domainIcpStatuses)[number];

const optionalDateSchema = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/);

const domainBaseSchema = z.object({
  presetKey: z.string(),
  name: z.string(),
  registrar: z.string(),
  dnsProvider: z.string(),
  purpose: z.enum(domainPurposes),
  status: z.enum(domainStatuses),
  expireDate: optionalDateSchema,
  autoRenew: z.boolean(),
  whoisPrivacy: z.boolean(),
  icpStatus: z.enum(domainIcpStatuses),
  icpNumber: z.string(),
  managementUrl: z.string(),
  subscriptionId: z.string(),
  registrarAccountId: z.string(),
  serverIds: z.array(z.string()),
  ipIds: z.array(z.string()),
  tags: z.array(z.string()),
  notes: z.string(),
  archived: z.boolean(),
});

export const domainInputSchema = domainBaseSchema.extend({
  createSubscription: subscriptionInputSchema.optional(),
});

export const domainSchema = domainBaseSchema.extend({
  id: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type DomainInput = z.infer<typeof domainInputSchema>;
export type Domain = z.infer<typeof domainSchema>;

const healthSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('ok'),
  version: z.string(),
  capabilities: z.object({
    auth: z.boolean(),
    domainLookup: z.boolean(),
    agentIngest: z.boolean(),
    selfUpdate: z.boolean().optional(),
  }),
});

export const healthOptions = queryOptions({
  queryKey: ['health'],
  queryFn: ({ signal }) => request('/health', healthSchema, { signal }),
  retry: false,
  refetchInterval: 30000,
});

export const domainsOptions = queryOptions({
  queryKey: ['domains'],
  queryFn: ({ signal }) => request('/domains', z.object({ items: z.array(domainSchema) }), { signal }),
  retry: false,
});

export function createDomain(input: Partial<DomainInput> & { name: string }) {
  return request('/domains', domainSchema, { method: 'POST', body: JSON.stringify(input) });
}

export function updateDomain(id: string, input: DomainInput) {
  return request(`/domains/${encodeURIComponent(id)}`, domainSchema, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteDomain(id: string) {
  return request(`/domains/${encodeURIComponent(id)}`, z.object({ deleted: z.literal(true) }), { method: 'DELETE' });
}
