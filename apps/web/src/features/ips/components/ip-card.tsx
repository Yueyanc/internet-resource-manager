import type { IpNode, Subscription } from '@irm/api-client';
import { App, Button, Card, Dropdown, Tooltip } from 'antd';
import dayjs from 'dayjs';
import {
  Activity,
  Archive,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Copy,
  Eye,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react';

import { usePreferences } from '../../../app/preferences-context';
import {
  countUnlockedServices,
  ipAsnTypeMeta,
  ipCategoryMeta,
  ipDisplayTitle,
  maskIpAddress,
  reviewRemaining,
  subscriptionAlert,
} from '../utils/ip-metrics';
import { IpMark } from './ip-mark';

export function IpCard({
  value,
  subscriptionsById,
  masked,
  onDetails,
  onEdit,
  onProbe,
  onLookup,
  onReview,
  onDelete,
  busyAction,
}: {
  value: IpNode;
  subscriptionsById: Map<string, Subscription>;
  masked: boolean;
  onDetails: () => void;
  onEdit: () => void;
  onProbe: () => Promise<unknown>;
  onLookup: () => Promise<unknown>;
  onReview: () => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  busyAction?: 'probe' | 'lookup' | 'review';
}) {
  const { t } = usePreferences();
  const { modal, message } = App.useApp();
  const title = ipDisplayTitle(value);
  const days = reviewRemaining(value);
  const unlocked = countUnlockedServices(value);
  const subAlert = subscriptionAlert(value, subscriptionsById);
  const displayAddress = masked ? maskIpAddress(value.address) : value.address;
  const isSingleHost = (value.version === 4 && value.prefixLen === 32) || (value.version === 6 && value.prefixLen === 128);
  const canLookup = value.networkScope !== 'overlay_private' && value.probeStatus !== 'skipped_non_public';
  const canProbe = canLookup && isSingleHost && value.probeMode !== 'none' && value.probePort > 0;

  const confirmReview = () => modal.confirm({
    title: t('确认已完成纯净度与解锁复检？'),
    content: t('下次复检日期将按周期顺延。'),
    okText: t('确定'),
    cancelText: t('取消'),
    onOk: onReview,
  });

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(value.address);
      void message.success(t('已复制 IP 地址'));
    }
    catch {
      /* Clipboard may be unavailable in restricted contexts. */
    }
  };

  let rightBadge: { text: string; tone: '' | 'is-soon' | 'is-overdue' | 'is-safe'; tooltip: string } | undefined;
  if (value.archived) {
    rightBadge = { text: t('已归档'), tone: '', tooltip: t('已归档') };
  }
  else if (value.status === 'blocked') {
    rightBadge = { text: t('被墙 / 封禁'), tone: 'is-overdue', tooltip: t('被墙 / 封禁') };
  }
  else if (value.probeMode !== 'none' && value.probeStatus === 'unreachable') {
    rightBadge = { text: t('无法连通'), tone: 'is-overdue', tooltip: value.probeError || t('无法连通') };
  }
  else if (value.probeStatus === 'skipped_non_public' || value.networkScope === 'overlay_private') {
    rightBadge = { text: t('内网跳过'), tone: '', tooltip: t('私有或保留地址段仅作内网资产登记，自动跳过公网探测。') };
  }
  else if (subAlert === 'cancel') {
    rightBadge = { text: t('续费预警'), tone: 'is-overdue', tooltip: t('到期必退') };
  }
  else if (days !== null && days <= 30) {
    const tone = days < 0 ? 'is-overdue' : 'is-soon';
    const text = days < 0
      ? t('逾期复检')
      : days === 0
        ? t('今天需复检')
        : t('{date} 复检', { date: dayjs(value.nextReviewDate).format('MM/DD') });
    const detail = days < 0
      ? t('已逾期 {count} 天', { count: -days })
      : days === 0
        ? t('今天到期')
        : t('剩 {count} 天', { count: days });
    rightBadge = { text, tone, tooltip: `${value.nextReviewDate} · ${detail}` };
  }
  else if (value.probeStatus === 'reachable') {
    rightBadge = {
      text: `${value.probeLatencyMs} ms`,
      tone: 'is-safe',
      tooltip: `${t('连通正常')} · ${value.probeMode.toUpperCase()}:${value.probePort}`,
    };
  }
  else if (unlocked.full > 0) {
    rightBadge = {
      text: `${unlocked.full} ${t('全解锁')}`,
      tone: 'is-safe',
      tooltip: `${t('AI 与流媒体解锁')} · ${unlocked.full}`,
    };
  }
  else if (days !== null) {
    rightBadge = {
      text: t('{date} 复检', { date: dayjs(value.nextReviewDate).format('MM/DD') }),
      tone: '',
      tooltip: value.nextReviewDate,
    };
  }

  const subtitleParts = [
    t(ipCategoryMeta[value.category].short),
    value.asn > 0 ? `AS${value.asn}` : t(ipAsnTypeMeta[value.asnType].short),
  ];
  if (value.originType === 'native') subtitleParts.push(t('原生'));

  return (
    <Card className={`subscription-card account-card ip-card ${value.archived ? 'is-archived' : ''}`}>
      <button
        type="button"
        className="subscription-face"
        aria-label={t('查看 {name}', { name: title })}
        onClick={onDetails}
      >
        <div className="subscription-identity">
          <IpMark value={value} />
          <div className="subscription-title-group">
            <div className="account-title-line">
              <h2 title={title}>{title}</h2>
              <span className={`account-region-pill ${value.networkScope === 'domestic_entry' ? 'is-domestic' : ''}`}>
                {value.region}
              </span>
            </div>
            <span className="subscription-subtitle">{subtitleParts.join(' · ')}</span>
          </div>
        </div>

        <div className="subscription-bottom">
          <div className="account-identifier-wrap">
            <code className="account-identifier" title={masked ? undefined : value.address}>{displayAddress}</code>
          </div>
          <div className="subscription-meta-right">
            <div className="card-signals">
              {value.role === 'dedicated' && (
                <Tooltip title={t('独享固定出口')}>
                  <Star size={13} className="text-indigo-500" aria-label={t('独享固定出口')} />
                </Tooltip>
              )}
              {(value.asnType === 'residential' || value.originType === 'native') && value.networkScope !== 'overlay_private' && (
                <Tooltip title={t(value.asnType === 'residential' ? '住宅宽带 (Residential)' : '原生 IP')}>
                  <ShieldCheck size={13} className="text-emerald-600" aria-label={t('原生 IP')} />
                </Tooltip>
              )}
              {(value.riskLevel === 'high' || value.status === 'degraded') && !value.archived && (
                <Tooltip title={t(value.riskLevel === 'high' ? '高危 / 黑名单' : '质量降级')}>
                  <ShieldAlert size={13} className="text-red-500" aria-label={t('高危 / 黑名单')} />
                </Tooltip>
              )}
              {value.status === 'blocked' && !value.archived && (
                <Tooltip title={t('被墙 / 封禁')}>
                  <Ban size={13} className="text-red-500" aria-label={t('被墙 / 封禁')} />
                </Tooltip>
              )}
              {value.status === 'retiring' && !value.archived && (
                <Tooltip title={t('计划迁移')}>
                  <span className="cancel-signal" aria-label={t('计划迁移')} />
                </Tooltip>
              )}
              {value.archived && <Archive size={13} aria-label={t('已归档')} />}
            </div>
            {rightBadge && (
              <Tooltip title={rightBadge.tooltip}>
                <span className={`due-badge ${rightBadge.tone}`}>{rightBadge.text}</span>
              </Tooltip>
            )}
          </div>
        </div>
      </button>

      <Tooltip title={t('复制地址')}>
        <Button
          type="text"
          size="small"
          className="account-copy-btn"
          aria-label={t('复制 {name} 地址', { name: title })}
          icon={<Copy size={13} />}
          onClick={() => { void copyAddress(); }}
        />
      </Tooltip>

      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        menu={{
          items: [
            { key: 'details', label: t('查看详情'), icon: <Eye size={14} /> },
            { key: 'edit', label: t('编辑节点'), icon: <Pencil size={14} /> },
            ...(canProbe
              ? [{
                  key: 'probe',
                  label: t('检测连通性'),
                  icon: <Activity size={14} />,
                  disabled: value.archived || Boolean(busyAction),
                }]
              : []),
            ...(canLookup
              ? [{
                  key: 'lookup',
                  label: t('同步归属信息'),
                  icon: <RefreshCw size={14} />,
                  disabled: value.archived || Boolean(busyAction),
                }]
              : []),
            ...(value.reviewCycle !== 'none'
              ? [{
                  key: 'review',
                  label: t('确认已复检'),
                  icon: <CheckCircle2 size={14} />,
                  disabled: value.archived || Boolean(busyAction),
                }]
              : []),
            ...(value.consoleUrl
              ? [{
                  key: 'console',
                  label: <a href={value.consoleUrl} target="_blank" rel="noopener noreferrer">{t('打开商家控制台')}</a>,
                  icon: <ArrowUpRight size={14} />,
                }]
              : []),
            ...(value.archived ? [{ key: 'delete', label: t('永久删除'), danger: true, icon: <Trash2 size={14} /> }] : []),
          ],
          onClick: ({ key }) => {
            if (key === 'details') onDetails();
            if (key === 'edit') onEdit();
            if (key === 'probe') void onProbe();
            if (key === 'lookup') void onLookup();
            if (key === 'review') confirmReview();
            if (key === 'delete') {
              modal.confirm({
                title: t('永久删除这个 IP 节点？'),
                content: t('删除后无法恢复。'),
                okButtonProps: { danger: true },
                onOk: onDelete,
              });
            }
          },
        }}
      >
        <Tooltip title={t('更多操作')}>
          <Button
            className="card-menu"
            type="text"
            aria-label={t('操作 {name}', { name: title })}
            icon={<MoreHorizontal size={17} />}
            loading={Boolean(busyAction)}
          />
        </Tooltip>
      </Dropdown>
    </Card>
  );
}
