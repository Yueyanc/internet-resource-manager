import { describe, expect, it } from 'vitest';

import { generateTotpToken, parseTotpInput } from './totp';

describe('totp engine (RFC 6238)', () => {
  // ASCII "12345678901234567890" in Base32 is GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
  const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it('matches official RFC 6238 SHA1 8-digit vectors', async () => {
    const cfg = parseTotpInput(`otpauth://totp/RFC:test?secret=${rfcSecret}&digits=8&period=30&algorithm=SHA1`);
    expect((await generateTotpToken(cfg, 59_000)).code).toBe('94287082');
    expect((await generateTotpToken(cfg, 1_111_111_109_000)).code).toBe('07081804');
    expect((await generateTotpToken(cfg, 1_234_567_890_000)).code).toBe('89005924');
  });

  it('normalizes spaced lowercase Base32 secrets and otpauth URIs', async () => {
    const raw = parseTotpInput('jbsw y3dp ehpk 3pxp');
    expect(raw).toEqual({
      secret: 'JBSWY3DPEHPK3PXP',
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
    });
    const tok = await generateTotpToken(raw, 1_700_000_000_000);
    expect(tok.code).toMatch(/^\d{6}$/);
    expect(tok.formatted).toMatch(/^\d{3} \d{3}$/);
    expect(tok.remainingSeconds).toBeGreaterThan(0);
    expect(tok.remainingSeconds).toBeLessThanOrEqual(30);
  });

  it('rejects malformed secrets and non-totp URIs', () => {
    expect(() => parseTotpInput('short')).toThrow();
    expect(() => parseTotpInput('otpauth://hotp/Test?secret=JBSWY3DPEHPK3PXP')).toThrow();
  });
});
