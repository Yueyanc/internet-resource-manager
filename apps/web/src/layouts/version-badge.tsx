import {
  checkSystemUpdates,
  healthOptions,
  performSystemUpdate,
  probeSystemHealthVersion,
  restartSystemService,
  rollbackSystemVersion,
  systemRollbackVersionsOptions,
  systemUpdateCheckOptions,
} from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Checkbox, Popover, Tooltip } from 'antd';
import dayjs from 'dayjs';
import {
  ArrowUpCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  ExternalLink,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { usePreferences } from '../app/preferences-context';
import { errorMessage } from '../shared/errors';

type TransitionPhase = 'idle' | 'updating' | 'rolling_back' | 'restarting';

export function VersionBadge({ collapsed = false }: { collapsed?: boolean }) {
  const { t, locale } = usePreferences();
  const { message } = App.useApp();
  const client = useQueryClient();

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<TransitionPhase>('idle');
  const [targetVersion, setTargetVersion] = useState<string>('');
  const [selectedRollbackKey, setSelectedRollbackKey] = useState<string>('');
  const [restoreDb, setRestoreDb] = useState(false);
  const [confirmingRollback, setConfirmingRollback] = useState(false);
  const [showManualCmd, setShowManualCmd] = useState(false);
  const [manualTab, setManualTab] = useState<'docker' | 'cli'>('docker');
  const [copiedCmd, setCopiedCmd] = useState(false);

  const pollTimerRef = useRef<number | null>(null);

  const health = useQuery(healthOptions);
  const updateQuery = useQuery(systemUpdateCheckOptions);
  const rollbackQuery = useQuery({
    ...systemRollbackVersionsOptions,
    enabled: open && phase === 'idle',
  });

  const info = updateQuery.data;
  const currentVersion = info?.currentVersion
    || (health.data?.version ? (health.data.version.startsWith('v') ? health.data.version : `v${health.data.version}`) : '—');
  const hasUpdate = Boolean(info?.hasUpdate);
  const canSelfUpdate = Boolean(info?.canSelfUpdate);
  const deploymentMode = info?.deploymentMode ?? 'dev';

  const rollbackData = rollbackQuery.data;
  const localBackup = rollbackData?.localBackup ?? info?.localBackup;

  const rollbackOptions = useMemo(() => {
    const items: Array<{
      key: string;
      versionParam: string;
      label: string;
      publishedAt?: string;
      htmlUrl?: string;
      isLocal: boolean;
      hasDbBackup: boolean;
    }> = [];

    if (localBackup?.available) {
      items.push({
        key: 'local',
        versionParam: '',
        label: localBackup.version || t('上一安装版本'),
        publishedAt: localBackup.createdAt,
        isLocal: true,
        hasDbBackup: localBackup.hasDbBackup,
      });
    }

    for (const cand of rollbackData?.versions ?? []) {
      items.push({
        key: `rel:${cand.version}`,
        versionParam: cand.version,
        label: cand.version,
        publishedAt: cand.publishedAt,
        htmlUrl: cand.htmlUrl,
        isLocal: false,
        hasDbBackup: cand.hasDbBackup,
      });
    }
    return items;
  }, [localBackup, rollbackData?.versions, t]);

  const effectiveSelectedKey = useMemo(() => {
    if (selectedRollbackKey && rollbackOptions.some(o => o.key === selectedRollbackKey)) {
      return selectedRollbackKey;
    }
    return rollbackOptions[0]?.key ?? '';
  }, [rollbackOptions, selectedRollbackKey]);

  const selectedRollback = useMemo(
    () => rollbackOptions.find(o => o.key === effectiveSelectedKey),
    [effectiveSelectedKey, rollbackOptions],
  );

  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  const waitForRestartAndReload = (expectedVer: string, kind: 'update' | 'rollback') => {
    setPhase('restarting');
    setTargetVersion(expectedVer);
    const startedAt = Date.now();
    let sawDisconnectOrChange = false;

    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
    }

    pollTimerRef.current = window.setInterval(() => {
      void (async () => {
        const elapsed = Date.now() - startedAt;
        const liveVer = await probeSystemHealthVersion();
        if (!liveVer) {
          sawDisconnectOrChange = true;
          if (elapsed > 90_000) {
            if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
            setPhase('idle');
            message.warning(t('服务重启耗时较长，请稍后手动刷新页面确认状态'));
          }
          return;
        }

        const normLive = liveVer.startsWith('v') ? liveVer : `v${liveVer}`;
        const normExpected = expectedVer.startsWith('v') ? expectedVer : `v${expectedVer}`;
        if (normLive === normExpected || (sawDisconnectOrChange && elapsed > 3000) || elapsed > 25_000) {
          if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
          message.success(
            kind === 'update'
              ? t('已成功更新至 {ver}，正在刷新界面...', { ver: normLive })
              : t('已成功回退至 {ver}，正在刷新界面...', { ver: normLive }),
          );
          window.setTimeout(() => {
            window.location.reload();
          }, 450);
        }
      })();
    }, 1500);
  };

  const refreshMutation = useMutation({
    mutationFn: () => checkSystemUpdates(true),
    onSuccess: async (fresh) => {
      client.setQueryData(['system-update'], fresh);
      await client.invalidateQueries({ queryKey: ['system-rollback-versions'] });
      if (fresh.warning) {
        message.warning(t('无法连接 GitHub Releases，已显示缓存状态'));
      }
      else if (fresh.hasUpdate) {
        message.info(t('检测到新版本 {ver}', { ver: fresh.latestVersion }));
      }
      else {
        message.success(t('当前已是最新版本'));
      }
    },
    onError: (err) => {
      message.error(errorMessage(err, locale));
    },
  });

  const handlePerformUpdate = async () => {
    if (phase !== 'idle') return;
    setConfirmingRollback(false);
    setPhase('updating');
    const nextVer = info?.latestVersion || '';
    setTargetVersion(nextVer);
    try {
      const res = await performSystemUpdate();
      if (res.needRestart) {
        await restartSystemService();
        waitForRestartAndReload(res.targetVersion, 'update');
      }
      else {
        setPhase('idle');
        await client.invalidateQueries({ queryKey: ['system-update'] });
      }
    }
    catch (err) {
      setPhase('idle');
      message.error(errorMessage(err, locale));
    }
  };

  const handlePerformRollback = async () => {
    if (phase !== 'idle' || !selectedRollback) return;
    setConfirmingRollback(false);
    setPhase('rolling_back');
    setTargetVersion(selectedRollback.label);
    try {
      const res = await rollbackSystemVersion({
        version: selectedRollback.versionParam || undefined,
        restoreDatabase: selectedRollback.hasDbBackup ? restoreDb : false,
      });
      if (res.needRestart) {
        await restartSystemService();
        waitForRestartAndReload(res.targetVersion, 'rollback');
      }
      else {
        setPhase('idle');
        await client.invalidateQueries({ queryKey: ['system-update'] });
      }
    }
    catch (err) {
      setPhase('idle');
      message.error(errorMessage(err, locale));
    }
  };

  const manualCommandVersion = selectedRollback?.versionParam
    || (hasUpdate ? info?.latestVersion : undefined)
    || currentVersion;

  const manualCommandText = manualTab === 'docker'
    ? `cd /opt/internet-resource-manager && sed -i "s|IRM_IMAGE=.*|IRM_IMAGE='ghcr.io/yueyanc/internet-resource-manager:${manualCommandVersion}'|" .env && docker compose up -d`
    : `curl -fsSL "https://github.com/Yueyanc/internet-resource-manager/releases/download/${manualCommandVersion}/irm-release-linux-amd64.tar.gz" | sudo tar -xz -C /usr/local/bin server && sudo systemctl restart irm`;

  const copyManualCommand = async () => {
    try {
      await navigator.clipboard.writeText(manualCommandText);
      setCopiedCmd(true);
      window.setTimeout(() => setCopiedCmd(false), 1800);
    }
    catch {
      message.error(t('复制失败，请手动选中复制'));
    }
  };

  const isBusy = phase !== 'idle';

  const popoverContent = (
    <div className="version-popover" role="dialog" aria-label={t('系统版本与更新')}>
      <div className="version-popover-head">
        <div className="version-popover-title-group">
          <span className="version-popover-current">{currentVersion}</span>
          <span className={`version-mode-pill is-${deploymentMode}`}>
            {deploymentMode === 'docker'
              ? 'Docker'
              : deploymentMode === 'binary'
                ? 'Binary'
                : 'Dev'}
          </span>
          {hasUpdate
            ? (
                <span className="version-status-chip is-update">
                  {t('有新版本')}
                </span>
              )
            : (
                <span className="version-status-chip is-latest">
                  {t('已是最新')}
                </span>
              )}
        </div>
        <div className="version-popover-actions">
          <Tooltip title={t('立即检查更新')}>
            <button
              type="button"
              className="version-icon-btn"
              aria-label={t('立即检查更新')}
              disabled={isBusy || refreshMutation.isPending}
              onClick={() => refreshMutation.mutate()}
            >
              <RefreshCw size={14} className={refreshMutation.isPending ? 'animate-spin' : ''} />
            </button>
          </Tooltip>
          <Tooltip title={t('查看 GitHub Releases')}>
            <a
              href="https://github.com/Yueyanc/internet-resource-manager/releases"
              target="_blank"
              rel="noreferrer"
              className="version-icon-btn"
              aria-label={t('查看 GitHub Releases')}
            >
              <ExternalLink size={14} />
            </a>
          </Tooltip>
        </div>
      </div>

      {isBusy
        ? (
            <div className="version-transition-card" aria-live="polite">
              <Loader2 size={20} className="animate-spin version-transition-spinner" />
              <div className="version-transition-text">
                <strong>
                  {phase === 'updating' && t('正在下载并校验 {ver} 更新包...', { ver: targetVersion })}
                  {phase === 'rolling_back' && t('正在切换至历史版本 {ver}...', { ver: targetVersion })}
                  {phase === 'restarting' && t('服务正在重启并切换至 {ver}...', { ver: targetVersion })}
                </strong>
                <span>
                  {phase === 'updating' && t('升级前会自动生成 SQLite 热备份快照，请勿关闭页面')}
                  {phase === 'rolling_back' && t('正在校验 SHA-256 签名并原子替换服务端程序')}
                  {phase === 'restarting' && t('正在探测健康检查端点，就绪后将自动刷新界面')}
                </span>
              </div>
            </div>
          )
        : (
            <>
              {hasUpdate && info?.release
                ? (
                    <div className="version-update-card">
                      <div className="version-update-top">
                        <div className="version-update-title">
                          <Sparkles size={15} />
                          <span>{t('发现新版本 {ver}', { ver: info.release.version })}</span>
                        </div>
                        {info.release.htmlUrl && (
                          <a
                            href={info.release.htmlUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="version-release-link"
                          >
                            {t('发行说明')}
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      {info.release.publishedAt && (
                        <div className="version-update-meta">
                          {t('发布于 {date}', { date: dayjs(info.release.publishedAt).format('YYYY-MM-DD HH:mm') })}
                        </div>
                      )}
                      {info.release.body && (
                        <pre className="version-release-notes">{info.release.body.trim()}</pre>
                      )}
                      {canSelfUpdate
                        ? (
                            <Button
                              type="primary"
                              block
                              className="version-upgrade-btn"
                              icon={<ArrowUpCircle size={15} />}
                              onClick={() => {
                                void handlePerformUpdate();
                              }}
                            >
                              {t('立即更新至 {ver}', { ver: info.release.version })}
                            </Button>
                          )
                        : (
                            <div className="version-dev-hint">
                              {t('当前为本地开发构建，已禁用在线二进制替换，可使用下方手动命令升级。')}
                            </div>
                          )}
                    </div>
                  )
                : (
                    <div className="version-uptodate-bar">
                      <CheckCircle2 size={15} />
                      <span>{t('当前运行版本已是最新稳定版')}</span>
                    </div>
                  )}

              <div className="version-rollback-section">
                <div className="version-section-header">
                  <span className="version-section-label">
                    <History size={13} />
                    {t('手动回退历史版本')}
                  </span>
                  <span className="version-section-sub">{t('保留近 3 个稳定版')}</span>
                </div>

                {rollbackQuery.isPending
                  ? (
                      <div className="version-empty-note">{t('正在获取可回退版本...')}</div>
                    )
                  : rollbackOptions.length === 0
                    ? (
                        <div className="version-empty-note">{t('暂无更早的已发布稳定版本可供回退')}</div>
                      )
                    : (
                        <>
                          <div className="version-rollback-list" role="radiogroup" aria-label={t('可回退版本列表')}>
                            {rollbackOptions.map((opt) => {
                              const active = opt.key === effectiveSelectedKey;
                              return (
                                <button
                                  key={opt.key}
                                  type="button"
                                  role="radio"
                                  aria-checked={active}
                                  className={`version-rollback-item ${active ? 'is-selected' : ''}`}
                                  onClick={() => {
                                    setSelectedRollbackKey(opt.key);
                                    setConfirmingRollback(false);
                                    if (!opt.hasDbBackup) {
                                      setRestoreDb(false);
                                    }
                                  }}
                                >
                                  <span className="version-radio-dot" />
                                  <div className="version-rollback-main">
                                    <div className="version-rollback-row">
                                      <span className="version-rollback-ver">{opt.label}</span>
                                      {opt.isLocal && (
                                        <span className="version-mini-tag is-local">{t('本地秒退')}</span>
                                      )}
                                      {opt.hasDbBackup && (
                                        <span className="version-mini-tag is-db">
                                          <Database size={10} />
                                          {t('含库快照')}
                                        </span>
                                      )}
                                    </div>
                                    {opt.publishedAt && (
                                      <span className="version-rollback-date">
                                        {dayjs(opt.publishedAt).format('YYYY-MM-DD HH:mm')}
                                      </span>
                                    )}
                                  </div>
                                  {opt.htmlUrl && (
                                    <a
                                      href={opt.htmlUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="version-item-ext"
                                      onClick={e => e.stopPropagation()}
                                      aria-label={opt.label}
                                    >
                                      <ExternalLink size={12} />
                                    </a>
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {selectedRollback?.hasDbBackup && canSelfUpdate && (
                            <label className="version-db-checkbox">
                              <Checkbox
                                checked={restoreDb}
                                onChange={e => setRestoreDb(e.target.checked)}
                              />
                              <span>{t('同时恢复升级前的 SQLite 数据库快照')}</span>
                            </label>
                          )}

                          {canSelfUpdate && selectedRollback && (
                            confirmingRollback
                              ? (
                                  <div className="version-confirm-box">
                                    <span>
                                      {restoreDb && selectedRollback.hasDbBackup
                                        ? t('确认回退程序并恢复 {ver} 的数据库快照？', { ver: selectedRollback.label })
                                        : t('确认将服务端切换回 {ver} 并自动重启？', { ver: selectedRollback.label })}
                                    </span>
                                    <div className="version-confirm-btns">
                                      <Button size="small" onClick={() => setConfirmingRollback(false)}>
                                        {t('取消')}
                                      </Button>
                                      <Button
                                        size="small"
                                        danger
                                        type="primary"
                                        icon={<RotateCcw size={13} />}
                                        onClick={() => {
                                          void handlePerformRollback();
                                        }}
                                      >
                                        {t('确认回退')}
                                      </Button>
                                    </div>
                                  </div>
                                )
                              : (
                                  <Button
                                    block
                                    className="version-rollback-btn"
                                    icon={<RotateCcw size={14} />}
                                    onClick={() => setConfirmingRollback(true)}
                                  >
                                    {t('回退至 {ver}', { ver: selectedRollback.label })}
                                  </Button>
                                )
                          )}
                        </>
                      )}
              </div>

              <div className="version-manual-section">
                <button
                  type="button"
                  className="version-manual-toggle"
                  onClick={() => setShowManualCmd(v => !v)}
                  aria-expanded={showManualCmd}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Terminal size={13} />
                    {t('手动升级 / 回退命令')}
                  </span>
                  {showManualCmd ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {showManualCmd && (
                  <div className="version-manual-body">
                    <div className="version-manual-tabs">
                      <button
                        type="button"
                        className={manualTab === 'docker' ? 'is-active' : ''}
                        onClick={() => setManualTab('docker')}
                      >
                        Docker Compose
                      </button>
                      <button
                        type="button"
                        className={manualTab === 'cli' ? 'is-active' : ''}
                        onClick={() => setManualTab('cli')}
                      >
                        Systemd / Binary
                      </button>
                    </div>
                    <div className="version-manual-code">
                      <code>{manualCommandText}</code>
                      <button
                        type="button"
                        className="version-copy-btn"
                        onClick={() => {
                          void copyManualCommand();
                        }}
                        aria-label={t('复制命令')}
                      >
                        {copiedCmd ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
    </div>
  );

  return (
    <Popover
      content={popoverContent}
      trigger="click"
      open={open}
      onOpenChange={(next) => {
        if (isBusy && !next) return;
        setOpen(next);
        if (!next) {
          setConfirmingRollback(false);
        }
      }}
      placement={collapsed ? 'rightTop' : 'bottomLeft'}
      arrow={false}
      classNames={{ root: 'version-badge-popover-root' }}
    >
      <Tooltip
        title={collapsed ? `${currentVersion} · ${hasUpdate ? t('发现新版本 {ver}', { ver: info?.latestVersion ?? '' }) : t('系统版本与更新')}` : undefined}
        placement="right"
      >
        <button
          type="button"
          className={`sidebar-version-badge ${hasUpdate ? 'has-update' : ''} ${collapsed ? 'is-collapsed' : ''}`}
          aria-label={t('系统版本与更新')}
        >
          {hasUpdate && <span className="sidebar-version-dot" aria-hidden="true" />}
          <span className="sidebar-version-text">
            {collapsed ? currentVersion.replace(/^v/, '') : currentVersion}
          </span>
          {!collapsed && hasUpdate && <ArrowUpCircle size={12} className="sidebar-version-up" />}
        </button>
      </Tooltip>
    </Popover>
  );
}
