import {
  accountsOptions,
  deleteServer,
  domainsOptions,
  ipsOptions,
  renewSubscription,
  revokeServerAgent,
  serversOptions,
  type Subscription,
  subscriptionsOptions,
} from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Alert, App, Button, Dropdown, Empty, Skeleton } from 'antd';
import dayjs from 'dayjs';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { usePreferences } from '../../app/preferences-context';
import { errorMessage } from '../../shared/errors';
import { QueryError } from '../../shared/feedback';
import { ServerCockpitPassport } from './components/server-cockpit-passport';
import { ServerCockpitWorkspace } from './components/server-cockpit-workspace';
import { ServerDrawer } from './components/server-drawer';
import { ServerWizardModal } from './components/server-wizard-modal';
import { buildSshCommand } from './utils/server-metrics';

export function ServerDetailPage() {
  const { serverId } = useParams({ strict: false }) as { serverId?: string };
  const navigate = useNavigate();
  const { t, locale } = usePreferences();
  const client = useQueryClient();
  const { message, modal } = App.useApp();

  const servers = useQuery({
    ...serversOptions,
    refetchInterval: 10_000,
  });
  const subscriptions = useQuery(subscriptionsOptions);
  const accounts = useQuery(accountsOptions);
  const domains = useQuery(domainsOptions);
  const ips = useQuery(ipsOptions);

  const [masked, setMasked] = useState(false);
  const [editing, setEditing] = useState(false);
  const [connectingAgent, setConnectingAgent] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== undefined) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const triggerCopied = async (key: string, text: string, toastMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      if (copyTimerRef.current !== undefined) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedKey(prev => (prev === key ? null : prev));
      }, 1800);
      void message.success(toastMessage);
    }
    catch {
      /* Clipboard may be restricted in non-HTTPS contexts. */
    }
  };

  const invalidateAll = async () => {
    await client.invalidateQueries({ queryKey: ['servers'] });
    await client.invalidateQueries({ queryKey: ['subscriptions'] });
    await client.invalidateQueries({ queryKey: ['ips'] });
    await client.invalidateQueries({ queryKey: ['nav-counts'] });
  };

  const renew = useMutation({
    mutationFn: (sub: Subscription) => renewSubscription(sub),
    onSuccess: async () => {
      await invalidateAll();
      void message.success(t('到期日已顺延一周期'));
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const revokeAgent = useMutation({
    mutationFn: revokeServerAgent,
    onSuccess: async () => {
      await invalidateAll();
      void message.success(t('探针凭据已吊销'));
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const remove = useMutation({
    mutationFn: deleteServer,
    onSuccess: async () => {
      await invalidateAll();
      void message.success(t('服务器已删除'));
      void navigate({ to: '/servers', replace: true });
    },
    onError: (error) => {
      void message.error(errorMessage(error, locale));
    },
  });

  const items = useMemo(() => (servers.isSuccess ? servers.data.items : []), [servers.isSuccess, servers.data]);
  const server = useMemo(() => items.find(item => item.id === serverId), [items, serverId]);

  const switcherServers = useMemo(
    () => items.filter(item => !item.archived || item.id === serverId),
    [items, serverId],
  );

  const subscriptionList = useMemo(
    () => (subscriptions.isSuccess ? subscriptions.data.items : []),
    [subscriptions.isSuccess, subscriptions.data],
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

  const linkedSubscription = useMemo(
    () => (server?.subscriptionId ? subscriptionList.find(sub => sub.id === server.subscriptionId) : undefined),
    [server, subscriptionList],
  );

  const linkedAccount = useMemo(() => {
    const accountId = server?.accountId || linkedSubscription?.accountId || '';
    return accountId ? accountList.find(acct => acct.id === accountId) : undefined;
  }, [server, linkedSubscription, accountList]);

  const linkedDomains = useMemo(() => {
    if (!server) return [];
    const ids = new Set(server.domainIds);
    return domainList.filter(dom => ids.has(dom.id));
  }, [server, domainList]);

  const linkedIps = useMemo(() => {
    if (!server) return [];
    const ids = new Set(server.ipIds);
    return ipList.filter(ip => ids.has(ip.id) || ip.serverId === server.id);
  }, [server, ipList]);

  if (servers.isPending) {
    return (
      <div className="server-cockpit">
        <div className="server-cockpit-topbar">
          <Link to="/servers" className="server-cockpit-back-pill">
            <ArrowLeft size={14} />
            <span>{t('服务器')}</span>
          </Link>
        </div>
        <div className="server-passport-card">
          <Skeleton active paragraph={{ rows: 3 }} />
        </div>
        <div className="server-bento-grid">
          {[0, 1, 2, 3].map(idx => (
            <div key={idx} className="server-bento-card">
              <Skeleton active paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (servers.isError) {
    return (
      <div className="server-cockpit">
        <div className="server-cockpit-topbar">
          <Link to="/servers" className="server-cockpit-back-pill">
            <ArrowLeft size={14} />
            <span>{t('服务器')}</span>
          </Link>
        </div>
        <QueryError
          title={t('无法加载服务器')}
          error={servers.error}
          retry={() => {
            void servers.refetch();
          }}
        />
      </div>
    );
  }

  if (!server) {
    return (
      <div className="server-cockpit">
        <div className="server-cockpit-topbar">
          <Link to="/servers" className="server-cockpit-back-pill">
            <ArrowLeft size={14} />
            <span>{t('服务器')}</span>
          </Link>
        </div>
        <div className="catalogue-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('未找到该服务器或已被删除')}
          />
          <Button type="primary" onClick={() => void navigate({ to: '/servers' })}>
            {t('返回服务器列表')}
          </Button>
        </div>
      </div>
    );
  }

  const tel = server.telemetry;
  const sshCommand = buildSshCommand(server);
  const lastReportLabel = tel.lastReportedAt ? dayjs(tel.lastReportedAt).format('YYYY-MM-DD HH:mm:ss') : '—';

  const overflowItems = [
    {
      key: 'mask',
      label: t(masked ? '显示完整地址' : '隐藏完整地址'),
      icon: masked ? <Eye size={14} /> : <EyeOff size={14} />,
    },
    ...(tel.agentStatus !== 'none'
      ? [{
          key: 'revoke',
          label: t('吊销探针凭据'),
          icon: <ShieldOff size={14} />,
          danger: true,
        }]
      : []),
    ...(server.archived
      ? [{
          key: 'delete',
          label: t('永久删除'),
          icon: <Trash2 size={14} />,
          danger: true,
        }]
      : []),
  ];

  return (
    <div className="server-cockpit">
      <div className="server-cockpit-topbar">
        <div className="server-cockpit-breadcrumb">
          <Link to="/servers" className="server-cockpit-back-pill">
            <ArrowLeft size={14} />
            <span>{t('服务器')}</span>
          </Link>
          <span className="server-cockpit-crumb-sep" aria-hidden="true">/</span>
          <h1 className="server-cockpit-crumb-title" title={server.name}>{server.name}</h1>

          {switcherServers.length > 1 && (
            <Dropdown
              trigger={['click']}
              menu={{
                selectedKeys: [server.id],
                items: switcherServers.map(item => ({
                  key: item.id,
                  label: (
                    <div className="server-switcher-item">
                      <span className={`server-switcher-dot is-${item.telemetry.agentStatus}`} />
                      <span className="server-switcher-name">{item.name}</span>
                      <span className="account-region-pill">{item.region}</span>
                    </div>
                  ),
                })),
                onClick: ({ key }) => {
                  if (key !== server.id) {
                    void navigate({ to: '/servers/$serverId', params: { serverId: key } });
                  }
                },
              }}
            >
              <button type="button" className="server-cockpit-switcher-btn" aria-label={t('切换节点')}>
                <span>{t('切换节点')}</span>
                <ChevronDown size={14} />
              </button>
            </Dropdown>
          )}
        </div>

        <div className="server-cockpit-actions">
          <Button
            icon={<RefreshCw size={14} />}
            onClick={() => setConnectingAgent(true)}
          >
            {t(tel.agentStatus === 'none' ? '接入探针' : '探针重装')}
          </Button>

          <Button
            icon={<Pencil size={14} />}
            aria-label={t('编辑服务器')}
            onClick={() => setEditing(true)}
          >
            {t('编辑')}
          </Button>

          {server.consoleUrl && (
            <Button
              icon={<ExternalLink size={14} />}
              href={server.consoleUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('打开控制台')}
            </Button>
          )}

          {sshCommand && (
            <Button
              type="primary"
              className="server-copy-ssh-btn"
              icon={copiedKey === 'top-ssh' ? <Check size={14} /> : <Copy size={14} />}
              onClick={() => {
                void triggerCopied('top-ssh', sshCommand, t('已复制 SSH 连接命令'));
              }}
            >
              {t(copiedKey === 'top-ssh' ? '已复制' : '复制 SSH')}
            </Button>
          )}

          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            menu={{
              items: overflowItems,
              onClick: ({ key }) => {
                if (key === 'mask') {
                  setMasked(prev => !prev);
                }
                else if (key === 'revoke') {
                  modal.confirm({
                    title: t('吊销此服务器的探针凭据？'),
                    content: t('吊销后现有常驻探针将无法继续上报指标，已采集的硬件台账会保留。'),
                    okButtonProps: { danger: true },
                    okText: t('确定'),
                    cancelText: t('取消'),
                    onOk: () => revokeAgent.mutateAsync(server.id),
                  });
                }
                else if (key === 'delete') {
                  modal.confirm({
                    title: t('永久删除这台服务器？'),
                    content: t('删除后无法恢复。'),
                    okButtonProps: { danger: true },
                    okText: t('确定'),
                    cancelText: t('取消'),
                    onOk: () => remove.mutateAsync(server.id),
                  });
                }
              },
            }}
          >
            <Button
              className="round-tool"
              aria-label={t('更多操作')}
              icon={<MoreHorizontal size={16} />}
            />
          </Dropdown>
        </div>
      </div>

      {server.archived && (
        <Alert
          showIcon
          type="info"
          title={t('该服务器当前处于已归档状态，不计入在役算力与到期提醒。')}
        />
      )}

      {linkedSubscription && linkedSubscription.intention === 'cancel' && !server.archived && (
        <Alert
          showIcon
          type="warning"
          title={t('该服务器关联的订阅「{name}」已标记到期必退，请提前迁移数据与解析域名。', { name: linkedSubscription.name })}
        />
      )}

      {tel.agentStatus === 'stale' && (
        <Alert
          showIcon
          type="warning"
          title={t('探针心跳已超时（最后上报：{time}）。探针进程可能已停止或网络阻断，此状态不代表服务器已关机离线。', { time: lastReportLabel })}
        />
      )}

      {tel.agentStatus === 'snapshot' && (
        <Alert
          showIcon
          type="info"
          title={t('当前展示一次性快照数据（采集于 {time}），升级常驻探针可开启实时速率与流量累计。', { time: lastReportLabel })}
          action={(
            <Button size="small" type="primary" ghost onClick={() => setConnectingAgent(true)}>
              {t('升级为常驻实时探针')}
            </Button>
          )}
        />
      )}

      <ServerCockpitPassport
        value={server}
        masked={masked}
        copiedKey={copiedKey}
        onCopy={(key, text, isSsh) => {
          void triggerCopied(key, text, t(isSsh ? '已复制 SSH 连接命令' : '已复制服务器地址'));
        }}
        onConnectAgent={() => setConnectingAgent(true)}
      />

      <ServerCockpitWorkspace
        value={server}
        linkedSubscription={linkedSubscription}
        linkedAccount={linkedAccount}
        linkedIps={linkedIps}
        linkedDomains={linkedDomains}
        masked={masked}
        copiedKey={copiedKey}
        onCopyContainer={(key, containerName) => {
          void triggerCopied(key, containerName, t('已复制容器名称'));
        }}
        onEdit={() => setEditing(true)}
        onConnectAgent={() => setConnectingAgent(true)}
        onRevokeAgent={() => revokeAgent.mutateAsync(server.id)}
        onRenew={sub => renew.mutateAsync(sub)}
        busyRenew={Boolean(linkedSubscription && renew.isPending && renew.variables.id === linkedSubscription.id)}
        busyRevoke={revokeAgent.isPending && revokeAgent.variables === server.id}
      />

      {editing && (
        <ServerDrawer
          key={server.id}
          open
          value={server}
          subscriptions={subscriptionList}
          accounts={accountList}
          domains={domainList}
          ips={ipList}
          onClose={() => setEditing(false)}
        />
      )}

      {connectingAgent && (
        <ServerWizardModal
          key={`agent-${server.id}`}
          open
          targetServer={server}
          onClose={() => setConnectingAgent(false)}
          onEditEnrolled={() => {
            setEditing(true);
          }}
        />
      )}
    </div>
  );
}
