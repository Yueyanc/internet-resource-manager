import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiError, request } from './client';

afterEach(() => vi.unstubAllGlobals());

describe('API transport', () => {
  it('does not turn a missing backend into an empty catalogue', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(request('/domains', z.object({ items: z.array(z.string()) }))).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('rejects successful responses that violate the contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ items: null })));
    await expect(request('/domains', z.object({ items: z.array(z.string()) }))).rejects.toBeInstanceOf(ApiError);
  });

  it('preserves validation errors returned by the backend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code: 'invalid_domain', message: '域名格式不正确' } }, { status: 400 })));
    await expect(request('/domains', z.unknown())).rejects.toMatchObject({ status: 400, code: 'invalid_domain', message: '域名格式不正确' });
  });
});
