import { authOptions } from '@irm/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';

import { Loading, QueryError } from '../shared/feedback';
import { updateSession } from '../shared/session';
import { usePreferences } from './preferences-context';
export function AuthGuard() {
  const { t } = usePreferences();
  const auth = useQuery(authOptions);

  const client = useQueryClient();

  useEffect(() => {
    const expired = () => {
      void updateSession(client, { initialized: true, user: null });
    };

    window.addEventListener('irm:unauthorized', expired);

    return () => window.removeEventListener('irm:unauthorized', expired);
  }, [client]);

  if (auth.isError)
    return (
      <div className="auth-state">
        <QueryError
          title={t('无法连接资源管家')}
          error={auth.error}
          retry={() => {
            void auth.refetch();
          }}
        />
      </div>
    );

  if (!auth.data)
    return <Loading />;

  if (!auth.data.initialized)
    return <Navigate to="/setup" replace />;

  if (!auth.data.user)
    return <Navigate to="/login" replace />;

  return <Outlet />;
}
