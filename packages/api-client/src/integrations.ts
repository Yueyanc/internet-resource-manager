import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { request } from './client';

export const cloudflarePermissionSchema = z.object({
  key: z.string(),
  type: z.string(),
  label: z.string(),
  description: z.string(),
});

export const cloudflareTemplateSchema = z.object({
  userTokenUrl: z.string(),
  accountTokenUrl: z.string(),
  tokenName: z.string(),
  permissions: z.array(cloudflarePermissionSchema),
});

export const syncStatsSchema = z.object({
  zonesTotal: z.number().int().nonnegative().default(0),
  domainsImported: z.number().int().nonnegative().default(0),
  domainsUpdated: z.number().int().nonnegative().default(0),
  recordsSynced: z.number().int().nonnegative().default(0),
  serverLinksAdded: z.number().int().nonnegative().default(0),
  ipLinksAdded: z.number().int().nonnegative().default(0),
  tunnelsTotal: z.number().int().nonnegative().default(0),
  tunnelsHealthy: z.number().int().nonnegative().default(0),
  pagesTotal: z.number().int().nonnegative().default(0),
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

export const cloudflareSyncResponseSchema = z.object({
  connection: providerConnectionSchema,
  syncStats: syncStatsSchema.nullable().optional(),
});

export type CloudflarePermissionSpec = z.infer<typeof cloudflarePermissionSchema>;
export type CloudflareTemplateInfo = z.infer<typeof cloudflareTemplateSchema>;
export type SyncStats = z.infer<typeof syncStatsSchema>;
export type ProviderConnection = z.infer<typeof providerConnectionSchema>;
export type CloudflareSyncResponse = z.infer<typeof cloudflareSyncResponseSchema>;

export const cloudflareTemplateOptions = queryOptions({
  queryKey: ['integrations', 'cloudflare', 'template'],
  queryFn: ({ signal }) => request('/integrations/cloudflare/template', cloudflareTemplateSchema, { signal }),
  staleTime: 5 * 60 * 1000,
  retry: false,
});

export const integrationsOptions = queryOptions({
  queryKey: ['integrations'],
  queryFn: ({ signal }) =>
    request('/integrations', z.object({ items: z.array(providerConnectionSchema) }), { signal }),
  retry: false,
});

export function connectCloudflare(input: {
  apiToken: string;
  label?: string;
  accountId?: string;
  syncNow?: boolean;
}) {
  return request('/integrations/cloudflare', cloudflareSyncResponseSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function syncIntegration(id: string) {
  return request(`/integrations/${encodeURIComponent(id)}/sync`, cloudflareSyncResponseSchema, {
    method: 'POST',
  });
}

export function deleteIntegration(id: string) {
  return request(`/integrations/${encodeURIComponent(id)}`, z.object({ deleted: z.literal(true) }), {
    method: 'DELETE',
  });
}
