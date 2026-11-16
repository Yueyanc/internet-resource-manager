import {
  accountsOptions,
  domainsOptions,
  ipsOptions,
  serversOptions,
  subscriptionsOptions,
} from '@irm/api-client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Modal } from 'antd';
import {
  ArrowRight,
  Bell,
  CornerDownLeft,
  CreditCard,
  Database,
  Globe,
  Moon,
  Network,
  Plus,
  Search,
  Server,
  Settings,
  Sun,
  UserRound,
} from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { usePreferences } from '../app/preferences-context';
import { accountDisplayTitle } from '../features/accounts/utils/account-metrics';
import { ipDisplayTitle } from '../features/ips/utils/ip-metrics';
import type { SettingsTab } from '../layouts/workspace-context';

type PaletteEntry = {
  id: string;
  group: string;
  title: string;
  subtitle: string;
  badge?: string;
  icon: ReactNode;
  onSelect: () => void;
};

export function CommandPalette({
  open,
  onClose,
  onNewResource,
  onOpenSettings,
}: {
  open: boolean;
  onClose: () => void;
  onNewResource: (type: 'subscription' | 'account' | 'domain' | 'ip' | 'server') => void;
  onOpenSettings: (tab?: SettingsTab) => void;
}) {
  const { t, mode, toggleMode } = usePreferences();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const subscriptions = useQuery({ ...subscriptionsOptions, enabled: open });
  const accounts = useQuery({ ...accountsOptions, enabled: open });
  const servers = useQuery({ ...serversOptions, enabled: open });
  const domains = useQuery({ ...domainsOptions, enabled: open });
  const ips = useQuery({ ...ipsOptions, enabled: open });

  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  const entries = useMemo<PaletteEntry[]>(() => {
    const q = query.trim().toLowerCase();
    const results: PaletteEntry[] = [];

    const runAndClose = (fn: () => void) => () => {
      onClose();
      fn();
    };

    // 1. Servers (including IPv4/IPv6/PrivateIP & Docker containers!)
    for (const srv of servers.data?.items ?? []) {
      if (srv.archived && !q) continue;
      const matchedContainer = q
        ? srv.telemetry.containers.find(c => `${c.name} ${c.image}`.toLowerCase().includes(q))
        : undefined;
      const hay = [
        srv.name,
        srv.hostname,
        srv.ipv4,
        srv.ipv6,
        srv.privateIp,
        srv.provider,
        srv.region,
        srv.datacenter,
        ...srv.tags,
        ...srv.telemetry.containers.map(c => `${c.name} ${c.image}`),
      ].join(' ').toLowerCase();
      if (q && !hay.includes(q)) continue;
      results.push({
        id: `srv:${srv.id}`,
        group: t('服务器'),
        title: srv.name,
        subtitle: [srv.ipv4 || srv.hostname, srv.provider, srv.region].filter(Boolean).join(' · '),
        badge: matchedContainer ? `Docker: ${matchedContainer.name}` : `${srv.cpuCores}C/${Math.round(srv.memoryMb / 1024)}G`,
        icon: <Server size={15} />,
        onSelect: runAndClose(() => {
          void navigate({ to: '/servers/$serverId', params: { serverId: srv.id } });
        }),
      });
    }

    // 2. Domains (including DNS record names & targets!)
    for (const dom of domains.data?.items ?? []) {
      if (dom.archived && !q) continue;
      const matchedRecord = q
        ? dom.dnsRecords.find(r => `${r.name} ${r.content} ${r.type}`.toLowerCase().includes(q))
        : undefined;
      const hay = [
        dom.name,
        dom.registrar,
        dom.dnsProvider,
        dom.icpNumber,
        ...dom.tags,
        ...dom.dnsRecords.map(r => `${r.name} ${r.content}`),
      ].join(' ').toLowerCase();
      if (q && !hay.includes(q)) continue;
      results.push({
        id: `dom:${dom.id}`,
        group: t('域名'),
        title: dom.name,
        subtitle: [dom.registrar, dom.dnsProvider, dom.expireDate].filter(Boolean).join(' · '),
        badge: matchedRecord ? `${matchedRecord.type} ${matchedRecord.name}` : undefined,
        icon: <Globe size={15} />,
        onSelect: runAndClose(() => {
          void navigate({ to: '/domains', search: { detail: dom.id } });
        }),
      });
    }

    // 3. Subscriptions
    for (const sub of subscriptions.data?.items ?? []) {
      if (sub.archived && !q) continue;
      const hay = `${sub.name} ${sub.account} ${sub.paymentMethod} ${sub.notes} ${sub.presetKey}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      results.push({
        id: `sub:${sub.id}`,
        group: t('订阅管理'),
        title: sub.name,
        subtitle: `${sub.currency} ${(sub.amountMinor / 100).toFixed(2)} · ${sub.dueDate}`,
        badge: sub.renewalMode === 'auto' ? t('自动扣款') : t('手动续费'),
        icon: <CreditCard size={15} />,
        onSelect: runAndClose(() => {
          void navigate({ to: '/subscriptions', search: { detail: sub.id } });
        }),
      });
    }

    // 4. Accounts
    for (const acc of accounts.data?.items ?? []) {
      if (acc.archived && !q) continue;
      const hay = `${acc.platform} ${acc.label} ${acc.identifier} ${acc.uid} ${acc.recoveryEmail} ${acc.phoneHint} ${acc.region}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      results.push({
        id: `acc:${acc.id}`,
        group: t('账号与身份'),
        title: accountDisplayTitle(acc),
        subtitle: `${acc.identifier} · ${acc.region}`,
        badge: acc.role === 'hub' ? t('核心枢纽') : undefined,
        icon: <UserRound size={15} />,
        onSelect: runAndClose(() => {
          void navigate({ to: '/accounts', search: { detail: acc.id } });
        }),
      });
    }

    // 5. IP Nodes
    for (const ip of ips.data?.items ?? []) {
      if (ip.archived && !q) continue;
      const hay = `${ip.address} ${ip.label} ${ip.provider} ${ip.asnOrg} ${ip.region} ${ip.city} ${ip.tags.join(' ')}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      results.push({
        id: `ip:${ip.id}`,
        group: t('IP 与节点'),
        title: ip.address,
        subtitle: [ipDisplayTitle(ip), ip.provider, ip.region].filter(Boolean).join(' · '),
        badge: ip.asn ? `AS${ip.asn}` : undefined,
        icon: <Network size={15} />,
        onSelect: runAndClose(() => {
          void navigate({ to: '/ips', search: { detail: ip.id } });
        }),
      });
    }

    // 6. Quick Actions
    const actions: Array<PaletteEntry & { keywords: string }> = [
      {
        id: 'act:settings-prefs',
        group: t('快捷指令'),
        title: t('打开系统设置 · 偏好与实时汇率'),
        subtitle: t('切换主题、语言或一键拉取最新汇率'),
        keywords: 'settings preferences fx rate 系统设置 偏好 汇率 货币',
        icon: <Settings size={15} />,
        onSelect: runAndClose(() => onOpenSettings('preferences')),
      },
      {
        id: 'act:settings-auto',
        group: t('快捷指令'),
        title: t('通知渠道与后台自动巡检'),
        subtitle: t('配置 Telegram / Bark / Webhook 告警与立即巡检'),
        keywords: 'notification telegram bark webhook automation 通知 巡检 自动同步',
        icon: <Bell size={15} />,
        onSelect: runAndClose(() => onOpenSettings('automation')),
      },
      {
        id: 'act:settings-backup',
        group: t('快捷指令'),
        title: t('下载 SQLite 快照 / 导出 JSON 清单'),
        subtitle: t('在线灾备备份与结构化数据导出'),
        keywords: 'backup export sqlite json 备份 导出 快照',
        icon: <Database size={15} />,
        onSelect: runAndClose(() => onOpenSettings('backup')),
      },
      {
        id: 'act:new-sub',
        group: t('快捷指令'),
        title: t('新建订阅'),
        subtitle: t('添加周期账单或软件服务订阅'),
        keywords: 'new create subscription 新建订阅',
        icon: <Plus size={15} />,
        onSelect: runAndClose(() => onNewResource('subscription')),
      },
      {
        id: 'act:new-server',
        group: t('快捷指令'),
        title: t('新建服务器'),
        subtitle: t('录入 VPS、独立服务器或接入探针'),
        keywords: 'new create server vps 新建服务器',
        icon: <Plus size={15} />,
        onSelect: runAndClose(() => onNewResource('server')),
      },
      {
        id: 'act:new-domain',
        group: t('快捷指令'),
        title: t('新建域名'),
        subtitle: t('录入域名并自动查询 RDAP 到期日'),
        keywords: 'new create domain 新建域名',
        icon: <Plus size={15} />,
        onSelect: runAndClose(() => onNewResource('domain')),
      },
      {
        id: 'act:new-account',
        group: t('快捷指令'),
        title: t('新建账号'),
        subtitle: t('录入云厂商、邮箱或社交身份账号'),
        keywords: 'new create account 新建账号',
        icon: <Plus size={15} />,
        onSelect: runAndClose(() => onNewResource('account')),
      },
      {
        id: 'act:new-ip',
        group: t('快捷指令'),
        title: t('新建 IP 节点'),
        subtitle: t('录入公网 IP、家宽或组网节点'),
        keywords: 'new create ip node 新建 IP 节点',
        icon: <Plus size={15} />,
        onSelect: runAndClose(() => onNewResource('ip')),
      },
      {
        id: 'act:theme',
        group: t('快捷指令'),
        title: t(mode === 'dark' ? '切换为浅色模式' : '切换为暗黑模式'),
        subtitle: t('立即切换全局界面主题'),
        keywords: 'theme dark light 暗黑 浅色 主题',
        icon: mode === 'dark' ? <Sun size={15} /> : <Moon size={15} />,
        onSelect: runAndClose(() => toggleMode()),
      },
    ];

    const matchedActions = actions.filter(a => !q || `${a.title} ${a.subtitle} ${a.keywords}`.toLowerCase().includes(q));

    if (!q) {
      return [...results.slice(0, 8), ...matchedActions.slice(0, 6)];
    }
    return [...results.slice(0, 24), ...matchedActions];
  }, [
    query,
    servers.data,
    domains.data,
    subscriptions.data,
    accounts.data,
    ips.data,
    mode,
    t,
    navigate,
    onClose,
    onNewResource,
    onOpenSettings,
    toggleMode,
  ]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (entries.length ? (prev + 1) % entries.length : 0));
    }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (entries.length ? (prev - 1 + entries.length) % entries.length : 0));
    }
    else if (e.key === 'Enter' && entries[activeIndex]) {
      e.preventDefault();
      entries[activeIndex].onSelect();
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, Array<{ entry: PaletteEntry; flatIdx: number }>>();
    entries.forEach((entry, flatIdx) => {
      const list = map.get(entry.group) ?? [];
      list.push({ entry, flatIdx });
      map.set(entry.group, list);
    });
    return Array.from(map.entries());
  }, [entries]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={620}
      className="command-palette-modal"
      styles={{
        container: { padding: 0, overflow: 'hidden', borderRadius: 18 },
        body: { padding: 0 },
      }}
    >
      <div className="command-palette" role="dialog" aria-label={t('全局快速检索')}>
        <div className="command-palette-search">
          <Search size={17} className="command-palette-search-icon" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('搜索订阅、账号、服务器 IP / 容器、域名、DNS 记录或指令…')}
            aria-label={t('全局快速检索')}
          />
          <kbd className="command-palette-esc" onClick={onClose}>ESC</kbd>
        </div>

        <div className="command-palette-results">
          {grouped.length === 0
            ? (
                <div className="command-palette-empty">
                  {t('未找到匹配的资产或指令')}
                </div>
              )
            : grouped.map(([groupName, rows]) => (
                <div key={groupName} className="command-palette-group">
                  <div className="command-palette-group-title">{groupName}</div>
                  {rows.map(({ entry, flatIdx }) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={`command-palette-item ${flatIdx === activeIndex ? 'is-active' : ''}`}
                      onMouseEnter={() => setActiveIndex(flatIdx)}
                      onClick={entry.onSelect}
                    >
                      <span className="command-palette-item-icon">{entry.icon}</span>
                      <span className="command-palette-item-body">
                        <strong>{entry.title}</strong>
                        {entry.subtitle && <small>{entry.subtitle}</small>}
                      </span>
                      {entry.badge && <span className="command-palette-badge">{entry.badge}</span>}
                      <ArrowRight size={14} className="command-palette-arrow" />
                    </button>
                  ))}
                </div>
              ))}
        </div>

        <div className="command-palette-footer">
          <span>
            <kbd>↑↓</kbd>
            {' '}
            {t('选择')}
          </span>
          <span>
            <kbd><CornerDownLeft size={11} /></kbd>
            {' '}
            {t('直达详情')}
          </span>
          <span>
            <kbd>⌘K</kbd>
            {' '}
            {t('随时呼出')}
          </span>
        </div>
      </div>
    </Modal>
  );
}
