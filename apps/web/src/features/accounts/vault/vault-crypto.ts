import type { VaultConfig, VaultRotateInput, VaultSetupInput } from '@irm/api-client';

import { parseTotpInput, type TotpConfig } from './totp';

export const DEFAULT_KDF_ITERATIONS = 600_000;

const AAD_MASTER_WRAP = 'irm-vault-v1:master';
const AAD_RECOVERY_WRAP = 'irm-vault-v1:recovery';
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface RecoveryCodeEntry {
  code: string;
  used: boolean;
}

export interface AccountSecretPayload {
  password: string;
  totp?: TotpConfig;
  recoveryCodes: RecoveryCodeEntry[];
}

export class VaultUnlockError extends Error {
  constructor(message = 'Invalid master password or recovery key') {
    super(message);
    this.name = 'VaultUnlockError';
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

export function base64ToBytes(encoded: string): Uint8Array<ArrayBuffer> {
  const binary = atob(encoded.trim());
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return buf;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export function generateEmergencyRecoveryKey(): string {
  const raw = randomBytes(32);
  let chars = '';
  for (let i = 0; i < 32; i += 1) {
    chars += RECOVERY_ALPHABET[(raw[i] ?? 0) & 31];
  }
  return chars.match(/.{1,4}/g)?.join('-') ?? chars;
}

export function normalizeRecoveryKey(input: string): string {
  return input.replace(/[\s-]+/g, '').toUpperCase();
}

async function deriveKek(secretText: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretText),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function wrapRawVaultKey(rawVaultKey: Uint8Array<ArrayBuffer>, kek: CryptoKey, aadLabel: string): Promise<string> {
  const iv = randomBytes(12);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(aadLabel) },
    kek,
    rawVaultKey,
  ));
  return bytesToBase64(concatBytes(iv, encrypted));
}

async function unwrapRawVaultKey(wrappedBase64: string, kek: CryptoKey, aadLabel: string): Promise<Uint8Array<ArrayBuffer>> {
  const combined = base64ToBytes(wrappedBase64);
  if (combined.length !== 60) {
    throw new VaultUnlockError();
  }
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(aadLabel) },
      kek,
      cipher,
    );
    return new Uint8Array(plain);
  }
  catch {
    throw new VaultUnlockError();
  }
}

async function importRuntimeVaultKey(rawVaultKey: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    rawVaultKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function createVaultBundle(
  masterPassword: string,
  iterations = DEFAULT_KDF_ITERATIONS,
): Promise<{
  setupInput: VaultSetupInput;
  recoveryKey: string;
  runtimeKey: CryptoKey;
}> {
  const rawVaultKey = randomBytes(32);
  const kdfSalt = randomBytes(16);
  const recoverySalt = randomBytes(16);
  const recoveryKey = generateEmergencyRecoveryKey();

  try {
    const masterKek = await deriveKek(masterPassword, kdfSalt, iterations);
    const recoveryKek = await deriveKek(normalizeRecoveryKey(recoveryKey), recoverySalt, iterations);
    const wrappedVaultKey = await wrapRawVaultKey(rawVaultKey, masterKek, AAD_MASTER_WRAP);
    const wrappedRecoveryKey = await wrapRawVaultKey(rawVaultKey, recoveryKek, AAD_RECOVERY_WRAP);
    const runtimeKey = await importRuntimeVaultKey(rawVaultKey);

    return {
      setupInput: {
        kdfSalt: bytesToBase64(kdfSalt),
        kdfIterations: iterations,
        wrappedVaultKey,
        recoverySalt: bytesToBase64(recoverySalt),
        wrappedRecoveryKey,
      },
      recoveryKey,
      runtimeKey,
    };
  }
  finally {
    rawVaultKey.fill(0);
  }
}

export async function unlockVaultWithPassword(
  masterPassword: string,
  config: Pick<VaultConfig, 'kdfSalt' | 'kdfIterations' | 'wrappedVaultKey'>,
): Promise<CryptoKey> {
  const salt = base64ToBytes(config.kdfSalt);
  const kek = await deriveKek(masterPassword, salt, config.kdfIterations);
  const rawVaultKey = await unwrapRawVaultKey(config.wrappedVaultKey, kek, AAD_MASTER_WRAP);
  try {
    return await importRuntimeVaultKey(rawVaultKey);
  }
  finally {
    rawVaultKey.fill(0);
  }
}

export async function rotateMasterPassword(
  currentPassword: string,
  newPassword: string,
  config: Pick<VaultConfig, 'keyVersion' | 'kdfSalt' | 'kdfIterations' | 'wrappedVaultKey'>,
  iterations = DEFAULT_KDF_ITERATIONS,
): Promise<{ rotateInput: VaultRotateInput; runtimeKey: CryptoKey }> {
  const currentKek = await deriveKek(currentPassword, base64ToBytes(config.kdfSalt), config.kdfIterations);
  const rawVaultKey = await unwrapRawVaultKey(config.wrappedVaultKey, currentKek, AAD_MASTER_WRAP);
  try {
    const newSalt = randomBytes(16);
    const newKek = await deriveKek(newPassword, newSalt, iterations);
    const wrappedVaultKey = await wrapRawVaultKey(rawVaultKey, newKek, AAD_MASTER_WRAP);
    const runtimeKey = await importRuntimeVaultKey(rawVaultKey);
    return {
      rotateInput: {
        keyVersion: config.keyVersion,
        kdfSalt: bytesToBase64(newSalt),
        kdfIterations: iterations,
        wrappedVaultKey,
      },
      runtimeKey,
    };
  }
  finally {
    rawVaultKey.fill(0);
  }
}

export async function resetPasswordWithRecoveryKey(
  recoveryKeyInput: string,
  newPassword: string,
  config: Pick<VaultConfig, 'keyVersion' | 'kdfIterations' | 'recoverySalt' | 'wrappedRecoveryKey'>,
  iterations = DEFAULT_KDF_ITERATIONS,
): Promise<{ rotateInput: VaultRotateInput; runtimeKey: CryptoKey }> {
  const normalized = normalizeRecoveryKey(recoveryKeyInput);
  if (normalized.length < 16) {
    throw new VaultUnlockError();
  }
  const recoveryKek = await deriveKek(normalized, base64ToBytes(config.recoverySalt), config.kdfIterations);
  const rawVaultKey = await unwrapRawVaultKey(config.wrappedRecoveryKey, recoveryKek, AAD_RECOVERY_WRAP);
  try {
    const newSalt = randomBytes(16);
    const newKek = await deriveKek(newPassword, newSalt, iterations);
    const wrappedVaultKey = await wrapRawVaultKey(rawVaultKey, newKek, AAD_MASTER_WRAP);
    const runtimeKey = await importRuntimeVaultKey(rawVaultKey);
    return {
      rotateInput: {
        keyVersion: config.keyVersion,
        kdfSalt: bytesToBase64(newSalt),
        kdfIterations: iterations,
        wrappedVaultKey,
      },
      runtimeKey,
    };
  }
  finally {
    rawVaultKey.fill(0);
  }
}

export async function encryptAccountSecret(
  runtimeKey: CryptoKey,
  accountId: string,
  payload: AccountSecretPayload,
): Promise<string> {
  const iv = randomBytes(12);
  const aad = encoder.encode(`irm-secret-v1:${accountId}`);
  const plaintext = encoder.encode(JSON.stringify(payload));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    runtimeKey,
    plaintext,
  ));
  return bytesToBase64(concatBytes(iv, encrypted));
}

export async function decryptAccountSecret(
  runtimeKey: CryptoKey,
  accountId: string,
  ciphertextBase64: string,
): Promise<AccountSecretPayload> {
  const combined = base64ToBytes(ciphertextBase64);
  if (combined.length < 29) {
    throw new Error('Malformed secret ciphertext');
  }
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const aad = encoder.encode(`irm-secret-v1:${accountId}`);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    runtimeKey,
    cipher,
  );
  const parsed = JSON.parse(decoder.decode(decrypted)) as Partial<AccountSecretPayload>;
  return {
    password: typeof parsed.password === 'string' ? parsed.password : '',
    totp: parsed.totp,
    recoveryCodes: Array.isArray(parsed.recoveryCodes) ? parsed.recoveryCodes : [],
  };
}

export interface PasswordGenOptions {
  length?: number;
  uppercase?: boolean;
  lowercase?: boolean;
  digits?: boolean;
  symbols?: boolean;
}

function randomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    const val = buf[0] ?? 0;
    if (val < limit) return val % max;
  }
}

export function generateStrongPassword(options: PasswordGenOptions = {}): string {
  const length = Math.min(64, Math.max(8, options.length ?? 20));
  const pools: string[] = [];
  if (options.lowercase !== false) pools.push('abcdefghijkmnopqrstuvwxyz');
  if (options.uppercase !== false) pools.push('ABCDEFGHJKLMNPQRSTUVWXYZ');
  if (options.digits !== false) pools.push('23456789');
  if (options.symbols !== false) pools.push('!@#$%^&*-_=+?');
  if (pools.length === 0) pools.push('abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789');

  const all = pools.join('');
  const chars: string[] = [];

  // Guarantee at least one character from each enabled character class
  for (const pool of pools) {
    chars.push(pool[randomInt(pool.length)] ?? 'a');
  }
  while (chars.length < length) {
    chars.push(all[randomInt(all.length)] ?? 'a');
  }

  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const tmp = chars[i] ?? '';
    chars[i] = chars[j] ?? '';
    chars[j] = tmp;
  }

  return chars.join('');
}

export function formatTotpConfigInput(totp?: TotpConfig): string {
  if (!totp) return '';
  if (totp.digits === 6 && totp.period === 30 && totp.algorithm === 'SHA1') {
    return totp.secret;
  }
  return `otpauth://totp/IRM?secret=${totp.secret}&digits=${totp.digits}&period=${totp.period}&algorithm=${totp.algorithm}`;
}

export function formatRecoveryCodesText(entries: RecoveryCodeEntry[]): string {
  return entries.map(item => item.code).join('\n');
}

export function buildSecretPayload(
  password: string,
  totpRaw: string,
  recoveryCodesText: string,
  previousEntries: RecoveryCodeEntry[] = [],
): AccountSecretPayload {
  const usedByCode = new Map(previousEntries.map(item => [item.code, item.used]));
  const codes = recoveryCodesText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(code => ({ code, used: usedByCode.get(code) ?? false }));

  const cleanTotp = totpRaw.trim();
  const totp = cleanTotp ? parseTotpInput(cleanTotp) : undefined;

  return {
    password,
    totp,
    recoveryCodes: codes,
  };
}
