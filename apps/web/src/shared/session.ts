import { authOptions } from '@irm/api-client';
import type { QueryClient } from '@tanstack/react-query';

export async function updateSession(client: QueryClient, state: { initialized: boolean; user: { username: string } | null }) {
  await client.cancelQueries();
  // Keep the auth query's observers attached while clearing private resource data.
  client.removeQueries({ predicate: query => query.queryKey[0] !== authOptions.queryKey[0] });
  client.setQueryData(authOptions.queryKey, state);
}
