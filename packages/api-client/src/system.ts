import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { request } from './client';

export const localBackupSchema = z.object({
  available: z.boolean(),
  version: z.string(),
  createdAt: z.string().optional(),
  hasDbBackup: z.boolean(),
});

export const releaseDetailsSchema = z.object({
  version: z.string(),
  name: z.string(),
  body: z.string(),
  publishedAt: z.string(),
  htmlUrl: z.string(),
});

export const systemUpdateInfoSchema = z.object({
  currentVersion: z.string(),
  latestVersion: z.string(),
  hasUpdate: z.boolean(),
  buildType: z.string(),
  deploymentMode: z.enum(['docker', 'binary', 'dev']),
  canSelfUpdate: z.boolean(),
  cached: z.boolean(),
  checkedAt: z.string(),
  warning: z.string().optional(),
  localBackup: localBackupSchema,
  release: releaseDetailsSchema.optional(),
});

export const rollbackCandidateSchema = z.object({
  version: z.string(),
  name: z.string(),
  publishedAt: z.string(),
  htmlUrl: z.string(),
  hasDbBackup: z.boolean(),
  dbBackupSizeBytes: z.number().optional(),
  dbBackupCreatedAt: z.string().optional(),
});

export const rollbackListSchema = z.object({
  currentVersion: z.string(),
  deploymentMode: z.enum(['docker', 'binary', 'dev']),
  canSelfUpdate: z.boolean(),
  localBackup: localBackupSchema,
  versions: z.array(rollbackCandidateSchema),
});

export const systemApplyResultSchema = z.object({
  message: z.string(),
  targetVersion: z.string(),
  restoredDatabase: z.boolean().optional(),
  needRestart: z.boolean(),
});

export const systemRestartResultSchema = z.object({
  message: z.string(),
  restarting: z.boolean(),
});

export type LocalBackupInfo = z.infer<typeof localBackupSchema>;
export type ReleaseDetails = z.infer<typeof releaseDetailsSchema>;
export type SystemUpdateInfo = z.infer<typeof systemUpdateInfoSchema>;
export type RollbackCandidate = z.infer<typeof rollbackCandidateSchema>;
export type RollbackList = z.infer<typeof rollbackListSchema>;
export type SystemApplyResult = z.infer<typeof systemApplyResultSchema>;

const LONG_UPDATE_TIMEOUT_MS = 15 * 60 * 1000;

export const systemUpdateCheckOptions = queryOptions({
  queryKey: ['system-update'],
  queryFn: ({ signal }) => request('/system/check-updates', systemUpdateInfoSchema, { signal }),
  staleTime: 10 * 60_000,
  refetchInterval: 20 * 60_000,
  retry: false,
});

export const systemRollbackVersionsOptions = queryOptions({
  queryKey: ['system-rollback-versions'],
  queryFn: ({ signal }) => request('/system/rollback-versions', rollbackListSchema, { signal }),
  staleTime: 60_000,
  retry: false,
});

export function checkSystemUpdates(force = true) {
  const qs = force ? '?force=true' : '';
  return request(`/system/check-updates${qs}`, systemUpdateInfoSchema);
}

export function performSystemUpdate() {
  return request('/system/update', systemApplyResultSchema, {
    method: 'POST',
    signal: AbortSignal.timeout(LONG_UPDATE_TIMEOUT_MS),
  });
}

export function rollbackSystemVersion(input?: { version?: string; restoreDatabase?: boolean }) {
  return request('/system/rollback', systemApplyResultSchema, {
    method: 'POST',
    body: JSON.stringify(input ?? {}),
    signal: AbortSignal.timeout(LONG_UPDATE_TIMEOUT_MS),
  });
}

export function restartSystemService() {
  return request('/system/restart', systemRestartResultSchema, {
    method: 'POST',
  });
}

export async function probeSystemHealthVersion(): Promise<string | null> {
  try {
    const res = await fetch('/api/v1/health', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: string; version?: string };
    if (data?.status === 'ok' && typeof data.version === 'string') {
      return data.version;
    }
    return null;
  }
  catch {
    return null;
  }
}
