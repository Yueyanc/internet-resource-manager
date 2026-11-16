import {
  type AutomationSaveInput,
  type AutomationSettings,
  checkSystemUpdates,
  downloadSystemBackup,
  performSystemUpdate,
  probeSystemHealthVersion,
  restartSystemService,
  runSystemInspection,
  saveAutomationSettings,
  sendTestNotification,
  systemAutomationOptions,
  systemStorageOptions,
  systemUpdateCheckOptions,
} from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Input, InputNumber, Switch } from 'antd';
import dayjs from 'dayjs';
import {
  ArrowUpCircle,
  BellRing,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  Play,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';

import { usePreferences } from '../../app/preferences-context';
import { errorMessage } from '../../shared/errors';
import { Loading, QueryError } from '../../shared/feedback';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

export function SettingsAutomationTab({ onClose }: { onClose: () => void }) {
  const { t, locale } = usePreferences();
  const { message } = App.useApp();
  const client = useQueryClient();
  const query = useQuery(systemAutomationOptions);

  if (query.isError) {
    return (
      <QueryError
        title={t('无法加载通知与自动化设置')}
        error={query.error}
        retry={() => { void query.refetch(); }}
      />
    );
  }
  if (!query.data) {
    return <Loading />;
  }

  return <AutomationForm key={query.dataUpdatedAt} initial={query.data} onClose={onClose} client={client} message={message} locale={locale} />;
}

function AutomationForm({
  initial,
  onClose,
  client,
  message,
  locale,
}: {
  initial: AutomationSettings;
  onClose: () => void;
  client: ReturnType<typeof useQueryClient>;
  message: ReturnType<typeof App.useApp>['message'];
  locale: 'zh-CN' | 'en-US';
}) {
  const { t } = usePreferences();
  const [draft, setDraft] = useState<AutomationSaveInput>(() => ({
    expiryLeadDays: initial.expiryLeadDays,
    dailyDigestHour: initial.dailyDigestHour,
    notifyOnServerOffline: initial.notifyOnServerOffline,
    trafficAlertThresholdPct: initial.trafficAlertThresholdPct,
    autoAdvanceSubscriptions: initial.autoAdvanceSubscriptions,
    autoSyncEnabled: initial.autoSyncEnabled,
    autoSyncIntervalHours: initial.autoSyncIntervalHours,
    telegramEnabled: initial.telegramEnabled,
    telegramChatId: initial.telegramChatId,
    telegramBotToken: '',
    barkEnabled: initial.barkEnabled,
    barkServerUrl: initial.barkServerUrl || 'https://api.day.app',
    barkDeviceKey: '',
    webhookEnabled: initial.webhookEnabled,
    webhookUrl: '',
  }));

  const saveMut = useMutation({
    mutationFn: () => saveAutomationSettings(draft),
    onSuccess: async () => {
      setDraft(prev => ({ ...prev, telegramBotToken: '', barkDeviceKey: '', webhookUrl: '' }));
      await client.invalidateQueries({ queryKey: ['system-automation'] });
      void message.success(t('通知与自动化策略已保存'));
    },
    onError: (err) => {
      void message.error(errorMessage(err, locale));
    },
  });

  const testMut = useMutation({
    mutationFn: () => sendTestNotification(draft),
    onSuccess: (res) => {
      void message.success(t('测试通知已送达 ({channels})', { channels: res.sentChannels.join(', ') }));
    },
    onError: (err) => {
      void message.error(errorMessage(err, locale));
    },
  });

  const inspectMut = useMutation({
    mutationFn: runSystemInspection,
    onSuccess: async (res) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['system-automation'] }),
        client.invalidateQueries({ queryKey: ['subscriptions'] }),
        client.invalidateQueries({ queryKey: ['domains'] }),
        client.invalidateQueries({ queryKey: ['servers'] }),
        client.invalidateQueries({ queryKey: ['ips'] }),
        client.invalidateQueries({ queryKey: ['integrations'] }),
        client.invalidateQueries({ queryKey: ['nav-counts'] }),
      ]);
      void message.success(
        t('巡检完成：顺延 {adv} 笔订阅 · 同步 {sync} 个云平台 · 临期待办 {exp} 项', {
          adv: res.subscriptionsAdvanced,
          sync: res.providersSynced,
          exp: res.expiringCount,
        }),
      );
    },
    onError: (err) => {
      void message.error(errorMessage(err, locale));
    },
  });

  return (
    <div className="settings-pane-stack">
      <div className="settings-pane-header">
        <div>
          <h3>{t('通知与自动化')}</h3>
          <p className="settings-pane-sub">
            {initial.lastRunAt
              ? t('上次后台巡检：{time}', { time: dayjs(initial.lastRunAt).format('YYYY-MM-DD HH:mm') })
              : t('配置主动到期预警、异常告警与后台静默同步策略')}
          </p>
        </div>
        <Button
          icon={<Play size={14} />}
          loading={inspectMut.isPending}
          onClick={() => inspectMut.mutate()}
        >
          {t('立即执行巡检')}
        </Button>
      </div>

      {initial.lastError && (
        <Alert type="warning" showIcon title={t('最近一次推送告警异常：{msg}', { msg: initial.lastError })} />
      )}

      <section className="settings-section-card">
        <div className="settings-section-head">
          <span className="settings-section-title">
            <BellRing size={15} />
            {t('推送通知渠道')}
          </span>
          <Button
            size="small"
            icon={<Send size={13} />}
            loading={testMut.isPending}
            onClick={() => testMut.mutate()}
          >
            {t('发送测试通知')}
          </Button>
        </div>

        <div className="settings-channel-list">
          <div className="settings-channel-box">
            <div className="settings-channel-top">
              <div>
                <strong>Telegram Bot</strong>
                <span>{t('通过官方 Bot API 推送到期清单与服务器离线告警')}</span>
              </div>
              <Switch
                checked={draft.telegramEnabled}
                onChange={checked => setDraft(prev => ({ ...prev, telegramEnabled: checked }))}
              />
            </div>
            {draft.telegramEnabled && (
              <div className="settings-channel-fields">
                <Input.Password
                  value={draft.telegramBotToken}
                  onChange={e => setDraft(prev => ({ ...prev, telegramBotToken: e.target.value }))}
                  placeholder={
                    initial.hasTelegramBotToken
                      ? t('已加密保存 ({hint})，留空保持不变', { hint: initial.telegramBotTokenHint })
                      : 'Bot Token (123456:ABC-DEF...)'
                  }
                />
                <Input
                  value={draft.telegramChatId}
                  onChange={e => setDraft(prev => ({ ...prev, telegramChatId: e.target.value }))}
                  placeholder={t('Chat ID（如 123456789 或 -100...）')}
                />
              </div>
            )}
          </div>

          <div className="settings-channel-box">
            <div className="settings-channel-top">
              <div>
                <strong>Bark (iOS)</strong>
                <span>{t('支持官方 api.day.app 或自建 Bark 服务端推送')}</span>
              </div>
              <Switch
                checked={draft.barkEnabled}
                onChange={checked => setDraft(prev => ({ ...prev, barkEnabled: checked }))}
              />
            </div>
            {draft.barkEnabled && (
              <div className="settings-channel-fields">
                <Input
                  value={draft.barkServerUrl}
                  onChange={e => setDraft(prev => ({ ...prev, barkServerUrl: e.target.value }))}
                  placeholder="https://api.day.app"
                />
                <Input.Password
                  value={draft.barkDeviceKey}
                  onChange={e => setDraft(prev => ({ ...prev, barkDeviceKey: e.target.value }))}
                  placeholder={
                    initial.hasBarkDeviceKey
                      ? t('已加密保存 ({hint})，留空保持不变', { hint: initial.barkDeviceKeyHint })
                      : 'Bark Device Key'
                  }
                />
              </div>
            )}
          </div>

          <div className="settings-channel-box">
            <div className="settings-channel-top">
              <div>
                <strong>Webhook</strong>
                <span>{t('自动识别飞书 / 企业微信 / 钉钉 / Discord / Slack 或通用 JSON')}</span>
              </div>
              <Switch
                checked={draft.webhookEnabled}
                onChange={checked => setDraft(prev => ({ ...prev, webhookEnabled: checked }))}
              />
            </div>
            {draft.webhookEnabled && (
              <div className="settings-channel-fields is-single">
                <Input.Password
                  value={draft.webhookUrl}
                  onChange={e => setDraft(prev => ({ ...prev, webhookUrl: e.target.value }))}
                  placeholder={
                    initial.hasWebhookUrl
                      ? t('已加密保存 ({hint})，留空保持不变', { hint: initial.webhookUrlHint })
                      : 'https://open.feishu.cn/open-apis/bot/v2/hook/...'
                  }
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="settings-section-card">
        <div className="settings-section-head">
          <span className="settings-section-title">{t('后台静默同步与巡检策略')}</span>
        </div>

        <div className="settings-policy-rows">
          <div className="settings-policy-row">
            <div>
              <strong>{t('自动顺延自动扣款订阅')}</strong>
              <span>{t('当开启自动续费且非“到期必退”的订阅过期时，自动推进至下一计费周期')}</span>
            </div>
            <Switch
              checked={draft.autoAdvanceSubscriptions}
              onChange={checked => setDraft(prev => ({ ...prev, autoAdvanceSubscriptions: checked }))}
            />
          </div>

          <div className="settings-policy-row">
            <div>
              <strong>{t('后台静默同步云平台与域名 RDAP')}</strong>
              <span>{t('定时刷新已连接的云平台资产与临期域名的注册商到期日')}</span>
            </div>
            <div className="inline-flex items-center gap-2">
              <InputNumber
                min={1}
                max={168}
                disabled={!draft.autoSyncEnabled}
                value={draft.autoSyncIntervalHours}
                onChange={v => setDraft(prev => ({ ...prev, autoSyncIntervalHours: Number(v ?? 6) }))}
                suffix={t('小时')}
                style={{ width: 96 }}
              />
              <Switch
                checked={draft.autoSyncEnabled}
                onChange={checked => setDraft(prev => ({ ...prev, autoSyncEnabled: checked }))}
              />
            </div>
          </div>

          <div className="settings-policy-row">
            <div>
              <strong>{t('服务器探针离线告警')}</strong>
              <span>{t('守护进程探针心跳超时失联时立即推送异常提醒')}</span>
            </div>
            <Switch
              checked={draft.notifyOnServerOffline}
              onChange={checked => setDraft(prev => ({ ...prev, notifyOnServerOffline: checked }))}
            />
          </div>

          <div className="settings-policy-row">
            <div>
              <strong>{t('月度流量使用率预警阈值')}</strong>
              <span>{t('达到配额百分比时发送预警（设为 0 关闭）')}</span>
            </div>
            <InputNumber
              min={0}
              max={100}
              value={draft.trafficAlertThresholdPct}
              onChange={v => setDraft(prev => ({ ...prev, trafficAlertThresholdPct: Number(v ?? 85) }))}
              suffix="%"
              style={{ width: 96 }}
            />
          </div>

          <div className="settings-policy-row">
            <div>
              <strong>{t('到期提前提醒窗口与汇总时间')}</strong>
              <span>{t('覆盖手动续费订阅、待退订止损、域名到期、账号保活与 IP 复检')}</span>
            </div>
            <div className="inline-flex items-center gap-2">
              <InputNumber
                min={1}
                max={90}
                value={draft.expiryLeadDays}
                onChange={v => setDraft(prev => ({ ...prev, expiryLeadDays: Number(v ?? 14) }))}
                suffix={t('天')}
                style={{ width: 88 }}
              />
              <InputNumber
                min={0}
                max={23}
                value={draft.dailyDigestHour}
                onChange={v => setDraft(prev => ({ ...prev, dailyDigestHour: Number(v ?? 9) }))}
                suffix={t('时')}
                style={{ width: 82 }}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="settings-pane-footer">
        <Button onClick={onClose}>{t('取消')}</Button>
        <Button type="primary" loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
          {t('保存更改')}
        </Button>
      </div>
    </div>
  );
}

export function SettingsBackupAboutTab() {
  const { t, locale } = usePreferences();
  const { message } = App.useApp();
  const client = useQueryClient();

  const storageQuery = useQuery(systemStorageOptions);
  const updateQuery = useQuery(systemUpdateCheckOptions);
  const [downloading, setDownloading] = useState<'sqlite' | 'json' | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  const checkMut = useMutation({
    mutationFn: () => checkSystemUpdates(true),
    onSuccess: (data) => {
      client.setQueryData(systemUpdateCheckOptions.queryKey, data);
      void message.success(data.hasUpdate ? t('发现新版本 {v}', { v: data.latestVersion }) : t('当前已是最新版本'));
    },
    onError: (err) => {
      void message.error(errorMessage(err, locale));
    },
  });

  const handleDownload = async (kind: 'sqlite' | 'json') => {
    setDownloading(kind);
    try {
      const filename = await downloadSystemBackup(kind);
      void message.success(t('已导出 {name}', { name: filename }));
    }
    catch (err) {
      void message.error(errorMessage(err, locale));
    }
    finally {
      setDownloading(null);
    }
  };

  const handleSelfUpdate = async () => {
    setUpgrading(true);
    try {
      const res = await performSystemUpdate();
      void message.info(res.message);
      if (res.needRestart) {
        await restartSystemService();
        for (let i = 0; i < 40; i++) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          const liveVer = await probeSystemHealthVersion();
          if (liveVer) {
            window.location.reload();
            return;
          }
        }
      }
    }
    catch (err) {
      void message.error(errorMessage(err, locale));
      setUpgrading(false);
    }
  };

  if (storageQuery.isError) {
    return (
      <QueryError
        title={t('无法读取存储与实例信息')}
        error={storageQuery.error}
        retry={() => { void storageQuery.refetch(); }}
      />
    );
  }
  if (!storageQuery.data) {
    return <Loading />;
  }

  const info = storageQuery.data;
  const updateInfo = updateQuery.data;
  const modeLabel = {
    docker: t('Docker 容器部署'),
    binary: t('原生守护进程'),
    dev: t('本地开发模式'),
  }[info.deploymentMode];

  const totalAssets = info.counts.subscriptions + info.counts.accounts + info.counts.domains + info.counts.servers + info.counts.ips;

  return (
    <div className="settings-pane-stack">
      <div className="settings-pane-header">
        <div>
          <h3>{t('数据备份与关于')}</h3>
          <p className="settings-pane-sub">{t('零停机热备 SQLite 数据库快照、导出开放格式清单及实例版本维护')}</p>
        </div>
      </div>

      <section className="settings-section-card">
        <div className="settings-about-grid">
          <div className="settings-stat-tile">
            <span>{t('当前运行版本')}</span>
            <strong>{info.version}</strong>
            <small>{modeLabel}</small>
          </div>
          <div className="settings-stat-tile">
            <span>{t('SQLite 数据库体积')}</span>
            <strong>{formatBytes(info.dbSizeBytes)}</strong>
            <small>{t('WAL 事务安全存储')}</small>
          </div>
          <div className="settings-stat-tile">
            <span>{t('已纳管资产总数')}</span>
            <strong>{totalAssets}</strong>
            <small>{t('{count} 个云平台同步连接', { count: info.integrationsCount })}</small>
          </div>
        </div>
      </section>

      <section className="settings-backup-cards">
        <div className="settings-backup-card">
          <div className="settings-backup-icon is-db">
            <Database size={20} />
          </div>
          <div className="settings-backup-meta">
            <h4>{t('SQLite 在线完整快照 (.db)')}</h4>
            <p>{t('通过 VACUUM INTO 在线生成事务一致的单文件数据库备份，包含加密保险箱密文与全部关联拓扑，可直接用于灾备迁移与恢复。')}</p>
            <Button
              type="primary"
              icon={<Download size={14} />}
              loading={downloading === 'sqlite'}
              onClick={() => { void handleDownload('sqlite'); }}
            >
              {t('下载 SQLite 在线快照 (.db)')}
            </Button>
          </div>
        </div>

        <div className="settings-backup-card">
          <div className="settings-backup-icon is-json">
            <FileJson size={20} />
          </div>
          <div className="settings-backup-meta">
            <h4>{t('JSON 结构化资产清单 (.json)')}</h4>
            <p>{t('导出人类可读的开放 JSON 台账（含订阅、账号、域名、服务器、IP 与汇率偏好，自动剔除敏感密钥），便于离线归档与二次审计。')}</p>
            <Button
              icon={<Download size={14} />}
              loading={downloading === 'json'}
              onClick={() => { void handleDownload('json'); }}
            >
              {t('导出 JSON 资产清单 (.json)')}
            </Button>
          </div>
        </div>
      </section>

      <section className="settings-section-card">
        <div className="settings-update-strip">
          <div className="settings-update-meta">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              {updateInfo?.hasUpdate ? <Sparkles size={15} className="text-emerald-600" /> : <CheckCircle2 size={15} className="text-emerald-600" />}
              {updateInfo?.hasUpdate
                ? t('发现可用新版本 {v}', { v: updateInfo.latestVersion })
                : t('实例版本状态正常 ({v})', { v: info.version })}
            </span>
            <span>
              {updateInfo?.checkedAt
                ? t('最近检查：{time}', { time: dayjs(updateInfo.checkedAt).format('MM-DD HH:mm') })
                : t('支持从 GitHub Releases 检查更新与安全回滚（亦可在左下角版本徽章查看详情）')}
            </span>
          </div>
          <div className="inline-flex items-center gap-2 shrink-0">
            <Button
              size="small"
              icon={<RefreshCw size={13} />}
              loading={checkMut.isPending}
              onClick={() => checkMut.mutate()}
            >
              {t('检查更新')}
            </Button>
            {updateInfo?.hasUpdate && info.canSelfUpdate && (
              <Button
                size="small"
                type="primary"
                icon={<ArrowUpCircle size={13} />}
                loading={upgrading}
                onClick={() => { void handleSelfUpdate(); }}
              >
                {t('一键升级')}
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
