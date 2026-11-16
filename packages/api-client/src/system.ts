import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { ApiError, request } from './client';

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

export const systemStorageInfoSchema = z.object({
  dbSizeBytes: z.number().int().nonnegative(),
  counts: z.object({
    subscriptions: z.number().int(),
    accounts: z.number().int(),
    domains: z.number().int(),
    ips: z.number().int(),
    servers: z.number().int(),
  }),
  integrationsCount: z.number().int(),
  version: z.string(),
  buildType: z.string(),
  deploymentMode: z.enum(['docker', 'binary', 'dev']),
  canSelfUpdate: z.boolean(),
});

export const automationConfigSchema = z.object({
  expiryLeadDays: z.number().int(),
  dailyDigestHour: z.number().int(),
  notifyOnServerOffline: z.boolean(),
  trafficAlertThresholdPct: z.number().int(),
  autoAdvanceSubscriptions: z.boolean(),
  autoSyncEnabled: z.boolean(),
  autoSyncIntervalHours: z.number().int(),
  telegramEnabled: z.boolean(),
  telegramChatId: z.string(),
  barkEnabled: z.boolean(),
  barkServerUrl: z.string(),
  webhookEnabled: z.boolean(),
});

export const automationSettingsSchema = automationConfigSchema.extend({
  hasTelegramBotToken: z.boolean(),
  telegramBotTokenHint: z.string(),
  hasBarkDeviceKey: z.boolean(),
  barkDeviceKeyHint: z.string(),
  hasWebhookUrl: z.boolean(),
  webhookUrlHint: z.string(),
  lastRunAt: z.string(),
  lastStatus: z.string(),
  lastError: z.string(),
  lastDigestDate: z.string(),
  lastAutoSyncAt: z.string(),
  updatedAt: z.string(),
});

export const inspectionSummarySchema = z.object({
  ranAt: z.string(),
  subscriptionsAdvanced: z.number().int(),
  providersSynced: z.number().int(),
  domainsRefreshed: z.number().int(),
  expiringCount: z.number().int(),
  offlineServers: z.number().int(),
  trafficAlerts: z.number().int(),
  notificationsSent: z.array(z.string()),
  channelErrors: z.array(z.string()),
});

export type LocalBackupInfo = z.infer<typeof localBackupSchema>;
export type ReleaseDetails = z.infer<typeof releaseDetailsSchema>;
export type SystemUpdateInfo = z.infer<typeof systemUpdateInfoSchema>;
export type RollbackCandidate = z.infer<typeof rollbackCandidateSchema>;
export type RollbackList = z.infer<typeof rollbackListSchema>;
export type SystemApplyResult = z.infer<typeof systemApplyResultSchema>;
export type SystemStorageInfo = z.infer<typeof systemStorageInfoSchema>;
export type AutomationConfig = z.infer<typeof automationConfigSchema>;
export type AutomationSettings = z.infer<typeof automationSettingsSchema>;
export type InspectionSummary = z.infer<typeof inspectionSummarySchema>;

export type AutomationSaveInput = AutomationConfig & {
  telegramBotToken?: string;
  barkDeviceKey?: string;
  webhookUrl?: string;
  clearTelegramBotToken?: boolean;
  clearBarkDeviceKey?: boolean;
  clearWebhookUrl?: boolean;
};

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

export const systemStorageOptions = queryOptions({
  queryKey: ['system-storage'],
  queryFn: ({ signal }) => request('/system/storage', systemStorageInfoSchema, { signal }),
  staleTime: 15_000,
  retry: false,
});

export const systemAutomationOptions = queryOptions({
  queryKey: ['system-automation'],
  queryFn: ({ signal }) => request('/system/automation', automationSettingsSchema, { signal }),
  staleTime: 15_000,
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

export function saveAutomationSettings(input: AutomationSaveInput) {
  return request('/system/automation', automationSettingsSchema, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function sendTestNotification(input?: AutomationSaveInput) {
  return request(
    '/system/automation/test-notify',
    z.object({
      sentChannels: z.array(z.string()),
      timestamp: z.string(),
    }),
    {
      method: 'POST',
      body: input ? JSON.stringify(input) : undefined,
    },
  );
}

export function runSystemInspection() {
  return request('/system/automation/run', inspectionSummarySchema, {
    method: 'POST',
  });
}

export async function downloadSystemBackup(kind: 'sqlite' | 'json'): Promise<string> {
  const res = await fetch(`/api/v1/system/backup/${kind}`, {
    method: 'GET',
    credentials: 'same-origin',
  });
  if (!res.ok) {
    let message = '下载备份失败';
    try {
      const errBody = (await res.json()) as { error?: { message?: string } };
      if (errBody?.error?.message) {
        message = errBody.error.message;
      }
    }
    catch {
      // ignore json parse failure
    }
    throw new ApiError(res.status, 'backup_failed', message);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const fallbackName = kind === 'sqlite' ? 'irm-snapshot.db' : 'irm-assets.json';
  const filename = match?.[1] ?? fallbackName;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return filename;
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
