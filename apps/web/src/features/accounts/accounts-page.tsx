import {
  type Account,
  accountsOptions,
  checkinAccount,
  deleteAccount,
  preferencesOptions,
  type Subscription,
  subscriptionsOptions,
} from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { App, Button, Dropdown, Empty, Segmented, Skeleton, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { ArrowDownWideNarrow, Eye, EyeOff, KeyRound, LayoutGrid, LockKeyhole, LockKeyholeOpen, Plus, Table2, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { usePreferences } from '../../app/preferences-context';
import { useWorkspace } from '../../layouts/workspace-context';
import { errorMessage } from '../../shared/errors';
import { QueryError } from '../../shared/feedback';
import { AccountBreakdownCard } from './components/account-breakdown-card';
import { AccountCard } from './components/account-card';
import { AccountDetails } from './components/account-details';
import { AccountDrawer } from './components/account-drawer';
import { AccountFilters } from './components/account-filters';
import { AccountHubsCard } from './components/account-hubs-card';
import { AccountHygieneCard } from './components/account-hygiene-card';
import { AccountSummaryStrip } from './components/account-summary-strip';
import { AccountTable } from './components/account-table';
import {
  accountDisplayTitle,
  checkinRemaining,
  computeAccountMetrics,
  needsAttention,
  securityIssues,
} from './utils/account-metrics';
import { useVault } from './vault/vault-context';

export function AccountsPage() {
  const accounts = useQuery(accountsOptions);
  const subscriptions = useQuery(subscriptionsOptions);
  const preferences = useQuery(preferencesOptions);
  const { newAccount, search } = useWorkspace();
  const routeSearch = useSearch({ strict: false }) as { detail?: string };
  const navigate = useNavigate();
  const { t, locale } = usePreferences();
  const vault = useVault();
  const client = useQueryClient();
  const { message } = App.useApp();

  const [scope, setScope] = useState<'all' | 'domestic' | 'overseas' | 'hub' | 'attention'>('all');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [region, setRegion] = useState('all');
  const [sort, setSort] = useState<'role' | 'checkin' | 'name'>('role');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [masked, setMasked] = useState(false);
  const [hubFilterId, setHubFilterId] = useState<string>();
  const [editing, setEditing] = useState<Account>();
  const [detailId, setDetailId] = useState<string>();

  const effectiveDetailId = detailId ?? routeSearch.detail;
  const closeDetail = () => {
    setDetailId(undefined);
    if (routeSearch.detail) {
      void navigate({ to: '/accounts', search: {}, replace: true });
    }
  };

  const changed = async () => {
    await client.invalidateQueries({ queryKey: ['accounts'] });
    await client.invalidateQueries({ queryKey: ['nav-counts'] });
  };

  const checkin = useMutation({
    mutationFn: (value: Account) => checkinAccount(value, dayjs().format('YYYY-MM-DD')),
    onSuccess: async () => {
      await changed();
      void message.success(t('已更新保活记录'));
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const remove = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      await changed();
      closeDetail();
      void message.success(t('账号已删除'));
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const available = accounts.isSuccess;
  const items = useMemo(() => (available ? accounts.data.items : []), [available, accounts.data]);
  const allById = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  const data = useMemo(() => (available ? computeAccountMetrics(items) : undefined), [available, items]);
  const prefs = preferences.isSuccess ? preferences.data : undefined;
  const regions = useMemo(
    () => Array.from(new Set(items.filter(item => !item.archived).map(item => item.region))).sort(),
    [items],
  );

  const detail = effectiveDetailId ? allById.get(effectiveDetailId) : undefined;
  const activeHub = hubFilterId ? allById.get(hubFilterId) : undefined;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) => {
        if (q) {
          const hay = `${item.platform} ${item.label} ${item.identifier} ${item.uid} ${item.phoneHint} ${item.recoveryEmail} ${item.region} ${item.notes}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (category !== 'all' && item.category !== category) return false;
        if (region !== 'all' && item.region !== region) return false;
        if (hubFilterId) {
          if (item.id !== hubFilterId && item.recoveryAccountId !== hubFilterId && item.ssoAccountId !== hubFilterId) {
            return false;
          }
        }

        if (status === 'archived') return item.archived;
        if (item.archived) return false;

        if (scope === 'domestic' && item.ecosystem !== 'domestic') return false;
        if (scope === 'overseas' && item.ecosystem !== 'overseas') return false;
        if (scope === 'hub' && item.role !== 'hub' && (data?.downstreamByAccountId.get(item.id)?.length ?? 0) === 0) return false;
        if (scope === 'attention' && !needsAttention(item)) return false;

        if (status === 'checkin_soon') {
          const days = checkinRemaining(item);
          return days !== null && days <= 30;
        }
        if (status === 'weak_security') return securityIssues(item).length > 0;
        if (status === 'kyc_verified') return item.kycStatus === 'verified';
        if (status === 'retiring' || status === 'restricted') return item.status === status;
        return true;
      })
      .sort((a, b) => {
        if (sort === 'name') {
          return accountDisplayTitle(a).localeCompare(accountDisplayTitle(b), locale);
        }
        if (sort === 'checkin') {
          const daysA = checkinRemaining(a) ?? 99999;
          const daysB = checkinRemaining(b) ?? 99999;
          if (daysA !== daysB) return daysA - daysB;
        }
        const rank = { hub: 0, primary: 1, alt: 2 } as const;
        if (rank[a.role] !== rank[b.role]) return rank[a.role] - rank[b.role];
        const downDiff = (data?.downstreamByAccountId.get(b.id)?.length ?? 0) - (data?.downstreamByAccountId.get(a.id)?.length ?? 0);
        if (downDiff !== 0) return downDiff;
        return accountDisplayTitle(a).localeCompare(accountDisplayTitle(b), locale);
      });
  }, [items, search, category, region, hubFilterId, status, scope, data, sort, locale]);

  const subscriptionItems = subscriptions.data?.items;
  const subsByAccountId = useMemo(() => {
    const map = new Map<string, Subscription[]>();
    if (!subscriptionItems) return map;
    for (const sub of subscriptionItems) {
      if (sub.archived) continue;
      const owners = new Set<string>();
      if (sub.accountId) owners.add(sub.accountId);
      if (sub.billingAccountId) owners.add(sub.billingAccountId);
      for (const accId of owners) {
        const list = map.get(accId) ?? [];
        list.push(sub);
        map.set(accId, list);
      }
    }
    return map;
  }, [subscriptionItems]);

  const downstreamList = useMemo(
    () => (detail ? (data?.downstreamByAccountId.get(detail.id) ?? []) : []),
    [detail, data],
  );

  const linkedSubscriptions = useMemo(
    () => (detail ? (subsByAccountId.get(detail.id) ?? []) : []),
    [detail, subsByAccountId],
  );

  const downstreamSubscriptions = useMemo(() => {
    if (!detail || !subscriptions.isSuccess || downstreamList.length === 0) return [];
    const downIds = new Set(downstreamList.map(item => item.id));
    const directIds = new Set(linkedSubscriptions.map(sub => sub.id));
    return subscriptions.data.items.filter(
      sub =>
        !sub.archived
        && !directIds.has(sub.id)
        && (downIds.has(sub.accountId) || downIds.has(sub.billingAccountId)),
    );
  }, [detail, subscriptions.isSuccess, subscriptions.data, downstreamList, linkedSubscriptions]);

  const hasFilters = Boolean(search.trim() || scope !== 'all' || status !== 'all' || category !== 'all' || region !== 'all' || hubFilterId);

  return (
    <>
      <div className="page-heading">
        <h1>
          {t('账号与身份')}
          <span className="heading-count">{available ? items.filter(item => !item.archived).length : '—'}</span>
        </h1>
        <div className="page-actions">
          {!vault.initialized
            ? (
                <Button
                  icon={<KeyRound size={15} />}
                  onClick={() => vault.openModal('setup')}
                  disabled={!available}
                >
                  {t('初始化保险箱')}
                </Button>
              )
            : !vault.unlocked
                ? (
                    <Button
                      icon={<LockKeyhole size={15} />}
                      onClick={() => vault.openModal('unlock')}
                    >
                      {t('解锁保险箱')}
                    </Button>
                  )
                : (
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: [
                          { key: 'lock', label: t('立即锁定'), icon: <LockKeyhole size={14} /> },
                          { key: 'change', label: t('修改保险箱主密码'), icon: <KeyRound size={14} /> },
                          { key: 'recover', label: t('使用恢复密钥重置'), icon: <KeyRound size={14} /> },
                        ],
                        onClick: ({ key }) => {
                          if (key === 'lock') vault.lock();
                          if (key === 'change') vault.openModal('change_password');
                          if (key === 'recover') vault.openModal('recover');
                        },
                      }}
                    >
                      <Button className="vault-unlocked-button" icon={<LockKeyholeOpen size={15} />}>
                        {t('保险箱已解锁')}
                      </Button>
                    </Dropdown>
                  )}
          <Tooltip title={t(masked ? '显示完整标识' : '隐藏完整标识')}>
            <Button
              className={`round-tool ${masked ? 'is-active' : ''}`}
              aria-label={t(masked ? '显示完整标识' : '隐藏完整标识')}
              aria-pressed={masked}
              icon={masked ? <Eye size={16} /> : <EyeOff size={16} />}
              onClick={() => setMasked(prev => !prev)}
            />
          </Tooltip>
          <AccountFilters
            status={status}
            category={category}
            region={region}
            regions={regions}
            onStatus={setStatus}
            onCategory={setCategory}
            onRegion={setRegion}
          />
          <Button
            type="primary"
            className="new-resource-button"
            aria-label={t('新建账号')}
            icon={<Plus size={16} />}
            onClick={newAccount}
            disabled={!available}
          >
            {t('新建')}
          </Button>
        </div>
      </div>

      {accounts.isError && (
        <div className="mb-5">
          <QueryError
            title={t('无法加载账号')}
            error={accounts.error}
            retry={() => {
              void accounts.refetch();
            }}
          />
        </div>
      )}

      <div className="subscriptions-layout">
        <AccountSummaryStrip data={data} />

        <section className="subscriptions-main" aria-label={t('账号列表')}>
          <div className="subscription-toolbar account-toolbar">
            <div className="account-toolbar-left">
              <Segmented
                value={scope}
                onChange={val => setScope(val as typeof scope)}
                options={[
                  { value: 'all', label: t('全部') },
                  { value: 'domestic', label: t('国内') },
                  { value: 'overseas', label: t('海外') },
                  { value: 'hub', label: t('枢纽') },
                  { value: 'attention', label: t('待处理') },
                ]}
              />
              {activeHub && (
                <button
                  type="button"
                  className="hub-filter-chip"
                  aria-label={t('清除枢纽筛选')}
                  onClick={() => setHubFilterId(undefined)}
                >
                  <span>{t('按枢纽筛选：{name}', { name: accountDisplayTitle(activeHub) })}</span>
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="account-toolbar-right">
              <div className="view-toggle-group" role="group" aria-label={t('账号列表')}>
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
                    { key: 'role', label: t('枢纽与重要度') },
                    { key: 'checkin', label: t('保活最近') },
                    { key: 'name', label: t('平台名称排序') },
                  ],
                  onClick: ({ key }) => setSort(key as typeof sort),
                }}
              >
                <Tooltip title={t('账号排序')}>
                  <Button className="round-tool" aria-label={t('账号排序')} icon={<ArrowDownWideNarrow size={16} />} />
                </Tooltip>
              </Dropdown>
            </div>
          </div>

          {accounts.isPending
            ? (
                <div className="subscription-grid">
                  {[0, 1].map(key => <Skeleton key={key} active className="p-6" />)}
                </div>
              )
            : accounts.isError
              ? <div className="catalogue-empty">{t('账号数据不可用')}</div>
              : !filtered.length
                  ? (
                      <div className="catalogue-empty">
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={t(hasFilters ? '没有匹配的账号' : '还没有录入账号')}
                        />
                        {!hasFilters && (
                          <Button icon={<Plus size={15} />} type="primary" onClick={newAccount}>
                            {t('录入第一个账号')}
                          </Button>
                        )}
                      </div>
                    )
                  : view === 'table'
                    ? (
                        <AccountTable
                          items={filtered}
                          allById={allById}
                          masked={masked}
                          loading={false}
                          onDetails={item => setDetailId(item.id)}
                          onEdit={item => setEditing(item)}
                          onCheckin={item => checkin.mutateAsync(item)}
                          onDelete={id => remove.mutateAsync(id)}
                          checkingId={checkin.isPending ? checkin.variables.id : undefined}
                        />
                      )
                    : (
                        <div className="subscription-grid">
                          {filtered.map(item => (
                            <AccountCard
                              key={item.id}
                              value={item}
                              downstreamCount={data?.downstreamByAccountId.get(item.id)?.length ?? 0}
                              allById={allById}
                              linkedSubscriptions={subsByAccountId.get(item.id)}
                              masked={masked}
                              onDetails={() => setDetailId(item.id)}
                              onSelectAccount={id => setDetailId(id)}
                              onEdit={() => setEditing(item)}
                              onCheckin={() => checkin.mutateAsync(item)}
                              onDelete={() => remove.mutateAsync(item.id)}
                              checkingIn={checkin.isPending && checkin.variables.id === item.id}
                            />
                          ))}
                        </div>
                      )}
        </section>

        <aside className="subscriptions-aside">
          <AccountHubsCard
            data={data}
            activeHubId={hubFilterId}
            onSelectHub={id => setHubFilterId(prev => (prev === id ? undefined : id))}
          />
          <AccountHygieneCard
            data={data}
            onSelect={item => setDetailId(item.id)}
            onCheckin={item => checkin.mutateAsync(item)}
          />
          <AccountBreakdownCard data={data} />
        </aside>
      </div>

      {detail && (
        <AccountDetails
          value={detail}
          prefs={prefs}
          allById={allById}
          downstream={downstreamList}
          linkedSubscriptions={linkedSubscriptions}
          downstreamSubscriptions={downstreamSubscriptions}
          onClose={closeDetail}
          onEdit={() => {
            setEditing(detail);
            closeDetail();
          }}
          onSelectAccount={id => setDetailId(id)}
          onCheckin={() => checkin.mutateAsync(detail)}
          checkingIn={checkin.isPending}
        />
      )}

      {editing && (
        <AccountDrawer
          key={editing.id}
          open
          value={editing}
          existingAccounts={items}
          onClose={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
