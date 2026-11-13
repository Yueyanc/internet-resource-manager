import { createRootRoute, createRoute, createRouter, Navigate, Outlet } from '@tanstack/react-router';
import { Result } from 'antd';

import { DomainsPage } from './screens/domains-page';

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: () => <Result status="404" title="页面不存在" /> });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <Navigate to="/domains" replace /> });
const domainsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/domains', component: DomainsPage });

export const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, domainsRoute]) });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
