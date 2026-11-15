import {
  deleteAccountSecret,
  getAccountSecret,
  saveAccountSecret,
  vaultOptions,
  vaultSecretsOptions,
} from '@irm/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { type PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { VaultModal } from '../components/vault-modal';
import { VaultContext, type VaultModalMode } from './vault-context';
import {
  type AccountSecretPayload,
  decryptAccountSecret,
  encryptAccountSecret,
} from './vault-crypto';

const IDLE_LOCK_MS = 15 * 60 * 1000;

export function VaultProvider({ activeRoute, children }: PropsWithChildren<{ activeRoute: boolean }>) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const client = useQueryClient();

  const [manuallyActivated, setManuallyActivated] = useState(false);
  const [runtimeKey, setRuntimeKey] = useState<CryptoKey | null>(null);
  const [unlockedKeyVersion, setUnlockedKeyVersion] = useState(1);
  const [decryptedById, setDecryptedById] = useState<Map<string, AccountSecretPayload>>(() => new Map());
  const [modalMode, setModalMode] = useState<VaultModalMode>();

  const pendingCallbackRef = useRef<((key: CryptoKey, keyVersion: number) => void | Promise<void>) | undefined>(undefined);
  const idleTimerRef = useRef<number | undefined>(undefined);

  const queryEnabled = activeRoute || manuallyActivated || Boolean(modalMode);
  const vaultQuery = useQuery({ ...vaultOptions, enabled: queryEnabled });
  const secretsQuery = useQuery({
    ...vaultSecretsOptions,
    enabled: queryEnabled && Boolean(runtimeKey) && Boolean(vaultQuery.data?.initialized),
  });

  const lock = useCallback((silent = false) => {
    if (idleTimerRef.current !== undefined) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = undefined;
    }
    setRuntimeKey(null);
    setDecryptedById(new Map());
    client.removeQueries({ queryKey: ['vault', 'secrets'] });
    if (!silent) {
      void message.info(t('已锁定加密保险箱'));
    }
  }, [client, message, t]);

  const touchIdleTimer = useCallback(() => {
    if (!runtimeKey) return;
    if (idleTimerRef.current !== undefined) {
      window.clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = window.setTimeout(() => {
      lock(true);
    }, IDLE_LOCK_MS);
  }, [lock, runtimeKey]);

  useEffect(() => {
    if (!runtimeKey) return undefined;
    touchIdleTimer();
    const onActivity = () => touchIdleTimer();
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      if (idleTimerRef.current !== undefined) {
        window.clearTimeout(idleTimerRef.current);
      }
    };
  }, [runtimeKey, touchIdleTimer]);

  // Decrypt encrypted records into memory whenever secretsQuery updates while unlocked
  useEffect(() => {
    if (!runtimeKey || !secretsQuery.data) return;
    let cancelled = false;
    const run = async () => {
      const next = new Map<string, AccountSecretPayload>();
      for (const item of secretsQuery.data.items) {
        try {
          const plain = await decryptAccountSecret(runtimeKey, item.accountId, item.ciphertext);
          next.set(item.accountId, plain);
        }
        catch {
          /* Skip unreadable records if tampered. */
        }
      }
      if (!cancelled) {
        setDecryptedById(next);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [runtimeKey, secretsQuery.data]);

  const initialized = Boolean(vaultQuery.data?.initialized);
  const config = vaultQuery.data?.config ?? null;
  const keyVersion = config?.keyVersion ?? unlockedKeyVersion;

  const summariesById = useMemo(() => {
    const map = new Map();
    for (const item of vaultQuery.data?.summaries ?? []) {
      map.set(item.accountId, item);
    }
    return map;
  }, [vaultQuery.data]);

  const activate = useCallback(() => {
    setManuallyActivated(true);
  }, []);

  const openModal = useCallback((
    requestedMode?: VaultModalMode,
    onUnlocked?: (key: CryptoKey, keyVersion: number) => void | Promise<void>,
  ) => {
    setManuallyActivated(true);
    pendingCallbackRef.current = onUnlocked;
    if (requestedMode) {
      setModalMode(requestedMode);
      return;
    }
    setModalMode(initialized ? 'unlock' : 'setup');
  }, [initialized]);

  const handleUnlocked = useCallback(async (key: CryptoKey, ver: number) => {
    setRuntimeKey(key);
    setUnlockedKeyVersion(ver);
    const cb = pendingCallbackRef.current;
    pendingCallbackRef.current = undefined;
    if (cb) {
      await cb(key, ver);
    }
  }, []);

  const saveSecretForAccount = useCallback(async (accountId: string, payload: AccountSecretPayload) => {
    if (!runtimeKey) {
      throw new Error('Vault is locked');
    }
    touchIdleTimer();
    const hasPassword = payload.password.length > 0;
    const hasTotp = Boolean(payload.totp?.secret);
    const hasRecoveryCodes = payload.recoveryCodes.length > 0;

    if (!hasPassword && !hasTotp && !hasRecoveryCodes) {
      await deleteAccountSecret(accountId);
      setDecryptedById((prev) => {
        const next = new Map(prev);
        next.delete(accountId);
        return next;
      });
      await client.invalidateQueries({ queryKey: ['vault'] });
      await client.invalidateQueries({ queryKey: ['vault', 'secrets'] });
      return;
    }

    const ciphertext = await encryptAccountSecret(runtimeKey, accountId, payload);
    await saveAccountSecret(accountId, {
      keyVersion,
      ciphertext,
      hasPassword,
      hasTotp,
      hasRecoveryCodes,
    });
    setDecryptedById((prev) => {
      const next = new Map(prev);
      next.set(accountId, payload);
      return next;
    });
    await client.invalidateQueries({ queryKey: ['vault'] });
    await client.invalidateQueries({ queryKey: ['vault', 'secrets'] });
  }, [client, keyVersion, runtimeKey, touchIdleTimer]);

  const copyAccountPassword = useCallback(async (accountId: string): Promise<boolean> => {
    const doCopy = async (key: CryptoKey): Promise<boolean> => {
      const cached = decryptedById.get(accountId);
      let pwd = cached?.password;
      if (pwd === undefined) {
        const rec = await getAccountSecret(accountId);
        const plain = await decryptAccountSecret(key, accountId, rec.ciphertext);
        pwd = plain.password;
      }
      if (pwd) {
        await navigator.clipboard.writeText(pwd);
        void message.success(t('已复制账号密码'));
        return true;
      }
      return false;
    };

    if (runtimeKey) {
      touchIdleTimer();
      try {
        return await doCopy(runtimeKey);
      }
      catch {
        return false;
      }
    }

    openModal(initialized ? 'unlock' : 'setup', async (key) => {
      try {
        await doCopy(key);
      }
      catch {
        /* Ignore clipboard failure. */
      }
    });
    return false;
  }, [decryptedById, initialized, message, openModal, runtimeKey, t, touchIdleTimer]);

  const copyAccountRecoveryCodes = useCallback(async (accountId: string): Promise<boolean> => {
    const doCopy = async (key: CryptoKey): Promise<boolean> => {
      const cached = decryptedById.get(accountId);
      let entries = cached?.recoveryCodes;
      if (entries === undefined) {
        const rec = await getAccountSecret(accountId);
        const plain = await decryptAccountSecret(key, accountId, rec.ciphertext);
        entries = plain.recoveryCodes;
      }
      if (entries && entries.length > 0) {
        const unused = entries.filter(entry => !entry.used);
        const targets = unused.length > 0 ? unused : entries;
        await navigator.clipboard.writeText(targets.map(entry => entry.code).join('\n'));
        void message.success(t('已复制恢复码'));
        return true;
      }
      return false;
    };

    if (runtimeKey) {
      touchIdleTimer();
      try {
        return await doCopy(runtimeKey);
      }
      catch {
        return false;
      }
    }

    openModal(initialized ? 'unlock' : 'setup', async (key) => {
      try {
        await doCopy(key);
      }
      catch {
        /* Ignore clipboard failure. */
      }
    });
    return false;
  }, [decryptedById, initialized, message, openModal, runtimeKey, t, touchIdleTimer]);

  const value = useMemo(() => ({
    initialized,
    loading: vaultQuery.isPending,
    unlocked: Boolean(runtimeKey),
    keyVersion,
    config,
    summariesById,
    secretsById: decryptedById,
    activate,
    lock,
    openModal,
    saveSecretForAccount,
    copyAccountPassword,
    copyAccountRecoveryCodes,
  }), [
    activate,
    config,
    copyAccountPassword,
    copyAccountRecoveryCodes,
    decryptedById,
    initialized,
    keyVersion,
    lock,
    openModal,
    runtimeKey,
    saveSecretForAccount,
    summariesById,
    vaultQuery.isPending,
  ]);

  return (
    <VaultContext.Provider value={value}>
      {children}
      {modalMode && (
        <VaultModal
          mode={modalMode}
          config={config}
          onSwitchMode={setModalMode}
          onClose={() => {
            pendingCallbackRef.current = undefined;
            setModalMode(undefined);
          }}
          onUnlocked={handleUnlocked}
        />
      )}
    </VaultContext.Provider>
  );
}
