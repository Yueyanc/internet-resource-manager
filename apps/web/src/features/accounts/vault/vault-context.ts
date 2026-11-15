import type { AccountSecretSummary, VaultConfig } from '@irm/api-client';
import { createContext, useContext } from 'react';

import type { AccountSecretPayload } from './vault-crypto';

export type VaultModalMode = 'setup' | 'unlock' | 'change_password' | 'recover';

export interface VaultContextValue {
  initialized: boolean;
  loading: boolean;
  unlocked: boolean;
  keyVersion: number;
  config: VaultConfig | null;
  summariesById: Map<string, AccountSecretSummary>;
  secretsById: Map<string, AccountSecretPayload>;
  activate: () => void;
  lock: (silent?: boolean) => void;
  openModal: (mode?: VaultModalMode, onUnlocked?: (key: CryptoKey, keyVersion: number) => void | Promise<void>) => void;
  saveSecretForAccount: (accountId: string, payload: AccountSecretPayload) => Promise<void>;
  copyAccountPassword: (accountId: string) => Promise<boolean>;
  copyAccountRecoveryCodes: (accountId: string) => Promise<boolean>;
}

const emptySummaries = new Map<string, AccountSecretSummary>();
const emptySecrets = new Map<string, AccountSecretPayload>();

export const VaultContext = createContext<VaultContextValue>({
  initialized: false,
  loading: false,
  unlocked: false,
  keyVersion: 1,
  config: null,
  summariesById: emptySummaries,
  secretsById: emptySecrets,
  activate: () => {},
  lock: () => {},
  openModal: () => {},
  saveSecretForAccount: async () => {},
  copyAccountPassword: async () => false,
  copyAccountRecoveryCodes: async () => false,
});

export function useVault() {
  return useContext(VaultContext);
}
