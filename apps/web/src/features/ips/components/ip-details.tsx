import { type Account, type Domain, type IpNode, ipUnlockServices, type Subscription } from '@irm/api-client';
import { Link } from '@tanstack/react-router';
import { Alert, App, Button, Descriptions, Drawer, Progress } from 'antd';
import { Activity, ArrowUpRight, CheckCircle2, Copy, Lock, Pencil, RefreshCw } from 'lucide-react';

import { usePreferences } from '../../../app/preferences-context';
import { accountDisplayTitle } from '../../accounts/utils/account-metrics';
import {
  ipAsnTypeMeta,
  ipCategoryMeta,
  ipDisplayTitle,
  ipUnlockMeta,
  reviewCycles,
  reviewPeriodDays,
  reviewRemaining,
} from '../utils/ip-metrics';
import { IpMark, UnlockServiceIcon } from './ip-mark';

export function IpDetails({
  value,
  linkedSubscription,
  linkedDomains,
  linkedAccounts,
  onClose,
  onEdit,
  onProbe,
  onLookup,
  onReview,
  busyAction,
}: {
  value: IpNode;
  linkedSubscription?: Subscription;
  linkedDomains: Domain[];
  linkedAccounts: Account[];
  onClose: () => void;
  onEdit: () => void;
  onProbe: () => Promise<unknown>;
  onLookup: () => Promise<unknown>;
  onReview: () => Promise<unknown>;
  busyAction?: 'probe' | 'lookup' | 'review';
}) {
  const { t } = usePreferences();
  const { modal, message } = App.useApp();
  const fallback = t('未填写');
  const title = ipDisplayTitle(value);
  const days = reviewRemaining(value);
  const isSingleHost = (value.version === 4 && value.prefixLen === 32) || (value.version === 6 && value.prefixLen === 128);
  const canLookup = value.networkScope !== 'overlay_private' && value.probeStatus !== 'skipped_non_public';
  const canProbe = canLookup && isSingleHost && value.probeMode !== 'none' && value.probePort > 0;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(value.address);
      void message.success(t('已复制 IP 地址'));
    }
    catch {
      /* Ignore clipboard denial. */
    }
  };

  const scopeLabel = {
    overseas_exit: t('海外出口'),
    domestic_entry: t('国内入口'),
    overlay_private: t('组网内网'),
  }[value.networkScope];

  const originLabel = {
    native: t('原生 IP'),
    broadcast: t('广播 IP'),
    unknown: t('未核验'),
  }[value.originType];

  const riskLabel = {
    clean: t('极度纯净'),
    low: t('低风险'),
    medium: t('中度验证码'),
    high: t('高危 / 黑名单'),
    unassessed: t('未评估'),
  }[value.riskLevel];

  const roleLabel = {
    dedicated: t('独享固定出口'),
    primary: t('主力出口'),
    service: t('建站与服务'),
    standby: t('备用线路'),
  }[value.role];

  const statusLabel = {
    active: t('正常在用'),
    degraded: t('质量降级'),
    blocked: t('被墙 / 封禁'),
    retiring: t('计划迁移'),
  }[value.status];

  const probeStatusLabel = {
    unchecked: t('未检测'),
    reachable: `${t('连通正常')} (${value.probeLatencyMs} ms)`,
    unreachable: `${t('无法连通')}${value.probeError ? ` · ${value.probeError}` : ''}`,
    skipped_non_public: t('内网跳过'),
  }[value.probeStatus];

  const reviewStatusText = days === null
    ? t('无需复检')
    : days < 0
      ? `${value.nextReviewDate} · ${t('已逾期 {count} 天', { count: -days })}`
      : days === 0
        ? `${value.nextReviewDate} · ${t('今天到期')}`
        : `${value.nextReviewDate} · ${t('剩 {count} 天', { count: days })}`;

  const items = [
    { key: 'provider', label: t('商家 / 运营商'), children: title },
    {
      key: 'address',
      label: t('IP / CIDR'),
      children: (
        <span className="inline-flex items-center gap-1.5">
          <code>{value.address}</code>
          <Button
            type="text"
            size="small"
            aria-label={t('复制地址')}
            icon={<Copy size={13} />}
            onClick={() => { void copyAddress(); }}
          />
        </span>
      ),
    },
    { key: 'version', label: t('地址版本'), children: `IPv${value.version} · /${value.prefixLen}` },
    { key: 'category', label: t('所属分类'), children: t(ipCategoryMeta[value.category].label) },
    {
      key: 'scope',
      label: t('网络位置'),
      children: `${scopeLabel} · ${value.region}${value.city ? ` (${value.city})` : ''}`,
    },
    {
      key: 'asn',
      label: t('ASN 与属性'),
      children: `${value.asn > 0 ? `AS${value.asn}` : '—'}${value.asnOrg ? ` (${value.asnOrg})` : ''} · ${t(ipAsnTypeMeta[value.asnType].label)}`,
    },
    ...(value.ptrRecord ? [{ key: 'ptr', label: t('反向解析 (PTR)'), children: <code>{value.ptrRecord}</code> }] : []),
    {
      key: 'purity',
      label: t('纯净度风控'),
      children: `${originLabel} · ${riskLabel}${value.purityNote ? ` (${value.purityNote})` : ''}`,
    },
    { key: 'role', label: t('节点角色'), children: `${roleLabel} · ${statusLabel}` },
    {
      key: 'probe',
      label: t('连通性探测'),
      children: value.probeMode === 'none' && value.probeStatus !== 'skipped_non_public'
        ? t('不开启探测')
        : `${value.probeMode !== 'none' ? `${value.probeMode.toUpperCase()}:${value.probePort} · ` : ''}${probeStatusLabel}`,
    },
    {
      key: 'lookup',
      label: t('数据来源'),
      children: (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          <span>{value.lookupSource === 'manual' ? t('手工录入') : value.lookupSource.toUpperCase()}</span>
          {value.manualLocks.length > 0 && (
            <span className="account-mini-tag">
              <Lock size={11} className="inline mr-1" />
              {value.manualLocks.join(', ')}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'review',
      label: t('纯净度复检'),
      children: value.reviewCycle === 'none'
        ? t('无需复检')
        : `${value.reviewCycle === 'custom' ? t('{count} 天', { count: value.reviewDays }) : t(reviewCycles[value.reviewCycle])} · ${reviewStatusText}`,
    },
    ...(value.lastReviewedAt ? [{ key: 'lastReviewed', label: t('上次复检打卡'), children: value.lastReviewedAt }] : []),
    { key: 'hostLabel', label: t('所属主机 / 设备标识'), children: value.hostLabel || fallback },
    ...(value.tags.length > 0
      ? [{
          key: 'tags',
          label: t('线路与特征标签'),
          children: (
            <span className="account-table-tags">
              {value.tags.map(tag => <span key={tag} className="account-mini-tag">{tag}</span>)}
            </span>
          ),
        }]
      : []),
    {
      key: 'consoleUrl',
      label: t('商家控制台网址'),
      children: value.consoleUrl
        ? <a href={value.consoleUrl} target="_blank" rel="noopener noreferrer">{value.consoleUrl}</a>
        : fallback,
    },
    { key: 'notes', label: t('路由与运维备注'), children: <span className="detail-notes">{value.notes || fallback}</span> },
    { key: 'archived', label: t('已停用归档'), children: value.archived ? t('已归档') : '—' },
  ];

  const unlockStateText = {
    unknown: t('未测'),
    full: t('全解锁'),
    partial: t('仅自制 / 受限'),
    blocked: t('不可用'),
  } as const;

  return (
    <Drawer
      open
      title={t('节点详情')}
      size={480}
      onClose={onClose}
      footer={(
        <div className="detail-actions">
          <Button icon={<Pencil size={14} />} onClick={onEdit}>{t('编辑节点')}</Button>
          {canLookup && !value.archived && (
            <Button
              icon={<RefreshCw size={14} />}
              loading={busyAction === 'lookup'}
              disabled={Boolean(busyAction)}
              onClick={() => { void onLookup(); }}
            >
              {t('同步归属信息')}
            </Button>
          )}
          {canProbe && !value.archived && (
            <Button
              icon={<Activity size={14} />}
              loading={busyAction === 'probe'}
              disabled={Boolean(busyAction)}
              onClick={() => { void onProbe(); }}
            >
              {t('检测连通性')}
            </Button>
          )}
          {value.reviewCycle !== 'none' && (
            <Button
              type="primary"
              icon={<CheckCircle2 size={14} />}
              disabled={value.archived || Boolean(busyAction)}
              loading={busyAction === 'review'}
              onClick={() => {
                modal.confirm({
                  title: t('确认已完成纯净度与解锁复检？'),
                  content: t('下次复检日期将按周期顺延。'),
                  okText: t('确定'),
                  cancelText: t('取消'),
                  onOk: onReview,
                });
              }}
            >
              {t('确认已复检')}
            </Button>
          )}
        </div>
      )}
    >
      <div className="detail-hero">
        <IpMark value={value} size="lg" />
        <div className="detail-hero-meta">
          <h3>{title}</h3>
          <span>{`${value.address} · ${value.region}${value.city ? ` (${value.city})` : ''}`}</span>
        </div>
      </div>

      {(value.status === 'blocked' || value.riskLevel === 'high') && !value.archived && (
        <Alert
          showIcon
          type="warning"
          className="mb-4"
          title={t('该节点处于被墙 / 封禁或高危风控状态，建议避免用于核心账号登录。')}
        />
      )}

      {linkedSubscription && linkedSubscription.intention === 'cancel' && !value.archived && (
        <Alert
          showIcon
          type="warning"
          className="mb-4"
          title={t('该节点关联的订阅「{name}」已标记到期必退，请提前迁移绑定的域名与固定账号。', { name: linkedSubscription.name })}
        />
      )}

      {(value.probeStatus === 'skipped_non_public' || value.networkScope === 'overlay_private') && (
        <Alert
          showIcon
          type="info"
          className="mb-4"
          title={t('私有或保留地址段仅作内网资产登记，自动跳过公网探测。')}
        />
      )}

      {days !== null && !value.archived && (
        <div className="detail-progress">
          <span>{t('复检周期剩余')}</span>
          <Progress
            percent={Math.min(100, Math.max(0, days / reviewPeriodDays(value) * 100))}
            showInfo={false}
            size="small"
          />
        </div>
      )}

      <div className="ip-unlock-detail-section">
        <h4>{t('AI 与流媒体解锁')}</h4>
        <div className="ip-unlock-detail-grid">
          {ipUnlockServices.map((svc) => {
            const entry = value.unlocks[svc];
            const state = entry?.status ?? 'unknown';
            const meta = ipUnlockMeta[svc];
            return (
              <div key={svc} className={`ip-unlock-detail-tile state-${state}`}>
                <UnlockServiceIcon service={svc} />
                <div className="ip-unlock-detail-meta">
                  <strong>{meta.label}</strong>
                  <span>
                    {unlockStateText[state]}
                    {entry?.region ? ` · ${entry.region}` : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Descriptions column={1} size="small" items={items} />

      {linkedSubscription && (
        <div className="detail-related-block">
          <h4>{t('关联订阅')}</h4>
          <div className="detail-related-list">
            <Link to="/subscriptions" search={{ detail: linkedSubscription.id }} className="detail-related-item" onClick={onClose}>
              <span>{linkedSubscription.name}</span>
              <code>{`${linkedSubscription.currency} ${(linkedSubscription.amountMinor / 100).toFixed(2)} · ${linkedSubscription.dueDate}`}</code>
            </Link>
          </div>
        </div>
      )}

      {linkedDomains.length > 0 && (
        <div className="detail-related-block">
          <h4>{`${t('绑定解析域名')} (${linkedDomains.length})`}</h4>
          <div className="detail-related-list">
            {linkedDomains.map(dom => (
              <Link key={dom.id} to="/domains" search={{ detail: dom.id }} className="detail-related-item" onClick={onClose}>
                <span>{dom.name}</span>
                <code>{dom.dnsProvider || dom.registrar || dom.notes || 'DNS'}</code>
              </Link>
            ))}
          </div>
        </div>
      )}

      {linkedAccounts.length > 0 && (
        <div className="detail-related-block">
          <h4>{`${t('固定登录账号（纯净环境绑定）')} (${linkedAccounts.length})`}</h4>
          <div className="detail-related-list">
            {linkedAccounts.map(acct => (
              <Link key={acct.id} to="/accounts" search={{ detail: acct.id }} className="detail-related-item" onClick={onClose}>
                <span>{accountDisplayTitle(acct)}</span>
                <code>{acct.identifier}</code>
              </Link>
            ))}
          </div>
        </div>
      )}

      {value.consoleUrl && (
        <Button className="mt-5" icon={<ArrowUpRight size={14} />} href={value.consoleUrl} target="_blank" rel="noopener noreferrer">
          {t('打开商家控制台')}
        </Button>
      )}
    </Drawer>
  );
}
