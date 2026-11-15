import { countsOptions } from '@irm/api-client';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from '@tanstack/react-router';
import { Button, Dropdown, Menu, Tooltip } from 'antd';
import { CircleUserRound, CreditCard, Globe2, Network, PanelLeftClose, PanelLeftOpen, Plus, Server, Smartphone } from 'lucide-react';
import { useState } from 'react';

import { usePreferences } from '../app/preferences-context';
import { ColorModeButton } from '../shared/appearance-controls';
import { BrandLogo } from '../shared/brand-logo';
import { VersionBadge } from './version-badge';
import { useWorkspace } from './workspace-context';

export function AppSidebar({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const { collapsed: preference, toggleSidebar, t } = usePreferences();
  const collapsed = !mobile && preference;
  const { newSubscription, newAccount, newDomain, newIp, newServer } = useWorkspace();
  const counts = useQuery(countsOptions);
  const location = useLocation();
  const [openKeys, setOpenKeys] = useState(['identity', 'infra']);
  const label = (name: string, count?: number) => (
    <span className="nav-menu-label">
      <span>{name}</span>
      <span className="nav-count">{count ?? '—'}</span>
    </span>
  );
  const activeNavKey = location.pathname.startsWith('/servers') ? '/servers' : location.pathname;
  const subscriptions = { key: '/subscriptions', icon: <CreditCard size={18} />, label: <Link to="/subscriptions" className="nav-menu-link" aria-label={t('订阅管理')} aria-current={activeNavKey === '/subscriptions' ? 'page' : undefined}>{label(t('订阅管理'), counts.isSuccess ? counts.data.subscriptions : undefined)}</Link> };
  const accounts = { key: '/accounts', icon: <CircleUserRound size={18} />, label: <Link to="/accounts" className="nav-menu-link" aria-label={t('账号与身份')} aria-current={activeNavKey === '/accounts' ? 'page' : undefined}>{label(t('账号与身份'), counts.isSuccess ? counts.data.accounts : undefined)}</Link> };
  const domains = { key: '/domains', icon: <Globe2 size={18} />, label: <Link to="/domains" className="nav-menu-link" aria-label={t('域名')} aria-current={activeNavKey === '/domains' ? 'page' : undefined}>{label(t('域名'), counts.isSuccess ? counts.data.domains : undefined)}</Link> };
  const ips = { key: '/ips', icon: <Network size={18} />, label: <Link to="/ips" className="nav-menu-link" aria-label={t('IP 与节点')} aria-current={activeNavKey === '/ips' ? 'page' : undefined}>{label(t('IP 与节点'), counts.isSuccess ? counts.data.ips : undefined)}</Link> };
  const servers = { key: '/servers', icon: <Server size={18} />, label: <Link to="/servers" className="nav-menu-link" aria-label={t('服务器')} aria-current={activeNavKey === '/servers' ? 'page' : undefined}>{label(t('服务器'), counts.isSuccess ? counts.data.servers : undefined)}</Link> };
  const planned = [
    { key: 'telecom', icon: <Smartphone size={17} />, label: t('手机卡 / eSIM'), disabled: true },
  ];
  return (
    <>
      <div className="sidebar-brand">
        <Link to="/subscriptions" className="sidebar-logo" aria-label={t('资源管家')} onClick={onNavigate}>
          <BrandLogo size={28} />
          {!collapsed && <span>{t('资源管家')}</span>}
        </Link>
        <VersionBadge collapsed={collapsed} />
      </div>
      <Dropdown
        trigger={['click']}
        menu={{ items: [{ key: 'subscription', label: t('新建订阅'), icon: <CreditCard size={15} /> }, { key: 'account', label: t('新建账号'), icon: <CircleUserRound size={15} /> }, { key: 'server', label: t('新建服务器'), icon: <Server size={15} /> }, { key: 'domain', label: t('新建域名'), icon: <Globe2 size={15} /> }, { key: 'ip', label: t('新建 IP'), icon: <Network size={15} /> }], onClick: ({ key }) => {
          if (key === 'subscription') newSubscription();
          else if (key === 'account') newAccount();
          else if (key === 'server') newServer();
          else if (key === 'ip') newIp();
          else newDomain();

          onNavigate?.();
        } }}
      >
        <Button className="global-create" type="primary" aria-label={t('新建')} icon={<Plus size={17} />}>{!collapsed && t('新建')}</Button>
      </Dropdown>
      <nav aria-label={t('资源导航')}>
        <Menu
          mode="inline"
          inlineCollapsed={collapsed}
          selectedKeys={[activeNavKey]}
          openKeys={collapsed ? undefined : openKeys}
          onOpenChange={keys => !collapsed && setOpenKeys(keys)}
          onClick={onNavigate}
          items={[
            { key: 'identity', label: t('订阅与身份'), icon: <CircleUserRound size={18} />, children: [subscriptions, accounts, ...planned] },
            { key: 'infra', label: t('基础设施与网络'), icon: <Network size={18} />, children: [servers, domains, ips] },
          ]}
        />
      </nav>
      <div className="sidebar-bottom">
        <ColorModeButton />
        {!mobile && <Tooltip title={t(collapsed ? '展开菜单' : '收起菜单')}><Button type="text" className="sidebar-collapse" aria-label={t(collapsed ? '展开菜单' : '收起菜单')} aria-expanded={!collapsed} icon={collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />} onClick={toggleSidebar} /></Tooltip>}
      </div>
    </>
  );
}
