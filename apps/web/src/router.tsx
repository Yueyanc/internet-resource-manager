import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Navigate, Outlet } from '@tanstack/react-router';

import { AuthGuard } from './app/auth-guard';
import { AuthPage } from './features/auth/auth-page';
import { NotFound } from './shared/not-found';

const WorkspaceLayout = lazyRouteComponent(() => import('./layouts/workspace-layout'), 'WorkspaceLayout');
const AccountsPage = lazyRouteComponent(() => import('./features/accounts/accounts-page'), 'AccountsPage');
const DomainsPage = lazyRouteComponent(() => import('./features/domains/domains-page'), 'DomainsPage');
const IpsPage = lazyRouteComponent(() => import('./features/ips/ips-page'), 'IpsPage');
const ServersPage = lazyRouteComponent(() => import('./features/servers/servers-page'), 'ServersPage');
const SubscriptionsPage = lazyRouteComponent(() => import('./features/subscriptions/subscriptions-page'), 'SubscriptionsPage');

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFound });
const setupRoute = createRoute({ getParentRoute: () => rootRoute, path: '/setup', component: () => <AuthPage mode="setup" /> });
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: () => <AuthPage mode="login" /> });
const protectedRoute = createRoute({ getParentRoute: () => rootRoute, id: 'protected', component: AuthGuard });
const detailSearchValidator = (search: Record<string, unknown>): { detail?: string } => ({
  detail: typeof search.detail === 'string' && search.detail ? search.detail : undefined,
});

const workspaceRoute = createRoute({ getParentRoute: () => protectedRoute, id: 'workspace', component: WorkspaceLayout });
const indexRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/', component: () => <Navigate to="/subscriptions" replace /> });
const accountsRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/accounts', validateSearch: detailSearchValidator, component: AccountsPage });
const domainsRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/domains', component: DomainsPage });
const ipsRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/ips', validateSearch: detailSearchValidator, component: IpsPage });
const serversRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/servers', validateSearch: detailSearchValidator, component: ServersPage });
const subscriptionsRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/subscriptions', validateSearch: detailSearchValidator, component: SubscriptionsPage });

export const router = createRouter({ routeTree: rootRoute.addChildren([setupRoute, loginRoute, protectedRoute.addChildren([workspaceRoute.addChildren([indexRoute, accountsRoute, domainsRoute, ipsRoute, serversRoute, subscriptionsRoute])])]) });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
