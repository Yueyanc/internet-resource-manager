import {
  accountsOptions,
  deleteServer,
  domainsOptions,
  healthOptions,
  ipsOptions,
  preferencesOptions,
  renewSubscription,
  type ServerHost,
  serversOptions,
  type Subscription,
  subscriptionsOptions,
} from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useSearch } from '@tanstack/react-router';
import { App, Button, Dropdown, Empty, Segmented, Skeleton, Tooltip } from 'antd';
import { ArrowDownWideNarrow, Eye, EyeOff, LayoutGrid, Plus, Table2, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { usePreferences } from '../../app/preferences-context';
import { useWorkspace } from '../../layouts/workspace-context';
import { errorMessage } from '../../shared/errors';
import { QueryError } from '../../shared/feedback';
import { monthlyCost } from '../subscriptions/utils/subscription-metrics';
import { ServerAttentionCard } from './components/server-attention-card';
import { ServerBreakdownCard } from './components/server-breakdown-card';
import { ServerCard } from './components/server-card';
import { ServerDrawer } from './components/server-drawer';
import { ServerFilters } from './components/server-filters';
import { ServerRegionsCard } from './components/server-regions-card';
import { ServerSummaryStrip } from './components/server-summary-strip';
import { ServerTable } from './components/server-table';
import { ServerWizardModal } from './components/server-wizard-modal';
import {
  computeServerMetrics,
  resolveServerExpiry,
  serverNeedsAttention,
} from './utils/server-metrics';

export function ServersPage() {
  const servers = useQuery({
    ...serversOptions,
    staleTime: 3_000,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });
  const subscriptions = useQuery(subscriptionsOptions);
  const preferences = useQuery(preferencesOptions);
  const health = useQuery(healthOptions);
  const accounts = useQuery(accountsOptions);
  const domains = useQuery(domainsOptions);
  const ips = useQuery(ipsOptions);

  const { newServer, search } = useWorkspace();
  const routeSearch = useSearch({ strict: false }) as { detail?: string };
  const navigate = useNavigate();
  const { t, locale } = usePreferences();
  const client = useQueryClient();
  const { message } = App.useApp();

  const [scope, setScope] = useState<'all' | 'cloud' | 'local' | 'attention'>('all');
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const [region, setRegion] = useState('all');
  const [sort, setSort] = useState<'status' | 'cost' | 'specs' | 'name'>('status');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [masked, setMasked] = useState(false);
  const [editing, setEditing] = useState<ServerHost>();
  const [connectingAgent, setConnectingAgent] = useState<ServerHost>();

  const openDetail = (item: ServerHost) => {
    void navigate({ to: '/servers/$serverId', params: { serverId: item.id } });
  };

  const changed = async () => {
    await client.invalidateQueries({ queryKey: ['servers'] });
    await client.invalidateQueries({ queryKey: ['subscriptions'] });
    await client.invalidateQueries({ queryKey: ['ips'] });
    await client.invalidateQueries({ queryKey: ['nav-counts'] });
  };

  const renew = useMutation({
    mutationFn: (sub: Subscription) => renewSubscription(sub),
    onSuccess: async () => {
      await changed();
      void message.success(t('到期日已顺延一周期'));
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const remove = useMutation({
    mutationFn: deleteServer,
    onSuccess: async () => {
      await changed();
      void message.success(t('服务器已删除'));
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const available = servers.isSuccess;
  const items = useMemo(() => (available ? servers.data.items : []), [available, servers.data]);

  const subscriptionList = useMemo(
    () => (subscriptions.isSuccess ? subscriptions.data.items : []),
    [subscriptions.isSuccess, subscriptions.data],
  );
  const subscriptionsById = useMemo(
    () => new Map(subscriptionList.map(sub => [sub.id, sub])),
    [subscriptionList],
  );

  const accountList = useMemo(
    () => (accounts.isSuccess ? accounts.data.items : []),
    [accounts.isSuccess, accounts.data],
  );

  const domainList = useMemo(
    () => (domains.isSuccess ? domains.data.items : []),
    [domains.isSuccess, domains.data],
  );
  const ipList = useMemo(
    () => (ips.isSuccess ? ips.data.items : []),
    [ips.isSuccess, ips.data],
  );

  const prefs = preferences.isSuccess ? preferences.data : undefined;
  const agentIngestEnabled = health.isSuccess ? health.data.capabilities.agentIngest : false;

  const data = useMemo(
    () => (available ? computeServerMetrics(items, subscriptionsById, prefs) : undefined),
    [available, items, subscriptionsById, prefs],
  );

  const regions = useMemo(
    () => Array.from(new Set(items.filter(item => !item.archived).map(item => item.region))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) => {
        if (q) {
          const hay = [
            item.name,
            item.hostname,
            item.provider,
            item.region,
            item.datacenter,
            item.os,
            item.ipv4,
            item.ipv6,
            item.privateIp,
            item.portNote,
            item.notes,
            item.telemetry.cpuModel,
            ...item.telemetry.containers.map(c => `${c.name} ${c.image}`),
            ...item.tags,
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (kind !== 'all' && item.kind !== kind) return false;
        if (region !== 'all' && item.region !== region) return false;

        if (status === 'archived') return item.archived;
        if (item.archived) return false;

        if (scope === 'cloud' && !(item.kind === 'vps' || item.kind === 'dedicated' || item.kind === 'nat')) return false;
        if (scope === 'local' && !(item.kind === 'homelab' || item.kind === 'nas')) return false;
        if (scope === 'attention' && !serverNeedsAttention(item, subscriptionsById)) return false;

        if (status === 'expiring_soon') {
          const expiry = resolveServerExpiry(item, subscriptionsById);
          return expiry.days !== null && expiry.days <= 30;
        }
        if (status === 'keep') {
          const sub = item.subscriptionId ? subscriptionsById.get(item.subscriptionId) : undefined;
          return sub?.intention === 'keep';
        }
        if (status === 'active' || status === 'standby' || status === 'maintenance' || status === 'retiring') {
          return item.status === status;
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === 'name') {
          return a.name.localeCompare(b.name, locale);
        }
        if (sort === 'specs') {
          if (b.cpuCores !== a.cpuCores) return b.cpuCores - a.cpuCores;
          if (b.memoryMb !== a.memoryMb) return b.memoryMb - a.memoryMb;
          if (b.diskGb !== a.diskGb) return b.diskGb - a.diskGb;
        }
        if (sort === 'cost' && prefs) {
          const subA = a.subscriptionId ? subscriptionsById.get(a.subscriptionId) : undefined;
          const subB = b.subscriptionId ? subscriptionsById.get(b.subscriptionId) : undefined;
          const costA = subA && !subA.archived ? monthlyCost(subA, prefs) : 0;
          const costB = subB && !subB.archived ? monthlyCost(subB, prefs) : 0;
          if (costB !== costA) return costB - costA;
        }
        const statusRank = { active: 0, maintenance: 1, standby: 2, retiring: 3 } as const;
        if (statusRank[a.status] !== statusRank[b.status]) return statusRank[a.status] - statusRank[b.status];
        const daysA = resolveServerExpiry(a, subscriptionsById).days ?? 99999;
        const daysB = resolveServerExpiry(b, subscriptionsById).days ?? 99999;
        if (daysA !== daysB) return daysA - daysB;
        return a.name.localeCompare(b.name, locale);
      });
  }, [items, search, kind, region, status, scope, subscriptionsById, sort, locale, prefs]);

  const busySubId = renew.isPending ? renew.variables.id : undefined;

  const hasFilters = Boolean(
    search.trim()
    || scope !== 'all'
    || status !== 'all'
    || kind !== 'all'
    || region !== 'all',
  );

  if (routeSearch.detail) {
    return <Navigate to="/servers/$serverId" params={{ serverId: routeSearch.detail }} replace />;
  }

  return (
    <>
      <div className="page-heading">
        <h1>
          {t('服务器')}
          <span className="heading-count">{available ? items.filter(item => !item.archived).length : '—'}</span>
        </h1>
        <div className="page-actions">
          <Tooltip title={t(masked ? '显示完整地址' : '隐藏完整地址')}>
            <Button
              className={`round-tool ${masked ? 'is-active' : ''}`}
              aria-label={t(masked ? '显示完整地址' : '隐藏完整地址')}
              aria-pressed={masked}
              icon={masked ? <Eye size={16} /> : <EyeOff size={16} />}
              onClick={() => setMasked(prev => !prev)}
            />
          </Tooltip>
          <ServerFilters
            status={status}
            kind={kind}
            region={region}
            regions={regions}
            onStatus={setStatus}
            onKind={setKind}
            onRegion={setRegion}
          />
          <Button
            type="primary"
            className="new-resource-button"
            aria-label={t('新建服务器')}
            icon={<Plus size={16} />}
            onClick={newServer}
            disabled={!available}
          >
            {t('新建')}
          </Button>
        </div>
      </div>

      {servers.isError && (
        <div className="mb-5">
          <QueryError
            title={t('无法加载服务器')}
            error={servers.error}
            retry={() => {
              void servers.refetch();
            }}
          />
        </div>
      )}

      {preferences.isError && available && (
        <div className="mb-5">
          <QueryError
            title={t('无法加载汇率，折算统计暂不可用')}
            error={preferences.error}
            retry={() => {
              void preferences.refetch();
            }}
          />
        </div>
      )}

      <div className="subscriptions-layout">
        <ServerSummaryStrip
          data={data}
          prefs={prefs}
          agentIngestEnabled={agentIngestEnabled}
        />

        <section className="subscriptions-main" aria-label={t('服务器列表')}>
          <div className="subscription-toolbar account-toolbar">
            <div className="account-toolbar-left">
              <Segmented
                value={scope}
                onChange={val => setScope(val as typeof scope)}
                options={[
                  { value: 'all', label: t('全部') },
                  { value: 'cloud', label: t('云与 VPS') },
                  { value: 'local', label: t('本地与 NAS') },
                  { value: 'attention', label: t('待处理') },
                ]}
              />
              {region !== 'all' && (
                <button
                  type="button"
                  className="hub-filter-chip"
                  aria-label={t('清除地区筛选')}
                  onClick={() => setRegion('all')}
                >
                  <span>{t('按地区筛选：{region}', { region })}</span>
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="account-toolbar-right">
              <div className="view-toggle-group" role="group" aria-label={t('服务器列表')}>
                <Tooltip title={t('卡片视图')}>
                  <Button
                    className={`round-tool ${view === 'cards' ? 'is-active' : ''}`}
                    aria-label={t('卡片视图')}
                    aria-pressed={view === 'cards'}
                    icon={<LayoutGrid size={15} />}
                    onClick={() => setView('cards')}
                  />
                </Tooltip>
                <Tooltip title={t('表格视图')}>
                  <Button
                    className={`round-tool ${view === 'table' ? 'is-active' : ''}`}
                    aria-label={t('表格视图')}
                    aria-pressed={view === 'table'}
                    icon={<Table2 size={15} />}
                    onClick={() => setView('table')}
                  />
                </Tooltip>
              </div>

              <Dropdown
                trigger={['click']}
                menu={{
                  selectedKeys: [sort],
                  items: [
                    { key: 'status', label: t('状态与到期优先') },
                    { key: 'cost', label: t('月均最高') },
                    { key: 'specs', label: t('规格与核心数') },
                    { key: 'name', label: t('名称排序') },
                  ],
                  onClick: ({ key }) => setSort(key as typeof sort),
                }}
              >
                <Tooltip title={t('服务器排序')}>
                  <Button className="round-tool" aria-label={t('服务器排序')} icon={<ArrowDownWideNarrow size={16} />} />
                </Tooltip>
              </Dropdown>
            </div>
          </div>

          {servers.isPending
            ? (
                <div className="subscription-grid">
                  {[0, 1].map(key => <Skeleton key={key} active className="p-6" />)}
                </div>
              )
            : servers.isError
              ? <div className="catalogue-empty">{t('服务器数据不可用')}</div>
              : !filtered.length
                  ? (
                      <div className="catalogue-empty">
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={t(hasFilters ? '没有匹配的服务器' : '还没有录入服务器')}
                        />
                        {!hasFilters && (
                          <Button icon={<Plus size={15} />} type="primary" onClick={newServer}>
                            {t('录入第一台服务器')}
                          </Button>
                        )}
                      </div>
                    )
                  : view === 'table'
                    ? (
                        <ServerTable
                          items={filtered}
                          subscriptionsById={subscriptionsById}
                          masked={masked}
                          loading={false}
                          onDetails={openDetail}
                          onEdit={item => setEditing(item)}
                          onConnectAgent={item => setConnectingAgent(item)}
                          onRenew={sub => renew.mutateAsync(sub)}
                          onDelete={id => remove.mutateAsync(id)}
                          busySubId={busySubId}
                        />
                      )
                    : (
                        <div className="subscription-grid">
                          {filtered.map(item => (
                            <ServerCard
                              key={item.id}
                              value={item}
                              subscriptionsById={subscriptionsById}
                              masked={masked}
                              onDetails={() => openDetail(item)}
                              onEdit={() => setEditing(item)}
                              onConnectAgent={() => setConnectingAgent(item)}
                              onRenew={sub => renew.mutateAsync(sub)}
                              onDelete={() => remove.mutateAsync(item.id)}
                              busyRenew={Boolean(item.subscriptionId && busySubId === item.subscriptionId)}
                            />
                          ))}
                        </div>
                      )}
        </section>

        <aside className="subscriptions-aside">
          <ServerRegionsCard
            data={data}
            activeRegion={region === 'all' ? undefined : region}
            onSelectRegion={code => setRegion(prev => (prev === code ? 'all' : code))}
          />
          <ServerAttentionCard
            data={data}
            onSelect={openDetail}
          />
          <ServerBreakdownCard data={data} />
        </aside>
      </div>

      {editing && (
        <ServerDrawer
          key={editing.id}
          open
          value={editing}
          subscriptions={subscriptionList}
          accounts={accountList}
          domains={domainList}
          ips={ipList}
          onClose={() => setEditing(undefined)}
        />
      )}

      {connectingAgent && (
        <ServerWizardModal
          key={`agent-${connectingAgent.id}`}
          open
          targetServer={connectingAgent}
          onClose={() => setConnectingAgent(undefined)}
          onEditEnrolled={(srv) => {
            setEditing(srv);
          }}
        />
      )}
    </>
  );
}
