import { authOptions, healthOptions, logout } from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Outlet, useLocation } from '@tanstack/react-router';
import { App, Avatar, Button, Drawer, Dropdown, Input, Tooltip } from 'antd';
import { LogOut, Menu, Search, Settings2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { usePreferences } from '../app/preferences-context';
import { AccountWizardModal } from '../features/accounts/components/account-wizard-modal';
import { VaultProvider } from '../features/accounts/vault/vault-provider';
import { DomainModal } from '../features/domains/domain-modal';
import { IpWizardModal } from '../features/ips/components/ip-wizard-modal';
import { PreferencesModal } from '../features/preferences/preferences-modal';
import { ServerWizardModal } from '../features/servers/components/server-wizard-modal';
import { SubscriptionWizardModal } from '../features/subscriptions/components/subscription-wizard-modal';
import { LanguageSwitcher } from '../shared/appearance-controls';
import { errorMessage } from '../shared/errors';
import { updateSession } from '../shared/session';
import { AppSidebar } from './app-sidebar';
import { WorkspaceContext } from './workspace-context';

export function WorkspaceLayout() {
  const { collapsed, t, locale } = usePreferences();
  const [mobile, setMobile] = useState(false);
  const [createType, setCreateType] = useState<'subscription' | 'account' | 'domain' | 'ip' | 'server'>();
  const [preferences, setPreferences] = useState(false);
  const [searches, setSearches] = useState({ accounts: '', domains: '', ips: '', servers: '', subscriptions: '' });
  const auth = useQuery(authOptions);
  const health = useQuery(healthOptions);
  const client = useQueryClient();
  const location = useLocation();
  const { message } = App.useApp();
  const key = location.pathname === '/domains'
    ? 'domains'
    : location.pathname === '/accounts'
      ? 'accounts'
      : location.pathname === '/ips'
        ? 'ips'
        : location.pathname === '/servers'
          ? 'servers'
          : 'subscriptions';
  const searchLabel = key === 'domains'
    ? '搜索域名'
    : key === 'accounts'
      ? '搜索账号'
      : key === 'ips'
        ? '搜索 IP'
        : key === 'servers'
          ? '搜索服务器'
          : '搜索订阅';
  const signOut = useMutation({ mutationFn: logout, onSuccess: () => updateSession(client, { initialized: true, user: null }), onError: (error) => {
    void message.error(errorMessage(error, locale));
  } });
  const username = auth.data?.user?.username ?? '';
  const openCreate = (type: 'subscription' | 'account' | 'domain' | 'ip' | 'server') => {
    setCreateType(type);

    setMobile(false);
  };
  const healthLabel = t(health.isSuccess ? '服务已连接' : health.isPending ? '连接中' : '服务不可用');
  return (
    <VaultProvider activeRoute={location.pathname === '/accounts'}>
      <WorkspaceContext.Provider value={{ search: searches[key], setSearch: value => setSearches(values => ({ ...values, [key]: value })), newSubscription: () => openCreate('subscription'), newAccount: () => openCreate('account'), newDomain: () => openCreate('domain'), newIp: () => openCreate('ip'), newServer: () => openCreate('server') }}>
        <div className={`app-shell ${collapsed ? 'is-collapsed' : 'is-expanded'}`}>
          <header className="topbar">
            <Button type="text" aria-label={t('打开导航')} className="mobile-menu-button" icon={<Menu size={19} />} onClick={() => setMobile(true)} />
            <Input className="workspace-search" aria-label={t(searchLabel)} prefix={<Search size={16} />} placeholder={t('搜索')} value={searches[key]} onChange={event => setSearches(values => ({ ...values, [key]: event.target.value }))} allowClear />
            <div className="header-tools">
              <Tooltip title={healthLabel}><span role="status" aria-label={healthLabel} className={`service-status ${health.isError ? 'unavailable' : health.isPending ? 'pending' : ''}`}><ShieldCheck size={15} /></span></Tooltip>
              <LanguageSwitcher />
              <Tooltip title={t('汇率与偏好设置')}><Button type="text" className="header-icon-button" aria-label={t('汇率与偏好设置')} icon={<Settings2 size={17} />} onClick={() => setPreferences(true)} /></Tooltip>
              <Dropdown
                trigger={['click']}
                menu={{ items: [{ key: 'user', label: (
                  <div className="account-menu">
                    <strong>{username}</strong>
                    <span>{t('管理员')}</span>
                  </div>
                ), disabled: true }, { type: 'divider' }, { key: 'preferences', label: t('汇率与偏好设置'), icon: <Settings2 size={15} /> }, { key: 'logout', label: t('退出登录'), icon: <LogOut size={15} />, disabled: signOut.isPending }], onClick: ({ key: action }) => {
                  if (action === 'logout') signOut.mutate();

                  if (action === 'preferences') setPreferences(true);
                } }}
              >
                <Button className="profile-button" type="text" aria-label={t('当前用户')} title={username}><Avatar size={30}>{username.charAt(0).toUpperCase()}</Avatar></Button>
              </Dropdown>
            </div>
          </header>
          <aside className="sidebar"><AppSidebar /></aside>
          <div className="workspace"><main className="page"><Outlet /></main></div>
        </div>
        <Drawer open={mobile} placement="left" className="navigation-drawer" size={252} onClose={() => setMobile(false)} styles={{ body: { padding: 16, display: 'flex', flexDirection: 'column' } }} title={t('资源导航')}><AppSidebar mobile onNavigate={() => setMobile(false)} /></Drawer>
        {createType === 'subscription' && <SubscriptionWizardModal open onClose={() => setCreateType(undefined)} />}
        {createType === 'account' && <AccountWizardModal open onClose={() => setCreateType(undefined)} />}
        {createType === 'domain' && <DomainModal open onClose={() => setCreateType(undefined)} />}
        {createType === 'ip' && <IpWizardModal open onClose={() => setCreateType(undefined)} />}
        {createType === 'server' && <ServerWizardModal open onClose={() => setCreateType(undefined)} />}
        {preferences && <PreferencesModal onClose={() => setPreferences(false)} />}
      </WorkspaceContext.Provider>
    </VaultProvider>
  );
}
