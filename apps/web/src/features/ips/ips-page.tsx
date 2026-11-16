import {
  accountsOptions,
  deleteIp,
  domainsOptions,
  integrationsOptions,
  type IpNode,
  ipsOptions,
  type IpUnlockService,
  probeIp,
  refreshIpLookup,
  reviewIp,
  subscriptionsOptions,
} from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { App, Button, Dropdown, Empty, Segmented, Skeleton, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { ArrowDownWideNarrow, Cloud, Eye, EyeOff, LayoutGrid, Plus, Table2, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { usePreferences } from '../../app/preferences-context';
import { useWorkspace } from '../../layouts/workspace-context';
import { errorMessage } from '../../shared/errors';
import { QueryError } from '../../shared/feedback';
import { ProviderSyncModal } from '../integrations/provider-sync-modal';
import { IpBreakdownCard } from './components/ip-breakdown-card';
import { IpCard } from './components/ip-card';
import { IpDetails } from './components/ip-details';
import { IpFilters } from './components/ip-filters';
import { IpHygieneCard } from './components/ip-hygiene-card';
import { IpSummaryStrip } from './components/ip-summary-strip';
import { IpTable } from './components/ip-table';
import { IpUnlocksCard } from './components/ip-unlocks-card';
import { IpWizardModal } from './components/ip-wizard-modal';
import {
  computeIpMetrics,
  ipDisplayTitle,
  ipNeedsAttention,
  ipUnlockMeta,
  isResidentialOrNative,
  reviewRemaining,
} from './utils/ip-metrics';

export function IpsPage() {
  const ips = useQuery(ipsOptions);
  const subscriptions = useQuery(subscriptionsOptions);
  const domains = useQuery(domainsOptions);
  const accounts = useQuery(accountsOptions);
  const integrations = useQuery(integrationsOptions);

  const { newIp, search } = useWorkspace();
  const routeSearch = useSearch({ strict: false }) as { detail?: string };
  const navigate = useNavigate();
  const { t, locale } = usePreferences();
  const client = useQueryClient();
  const { message } = App.useApp();

  const [scope, setScope] = useState<'all' | 'exit' | 'residential' | 'entry' | 'overlay' | 'attention'>('all');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [asnType, setAsnType] = useState('all');
  const [originType, setOriginType] = useState('all');
  const [region, setRegion] = useState('all');
  const [sort, setSort] = useState<'role' | 'review' | 'latency' | 'name'>('role');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [masked, setMasked] = useState(false);
  const [unlockFilter, setUnlockFilter] = useState<IpUnlockService>();
  const [editing, setEditing] = useState<IpNode>();
  const [detailId, setDetailId] = useState<string>();
  const [syncModalOpen, setSyncModalOpen] = useState(false);

  const effectiveDetailId = detailId ?? routeSearch.detail;
  const closeDetail = () => {
    setDetailId(undefined);
    if (routeSearch.detail) {
      void navigate({ to: '/ips', search: {}, replace: true });
    }
  };

  const changed = async () => {
    await client.invalidateQueries({ queryKey: ['ips'] });
    await client.invalidateQueries({ queryKey: ['nav-counts'] });
  };

  const review = useMutation({
    mutationFn: (value: IpNode) => reviewIp(value, dayjs().format('YYYY-MM-DD')),
    onSuccess: async () => {
      await changed();
      void message.success(t('已更新复检记录'));
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const lookup = useMutation({
    mutationFn: (value: IpNode) => refreshIpLookup(value.id),
    onSuccess: async () => {
      await changed();
      void message.success(t('已同步归属信息'));
    },
    onError: async (error) => {
      await client.invalidateQueries({ queryKey: ['ips'] });
      void message.error(errorMessage(error, locale));
    },
  });

  const probe = useMutation({
    mutationFn: (value: IpNode) => probeIp(value.id),
    onSuccess: async (updated) => {
      await changed();
      const statusText = updated.probeStatus === 'reachable'
        ? `${t('连通正常')} (${updated.probeLatencyMs} ms)`
        : updated.probeStatus === 'unreachable'
          ? t('无法连通')
          : t('内网跳过');
      void message.success(t('已完成连通性探测：{status}', { status: statusText }));
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const remove = useMutation({
    mutationFn: deleteIp,
    onSuccess: async () => {
      await changed();
      closeDetail();
      void message.success(t('IP 节点已删除'));
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const available = ips.isSuccess;
  const items = useMemo(() => (available ? ips.data.items : []), [available, ips.data]);
  const allById = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);

  const subscriptionList = useMemo(
    () => (subscriptions.isSuccess ? subscriptions.data.items : []),
    [subscriptions.isSuccess, subscriptions.data],
  );
  const subscriptionsById = useMemo(
    () => new Map(subscriptionList.map(sub => [sub.id, sub])),
    [subscriptionList],
  );
  const domainList = useMemo(
    () => (domains.isSuccess ? domains.data.items : []),
    [domains.isSuccess, domains.data],
  );
  const accountList = useMemo(
    () => (accounts.isSuccess ? accounts.data.items : []),
    [accounts.isSuccess, accounts.data],
  );
  const ipConnections = useMemo(() => {
    if (!integrations.isSuccess) return [];
    const supported = new Set([
      'tailscale',
      'hetzner',
      'digitalocean',
      'bandwagon',
      'aliyun',
      'tencent',
    ]);
    return integrations.data.items.filter(item => supported.has(item.provider));
  }, [integrations.isSuccess, integrations.data]);
  const ipSyncHasError = ipConnections.some(item => item.status === 'error');

  const data = useMemo(
    () => (available ? computeIpMetrics(items, subscriptionList) : undefined),
    [available, items, subscriptionList],
  );
  const regions = useMemo(
    () => Array.from(new Set(items.filter(item => !item.archived).map(item => item.region))).sort(),
    [items],
  );

  const detail = effectiveDetailId ? allById.get(effectiveDetailId) : undefined;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) => {
        if (q) {
          const hay = [
            item.address,
            item.provider,
            item.label,
            item.region,
            item.city,
            item.asn > 0 ? `as${item.asn} ${item.asn}` : '',
            item.asnOrg,
            item.ptrRecord,
            item.purityNote,
            item.hostLabel,
            item.notes,
            ...item.tags,
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (category !== 'all' && item.category !== category) return false;
        if (asnType !== 'all' && item.asnType !== asnType) return false;
        if (originType !== 'all' && item.originType !== originType) return false;
        if (region !== 'all' && item.region !== region) return false;
        if (unlockFilter && item.unlocks[unlockFilter]?.status !== 'full') return false;

        if (status === 'archived') return item.archived;
        if (item.archived) return false;

        if (scope === 'exit' && item.networkScope !== 'overseas_exit') return false;
        if (scope === 'residential' && !isResidentialOrNative(item)) return false;
        if (scope === 'entry' && item.networkScope !== 'domestic_entry') return false;
        if (scope === 'overlay' && item.networkScope !== 'overlay_private') return false;
        if (scope === 'attention' && !ipNeedsAttention(item, subscriptionsById)) return false;

        if (status === 'review_soon') {
          const days = reviewRemaining(item);
          return days !== null && days <= 30;
        }
        if (status === 'unhealthy') {
          return (
            item.status === 'blocked'
            || item.status === 'degraded'
            || item.riskLevel === 'high'
            || (item.probeMode !== 'none' && item.probeStatus === 'unreachable')
          );
        }
        if (status === 'retiring') return item.status === 'retiring';
        return true;
      })
      .sort((a, b) => {
        if (sort === 'name') {
          return ipDisplayTitle(a).localeCompare(ipDisplayTitle(b), locale) || a.address.localeCompare(b.address);
        }
        if (sort === 'review') {
          const daysA = reviewRemaining(a) ?? 99999;
          const daysB = reviewRemaining(b) ?? 99999;
          if (daysA !== daysB) return daysA - daysB;
        }
        if (sort === 'latency') {
          const latA = a.probeStatus === 'reachable' ? a.probeLatencyMs : 999999;
          const latB = b.probeStatus === 'reachable' ? b.probeLatencyMs : 999999;
          if (latA !== latB) return latA - latB;
        }
        const roleRank = { dedicated: 0, primary: 1, service: 2, standby: 3 } as const;
        if (roleRank[a.role] !== roleRank[b.role]) return roleRank[a.role] - roleRank[b.role];
        const nativeDiff = Number(isResidentialOrNative(b)) - Number(isResidentialOrNative(a));
        if (nativeDiff !== 0) return nativeDiff;
        return ipDisplayTitle(a).localeCompare(ipDisplayTitle(b), locale);
      });
  }, [items, search, category, asnType, originType, region, unlockFilter, status, scope, subscriptionsById, sort, locale]);

  const busyActionFor = (id: string): 'probe' | 'lookup' | 'review' | undefined => {
    if (probe.isPending && probe.variables.id === id) return 'probe';
    if (lookup.isPending && lookup.variables.id === id) return 'lookup';
    if (review.isPending && review.variables.id === id) return 'review';
    return undefined;
  };

  const activeBusyId = probe.isPending
    ? probe.variables.id
    : lookup.isPending
      ? lookup.variables.id
      : review.isPending
        ? review.variables.id
        : undefined;

  const hasFilters = Boolean(
    search.trim()
    || scope !== 'all'
    || status !== 'all'
    || category !== 'all'
    || asnType !== 'all'
    || originType !== 'all'
    || region !== 'all'
    || unlockFilter,
  );

  const detailSubscription = detail?.subscriptionId ? subscriptionsById.get(detail.subscriptionId) : undefined;
  const detailDomains = useMemo(() => {
    if (!detail) return [];
    const ids = new Set(detail.domainIds);
    return domainList.filter(dom => ids.has(dom.id));
  }, [detail, domainList]);
  const detailAccounts = useMemo(() => {
    if (!detail) return [];
    const ids = new Set(detail.accountIds);
    return accountList.filter(acct => ids.has(acct.id));
  }, [detail, accountList]);

  return (
    <>
      <div className="page-heading">
        <h1>
          {t('IP 与节点')}
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
          <IpFilters
            status={status}
            category={category}
            asnType={asnType}
            originType={originType}
            region={region}
            regions={regions}
            onStatus={setStatus}
            onCategory={setCategory}
            onAsnType={setAsnType}
            onOriginType={setOriginType}
            onRegion={setRegion}
          />
          <Button
            className={`cf-sync-trigger-btn ${ipConnections.length > 0 ? 'is-connected' : ''}`}
            icon={<Cloud size={15} />}
            onClick={() => setSyncModalOpen(true)}
            disabled={!available}
          >
            <span>{t('云平台同步')}</span>
            {ipConnections.length > 0 && (
              <span className={`cf-live-dot ${ipSyncHasError ? 'is-error' : ''}`} aria-hidden="true" />
            )}
          </Button>
          <Button
            type="primary"
            className="new-resource-button"
            aria-label={t('新建 IP')}
            icon={<Plus size={16} />}
            onClick={newIp}
            disabled={!available}
          >
            {t('新建')}
          </Button>
        </div>
      </div>

      {ips.isError && (
        <div className="mb-5">
          <QueryError
            title={t('无法加载 IP 节点')}
            error={ips.error}
            retry={() => {
              void ips.refetch();
            }}
          />
        </div>
      )}

      <div className="subscriptions-layout">
        <IpSummaryStrip data={data} />

        <section className="subscriptions-main" aria-label={t('节点列表')}>
          <div className="subscription-toolbar account-toolbar">
            <div className="account-toolbar-left">
              <Segmented
                value={scope}
                onChange={val => setScope(val as typeof scope)}
                options={[
                  { value: 'all', label: t('全部') },
                  { value: 'exit', label: t('出口') },
                  { value: 'residential', label: t('住宅') },
                  { value: 'entry', label: t('入口') },
                  { value: 'overlay', label: t('组网') },
                  { value: 'attention', label: t('待处理') },
                ]}
              />
              {unlockFilter && (
                <button
                  type="button"
                  className="hub-filter-chip"
                  aria-label={t('清除解锁筛选')}
                  onClick={() => setUnlockFilter(undefined)}
                >
                  <span>{t('按解锁筛选：{name}', { name: ipUnlockMeta[unlockFilter].label })}</span>
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="account-toolbar-right">
              <div className="view-toggle-group" role="group" aria-label={t('节点列表')}>
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
                    { key: 'role', label: t('角色与纯净度') },
                    { key: 'review', label: t('复检与续费最近') },
                    { key: 'latency', label: t('延迟最低') },
                    { key: 'name', label: t('名称与地址排序') },
                  ],
                  onClick: ({ key }) => setSort(key as typeof sort),
                }}
              >
                <Tooltip title={t('节点排序')}>
                  <Button className="round-tool" aria-label={t('节点排序')} icon={<ArrowDownWideNarrow size={16} />} />
                </Tooltip>
              </Dropdown>
            </div>
          </div>

          {ips.isPending
            ? (
                <div className="subscription-grid">
                  {[0, 1].map(key => <Skeleton key={key} active className="p-6" />)}
                </div>
              )
            : ips.isError
              ? <div className="catalogue-empty">{t('IP 节点数据不可用')}</div>
              : !filtered.length
                  ? (
                      <div className="catalogue-empty">
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={t(hasFilters ? '没有匹配的 IP 节点' : '还没有录入 IP 节点')}
                        />
                        {!hasFilters && (
                          <Button icon={<Plus size={15} />} type="primary" onClick={newIp}>
                            {t('录入第一个 IP 节点')}
                          </Button>
                        )}
                      </div>
                    )
                  : view === 'table'
                    ? (
                        <IpTable
                          items={filtered}
                          subscriptionsById={subscriptionsById}
                          masked={masked}
                          loading={false}
                          onDetails={item => setDetailId(item.id)}
                          onEdit={item => setEditing(item)}
                          onProbe={item => probe.mutateAsync(item)}
                          onLookup={item => lookup.mutateAsync(item)}
                          onReview={item => review.mutateAsync(item)}
                          onDelete={id => remove.mutateAsync(id)}
                          busyId={activeBusyId}
                        />
                      )
                    : (
                        <div className="subscription-grid">
                          {filtered.map(item => (
                            <IpCard
                              key={item.id}
                              value={item}
                              subscriptionsById={subscriptionsById}
                              masked={masked}
                              onDetails={() => setDetailId(item.id)}
                              onEdit={() => setEditing(item)}
                              onProbe={() => probe.mutateAsync(item)}
                              onLookup={() => lookup.mutateAsync(item)}
                              onReview={() => review.mutateAsync(item)}
                              onDelete={() => remove.mutateAsync(item.id)}
                              busyAction={busyActionFor(item.id)}
                            />
                          ))}
                        </div>
                      )}
        </section>

        <aside className="subscriptions-aside">
          <IpUnlocksCard
            data={data}
            activeService={unlockFilter}
            onSelectService={service => setUnlockFilter(prev => (prev === service ? undefined : service))}
          />
          <IpHygieneCard
            data={data}
            subscriptionsById={subscriptionsById}
            onSelect={item => setDetailId(item.id)}
          />
          <IpBreakdownCard data={data} />
        </aside>
      </div>

      {detail && (
        <IpDetails
          value={detail}
          linkedSubscription={detailSubscription}
          linkedDomains={detailDomains}
          linkedAccounts={detailAccounts}
          onClose={closeDetail}
          onEdit={() => {
            setEditing(detail);
            closeDetail();
          }}
          onProbe={() => probe.mutateAsync(detail)}
          onLookup={() => lookup.mutateAsync(detail)}
          onReview={() => review.mutateAsync(detail)}
          busyAction={busyActionFor(detail.id)}
        />
      )}

      {editing && (
        <IpWizardModal
          key={editing.id}
          open
          value={editing}
          subscriptions={subscriptionList}
          domains={domainList}
          accounts={accountList}
          onClose={() => setEditing(undefined)}
        />
      )}

      <ProviderSyncModal
        open={syncModalOpen}
        scope="ips"
        accounts={accountList}
        onClose={() => setSyncModalOpen(false)}
      />
    </>
  );
}
