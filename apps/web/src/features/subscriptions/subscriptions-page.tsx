import {
  accountsOptions,
  deleteSubscription,
  ipsOptions,
  preferencesOptions,
  renewSubscription,
  serversOptions,
  type Subscription,
  subscriptionsOptions,
} from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { App, Button, Dropdown, Empty, Segmented, Skeleton, Tooltip } from 'antd';
import { ArrowDownWideNarrow, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { usePreferences } from '../../app/preferences-context';
import { useWorkspace } from '../../layouts/workspace-context';
import { errorMessage } from '../../shared/errors';
import { QueryError } from '../../shared/feedback';
import { RenewalCalendar } from './components/renewal-calendar';
import { SpendBreakdown } from './components/spend-breakdown';
import { SpendSummaryStrip } from './components/spend-summary-strip';
import { SubscriptionCard } from './components/subscription-card';
import { SubscriptionDetails } from './components/subscription-details';
import { SubscriptionDrawer } from './components/subscription-drawer';
import { SubscriptionFilters } from './components/subscription-filters';
import { metrics, monthlyCost, remaining } from './utils/subscription-metrics';

export function SubscriptionsPage() {
  const subscriptions = useQuery(subscriptionsOptions);
  const preferences = useQuery(preferencesOptions);
  const accounts = useQuery(accountsOptions);
  const servers = useQuery(serversOptions);
  const ips = useQuery(ipsOptions);
  const { newSubscription, search } = useWorkspace();
  const routeSearch = useSearch({ strict: false }) as { detail?: string };
  const navigate = useNavigate();
  const { t, locale } = usePreferences();
  const client = useQueryClient();
  const { message } = App.useApp();

  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [sort, setSort] = useState('due');
  const [editing, setEditing] = useState<Subscription>();
  const [detailId, setDetailId] = useState<string>();

  const effectiveDetailId = detailId ?? routeSearch.detail;
  const closeDetail = () => {
    setDetailId(undefined);
    if (routeSearch.detail) {
      void navigate({ to: '/subscriptions', search: {}, replace: true });
    }
  };

  const changed = async () => {
    await client.invalidateQueries({ queryKey: ['subscriptions'] });
    await client.invalidateQueries({ queryKey: ['nav-counts'] });
  };

  const renew = useMutation({
    mutationFn: renewSubscription,
    onSuccess: async () => {
      await changed();
      void message.success(t('到期日已顺延一周期'));
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const remove = useMutation({
    mutationFn: deleteSubscription,
    onSuccess: async () => {
      await changed();
      closeDetail();
      void message.success(t('订阅已删除'));
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const available = subscriptions.isSuccess;
  const items = useMemo(() => (available ? subscriptions.data.items : []), [available, subscriptions.data]);
  const accountList = useMemo(() => (accounts.isSuccess ? accounts.data.items : []), [accounts.isSuccess, accounts.data]);
  const accountsById = useMemo(() => new Map(accountList.map(item => [item.id, item])), [accountList]);
  const prefs = preferences.isSuccess ? preferences.data : undefined;
  const data = available && prefs ? metrics(items, prefs) : undefined;
  const detail = effectiveDetailId ? items.find(item => item.id === effectiveDetailId) : undefined;

  const detailServers = useMemo(() => {
    if (!detail || !servers.isSuccess) return [];
    return servers.data.items.filter(srv => !srv.archived && srv.subscriptionId === detail.id);
  }, [detail, servers.isSuccess, servers.data]);

  const detailIps = useMemo(() => {
    if (!detail || !ips.isSuccess) return [];
    return ips.data.items.filter(ip => !ip.archived && ip.subscriptionId === detail.id);
  }, [detail, ips.isSuccess, ips.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) => {
        if (q) {
          const acc = item.accountId ? accountsById.get(item.accountId) : undefined;
          const billAcc = item.billingAccountId ? accountsById.get(item.billingAccountId) : undefined;
          const hay = [
            item.name,
            item.account,
            item.paymentMethod,
            item.notes,
            acc ? `${acc.platform} ${acc.label} ${acc.identifier}` : '',
            billAcc ? `${billAcc.platform} ${billAcc.label} ${billAcc.identifier}` : '',
          ].join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (category !== 'all' && item.category !== category) return false;
        if (accountFilter === 'unlinked' && (item.accountId || item.billingAccountId)) return false;
        if (accountFilter !== 'all' && accountFilter !== 'unlinked' && item.accountId !== accountFilter && item.billingAccountId !== accountFilter) {
          return false;
        }
        if (status === 'archived') return item.archived;
        if (item.archived) return false;
        if (status === 'soon') return remaining(item) >= 0 && remaining(item) <= 30;
        if (status === 'auto' || status === 'manual') return item.renewalMode === status;
        return status !== 'cancel' || item.intention === 'cancel';
      })
      .sort((a, b) =>
        sort === 'name'
          ? a.name.localeCompare(b.name, locale)
          : sort === 'amount' && prefs
            ? monthlyCost(b, prefs) - monthlyCost(a, prefs)
            : a.dueDate.localeCompare(b.dueDate),
      );
  }, [items, search, accountsById, category, accountFilter, status, sort, locale, prefs]);

  const hasFilters = Boolean(search.trim() || category !== 'all' || status !== 'all' || accountFilter !== 'all');

  return (
    <>
      <div className="page-heading">
        <h1>
          {t('订阅管理')}
          <span className="heading-count">{available ? items.filter(item => !item.archived).length : '—'}</span>
        </h1>
        <div className="page-actions">
          <SubscriptionFilters
            status={status}
            category={category}
            accountId={accountFilter}
            accounts={accountList}
            onStatus={setStatus}
            onCategory={setCategory}
            onAccountId={setAccountFilter}
          />
          <Button
            type="primary"
            className="new-resource-button"
            aria-label={t('新建订阅')}
            icon={<Plus size={16} />}
            onClick={newSubscription}
            disabled={!available}
          >
            {t('新建')}
          </Button>
        </div>
      </div>
      {subscriptions.isError && (
        <div className="mb-5">
          <QueryError
            title={t('无法加载订阅')}
            error={subscriptions.error}
            retry={() => {
              void subscriptions.refetch();
            }}
          />
        </div>
      )}
      {preferences.isError && (
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
        <SpendSummaryStrip data={data} prefs={prefs} />
        <section className="subscriptions-main" aria-label={t('订阅列表')}>
          <div className="subscription-toolbar">
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: t('全部') },
                { value: 'soon', label: t('临期') },
              ]}
            />
            <Dropdown
              trigger={['click']}
              menu={{
                selectedKeys: [sort],
                items: [
                  { key: 'due', label: t('到期最近') },
                  { key: 'amount', label: t('月均最高') },
                  { key: 'name', label: t('名称排序') },
                ],
                onClick: ({ key }) => setSort(key),
              }}
            >
              <Tooltip title={t('订阅排序')}>
                <Button className="round-tool" aria-label={t('订阅排序')} icon={<ArrowDownWideNarrow size={16} />} />
              </Tooltip>
            </Dropdown>
          </div>
          {subscriptions.isPending
            ? (
                <div className="subscription-grid">
                  {[0, 1].map(key => <Skeleton key={key} active className="p-6" />)}
                </div>
              )
            : subscriptions.isError
              ? <div className="catalogue-empty">{t('订阅数据不可用')}</div>
              : !filtered.length
                  ? (
                      <div className="catalogue-empty">
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={t(hasFilters ? '没有匹配的订阅' : '还没有订阅')}
                        />
                        {!hasFilters && (
                          <Button icon={<Plus size={15} />} type="primary" onClick={newSubscription}>
                            {t('新建第一笔订阅')}
                          </Button>
                        )}
                      </div>
                    )
                  : (
                      <div className="subscription-grid">
                        {filtered.map(item => (
                          <SubscriptionCard
                            key={item.id}
                            value={item}
                            prefs={prefs}
                            account={item.accountId ? accountsById.get(item.accountId) : undefined}
                            billingAccount={item.billingAccountId ? accountsById.get(item.billingAccountId) : undefined}
                            onDetails={() => setDetailId(item.id)}
                            onEdit={() => setEditing(item)}
                            onRenew={() => renew.mutateAsync(item)}
                            onDelete={() => remove.mutateAsync(item.id)}
                            renewing={renew.isPending && renew.variables.id === item.id}
                          />
                        ))}
                      </div>
                    )}
        </section>
        <aside className="subscriptions-aside">
          <RenewalCalendar items={items} available={available} onSelect={item => setDetailId(item.id)} />
          <SpendBreakdown data={data} prefs={prefs} />
        </aside>
      </div>
      {detail && (
        <SubscriptionDetails
          value={detail}
          prefs={prefs}
          linkedAccount={detail.accountId ? accountsById.get(detail.accountId) : undefined}
          billingAccount={detail.billingAccountId ? accountsById.get(detail.billingAccountId) : undefined}
          linkedServers={detailServers}
          linkedIps={detailIps}
          onClose={closeDetail}
          onEdit={() => {
            setEditing(detail);
            closeDetail();
          }}
          onRenew={() => renew.mutateAsync(detail)}
          renewing={renew.isPending}
        />
      )}
      {editing && <SubscriptionDrawer key={editing.id} value={editing} open onClose={() => setEditing(undefined)} />}
    </>
  );
}
