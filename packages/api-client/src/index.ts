import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { request } from './client';

export { ApiError } from './client';

export const domainSchema = z.object({
  id: z.string(),
  name: z.string(),
  notes: z.string(),
  createdAt: z.iso.datetime(),
});
export type Domain = z.infer<typeof domainSchema>;

const healthSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('ok'),
  version: z.string(),
  capabilities: z.object({ auth: z.boolean(), domainLookup: z.boolean(), agentIngest: z.boolean() }),
});

export const healthOptions = queryOptions({
  queryKey: ['health'],
  queryFn: ({ signal }) => request('/health', healthSchema, { signal }),
  retry: false,
  refetchInterval: 30_000,
});

export const domainsOptions = queryOptions({
  queryKey: ['domains'],
  queryFn: ({ signal }) => request('/domains', z.object({ items: z.array(domainSchema) }), { signal }),
  retry: false,
});

export function createDomain(input: { name: string; notes: string }) {
  return request('/domains', domainSchema, { method: 'POST', body: JSON.stringify(input) });
}

export function deleteDomain(id: string) {
  return request(`/domains/${encodeURIComponent(id)}`, z.object({ deleted: z.literal(true) }), { method: 'DELETE' });
}
