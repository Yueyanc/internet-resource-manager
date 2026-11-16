import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { request } from './client';

const authSchema = z.object({
  initialized: z.boolean(),
  user: z.object({ username: z.string() }).nullable(),
});

export const sessionInfoSchema = z.object({
  id: z.string(),
  userAgent: z.string(),
  ipAddress: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  expiresAt: z.number().int(),
  current: z.boolean(),
});

export type SessionInfo = z.infer<typeof sessionInfoSchema>;

export const authOptions = queryOptions({
  queryKey: ['auth'],
  queryFn: ({ signal }) => request('/auth/status', authSchema, { signal }),
  retry: false,
  refetchInterval: 60000,
});

export const authSessionsOptions = queryOptions({
  queryKey: ['auth-sessions'],
  queryFn: ({ signal }) => request('/auth/sessions', z.object({ items: z.array(sessionInfoSchema) }), { signal }),
  retry: false,
  staleTime: 15_000,
});

export function signIn(mode: 'setup' | 'login', input: {
  username: string;
  password: string;
}) {
  return request(`/auth/${mode}`, authSchema, { method: 'POST', body: JSON.stringify(input) });
}

export function logout() {
  return request('/auth/logout', z.object({ ok: z.literal(true) }), { method: 'POST' });
}

export function revokeOtherSessions() {
  return request('/auth/sessions/others', z.object({ revoked: z.number().int() }), { method: 'DELETE' });
}

export function revokeSession(id: string) {
  return request(`/auth/sessions/${encodeURIComponent(id)}`, z.object({ deleted: z.literal(true) }), { method: 'DELETE' });
}

export function updateAdminPassword(input: {
  username?: string;
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions?: boolean;
}) {
  return request(
    '/auth/password',
    z.object({
      ok: z.literal(true),
      user: z.object({ username: z.string() }),
      revokedSessions: z.number().int(),
    }),
    {
      method: 'PUT',
      body: JSON.stringify(input),
    },
  );
}
