import {
  accountsOptions,
  deleteDomain,
  type Domain,
  domainsOptions,
  integrationsOptions,
  ipsOptions,
  preferencesOptions,
  refreshDomainLookup,
  renewSubscription,
  serversOptions,
  type Subscription,
  subscriptionsOptions,
  updateDomain,
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
import { CloudflareSyncModal } from './components/cloudflare-sync-modal';
import { DomainAttentionCard } from './components/domain-attention-card';
import { DomainBreakdownCard } from './components/domain-breakdown-card';
import { DomainCard } from './components/domain-card';
import { DomainDetails } from './components/domain-details';
import { DomainDrawer } from './components/domain-drawer';
import { DomainFilters } from './components/domain-filters';
import { DomainRegistrarsCard } from './components/domain-registrars-card';
import { DomainSummaryStrip } from './components/domain-summary-strip';
import { DomainTable } from './components/domain-table';
import { resolveDomainPreset } from './presets/domain-presets';
import {
  computeDomainMetrics,
  domainNeedsAttention,
  extractDomainTld,
  resolveDomainExpiry,
} from './utils/domain-metrics';

export function DomainsPage() {
  const domains = useQuery(domainsOptions);
  const subscriptions = useQuery(subscriptionsOptions);
  const preferences = useQuery(preferencesOptions);
  const accounts = useQuery(accountsOptions);
  const servers = useQuery(serversOptions);
  const ips = useQuery(ipsOptions);
  const integrations = useQuery(integrationsOptions);

  const { newDomain, search } = useWorkspace();
  const routeSearch = useSearch({ strict: false }) as { detail?: string };
  const navigate = useNavigate();
  const { t, locale } = usePreferences();
  const client = useQueryClient();
  const { message } = App.useApp();

  const [scope, setScope] = useState<'all' | 'prod' | 'personal' | 'parked' | 'attention'>('all');
  const [status, setStatus] = useState('all');
  const [purpose, setPurpose] = useState('all');
  const [icp, setIcp] = useState('all');
  const [tld, setTld] = useState('all');
  const [registrarFilter, setRegistrarFilter] = useState<string>();
  const [sort, setSort] = useState<'expiry' | 'purpose' | 'name'>('expiry');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [masked, setMasked] = useState(false);
  const [editing, setEditing] = useState<Domain>();
  const [detailId, setDetailId] = useState<string>();
  const [cfModalOpen, setCfModalOpen] = useState(false);

  const effectiveDetailId = detailId ?? routeSearch.detail;
  const closeDetail = () => {
    setDetailId(undefined);
    if (routeSearch.detail) {
      void navigate({ to: '/domains', search: {}, replace: true });
    }
  };

  const changed = async () => {
    await client.invalidateQueries({ queryKey: ['domains'] });
    await client.invalidateQueries({ queryKey: ['servers'] });
    await client.invalidateQueries({ queryKey: ['ips'] });
    await client.invalidateQueries({ queryKey: ['subscriptions'] });
    await client.invalidateQueries({ queryKey: ['nav-counts'] });
  };

  const renewSub = useMutation({
    mutationFn: (sub: Subscription) => renewSubscription(sub),
    onSuccess: async () => {
      await changed();
      void message.success(t('到期日已顺延一周期'));
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const extendYear = useMutation({
    mutationFn: (domain: Domain) => {
      const nextDate = dayjs(domain.expireDate || dayjs().format('YYYY-MM-DD'))
        .add(1, 'year')
        .format('YYYY-MM-DD');
      return updateDomain(domain.id, { ...domain, expireDate: nextDate });
    },
    onSuccess: async () => {
      await changed();
      void message.success(t('域名到期日已顺延 1 年'));
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const lookupRefresh = useMutation({
    mutationFn: (domain: Domain) => refreshDomainLookup(domain.id, true),
    onSuccess: async (res) => {
      await changed();
      void message.success(
        t('已通过 {source} 更新域名注册与到期信息', {
          source: (res.lookupSource || 'RDAP').toUpperCase(),
        }),
      );
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const remove = useMutation({
    mutationFn: deleteDomain,
    onSuccess: async () => {
      await changed();
      closeDetail();
      void message.success(t('域名已删除'));
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const cfConnections = useMemo(
    () => (integrations.isSuccess ? integrations.data.items.filter(c => c.provider === 'cloudflare') : []),
    [integrations.isSuccess, integrations.data],
  );
  const cfHasError = cfConnections.some(c => c.status === 'error');

  const available = domains.isSuccess;
  const items = useMemo(() => (available ? domains.data.items : []), [available, domains.data]);
  const allById = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);

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
  const accountsById = useMemo(
    () => new Map(accountList.map(acct => [acct.id, acct])),
    [accountList],
  );

  const serverList = useMemo(
    () => (servers.isSuccess ? servers.data.items : []),
    [servers.isSuccess, servers.data],
  );
  const serversById = useMemo(
    () => new Map(serverList.map(srv => [srv.id, srv])),
    [serverList],
  );

  const ipList = useMemo(
    () => (ips.isSuccess ? ips.data.items : []),
    [ips.isSuccess, ips.data],
  );
  const ipsById = useMemo(
    () => new Map(ipList.map(ip => [ip.id, ip])),
    [ipList],
  );

  const data = useMemo(
    () => (available ? computeDomainMetrics(items, subscriptionsById, preferences.data) : undefined),
    [available, items, subscriptionsById, preferences.data],
  );

  const tldOptions = useMemo(
    () => Array.from(new Set(items.filter(item => !item.archived).map(item => extractDomainTld(item.name)).filter(Boolean))).sort(),
    [items],
  );

  const detail = effectiveDetailId ? allById.get(effectiveDetailId) : undefined;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) => {
        if (q) {
          const hay = [
            item.name,
            item.registrar,
            item.dnsProvider,
            item.icpNumber,
            item.notes,
            ...item.tags,
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }

        if (purpose !== 'all' && item.purpose !== purpose) return false;
        if (icp !== 'all' && item.icpStatus !== icp) return false;
        if (tld !== 'all' && extractDomainTld(item.name) !== tld) return false;

        if (registrarFilter) {
          const preset = resolveDomainPreset(item);
          const regKey = (item.registrar.trim() || preset?.registrar.zh || '').toLowerCase();
          if (regKey !== registrarFilter) return false;
        }

        if (status === 'archived') return item.archived;
        if (item.archived) return false;

        if (scope === 'prod' && item.purpose !== 'prod' && item.purpose !== 'cdn') return false;
        if (scope === 'personal' && item.purpose !== 'personal' && item.purpose !== 'mail') return false;
        if (scope === 'parked' && item.purpose !== 'parked' && item.status !== 'parked') return false;
        if (scope === 'attention' && !domainNeedsAttention(item, subscriptionsById)) return false;

        if (status === 'expiring') {
          const exp = resolveDomainExpiry(item, subscriptionsById);
          return exp.days !== null && exp.days <= 60;
        }
        if (status !== 'all' && item.status !== status) return false;

        return true;
      })
      .sort((a, b) => {
        if (sort === 'name') {
          return a.name.localeCompare(b.name, locale);
        }
        if (sort === 'purpose') {
          const rank = { prod: 0, cdn: 1, mail: 2, personal: 3, parked: 4 } as const;
          if (rank[a.purpose] !== rank[b.purpose]) return rank[a.purpose] - rank[b.purpose];
        }
        const expA = resolveDomainExpiry(a, subscriptionsById).days ?? 99999;
        const expB = resolveDomainExpiry(b, subscriptionsById).days ?? 99999;
        if (expA !== expB) return expA - expB;
        return a.name.localeCompare(b.name, locale);
      });
  }, [items, search, purpose, icp, tld, registrarFilter, status, scope, subscriptionsById, sort, locale]);

  const activeBusyId = renewSub.isPending
    ? renewSub.variables.id
    : extendYear.isPending
      ? extendYear.variables.id
      : lookupRefresh.isPending
        ? lookupRefresh.variables.id
        : undefined;

  const hasFilters = Boolean(
    search.trim()
    || scope !== 'all'
    || status !== 'all'
    || purpose !== 'all'
    || icp !== 'all'
    || tld !== 'all'
    || registrarFilter,
  );

  const selectedRegistrarLabel = useMemo(() => {
    if (!registrarFilter || !data) return registrarFilter;
    return data.registrars.find(r => r.key === registrarFilter)?.registrar ?? registrarFilter;
  }, [registrarFilter, data]);

  const detailSubscription = detail?.subscriptionId ? subscriptionsById.get(detail.subscriptionId) : undefined;
  const detailAccount = detail?.registrarAccountId ? accountsById.get(detail.registrarAccountId) : undefined;
  const detailServers = useMemo(() => {
    if (!detail) return [];
    const ids = new Set(detail.serverIds);
    return serverList.filter(srv => ids.has(srv.id));
  }, [detail, serverList]);
  const detailIps = useMemo(() => {
    if (!detail) return [];
    const ids = new Set(detail.ipIds);
    return ipList.filter(ip => ids.has(ip.id));
  }, [detail, ipList]);

  return (
    <>
      <div className="page-heading">
        <h1>
          {t('域名')}
          <span className="heading-count">{available ? items.filter(item => !item.archived).length : '—'}</span>
        </h1>
        <div className="page-actions">
          <Tooltip title={t(masked ? '显示完整域名' : '隐藏域名前缀')}>
            <Button
              className={`round-tool ${masked ? 'is-active' : ''}`}
              aria-label={t(masked ? '显示完整域名' : '隐藏域名前缀')}
              aria-pressed={masked}
              icon={masked ? <Eye size={16} /> : <EyeOff size={16} />}
              onClick={() => setMasked(prev => !prev)}
            />
          </Tooltip>
          <DomainFilters
            status={status}
            purpose={purpose}
            icp={icp}
            tld={tld}
            tlds={tldOptions}
            onStatus={setStatus}
            onPurpose={setPurpose}
            onIcp={setIcp}
            onTld={setTld}
          />
          <Button
            className={`cf-sync-trigger-btn ${cfConnections.length > 0 ? 'is-connected' : ''}`}
            icon={<Cloud size={15} />}
            onClick={() => setCfModalOpen(true)}
            disabled={!available}
          >
            <span>{t('Cloudflare 同步')}</span>
            {cfConnections.length > 0 && (
              <span className={`cf-live-dot ${cfHasError ? 'is-error' : ''}`} aria-hidden="true" />
            )}
          </Button>
          <Button
            type="primary"
            className="new-resource-button"
            aria-label={t('新建域名')}
            icon={<Plus size={16} />}
            onClick={newDomain}
            disabled={!available}
          >
            {t('新建')}
          </Button>
        </div>
      </div>

      {domains.isError && (
        <div className="mb-5">
          <QueryError
            title={t('无法加载域名')}
            error={domains.error}
            retry={() => {
              void domains.refetch();
            }}
          />
        </div>
      )}

      <div className="subscriptions-layout">
        <DomainSummaryStrip data={data} prefs={preferences.data} />

        <section className="subscriptions-main" aria-label={t('域名列表')}>
          <div className="subscription-toolbar account-toolbar">
            <div className="account-toolbar-left">
              <Segmented
                value={scope}
                onChange={val => setScope(val as typeof scope)}
                options={[
                  { value: 'all', label: t('全部') },
                  { value: 'prod', label: t('主力生产') },
                  { value: 'personal', label: t('个人与邮箱') },
                  { value: 'parked', label: t('停放备用') },
                  { value: 'attention', label: t('待处理') },
                ]}
              />

              {registrarFilter && (
                <button
                  type="button"
                  className="hub-filter-chip"
                  aria-label={t('清除注册商筛选')}
                  onClick={() => setRegistrarFilter(undefined)}
                >
                  <span>{t('按注册商：{name}', { name: selectedRegistrarLabel ?? '' })}</span>
                  <X size={13} />
                </button>
              )}

              {tld !== 'all' && (
                <button
                  type="button"
                  className="hub-filter-chip"
                  aria-label={t('清除后缀筛选')}
                  onClick={() => setTld('all')}
                >
                  <span>{t('后缀：{tld}', { tld })}</span>
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="account-toolbar-right">
              <div className="view-toggle-group" role="group" aria-label={t('域名列表')}>
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
                    { key: 'expiry', label: t('到期时间最近') },
                    { key: 'purpose', label: t('用途优先级') },
                    { key: 'name', label: t('按域名排序') },
                  ],
                  onClick: ({ key }) => setSort(key as typeof sort),
                }}
              >
                <Tooltip title={t('域名排序')}>
                  <Button className="round-tool" aria-label={t('域名排序')} icon={<ArrowDownWideNarrow size={16} />} />
                </Tooltip>
              </Dropdown>
            </div>
          </div>

          {domains.isPending
            ? (
                <div className="subscription-grid">
                  {[0, 1].map(key => <Skeleton key={key} active className="p-6" />)}
                </div>
              )
            : domains.isError
              ? <div className="catalogue-empty">{t('数据不可用')}</div>
              : !filtered.length
                  ? (
                      <div className="catalogue-empty">
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={t(hasFilters ? '没有匹配的域名' : '还没有录入域名资产')}
                        />
                        {!hasFilters && (
                          <Button icon={<Plus size={15} />} type="primary" onClick={newDomain}>
                            {t('录入第一个域名')}
                          </Button>
                        )}
                      </div>
                    )
                  : view === 'table'
                    ? (
                        <DomainTable
                          items={filtered}
                          subscriptionsById={subscriptionsById}
                          serversById={serversById}
                          ipsById={ipsById}
                          masked={masked}
                          loading={false}
                          onDetails={item => setDetailId(item.id)}
                          onEdit={item => setEditing(item)}
                          onRenewSub={sub => renewSub.mutateAsync(sub)}
                          onExtendYear={item => extendYear.mutateAsync(item)}
                          onDelete={id => remove.mutateAsync(id)}
                          busyId={activeBusyId}
                        />
                      )
                    : (
                        <div className="subscription-grid">
                          {filtered.map((item) => {
                            const exp = resolveDomainExpiry(item, subscriptionsById);
                            const isBusy = activeBusyId === item.id
                              || Boolean(exp.subscription && activeBusyId === exp.subscription.id);
                            return (
                              <DomainCard
                                key={item.id}
                                value={item}
                                subscriptionsById={subscriptionsById}
                                accountsById={accountsById}
                                serversById={serversById}
                                ipsById={ipsById}
                                masked={masked}
                                onDetails={() => setDetailId(item.id)}
                                onEdit={() => setEditing(item)}
                                onRenewSub={sub => renewSub.mutateAsync(sub)}
                                onExtendYear={dom => extendYear.mutateAsync(dom)}
                                onRefreshLookup={dom => lookupRefresh.mutateAsync(dom)}
                                onDelete={() => remove.mutateAsync(item.id)}
                                busyRenew={isBusy}
                              />
                            );
                          })}
                        </div>
                      )}
        </section>

        <aside className="subscriptions-aside">
          <DomainRegistrarsCard
            data={data}
            activeRegistrar={registrarFilter}
            onSelectRegistrar={key => setRegistrarFilter(prev => (prev === key ? undefined : key))}
          />
          <DomainAttentionCard
            data={data}
            masked={masked}
            onSelect={item => setDetailId(item.id)}
          />
          <DomainBreakdownCard
            data={data}
            activeTld={tld}
            onSelectTld={setTld}
          />
        </aside>
      </div>

      {detail && (
        <DomainDetails
          value={detail}
          linkedSubscription={detailSubscription}
          linkedAccount={detailAccount}
          linkedServers={detailServers}
          linkedIps={detailIps}
          serversById={serversById}
          ipsById={ipsById}
          onClose={closeDetail}
          onEdit={() => {
            setEditing(detail);
            closeDetail();
          }}
          onRenewSub={sub => renewSub.mutateAsync(sub)}
          onExtendYear={dom => extendYear.mutateAsync(dom)}
          onRefreshLookup={dom => lookupRefresh.mutateAsync(dom)}
          busyLookup={lookupRefresh.isPending && lookupRefresh.variables.id === detail.id}
          busyRenew={
            activeBusyId === detail.id
            || Boolean(detailSubscription && activeBusyId === detailSubscription.id)
          }
        />
      )}

      {editing && (
        <DomainDrawer
          key={editing.id}
          open
          value={editing}
          subscriptions={subscriptionList}
          accounts={accountList}
          servers={serverList}
          ips={ipList}
          onClose={() => setEditing(undefined)}
        />
      )}

      <CloudflareSyncModal
        open={cfModalOpen}
        accounts={accountList}
        onClose={() => setCfModalOpen(false)}
      />
    </>
  );
}
