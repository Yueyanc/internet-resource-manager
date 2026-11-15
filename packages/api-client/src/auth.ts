import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { request } from './client';
const authSchema = z.object({ initialized: z.boolean(), user: z.object({ username: z.string() }).nullable() });
export const authOptions = queryOptions({
  queryKey: ['auth'],
  queryFn: ({ signal }) => request('/auth/status', authSchema, { signal }),
  retry: false,
  refetchInterval: 60000,
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
