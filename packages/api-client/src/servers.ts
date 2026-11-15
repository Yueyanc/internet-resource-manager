import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { request } from './client';
import { subscriptionInputSchema } from './subscriptions';

export const serverKinds = ['vps', 'dedicated', 'nat', 'homelab', 'nas'] as const;
export const serverStatuses = ['active', 'standby', 'maintenance', 'retiring'] as const;
export const serverArches = ['amd64', 'arm64', 'other'] as const;
export const serverDiskTypes = ['', 'nvme', 'ssd', 'hdd', 'raid'] as const;
export const serverTrafficRules = ['both', 'out_only', 'unlimited'] as const;
export const serverAgentStatuses = ['none', 'snapshot', 'online', 'stale'] as const;

const optionalDateSchema = z.union([z.literal(''), z.iso.date()]);

export const serverContainerSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  state: z.string(),
  status: z.string(),
  composeProject: z.string().optional(),
  composeService: z.string().optional(),
});

export const serverTelemetrySchema = z.object({
  agentStatus: z.enum(serverAgentStatuses),
  mode: z.string(),
  agentVersion: z.string(),
  intervalSec: z.number().int().nonnegative(),
  enrolledAt: z.string(),
  lastReportedAt: z.string(),
  cpuModel: z.string(),
  kernelVersion: z.string(),
  uptimeSeconds: z.number().int().nonnegative(),
  cpuPercent: z.number(),
  load1: z.number(),
  load5: z.number(),
  load15: z.number(),
  memoryUsedBytes: z.number().int().nonnegative(),
  memoryTotalBytes: z.number().int().nonnegative(),
  swapUsedBytes: z.number().int().nonnegative(),
  swapTotalBytes: z.number().int().nonnegative(),
  rootDiskUsedBytes: z.number().int().nonnegative(),
  rootDiskTotalBytes: z.number().int().nonnegative(),
  netRxBps: z.number().int().nonnegative(),
  netTxBps: z.number().int().nonnegative(),
  trafficCycleKey: z.string(),
  trafficRxBytes: z.number().int().nonnegative(),
  trafficTxBytes: z.number().int().nonnegative(),
  tcpConnections: z.number().int().nonnegative(),
  dockerEnabled: z.boolean(),
  dockerAvailable: z.boolean(),
  dockerError: z.string(),
  containers: z.array(serverContainerSchema),
});

const serverBaseSchema = z.object({
  presetKey: z.string().optional(),
  name: z.string(),
  hostname: z.string(),
  provider: z.string(),
  kind: z.enum(serverKinds),
  status: z.enum(serverStatuses),
  region: z.string(),
  datacenter: z.string(),
  os: z.string(),
  arch: z.enum(serverArches),
  cpuCores: z.number().int().nonnegative(),
  memoryMb: z.number().int().nonnegative(),
  diskGb: z.number().int().nonnegative(),
  diskType: z.enum(serverDiskTypes),
  bandwidthMbps: z.number().int().nonnegative(),
  trafficGb: z.number().int().nonnegative(),
  trafficRule: z.enum(serverTrafficRules),
  trafficResetDay: z.number().int().min(0).max(31),
  ipv4: z.string(),
  ipv6: z.string(),
  privateIp: z.string(),
  portNote: z.string(),
  sshPort: z.number().int().min(0).max(65535),
  sshUser: z.string(),
  consoleUrl: z.string(),
  subscriptionId: z.string(),
  accountId: z.string(),
  expireDate: optionalDateSchema,
  domainIds: z.array(z.string()),
  ipIds: z.array(z.string()),
  tags: z.array(z.string()),
  notes: z.string(),
  archived: z.boolean(),
});

export const serverInputSchema = serverBaseSchema.extend({
  createSubscription: subscriptionInputSchema.optional(),
});

export const serverSchema = serverBaseSchema.extend({
  id: z.string(),
  presetKey: z.string(),
  telemetry: serverTelemetrySchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const serverEnrollTokenCreatedSchema = z.object({
  id: z.string(),
  token: z.string(),
  targetServerId: z.string(),
  nameHint: z.string(),
  presetKey: z.string(),
  dockerEnabled: z.boolean(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export const serverEnrollTokenStatusSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'used', 'expired']),
  targetServerId: z.string(),
  dockerEnabled: z.boolean(),
  expiresAt: z.iso.datetime(),
  usedAt: z.string(),
  server: serverSchema.nullable(),
});

export type ServerContainer = z.infer<typeof serverContainerSchema>;
export type ServerTelemetry = z.infer<typeof serverTelemetrySchema>;
export type ServerHost = z.infer<typeof serverSchema>;
export type ServerInput = z.infer<typeof serverInputSchema>;
export type ServerEnrollTokenCreated = z.infer<typeof serverEnrollTokenCreatedSchema>;
export type ServerEnrollTokenStatus = z.infer<typeof serverEnrollTokenStatusSchema>;

export const serversOptions = queryOptions({
  queryKey: ['servers'],
  queryFn: ({ signal }) => request('/servers', z.object({ items: z.array(serverSchema) }), { signal }),
  retry: false,
});

export function saveServer(input: ServerInput, id?: string) {
  return request(id ? `/servers/${encodeURIComponent(id)}` : '/servers', serverSchema, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteServer(id: string) {
  return request(`/servers/${encodeURIComponent(id)}`, z.object({ deleted: z.literal(true) }), { method: 'DELETE' });
}

export function createServerEnrollToken(input: {
  targetServerId?: string;
  nameHint?: string;
  presetKey?: string;
  dockerEnabled?: boolean;
}) {
  return request('/servers/enroll-tokens', serverEnrollTokenCreatedSchema, {
    method: 'POST',
    body: JSON.stringify({
      targetServerId: input.targetServerId ?? '',
      nameHint: input.nameHint ?? '',
      presetKey: input.presetKey ?? '',
      dockerEnabled: Boolean(input.dockerEnabled),
    }),
  });
}

export function getServerEnrollTokenStatus(id: string, signal?: AbortSignal) {
  return request(`/servers/enroll-tokens/${encodeURIComponent(id)}`, serverEnrollTokenStatusSchema, { signal });
}

export function importServerSnapshot(input: {
  payload: string;
  targetServerId?: string;
  nameHint?: string;
  presetKey?: string;
}) {
  return request('/servers/import-snapshot', serverSchema, {
    method: 'POST',
    body: JSON.stringify({
      payload: input.payload,
      targetServerId: input.targetServerId ?? '',
      nameHint: input.nameHint ?? '',
      presetKey: input.presetKey ?? '',
    }),
  });
}

export function revokeServerAgent(id: string) {
  return request(`/servers/${encodeURIComponent(id)}/agent`, serverSchema, {
    method: 'DELETE',
  });
}
