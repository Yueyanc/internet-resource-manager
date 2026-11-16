import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { request } from './client';

export const syncStatsSchema = z.object({
  zonesTotal: z.number().int().nonnegative().default(0),
  domainsImported: z.number().int().nonnegative().default(0),
  domainsUpdated: z.number().int().nonnegative().default(0),
  recordsSynced: z.number().int().nonnegative().default(0),
  serversImported: z.number().int().nonnegative().default(0),
  serversUpdated: z.number().int().nonnegative().default(0),
  ipsImported: z.number().int().nonnegative().default(0),
  ipsUpdated: z.number().int().nonnegative().default(0),
  serverLinksAdded: z.number().int().nonnegative().default(0),
  ipLinksAdded: z.number().int().nonnegative().default(0),
  tunnelsTotal: z.number().int().nonnegative().default(0),
  tunnelsHealthy: z.number().int().nonnegative().default(0),
  pagesTotal: z.number().int().nonnegative().default(0),
});

export const providerFieldSpecSchema = z.object({
  key: z.string(),
  label: z.string(),
  labelEn: z.string(),
  placeholder: z.string(),
  placeholderEn: z.string(),
  secret: z.boolean(),
  required: z.boolean(),
  help: z.string().optional().default(''),
  helpEn: z.string().optional().default(''),
});

export const providerMetaSpecSchema = z.object({
  key: z.string(),
  name: z.string(),
  nameEn: z.string(),
  subtitle: z.string(),
  subtitleEn: z.string(),
  color: z.string(),
  targets: z.array(z.string()),
  readOnlyMode: z.string(),
  safetyNote: z.string(),
  safetyNoteEn: z.string(),
  stepTitle: z.string(),
  stepTitleEn: z.string(),
  stepDescription: z.string(),
  stepDescriptionEn: z.string(),
  primaryActionLabel: z.string(),
  primaryActionLabelEn: z.string(),
  primaryActionUrl: z.string(),
  secondaryActionLabel: z.string().optional().default(''),
  secondaryActionUrl: z.string().optional().default(''),
  recommendedScopes: z.array(z.string()).default([]),
  fields: z.array(providerFieldSpecSchema),
  matchedPresets: z.array(z.string()).default([]),
});

export const providerConnectionSchema = z.object({
  id: z.string(),
  provider: z.string(),
  label: z.string(),
  accountId: z.string(),
  tokenHint: z.string(),
  scopes: z.array(z.string()),
  externalAccountName: z.string(),
  status: z.string(),
  lastSyncedAt: z.string(),
  lastError: z.string(),
  stats: syncStatsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const providerSyncResponseSchema = z.object({
  connection: providerConnectionSchema,
  syncStats: syncStatsSchema.nullable().optional(),
});

export type ProviderFieldSpec = z.infer<typeof providerFieldSpecSchema>;
export type ProviderMetaSpec = z.infer<typeof providerMetaSpecSchema>;
export type SyncStats = z.infer<typeof syncStatsSchema>;
export type ProviderConnection = z.infer<typeof providerConnectionSchema>;
export type ProviderSyncResponse = z.infer<typeof providerSyncResponseSchema>;

export const integrationProvidersOptions = queryOptions({
  queryKey: ['integrations', 'providers'],
  queryFn: ({ signal }) =>
    request('/integrations/providers', z.object({ items: z.array(providerMetaSpecSchema) }), { signal }),
  staleTime: 5 * 60 * 1000,
  retry: false,
});

export const integrationsOptions = queryOptions({
  queryKey: ['integrations'],
  queryFn: ({ signal }) =>
    request('/integrations', z.object({ items: z.array(providerConnectionSchema) }), { signal }),
  retry: false,
});

export function connectProviderIntegration(input: {
  provider: string;
  credentials: Record<string, string>;
  label?: string;
  accountId?: string;
  syncNow?: boolean;
}) {
  return request('/integrations/connect', providerSyncResponseSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function syncIntegration(id: string) {
  return request(`/integrations/${encodeURIComponent(id)}/sync`, providerSyncResponseSchema, {
    method: 'POST',
  });
}

export function deleteIntegration(id: string) {
  return request(`/integrations/${encodeURIComponent(id)}`, z.object({ deleted: z.literal(true) }), {
    method: 'DELETE',
  });
}
