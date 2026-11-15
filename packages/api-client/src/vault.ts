import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { request } from './client';

export const vaultConfigSchema = z.object({
  kdfSalt: z.string(),
  kdfIterations: z.number().int().positive(),
  wrappedVaultKey: z.string(),
  recoverySalt: z.string(),
  wrappedRecoveryKey: z.string(),
  keyVersion: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const accountSecretSummarySchema = z.object({
  accountId: z.string(),
  keyVersion: z.number().int().positive(),
  hasPassword: z.boolean(),
  hasTotp: z.boolean(),
  hasRecoveryCodes: z.boolean(),
  updatedAt: z.iso.datetime(),
});

export const accountSecretSchema = accountSecretSummarySchema.extend({
  ciphertext: z.string(),
});

export const vaultStatusSchema = z.object({
  initialized: z.boolean(),
  config: vaultConfigSchema.nullable(),
  summaries: z.array(accountSecretSummarySchema),
});

export type VaultConfig = z.infer<typeof vaultConfigSchema>;
export type AccountSecretSummary = z.infer<typeof accountSecretSummarySchema>;
export type AccountSecretRecord = z.infer<typeof accountSecretSchema>;
export type VaultStatus = z.infer<typeof vaultStatusSchema>;

export interface VaultSetupInput {
  kdfSalt: string;
  kdfIterations: number;
  wrappedVaultKey: string;
  recoverySalt: string;
  wrappedRecoveryKey: string;
}

export interface VaultRotateInput {
  keyVersion: number;
  kdfSalt: string;
  kdfIterations: number;
  wrappedVaultKey: string;
  recoverySalt?: string;
  wrappedRecoveryKey?: string;
}

export interface AccountSecretInput {
  keyVersion: number;
  ciphertext: string;
  hasPassword: boolean;
  hasTotp: boolean;
  hasRecoveryCodes: boolean;
}

export const vaultOptions = queryOptions({
  queryKey: ['vault'],
  queryFn: ({ signal }) => request('/vault', vaultStatusSchema, { signal }),
  retry: false,
});

export const vaultSecretsOptions = queryOptions({
  queryKey: ['vault', 'secrets'],
  queryFn: ({ signal }) => request('/vault/secrets', z.object({ items: z.array(accountSecretSchema) }), { signal }),
  retry: false,
});

export function setupVault(input: VaultSetupInput) {
  return request('/vault/setup', vaultConfigSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function rotateVaultMasterKey(input: VaultRotateInput) {
  return request('/vault/master-key', vaultConfigSchema, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function getAccountSecret(accountId: string) {
  return request(`/accounts/${encodeURIComponent(accountId)}/secret`, accountSecretSchema);
}

export function saveAccountSecret(accountId: string, input: AccountSecretInput) {
  return request(`/accounts/${encodeURIComponent(accountId)}/secret`, accountSecretSchema, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteAccountSecret(accountId: string) {
  return request(`/accounts/${encodeURIComponent(accountId)}/secret`, z.object({ deleted: z.literal(true) }), {
    method: 'DELETE',
  });
}
