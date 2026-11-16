import {
  accountsOptions,
  authOptions,
  authSessionsOptions,
  currencies,
  fetchLiveRates,
  healthOptions,
  integrationsOptions,
  type Preferences,
  preferencesOptions,
  revokeOtherSessions,
  revokeSession,
  savePreferences,
  type SessionInfo,
  updateAdminPassword,
} from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import {
  Bell,
  CheckCircle2,
  Cloud,
  Info,
  Laptop,
  LogOut,
  Moon,
  RefreshCw,
  Settings,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import type { Translate } from '../../app/messages';
import { usePreferences } from '../../app/preferences-context';
import type { SettingsTab } from '../../layouts/workspace-context';
import { errorMessage } from '../../shared/errors';
import { Loading, QueryError } from '../../shared/feedback';
import { ProviderSyncPanel } from '../integrations/provider-sync-modal';
import { SettingsAutomationTab, SettingsBackupAboutTab } from './settings-automation-backup';

const FOREIGN_CURRENCIES = ['USD', 'EUR', 'GBP', 'HKD', 'JPY'] as const;

const CURRENCY_LABELS: Record<Preferences['baseCurrency'], string> = {
  CNY: 'CNY (¥)',
  USD: 'USD ($)',
  EUR: 'EUR (€)',
  GBP: 'GBP (£)',
  HKD: 'HKD (HK$)',
  JPY: 'JPY (¥)',
};

function parseSessionDevice(ua: string, t: Translate): { label: string; mobile: boolean } {
  if (!ua) return { label: t('未知客户端'), mobile: false };
  const lower = ua.toLowerCase();
  const mobile = /iphone|ipad|android|mobile/.test(lower);
  const os = /iphone|ipad/.test(lower)
    ? 'iOS'
    : /mac os x|macintosh/.test(lower)
      ? 'macOS'
      : /windows/.test(lower)
        ? 'Windows'
        : /android/.test(lower)
          ? 'Android'
          : /linux/.test(lower)
            ? 'Linux'
            : 'Web';
  const browser = /edg\//.test(lower)
    ? 'Edge'
    : /chrome\//.test(lower) && !/edg\//.test(lower)
      ? 'Chrome'
      : /firefox\//.test(lower)
        ? 'Firefox'
        : /safari\//.test(lower) && !/chrome\//.test(lower)
          ? 'Safari'
          : /curl\//.test(lower)
            ? 'curl'
            : 'Browser';
  return { label: `${os} · ${browser}`, mobile };
}

export function SettingsModal({
  initialTab = 'preferences',
  onClose,
}: {
  initialTab?: SettingsTab;
  onClose: () => void;
}) {
  const { t } = usePreferences();
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  const health = useQuery(healthOptions);
  const integrations = useQuery(integrationsOptions);
  const accounts = useQuery(accountsOptions);

  const versionText = health.data?.version
    ? (health.data.version.startsWith('v') ? health.data.version : `v${health.data.version}`)
    : '';
  const integrationsCount = integrations.data?.items.length ?? 0;

  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      closable={false}
      width={860}
      className="settings-center-modal"
      styles={{
        container: { padding: 0, overflow: 'hidden', borderRadius: 22 },
        body: { padding: 0 },
      }}
    >
      <div className="settings-modal-shell" role="dialog" aria-label={t('系统设置')}>
        <aside className="settings-modal-rail">
          <div className="settings-rail-brand">
            <h2>{t('系统设置')}</h2>
            <p>{t('实例偏好与安全维护')}</p>
          </div>

          <div className="settings-rail-nav" role="tablist" aria-label={t('设置分类')}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'preferences'}
              className={`settings-nav-item ${tab === 'preferences' ? 'is-active' : ''}`}
              onClick={() => setTab('preferences')}
            >
              <Settings size={16} />
              <span>{t('偏好与汇率')}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={tab === 'security'}
              className={`settings-nav-item ${tab === 'security' ? 'is-active' : ''}`}
              onClick={() => setTab('security')}
            >
              <ShieldCheck size={16} />
              <span>{t('账号与安全')}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={tab === 'integrations'}
              className={`settings-nav-item ${tab === 'integrations' ? 'is-active' : ''}`}
              onClick={() => setTab('integrations')}
            >
              <Cloud size={16} />
              <span>{t('云平台连接')}</span>
              {integrationsCount > 0 && (
                <span className="settings-nav-badge is-emerald">{integrationsCount}</span>
              )}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={tab === 'automation'}
              className={`settings-nav-item ${tab === 'automation' ? 'is-active' : ''}`}
              onClick={() => setTab('automation')}
            >
              <Bell size={16} />
              <span>{t('通知与自动化')}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={tab === 'backup'}
              className={`settings-nav-item ${tab === 'backup' ? 'is-active' : ''}`}
              onClick={() => setTab('backup')}
            >
              <Info size={16} />
              <span className="settings-nav-backup-label">
                <span>{t('数据备份与关于')}</span>
                {versionText && <small className="settings-version-chip">{versionText}</small>}
              </span>
            </button>
          </div>
        </aside>

        <div className="settings-modal-main">
          <button
            type="button"
            className="settings-close-btn"
            aria-label={t('关闭')}
            onClick={onClose}
          >
            <X size={17} />
          </button>

          <div className="settings-modal-scroll">
            {tab === 'preferences' && <PreferencesRatesPane onClose={onClose} />}
            {tab === 'security' && <SecuritySessionsPane />}
            {tab === 'integrations' && (
              <div className="settings-pane-stack">
                <div className="settings-pane-header">
                  <div>
                    <h3>{t('云平台连接')}</h3>
                    <p className="settings-pane-sub">{t('集中管理只读 API 凭据，一键拉取域名、DNS 记录、服务器与网格 IP')}</p>
                  </div>
                </div>
                <ProviderSyncPanel
                  active
                  scope="all"
                  accounts={accounts.data?.items ?? []}
                  cancelLabel={t('关闭')}
                  onCancel={onClose}
                />
              </div>
            )}
            {tab === 'automation' && <SettingsAutomationTab onClose={onClose} />}
            {tab === 'backup' && <SettingsBackupAboutTab />}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function PreferencesRatesPane({ onClose }: { onClose: () => void }) {
  const { t, locale, setLocale, mode, setMode } = usePreferences();
  const query = useQuery(preferencesOptions);

  if (query.isError) {
    return (
      <QueryError
        title={t('无法加载偏好')}
        error={query.error}
        retry={() => { void query.refetch(); }}
      />
    );
  }
  if (!query.data) {
    return <Loading />;
  }

  return (
    <PreferencesRatesForm
      value={query.data}
      locale={locale}
      setLocale={setLocale}
      mode={mode}
      setMode={setMode}
      onClose={onClose}
    />
  );
}

function PreferencesRatesForm({
  value,
  locale,
  setLocale,
  mode,
  setMode,
  onClose,
}: {
  value: Preferences;
  locale: 'zh-CN' | 'en-US';
  setLocale: (loc: 'zh-CN' | 'en-US') => void;
  mode: 'light' | 'dark';
  setMode: (m: 'light' | 'dark') => void;
  onClose: () => void;
}) {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const client = useQueryClient();
  const [form] = Form.useForm<Preferences>();

  useEffect(() => {
    form.setFieldsValue(value);
  }, [form, value]);

  const save = useMutation({
    mutationFn: (vals: Preferences) => savePreferences({
      baseCurrency: vals.baseCurrency,
      rates: {
        ...vals.rates,
        CNY: 1,
      },
    }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['preferences'] });
      void message.success(t('偏好已保存'));
      onClose();
    },
  });

  const liveFetch = useMutation({
    mutationFn: () => fetchLiveRates({
      baseCurrency: form.getFieldValue('baseCurrency') ?? value.baseCurrency,
      persist: true,
    }),
    onSuccess: async (res) => {
      form.setFieldsValue({
        baseCurrency: res.baseCurrency,
        rates: res.rates,
      });
      await client.invalidateQueries({ queryKey: ['preferences'] });
      void message.success(t('已同步最新参考汇率 ({source})', { source: res.source }));
    },
    onError: (err) => {
      void message.error(errorMessage(err, locale));
    },
  });

  const updatedLabel = value.ratesUpdatedAt
    ? t('更新于 {time}', { time: dayjs(value.ratesUpdatedAt).format('YYYY-MM-DD HH:mm') })
    : t('默认参考汇率 · 支持一键实时拉取');

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={value}
      onFinish={vals => save.mutate(vals)}
      disabled={save.isPending}
      requiredMark={false}
      className="settings-pane-stack"
    >
      <div className="settings-pane-header">
        <h3>{t('偏好与汇率')}</h3>
      </div>

      <section className="settings-appearance-section">
        <h4>{t('界面与外观')}</h4>
        <div className="settings-inline-row">
          <span className="settings-inline-label">{t('外观主题')}</span>
          <div className="settings-theme-segmented" role="group" aria-label={t('外观主题')}>
            <button
              type="button"
              className={`settings-theme-pill ${mode === 'light' ? 'is-active' : ''}`}
              aria-pressed={mode === 'light'}
              onClick={() => setMode('light')}
            >
              <Sun size={14} />
              <span>{t('浅色')}</span>
            </button>
            <button
              type="button"
              className={`settings-theme-pill ${mode === 'dark' ? 'is-active' : ''}`}
              aria-pressed={mode === 'dark'}
              onClick={() => setMode('dark')}
            >
              <Moon size={14} />
              <span>{t('暗黑')}</span>
            </button>
          </div>
        </div>

        <div className="settings-inline-row">
          <span className="settings-inline-label">{t('界面语言')}</span>
          <Select
            value={locale}
            onChange={val => setLocale(val)}
            style={{ width: 236 }}
            options={[
              { value: 'zh-CN', label: '简体中文' },
              { value: 'en-US', label: 'English' },
            ]}
          />
        </div>
      </section>

      <div className="settings-divider" />

      <section className="settings-fx-section">
        <h4>{t('基准货币与实时汇率')}</h4>

        {save.isError && <Alert type="error" title={errorMessage(save.error, locale)} className="mb-3" />}

        <div className="settings-fx-card">
          <div className="settings-fx-top">
            <div className="settings-fx-base">
              <span>{t('基准货币')}</span>
              <Form.Item name="baseCurrency" noStyle>
                <Select
                  aria-label={t('本位币')}
                  style={{ width: 152 }}
                  options={currencies.map(cur => ({ value: cur, label: CURRENCY_LABELS[cur] }))}
                />
              </Form.Item>
            </div>

            <div className="settings-fx-sync">
              <small>{updatedLabel}</small>
              <Button
                type="primary"
                icon={<RefreshCw size={14} className={liveFetch.isPending ? 'animate-spin' : ''} />}
                loading={liveFetch.isPending}
                onClick={() => liveFetch.mutate()}
              >
                {t('一键拉取实时汇率')}
              </Button>
            </div>
          </div>

          <Form.Item name={['rates', 'CNY']} hidden>
            <InputNumber />
          </Form.Item>

          <div className="settings-fx-grid">
            {FOREIGN_CURRENCIES.map(currency => (
              <Form.Item
                key={currency}
                label={currency}
                name={['rates', currency]}
                className="mb-0"
                rules={[
                  { required: true, message: t('请输入汇率') },
                  { type: 'number', min: 0.000001, max: 1000000, message: t('请输入大于 0 的有效汇率') },
                ]}
              >
                <InputNumber
                  min={0.000001}
                  max={1000000}
                  precision={4}
                  className="w-full"
                />
              </Form.Item>
            ))}
          </div>

          <div className="settings-fx-note">
            <CheckCircle2 size={15} />
            <span>{t('以上为 1 单位外币折合人民币汇率 · 自动折算月度/年度总支出，修改后即时生效')}</span>
          </div>
        </div>
      </section>

      <div className="settings-pane-footer">
        <Button onClick={onClose}>{t('取消')}</Button>
        <Button type="primary" htmlType="submit" loading={save.isPending}>
          {t('保存更改')}
        </Button>
      </div>
    </Form>
  );
}

function SecuritySessionsPane() {
  const { t, locale } = usePreferences();
  const { message, modal } = App.useApp();
  const client = useQueryClient();

  const auth = useQuery(authOptions);
  const sessionsQuery = useQuery(authSessionsOptions);

  const currentUsername = auth.data?.user?.username ?? '';
  const [editedUsername, setEditedUsername] = useState<string | null>(null);
  const username = editedUsername ?? currentUsername;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revokeOthers, setRevokeOthers] = useState(true);

  const pwdMut = useMutation({
    mutationFn: () => {
      if (newPassword && newPassword !== confirmPassword) {
        throw new Error(t('两次输入的新密码不一致'));
      }
      return updateAdminPassword({
        username: username.trim(),
        currentPassword,
        newPassword,
        revokeOtherSessions: revokeOthers,
      });
    },
    onSuccess: async (res) => {
      setEditedUsername(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['auth'] }),
        client.invalidateQueries({ queryKey: ['auth-sessions'] }),
      ]);
      void message.success(
        res.revokedSessions > 0
          ? t('管理员凭据已更新，并已下线其他 {count} 个会话', { count: res.revokedSessions })
          : t('管理员凭据已更新'),
      );
    },
    onError: (err) => {
      void message.error(errorMessage(err, locale));
    },
  });

  const revokeOthersMut = useMutation({
    mutationFn: revokeOtherSessions,
    onSuccess: async (res) => {
      await client.invalidateQueries({ queryKey: ['auth-sessions'] });
      void message.success(t('已清理 {count} 个其他登录会话', { count: res.revoked }));
    },
    onError: (err) => {
      void message.error(errorMessage(err, locale));
    },
  });

  const revokeOneMut = useMutation({
    mutationFn: (id: string) => revokeSession(id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['auth-sessions'] });
      void message.success(t('该会话已强制下线'));
    },
    onError: (err) => {
      void message.error(errorMessage(err, locale));
    },
  });

  const sessions: SessionInfo[] = sessionsQuery.data?.items ?? [];
  const otherCount = sessions.filter(s => !s.current).length;

  return (
    <div className="settings-pane-stack">
      <div className="settings-pane-header">
        <div>
          <h3>{t('账号与安全')}</h3>
          <p className="settings-pane-sub">{t('修改管理员登录凭据并审计当前活跃设备会话')}</p>
        </div>
      </div>

      <section className="settings-section-card">
        <div className="settings-section-head">
          <span className="settings-section-title">{t('修改管理员用户名与密码')}</span>
        </div>

        <div className="settings-security-grid">
          <div>
            <label className="settings-field-label">{t('管理员用户名')}</label>
            <Input
              value={username}
              onChange={e => setEditedUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="settings-field-label">{t('当前密码（必填验证）')}</label>
            <Input.Password
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder={t('输入当前登录密码')}
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="settings-field-label">{t('新密码（至少 8 位）')}</label>
            <Input.Password
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder={t('输入新密码（若仅改用户名可留空）')}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="settings-field-label">{t('确认新密码')}</label>
            <Input.Password
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder={t('再次输入新密码')}
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="settings-security-actions">
          <Checkbox checked={revokeOthers} onChange={e => setRevokeOthers(e.target.checked)}>
            {t('保存后自动注销其他设备会话')}
          </Checkbox>
          <Button
            type="primary"
            disabled={!currentPassword || (!newPassword && username.trim() === currentUsername)}
            loading={pwdMut.isPending}
            onClick={() => pwdMut.mutate()}
          >
            {t('更新凭据')}
          </Button>
        </div>
      </section>

      <section className="settings-section-card">
        <div className="settings-section-head">
          <span className="settings-section-title">
            {`${t('活跃登录会话')} (${sessions.length})`}
          </span>
          <Button
            size="small"
            danger
            icon={<Trash2 size={13} />}
            disabled={otherCount === 0}
            loading={revokeOthersMut.isPending}
            onClick={() => {
              modal.confirm({
                title: t('确认清理其他设备会话？'),
                content: t('除当前浏览器外，其余 {count} 个活跃登录会话将立即失效。', { count: otherCount }),
                okButtonProps: { danger: true },
                onOk: () => revokeOthersMut.mutateAsync(),
              });
            }}
          >
            {t('清理其他会话')}
          </Button>
        </div>

        {sessionsQuery.isPending
          ? <Loading />
          : (
              <div className="settings-session-list">
                {sessions.map((sess) => {
                  const dev = parseSessionDevice(sess.userAgent, t);
                  return (
                    <div key={sess.id} className={`settings-session-row ${sess.current ? 'is-current' : ''}`}>
                      <div className="settings-session-icon">
                        {dev.mobile ? <Smartphone size={16} /> : <Laptop size={16} />}
                      </div>
                      <div className="settings-session-meta">
                        <div className="settings-session-title">
                          <strong>{dev.label}</strong>
                          {sess.current && <span className="settings-current-pill">{t('当前会话')}</span>}
                        </div>
                        <span>
                          {`IP: ${sess.ipAddress || '127.0.0.1'}`}
                          {sess.lastSeenAt ? ` · ${t('活跃于')} ${dayjs(sess.lastSeenAt).format('MM-DD HH:mm')}` : ''}
                        </span>
                      </div>
                      {!sess.current && (
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<LogOut size={13} />}
                          loading={revokeOneMut.isPending && revokeOneMut.variables === sess.id}
                          onClick={() => revokeOneMut.mutate(sess.id)}
                        >
                          {t('下线')}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
      </section>
    </div>
  );
}
