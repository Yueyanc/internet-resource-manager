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

export const syncedDnsRecordSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  content: z.string(),
  proxied: z.boolean(),
  ttl: z.number(),
  matchedServerIds: z.array(z.string()).optional().default([]),
  matchedIpIds: z.array(z.string()).optional().default([]),
});

export const syncedTunnelRouteSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  hostname: z.string().optional().default(''),
  service: z.string().optional().default(''),
});

export const syncedPagesProjectSchema = z.object({
  name: z.string(),
  subdomain: z.string().optional().default(''),
  domains: z.array(z.string()).optional().default([]),
});

export const domainEdgeMetaSchema = z.object({
  provider: z.string().optional().default(''),
  accountName: z.string().optional().default(''),
  plan: z.string().optional().default(''),
  zoneStatus: z.string().optional().default(''),
  nameServers: z.array(z.string()).optional().default([]),
  proxiedCount: z.number().int().nonnegative().optional().default(0),
  totalRecords: z.number().int().nonnegative().optional().default(0),
  workerRoutes: z.array(z.string()).optional().default([]),
  tunnels: z.array(syncedTunnelRouteSchema).optional().default([]),
  pagesProjects: z.array(syncedPagesProjectSchema).optional().default([]),
});

export const domainLookupResultSchema = z.object({
  domain: z.string(),
  apexDomain: z.string(),
  registrar: z.string(),
  rawRegistrar: z.string().optional().default(''),
  dnsProvider: z.string(),
  presetKey: z.string(),
  expireDate: optionalDateSchema,
  registeredDate: z.string().optional().default(''),
  nameServers: z.array(z.string()).optional().default([]),
  registryStatus: z.array(z.string()).optional().default([]),
  transferLocked: z.boolean().optional().default(false),
  source: z.string(),
  checkedAt: z.string(),
});

export type SyncedDnsRecord = z.infer<typeof syncedDnsRecordSchema>;
export type SyncedTunnelRoute = z.infer<typeof syncedTunnelRouteSchema>;
export type SyncedPagesProject = z.infer<typeof syncedPagesProjectSchema>;
export type DomainEdgeMeta = z.infer<typeof domainEdgeMetaSchema>;
export type DomainLookupResult = z.infer<typeof domainLookupResultSchema>;

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
  providerConnectionId: z.string().optional().default(''),
  externalZoneId: z.string().optional().default(''),
  dnsRecords: z.array(syncedDnsRecordSchema).optional().default([]),
  edgeMeta: domainEdgeMetaSchema.optional(),
  lookupSource: z.string().optional().default(''),
  lookupCheckedAt: z.string().optional().default(''),
  lookupError: z.string().optional().default(''),
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

export function lookupDomainPreview(name: string) {
  return request('/domains/lookup-preview', domainLookupResultSchema, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function refreshDomainLookup(id: string, overwrite = true) {
  return request(`/domains/${encodeURIComponent(id)}/lookup`, domainSchema, {
    method: 'POST',
    body: JSON.stringify({ overwrite }),
  });
}
