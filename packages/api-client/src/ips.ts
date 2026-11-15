import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { request } from './client';

export const ipCategories = [
  'residential_isp',
  'cloud_vps',
  'floating_eip',
  'transit_relay',
  'home_ddns',
  'overlay_subnet',
] as const;

export const ipNetworkScopes = ['overseas_exit', 'domestic_entry', 'overlay_private'] as const;
export const ipAsnTypes = ['residential', 'isp', 'hosting', 'mobile', 'business', 'private'] as const;
export const ipOriginTypes = ['native', 'broadcast', 'unknown'] as const;
export const ipRiskLevels = ['clean', 'low', 'medium', 'high', 'unassessed'] as const;
export const ipRoles = ['dedicated', 'primary', 'service', 'standby'] as const;
export const ipStatuses = ['active', 'degraded', 'blocked', 'retiring'] as const;
export const ipReviewCycles = ['none', 'monthly', 'quarterly', 'halfyear', 'yearly', 'custom'] as const;
export const ipProbeModes = ['none', 'tcp', 'http', 'https'] as const;
export const ipProbeStatuses = ['unchecked', 'reachable', 'unreachable', 'skipped_non_public'] as const;
export const ipUnlockServices = ['openai', 'claude', 'gemini', 'netflix', 'disney_plus', 'youtube', 'tiktok'] as const;
export const ipUnlockStates = ['unknown', 'full', 'partial', 'blocked'] as const;
export const ipLockableFields = ['region', 'city', 'asn', 'asnOrg', 'ptrRecord'] as const;

const optionalDateSchema = z.union([z.literal(''), z.iso.date()]);

export const ipUnlockEntrySchema = z.object({
  status: z.enum(ipUnlockStates),
  region: z.string().optional(),
});

export type IpUnlockService = (typeof ipUnlockServices)[number];
export type IpUnlockState = (typeof ipUnlockStates)[number];
export type IpUnlockEntry = z.infer<typeof ipUnlockEntrySchema>;

export const ipInputSchema = z.object({
  presetKey: z.string().optional(),
  address: z.string(),
  networkScope: z.enum(ipNetworkScopes),
  category: z.enum(ipCategories),
  provider: z.string(),
  label: z.string(),
  region: z.string(),
  city: z.string(),
  asn: z.number().int().nonnegative(),
  asnOrg: z.string(),
  ptrRecord: z.string(),
  asnType: z.enum(ipAsnTypes),
  originType: z.enum(ipOriginTypes),
  riskLevel: z.enum(ipRiskLevels),
  purityNote: z.string(),
  unlocks: z.record(z.string(), ipUnlockEntrySchema),
  tags: z.array(z.string()),
  manualLocks: z.array(z.enum(ipLockableFields)),
  lookupSource: z.string().optional(),
  role: z.enum(ipRoles),
  status: z.enum(ipStatuses),
  reviewCycle: z.enum(ipReviewCycles),
  reviewDays: z.number().int().nonnegative(),
  nextReviewDate: optionalDateSchema,
  lastReviewedAt: optionalDateSchema.optional(),
  probeMode: z.enum(ipProbeModes),
  probePort: z.number().int().nonnegative(),
  subscriptionId: z.string(),
  hostLabel: z.string(),
  domainIds: z.array(z.string()),
  accountIds: z.array(z.string()),
  consoleUrl: z.string(),
  notes: z.string(),
  archived: z.boolean(),
});

export const ipSchema = ipInputSchema.extend({
  id: z.string(),
  presetKey: z.string(),
  version: z.union([z.literal(4), z.literal(6)]),
  prefixLen: z.number().int().min(1).max(128),
  lookupSource: z.string(),
  lookupCheckedAt: z.string(),
  lookupError: z.string(),
  lastReviewedAt: optionalDateSchema,
  probeStatus: z.enum(ipProbeStatuses),
  probeLatencyMs: z.number().int().nonnegative(),
  probeCheckedAt: z.string(),
  probeError: z.string(),
  serverId: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ipLookupPreviewSchema = z.object({
  address: z.string(),
  region: z.string(),
  city: z.string(),
  asn: z.number().int().nonnegative(),
  asnOrg: z.string(),
  ptrRecord: z.string(),
  source: z.string(),
  checkedAt: z.string(),
});

export type IpNode = z.infer<typeof ipSchema>;
export type IpInput = z.infer<typeof ipInputSchema>;
export type IpLookupPreview = z.infer<typeof ipLookupPreviewSchema>;

export const ipsOptions = queryOptions({
  queryKey: ['ips'],
  queryFn: ({ signal }) => request('/ips', z.object({ items: z.array(ipSchema) }), { signal }),
  retry: false,
});

export function saveIp(input: IpInput, id?: string) {
  return request(id ? `/ips/${encodeURIComponent(id)}` : '/ips', ipSchema, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  });
}

export function previewIpLookup(address: string) {
  return request('/ips/lookup-preview', ipLookupPreviewSchema, {
    method: 'POST',
    body: JSON.stringify({ address }),
  });
}

export function refreshIpLookup(id: string) {
  return request(`/ips/${encodeURIComponent(id)}/lookup`, ipSchema, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function probeIp(id: string) {
  return request(`/ips/${encodeURIComponent(id)}/probe`, ipSchema, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function reviewIp(value: IpNode, reviewedOn: string) {
  return request(`/ips/${encodeURIComponent(value.id)}/review`, ipSchema, {
    method: 'POST',
    body: JSON.stringify({ nextReviewDate: value.nextReviewDate, reviewedOn }),
  });
}

export function deleteIp(id: string) {
  return request(`/ips/${encodeURIComponent(id)}`, z.object({ deleted: z.literal(true) }), { method: 'DELETE' });
}
