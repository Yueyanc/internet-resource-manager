import { describe, expect, it } from 'vitest';

import {
  createVaultBundle,
  decryptAccountSecret,
  encryptAccountSecret,
  generateStrongPassword,
  resetPasswordWithRecoveryKey,
  rotateMasterPassword,
  unlockVaultWithPassword,
  VaultUnlockError,
} from './vault-crypto';

describe('zero-knowledge vault crypto', () => {
  const fastIterations = 100_000;

  it('round-trips secrets across browser unlock, password rotation, and emergency recovery', async () => {
    const { setupInput, recoveryKey, runtimeKey } = await createVaultBundle('MasterPass#2026', fastIterations);
    const config = {
      ...setupInput,
      keyVersion: 1,
      createdAt: '2026-11-13T00:00:00Z',
      updatedAt: '2026-11-13T00:00:00Z',
    };

    const payload = {
      password: 'acc-SuperSecretPassword!99',
      totp: { secret: 'JBSWY3DPEHPK3PXP', digits: 6 as const, period: 30, algorithm: 'SHA1' as const },
      recoveryCodes: [{ code: 'ABCD-1111', used: false }, { code: 'EFGH-2222', used: true }],
    };

    const ciphertext = await encryptAccountSecret(runtimeKey, 'acc-1', payload);

    // Wrong password must fail locally
    await expect(unlockVaultWithPassword('WrongPassword', config)).rejects.toBeInstanceOf(VaultUnlockError);

    // Cross-browser unlock with only server config + master password
    const secondBrowserKey = await unlockVaultWithPassword('MasterPass#2026', config);
    expect(await decryptAccountSecret(secondBrowserKey, 'acc-1', ciphertext)).toEqual(payload);

    // AAD accountId binding prevents swapping ciphertexts across accounts
    await expect(decryptAccountSecret(secondBrowserKey, 'acc-other', ciphertext)).rejects.toThrow();

    // Rotate master password without re-encrypting account secrets
    const rotated = await rotateMasterPassword('MasterPass#2026', 'NewMasterPass#2027', config, fastIterations);
    const rotatedConfig = { ...config, ...rotated.rotateInput };
    const unlockedAfterRotate = await unlockVaultWithPassword('NewMasterPass#2027', rotatedConfig);
    expect(await decryptAccountSecret(unlockedAfterRotate, 'acc-1', ciphertext)).toEqual(payload);

    // Reset master password via Emergency Recovery Key
    const recovered = await resetPasswordWithRecoveryKey(recoveryKey, 'RecoveredPass#2028', rotatedConfig, fastIterations);
    const recoveredConfig = { ...rotatedConfig, ...recovered.rotateInput };
    const unlockedAfterRecovery = await unlockVaultWithPassword('RecoveredPass#2028', recoveredConfig);
    expect(await decryptAccountSecret(unlockedAfterRecovery, 'acc-1', ciphertext)).toEqual(payload);
  });

  it('generates strong passwords containing all requested character classes', () => {
    const pwd = generateStrongPassword({ length: 24, uppercase: true, lowercase: true, digits: true, symbols: true });
    expect(pwd).toHaveLength(24);
    expect(pwd).toMatch(/[a-z]/);
    expect(pwd).toMatch(/[A-Z]/);
    expect(pwd).toMatch(/[0-9]/);
    expect(pwd).toMatch(/[!@#$%^&*\-_=+?]/);
  });
});
