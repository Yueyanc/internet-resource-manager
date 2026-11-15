export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

export interface TotpConfig {
  secret: string;
  digits: 6 | 8;
  period: number;
  algorithm: TotpAlgorithm;
}

export interface TotpToken {
  code: string;
  formatted: string;
  remainingSeconds: number;
  period: number;
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function normalizeBase32Secret(raw: string): string {
  const cleaned = raw.replace(/[\s\-=]+/g, '').toUpperCase();
  if (cleaned.length < 8) {
    throw new Error('Invalid Base32 secret length');
  }
  for (const ch of cleaned) {
    if (!BASE32_ALPHABET.includes(ch)) {
      throw new Error('Invalid Base32 character');
    }
  }
  return cleaned;
}

export function decodeBase32(secret: string): Uint8Array<ArrayBuffer> {
  const clean = normalizeBase32Secret(secret);
  const out = new Uint8Array(Math.floor(clean.length * 5 / 8));
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const ch of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out[index++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  return out;
}

export function parseTotpInput(raw: string): TotpConfig {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Empty TOTP secret');
  }

  if (trimmed.toLowerCase().startsWith('otpauth://')) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    }
    catch {
      throw new Error('Invalid otpauth URI');
    }
    if (parsedUrl.protocol !== 'otpauth:' || parsedUrl.hostname.toLowerCase() !== 'totp') {
      throw new Error('Only otpauth://totp URIs are supported');
    }
    const secret = normalizeBase32Secret(parsedUrl.searchParams.get('secret') ?? '');
    const digitsRaw = Number(parsedUrl.searchParams.get('digits') ?? '6');
    const digits: 6 | 8 = digitsRaw === 8 ? 8 : 6;
    if (digitsRaw !== 6 && digitsRaw !== 8) {
      throw new Error('TOTP digits must be 6 or 8');
    }
    const periodRaw = Number(parsedUrl.searchParams.get('period') ?? '30');
    if (!Number.isInteger(periodRaw) || periodRaw < 15 || periodRaw > 120) {
      throw new Error('TOTP period must be between 15 and 120 seconds');
    }
    const algoRaw = (parsedUrl.searchParams.get('algorithm') ?? 'SHA1').toUpperCase();
    if (algoRaw !== 'SHA1' && algoRaw !== 'SHA256' && algoRaw !== 'SHA512') {
      throw new Error('Unsupported TOTP HMAC algorithm');
    }
    return {
      secret,
      digits,
      period: periodRaw,
      algorithm: algoRaw,
    };
  }

  return {
    secret: normalizeBase32Secret(trimmed),
    digits: 6,
    period: 30,
    algorithm: 'SHA1',
  };
}

const HASH_NAMES: Record<TotpAlgorithm, 'SHA-1' | 'SHA-256' | 'SHA-512'> = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA512: 'SHA-512',
};

export async function generateTotpToken(config: TotpConfig, timestampMs = Date.now()): Promise<TotpToken> {
  const keyBytes = decodeBase32(config.secret);
  const epochSeconds = Math.floor(timestampMs / 1000);
  const counter = Math.floor(epochSeconds / config.period);

  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  view.setUint32(0, Math.floor(counter / 0x1_0000_0000), false);
  view.setUint32(4, counter >>> 0, false);

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: HASH_NAMES[config.algorithm] },
    false,
    ['sign'],
  );

  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBuffer));
  const lastByte = signature[signature.length - 1] ?? 0;
  const offset = lastByte & 0x0f;
  const b0 = (signature[offset] ?? 0) & 0x7f;
  const b1 = (signature[offset + 1] ?? 0) & 0xff;
  const b2 = (signature[offset + 2] ?? 0) & 0xff;
  const b3 = (signature[offset + 3] ?? 0) & 0xff;
  const binary = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
  const modulo = 10 ** config.digits;
  const code = String(binary % modulo).padStart(config.digits, '0');
  const formatted = config.digits === 6
    ? `${code.slice(0, 3)} ${code.slice(3)}`
    : `${code.slice(0, 4)} ${code.slice(4)}`;
  const remainingSeconds = config.period - (epochSeconds % config.period);

  return {
    code,
    formatted,
    remainingSeconds,
    period: config.period,
  };
}
