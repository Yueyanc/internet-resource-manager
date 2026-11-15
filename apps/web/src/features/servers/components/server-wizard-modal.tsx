import {
  accountsOptions,
  createServerEnrollToken,
  domainsOptions,
  getServerEnrollTokenStatus,
  importServerSnapshot,
  ipsOptions,
  saveServer,
  type ServerHost,
  type ServerInput,
  type SubscriptionInput,
  subscriptionsOptions,
} from '@irm/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Collapse,
  Form,
  Input,
  Modal,
  Select,
  Switch,
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import {
  Activity,
  CheckCircle2,
  Copy,
  FileCode2,
  PenLine,
  RefreshCw,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { useRef, useState } from 'react';

import { usePreferences } from '../../../app/preferences-context';
import { errorMessage } from '../../../shared/errors';
import {
  findServerPreset,
  type ServerPreset,
  type ServerPresetPlan,
  serverPresets,
} from '../presets/server-presets';
import {
  buildDaemonInstallCommand,
  buildLocalSshPipeCommand,
  buildZeroCallbackProbeCommand,
  isLoopbackEndpointUrl,
} from '../utils/probe-command';
import {
  extractUserAndPortFromEndpoint,
  formatSpecSummary,
  parseSmartEndpoint,
  serverKindMeta,
} from '../utils/server-metrics';
import {
  type ServerBillingMode,
  ServerPropertySheet,
} from './server-composer-parts';
import { ServerMark } from './server-mark';

type ManualFormValues = Omit<ServerInput, 'presetKey' | 'expireDate' | 'archived' | 'createSubscription'> & {
  smartEndpoint: string;
  billingMode: ServerBillingMode;
  expireDate?: Dayjs;
  subName?: string;
  subAmount?: number;
  subCurrency: SubscriptionInput['currency'];
  subCycle: SubscriptionInput['cycle'];
  subIntervalDays?: number;
  subDueDate?: Dayjs;
  subRenewalMode: SubscriptionInput['renewalMode'];
  subIntention: SubscriptionInput['intention'];
  subRenewalAmount?: number;
  subPaymentMethod?: string;
};

function nextCycleDayjs(cycle: 'monthly' | 'quarterly' | 'yearly'): Dayjs {
  if (cycle === 'yearly') return dayjs().add(1, 'year');
  if (cycle === 'quarterly') return dayjs().add(3, 'month');
  return dayjs().add(1, 'month');
}

function ServerWizardBody({
  targetServer,
  onClose,
  onEditEnrolled,
}: {
  targetServer?: ServerHost;
  onClose: () => void;
  onEditEnrolled?: (server: ServerHost) => void;
}) {
  const { t, locale } = usePreferences();
  const [form] = Form.useForm<ManualFormValues>();
  const client = useQueryClient();
  const { message } = App.useApp();

  const [entryMode, setEntryMode] = useState<'agent' | 'manual'>('agent');
  const [agentSubMode, setAgentSubMode] = useState<'daemon' | 'snapshot'>('daemon');
  const [endpointUrl, setEndpointUrl] = useState(() => window.location.origin);
  const [dockerEnabled, setDockerEnabled] = useState(false);
  const [agentNameHint, setAgentNameHint] = useState('');
  const [committedNameHint, setCommittedNameHint] = useState('');
  const [presetKey, setPresetKey] = useState(targetServer?.presetKey ?? '');
  const [planId, setPlanId] = useState('');
  const [tokenNonce, setTokenNonce] = useState(0);
  const [snapshotText, setSnapshotText] = useState('');
  const [sshTarget, setSshTarget] = useState(() => {
    if (!targetServer) return '';
    const host = targetServer.ipv4 || targetServer.privateIp || targetServer.ipv6 || targetServer.hostname;
    const user = targetServer.sshUser || 'root';
    return host ? `${user}@${host}` : '';
  });
  const [showSshPipe, setShowSshPipe] = useState(false);
  const [importedServer, setImportedServer] = useState<ServerHost | null>(null);
  const invalidatedRef = useRef<string>('');

  const effectiveMode = targetServer ? 'agent' : entryMode;

  const subsQuery = useQuery({ ...subscriptionsOptions, enabled: effectiveMode === 'manual' });
  const accountsQuery = useQuery({ ...accountsOptions, enabled: effectiveMode === 'manual' });
  const domainsQuery = useQuery({ ...domainsOptions, enabled: effectiveMode === 'manual' });
  const ipsQuery = useQuery({ ...ipsOptions, enabled: effectiveMode === 'manual' });

  const activeSubscriptions = subsQuery.isSuccess ? subsQuery.data.items.filter(item => !item.archived) : [];
  const activeAccounts = accountsQuery.isSuccess ? accountsQuery.data.items.filter(item => !item.archived) : [];
  const allDomains = domainsQuery.isSuccess ? domainsQuery.data.items : [];
  const activeIps = ipsQuery.isSuccess ? ipsQuery.data.items.filter(item => !item.archived) : [];

  const needEnrollToken = effectiveMode === 'agent'
    && !importedServer
    && (agentSubMode === 'daemon' || showSshPipe);

  const enrollTokenQuery = useQuery({
    queryKey: [
      'server-enroll-token',
      targetServer?.id ?? 'new',
      dockerEnabled,
      presetKey,
      committedNameHint,
      tokenNonce,
    ],
    queryFn: () =>
      createServerEnrollToken({
        targetServerId: targetServer?.id,
        nameHint: committedNameHint,
        presetKey,
        dockerEnabled,
      }),
    enabled: needEnrollToken,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const activeTokenId = enrollTokenQuery.data?.id;

  const tokenStatusQuery = useQuery({
    queryKey: ['server-enroll-token-status', activeTokenId],
    queryFn: async ({ signal }) => {
      const status = await getServerEnrollTokenStatus(activeTokenId!, signal);
      if (status.status === 'used' && status.server && invalidatedRef.current !== status.id) {
        invalidatedRef.current = status.id;
        await client.invalidateQueries({ queryKey: ['servers'] });
        await client.invalidateQueries({ queryKey: ['ips'] });
        await client.invalidateQueries({ queryKey: ['nav-counts'] });
      }
      return status;
    },
    enabled: effectiveMode === 'agent' && Boolean(activeTokenId) && !importedServer,
    refetchInterval: query => (query.state.data?.status === 'pending' || !query.state.data ? 2000 : false),
    retry: false,
  });

  const enrolledServer = importedServer
    ?? (tokenStatusQuery.data?.status === 'used' ? tokenStatusQuery.data.server : null);

  const importMutation = useMutation({
    mutationFn: () =>
      importServerSnapshot({
        payload: snapshotText,
        targetServerId: targetServer?.id,
        nameHint: agentNameHint.trim(),
        presetKey,
      }),
    onSuccess: async (saved) => {
      await client.invalidateQueries({ queryKey: ['servers'] });
      await client.invalidateQueries({ queryKey: ['ips'] });
      await client.invalidateQueries({ queryKey: ['nav-counts'] });
      setImportedServer(saved);
      void message.success(t(targetServer ? '快照已更新至当前服务器' : '快照解析成功，服务器已自动建档'));
    },
  });

  const manualMutation = useMutation({
    mutationFn: (input: ServerInput) => saveServer(input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['servers'] });
      await client.invalidateQueries({ queryKey: ['subscriptions'] });
      await client.invalidateQueries({ queryKey: ['ips'] });
      await client.invalidateQueries({ queryKey: ['nav-counts'] });
      void message.success(t('服务器已添加'));
      onClose();
    },
  });

  const selectedPreset = findServerPreset(presetKey);

  const copyCommand = async (text: string, toastMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      void message.success(toastMsg);
    }
    catch {
      /* Clipboard may be restricted in non-HTTPS contexts. */
    }
  };

  const applyManualPreset = (preset: ServerPreset) => {
    setPresetKey(preset.key);
    const firstPlan = preset.plans?.[0];
    const providerName = locale === 'en-US' ? preset.provider.en : preset.provider.zh;
    const currentName = String(form.getFieldValue('name') ?? '').trim();
    const defaultName = firstPlan?.nameHint ?? `${preset.key.toUpperCase()}-${preset.region}`;
    setPlanId(firstPlan?.id ?? '');

    form.setFieldsValue({
      name: currentName || defaultName,
      provider: providerName,
      kind: preset.kind,
      region: firstPlan?.region ?? preset.region,
      datacenter: firstPlan?.datacenter ?? '',
      os: preset.defaultOs,
      arch: firstPlan?.arch ?? preset.defaultArch ?? 'amd64',
      cpuCores: firstPlan?.cpuCores ?? 2,
      memoryMb: firstPlan?.memoryMb ?? 2048,
      diskGb: firstPlan?.diskGb ?? 40,
      diskType: firstPlan?.diskType ?? 'nvme',
      bandwidthMbps: firstPlan?.bandwidthMbps ?? 1000,
      trafficGb: firstPlan?.trafficGb ?? 1000,
      trafficRule: firstPlan?.trafficRule ?? (preset.kind === 'homelab' || preset.kind === 'nas' ? 'unlimited' : 'both'),
      portNote: firstPlan?.portNote ?? '',
      sshPort: preset.defaultSshPort ?? 22,
      sshUser: preset.defaultSshUser ?? 'root',
      consoleUrl: preset.consoleUrl ?? '',
      ...(firstPlan?.suggestedPrice
        ? {
            subName: defaultName,
            subAmount: firstPlan.suggestedPrice.amount,
            subCurrency: firstPlan.suggestedPrice.currency,
            subCycle: firstPlan.suggestedPrice.cycle,
            subDueDate: nextCycleDayjs(firstPlan.suggestedPrice.cycle),
          }
        : {}),
    });
  };

  const clearManualPreset = () => {
    setPresetKey('');
    setPlanId('');
  };

  const applyPlan = (plan: ServerPresetPlan) => {
    setPlanId(plan.id);
    const hasPrice = Boolean(plan.suggestedPrice);
    form.setFieldsValue({
      name: plan.nameHint,
      region: plan.region,
      datacenter: plan.datacenter ?? '',
      arch: plan.arch ?? selectedPreset?.defaultArch ?? 'amd64',
      cpuCores: plan.cpuCores,
      memoryMb: plan.memoryMb,
      diskGb: plan.diskGb,
      diskType: plan.diskType ?? 'nvme',
      bandwidthMbps: plan.bandwidthMbps,
      trafficGb: plan.trafficGb,
      trafficRule: plan.trafficRule ?? 'both',
      portNote: plan.portNote ?? '',
      ...(hasPrice && plan.suggestedPrice
        ? {
            billingMode: 'create' as const,
            subName: plan.nameHint,
            subAmount: plan.suggestedPrice.amount,
            subCurrency: plan.suggestedPrice.currency,
            subCycle: plan.suggestedPrice.cycle,
            subDueDate: nextCycleDayjs(plan.suggestedPrice.cycle),
          }
        : {}),
    });
  };

  const submitManual = (values: ManualFormValues) => {
    const rawEndpoint = values.smartEndpoint ?? '';
    const smart = parseSmartEndpoint(rawEndpoint);
    const extracted = extractUserAndPortFromEndpoint(rawEndpoint);
    const ipv4 = (values.ipv4 ?? '').trim() || smart.ipv4;
    const ipv6 = (values.ipv6 ?? '').trim() || smart.ipv6;
    const privateIp = (values.privateIp ?? '').trim() || smart.privateIp;
    const hostname = (values.hostname ?? '').trim() || smart.hostname;
    const sshUser = (values.sshUser ?? '').trim() || extracted.sshUser || 'root';
    const sshPort = values.sshPort || extracted.sshPort || 22;

    const createSubscription: SubscriptionInput | undefined = values.billingMode === 'create'
      ? {
          presetKey,
          name: (values.subName ?? '').trim() || values.name.trim(),
          amountMinor: Math.round((values.subAmount ?? 0) * 100),
          currency: values.subCurrency,
          cycle: values.subCycle,
          intervalDays: values.subCycle === 'custom' ? (values.subIntervalDays || 30) : 0,
          dueDate: (values.subDueDate ?? dayjs().add(1, 'year')).format('YYYY-MM-DD'),
          category: 'cloud',
          renewalMode: values.subRenewalMode,
          intention: values.subIntention,
          renewalAmountMinor: Math.round((values.subRenewalAmount ?? 0) * 100),
          accountId: values.accountId ?? '',
          account: '',
          paymentMethod: (values.subPaymentMethod ?? '').trim(),
          managementUrl: (values.consoleUrl ?? '').trim(),
          notes: '',
          archived: false,
        }
      : undefined;

    manualMutation.mutate({
      presetKey,
      name: values.name.trim(),
      hostname,
      provider: (values.provider ?? '').trim(),
      kind: values.kind,
      status: values.status,
      region: (values.region ?? 'HK').trim().toUpperCase(),
      datacenter: (values.datacenter ?? '').trim(),
      os: (values.os ?? '').trim(),
      arch: values.arch,
      cpuCores: values.cpuCores ?? 0,
      memoryMb: values.memoryMb ?? 0,
      diskGb: values.diskGb ?? 0,
      diskType: values.diskType ?? '',
      bandwidthMbps: values.bandwidthMbps ?? 0,
      trafficGb: values.trafficRule === 'unlimited' ? 0 : (values.trafficGb ?? 0),
      trafficRule: values.trafficRule,
      trafficResetDay: values.trafficResetDay ?? 0,
      ipv4,
      ipv6,
      privateIp,
      portNote: (values.portNote ?? '').trim(),
      sshPort,
      sshUser,
      consoleUrl: (values.consoleUrl ?? '').trim(),
      subscriptionId: values.billingMode === 'link' ? (values.subscriptionId ?? '') : '',
      accountId: values.accountId ?? '',
      expireDate: values.billingMode === 'none' && values.expireDate
        ? values.expireDate.format('YYYY-MM-DD')
        : '',
      domainIds: values.domainIds ?? [],
      ipIds: values.ipIds ?? [],
      tags: values.tags ?? [],
      notes: (values.notes ?? '').trim(),
      archived: false,
      createSubscription,
    });
  };

  const rawToken = enrollTokenQuery.data?.token ?? '';
  const daemonCommand = rawToken
    ? buildDaemonInstallCommand(endpointUrl || window.location.origin, rawToken, dockerEnabled)
    : '';
  const probeCommand = buildZeroCallbackProbeCommand(dockerEnabled);
  const sshPipeCommand = rawToken
    ? buildLocalSshPipeCommand(sshTarget, window.location.origin, rawToken)
    : '';
  const loopbackDetected = isLoopbackEndpointUrl(endpointUrl);
  const busy = manualMutation.isPending || importMutation.isPending;

  return (
    <>
      {!targetServer && !enrolledServer && (
        <div className="server-sheet-mode-bar">
          <div className="sub-sheet-segmented" role="radiogroup">
            <button
              type="button"
              role="radio"
              aria-checked={entryMode === 'agent'}
              className={`sub-sheet-seg-item ${entryMode === 'agent' ? 'is-active' : ''}`}
              onClick={() => setEntryMode('agent')}
            >
              {t('探针一键接入')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={entryMode === 'manual'}
              className={`sub-sheet-seg-item ${entryMode === 'manual' ? 'is-active' : ''}`}
              onClick={() => setEntryMode('manual')}
            >
              {t('手动录入')}
            </button>
          </div>
        </div>
      )}

      {enrolledServer && (
        <>
          <div className="server-enrolled-success-card" role="status">
            <div className="server-enrolled-banner">
              <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
              <div>
                <h4>{t('服务器已自动接入并完成建档！')}</h4>
                {enrolledServer.telemetry.mode === 'daemon' && (
                  <p>{t('硬件规格、操作系统、网络地址与归属地已自动填入，后续指标将每 {sec} 秒自动刷新。', { sec: enrolledServer.telemetry.intervalSec || 20 })}</p>
                )}
              </div>
            </div>

            <div className="server-enrolled-preview">
              <ServerMark value={enrolledServer} size="lg" />
              <div className="server-enrolled-meta">
                <div className="account-title-line">
                  <strong>{enrolledServer.name}</strong>
                  <span className="account-region-pill">{enrolledServer.region}</span>
                  <span className={`server-agent-pill is-${enrolledServer.telemetry.agentStatus}`}>
                    {t(enrolledServer.telemetry.agentStatus === 'online' ? '实时在线' : '快照建档')}
                  </span>
                </div>
                <span>
                  {[
                    enrolledServer.provider || t(serverKindMeta[enrolledServer.kind].short),
                    formatSpecSummary(enrolledServer),
                    enrolledServer.os,
                  ].filter(Boolean).join(' · ')}
                </span>
                <div className="account-table-tags mt-1.5">
                  {enrolledServer.ipv4 && <code className="account-identifier">{enrolledServer.ipv4}</code>}
                  {enrolledServer.privateIp && <code className="account-identifier">{enrolledServer.privateIp}</code>}
                  {enrolledServer.telemetry.cpuModel && (
                    <span className="account-mini-tag">{enrolledServer.telemetry.cpuModel}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="sub-sheet-footer">
            <div className="sub-sheet-footer-links" />
            <div className="sub-sheet-footer-actions">
              {onEditEnrolled && (
                <Button
                  icon={<PenLine size={14} />}
                  onClick={() => {
                    onEditEnrolled(enrolledServer);
                    onClose();
                  }}
                >
                  {t('继续补充账单与备注')}
                </Button>
              )}
              <Button type="primary" className="sub-sheet-save-btn" onClick={onClose}>
                {t('完成并查看')}
              </Button>
            </div>
          </div>
        </>
      )}

      {!enrolledServer && effectiveMode === 'agent' && (
        <div className="server-agent-onboarding">
          <div className="server-submode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={agentSubMode === 'daemon'}
              className={`server-submode-tab ${agentSubMode === 'daemon' ? 'is-active' : ''}`}
              onClick={() => setAgentSubMode('daemon')}
            >
              <Activity size={15} />
              <div>
                <strong>{t('常驻监控探针')}</strong>
                <span>{t('一键在服务器执行单行命令，自动采集 CPU/内存/磁盘/IP 并开启实时负载与容器监控。')}</span>
              </div>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={agentSubMode === 'snapshot'}
              className={`server-submode-tab ${agentSubMode === 'snapshot' ? 'is-active' : ''}`}
              onClick={() => setAgentSubMode('snapshot')}
            >
              <FileCode2 size={15} />
              <div>
                <strong>{t('免回连快照采集')}</strong>
                <span>{t('1. 在目标服务器 SSH 终端执行以下只读采集命令（无需安装任何程序，零网络回连）：')}</span>
              </div>
            </button>
          </div>

          {!targetServer && (
            <div className="form-grid mt-3">
              <div className="ant-form-item mb-3">
                <label className="server-mini-label">{t('节点备注名（选填，留空默认使用主机名）')}</label>
                <Input
                  value={agentNameHint}
                  onChange={e => setAgentNameHint(e.target.value)}
                  onBlur={() => {
                    const trimmed = agentNameHint.trim();
                    if (trimmed !== committedNameHint) setCommittedNameHint(trimmed);
                  }}
                  placeholder="Tokyo-Edge-01"
                  maxLength={100}
                />
              </div>
              <div className="ant-form-item mb-3">
                <label className="server-mini-label">{t('预设品牌（选填，留空将按公网 IP ASN 自动识别）')}</label>
                <Select
                  className="w-full"
                  value={presetKey}
                  onChange={val => setPresetKey(val)}
                  showSearch
                  optionFilterProp="label"
                  options={[
                    { value: '', label: t('自动识别') },
                    ...serverPresets.map(p => ({
                      value: p.key,
                      label: locale === 'en-US' ? p.provider.en : p.provider.zh,
                    })),
                  ]}
                />
              </div>
            </div>
          )}

          <div className="server-docker-optin-row">
            <div className="server-docker-optin-label">
              <span>{t('读取 Docker 容器列表（特权接口 · 默认关闭）')}</span>
            </div>
            <Switch
              checked={dockerEnabled}
              aria-label={t('读取 Docker 容器列表（特权接口 · 默认关闭）')}
              onChange={checked => setDockerEnabled(checked)}
            />
          </div>

          {dockerEnabled && (
            <Alert
              type="warning"
              showIcon
              className="mb-3"
              title={t('开启后探针将只读访问 /var/run/docker.sock 获取容器名称、镜像与运行状态；Docker Socket 属于高权限接口，请仅在受信任主机启用。')}
            />
          )}

          {agentSubMode === 'daemon' && (
            <div className="server-daemon-panel">
              <div className="mb-3">
                <label className="server-mini-label">{t('上报地址（服务器需可访问此地址）')}</label>
                <Input
                  value={endpointUrl}
                  aria-label={t('上报地址（服务器需可访问此地址）')}
                  onChange={e => setEndpointUrl(e.target.value)}
                  placeholder="http://100.x.y.z:8787"
                />
                {loopbackDetected && (
                  <div className="server-loopback-hint">
                    <span>{t('当前为本机回环地址。若目标在远端云上，请改为本机的 Tailscale / 组网地址（如 http://100.x.y.z:8787），或切至右侧「免回连快照采集」。')}</span>
                  </div>
                )}
              </div>

              {enrollTokenQuery.isError && (
                <Alert
                  type="error"
                  showIcon
                  className="mb-3"
                  title={errorMessage(enrollTokenQuery.error, locale)}
                />
              )}

              <div className="server-command-card">
                <div className="server-command-header">
                  <span>
                    <Terminal size={14} />
                    {t('在目标服务器终端（root 或普通用户）执行以下单行命令：')}
                  </span>
                  <div className="server-command-actions">
                    <Button
                      size="small"
                      icon={<RefreshCw size={13} />}
                      loading={enrollTokenQuery.isFetching}
                      onClick={() => setTokenNonce(n => n + 1)}
                    >
                      {t('刷新令牌')}
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      icon={<Copy size={13} />}
                      disabled={!daemonCommand}
                      onClick={() => {
                        void copyCommand(daemonCommand, t('已复制一键接入命令'));
                      }}
                    >
                      {t('复制一键接入命令')}
                    </Button>
                  </div>
                </div>
                <pre className="server-command-pre">
                  <code>{daemonCommand || '...'}</code>
                </pre>
              </div>

              {tokenStatusQuery.data?.status === 'expired'
                ? (
                    <Alert
                      type="warning"
                      showIcon
                      className="mt-3"
                      title={t('接入令牌已过期，请点击刷新令牌重新生成。')}
                    />
                  )
                : (
                    <div className="server-waiting-bar" role="status">
                      <span className="server-pulse-dot" />
                      <span>{t('正在等待服务器执行命令回连...（一次性令牌 15 分钟内有效）')}</span>
                    </div>
                  )}
            </div>
          )}

          {agentSubMode === 'snapshot' && (
            <div className="server-snapshot-panel">
              {importMutation.isError && (
                <Alert
                  type="error"
                  showIcon
                  className="mb-3"
                  title={errorMessage(importMutation.error, locale)}
                />
              )}

              <div className="server-command-card mb-3">
                <div className="server-command-header">
                  <span>
                    <Terminal size={14} />
                    {t('1. 在目标服务器 SSH 终端执行以下只读采集命令（无需安装任何程序，零网络回连）：')}
                  </span>
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    icon={<Copy size={13} />}
                    onClick={() => {
                      void copyCommand(probeCommand, t('已复制只读采集命令'));
                    }}
                  >
                    {t('复制只读采集命令')}
                  </Button>
                </div>
                <pre className="server-command-pre is-compact">
                  <code>{probeCommand}</code>
                </pre>
              </div>

              <div>
                <label className="server-mini-label">{t('2. 将终端输出的 IRM1:... 文本粘贴到下方，一键自动建档：')}</label>
                <Input.TextArea
                  rows={3}
                  value={snapshotText}
                  aria-label={t('2. 将终端输出的 IRM1:... 文本粘贴到下方，一键自动建档：')}
                  onChange={e => setSnapshotText(e.target.value)}
                  placeholder={t('粘贴以 IRM1: 开头的快照文本（支持直接粘贴整段终端输出）...')}
                  className="font-mono text-xs"
                />
              </div>

              <Collapse
                ghost
                size="small"
                className="mt-2 server-ssh-pipe-collapse"
                onChange={keys => setShowSshPipe(Array.isArray(keys) ? keys.length > 0 : Boolean(keys))}
                items={[{
                  key: 'ssh-pipe',
                  label: t('进阶：也可在本机终端通过 SSH 管道一行直传（免手动复制结果）'),
                  children: (
                    <div className="pt-1">
                      <div className="flex gap-2 mb-2">
                        <Input
                          size="small"
                          value={sshTarget}
                          onChange={e => setSshTarget(e.target.value)}
                          placeholder="root@154.12.34.56"
                        />
                        <Button
                          size="small"
                          icon={<Copy size={13} />}
                          disabled={!sshPipeCommand}
                          onClick={() => {
                            void copyCommand(sshPipeCommand, t('已复制只读采集命令'));
                          }}
                        >
                          {t('复制')}
                        </Button>
                      </div>
                      <pre className="server-command-pre is-compact">
                        <code>{sshPipeCommand || '...'}</code>
                      </pre>
                    </div>
                  ),
                }]}
              />
            </div>
          )}

          <div className="sub-sheet-footer">
            <div className="sub-sheet-footer-links">
              {!targetServer && (
                <button
                  type="button"
                  disabled={busy}
                  className="sub-sheet-footer-link"
                  onClick={() => setEntryMode('manual')}
                >
                  <span>{t('极简手工录入')}</span>
                </button>
              )}
            </div>
            <div className="sub-sheet-footer-actions">
              <button
                type="button"
                disabled={busy}
                className="sub-sheet-cancel-btn"
                onClick={onClose}
              >
                {t('取消')}
              </button>
              {agentSubMode === 'snapshot' && (
                <Button
                  type="primary"
                  icon={<Sparkles size={15} />}
                  loading={importMutation.isPending}
                  disabled={!snapshotText.trim()}
                  className="sub-sheet-save-btn"
                  onClick={() => importMutation.mutate()}
                >
                  {t('解析快照并自动建档')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {!enrolledServer && effectiveMode === 'manual' && (
        <>
          {manualMutation.isError && (
            <Alert
              type="error"
              showIcon
              title={errorMessage(manualMutation.error, locale)}
              className="mb-3"
            />
          )}

          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            initialValues={{
              name: '',
              smartEndpoint: '',
              hostname: '',
              provider: '',
              kind: 'vps',
              status: 'active',
              region: 'JP',
              datacenter: '',
              os: 'Debian 12',
              arch: 'amd64',
              cpuCores: 2,
              memoryMb: 4096,
              diskGb: 80,
              diskType: 'nvme',
              bandwidthMbps: 1000,
              trafficGb: 2048,
              trafficRule: 'both',
              trafficResetDay: 1,
              ipv4: '',
              ipv6: '',
              privateIp: '',
              portNote: '',
              sshPort: 22,
              sshUser: 'root',
              consoleUrl: '',
              billingMode: 'none',
              subscriptionId: '',
              accountId: '',
              domainIds: [],
              ipIds: [],
              tags: [],
              notes: '',
              subName: '',
              subAmount: 0,
              subCurrency: 'USD',
              subCycle: 'yearly',
              subIntervalDays: 30,
              subDueDate: dayjs().add(1, 'year'),
              subRenewalMode: 'manual',
              subIntention: 'normal',
              subPaymentMethod: '',
            }}
            onFinish={submitManual}
            disabled={manualMutation.isPending}
          >
            <ServerPropertySheet
              form={form}
              presetKey={presetKey}
              planId={planId}
              onSelectPreset={applyManualPreset}
              onSelectPlan={applyPlan}
              onClearPreset={clearManualPreset}
              subscriptions={activeSubscriptions}
              accounts={activeAccounts}
              domains={allDomains}
              ips={activeIps}
              submitting={manualMutation.isPending}
              onCancel={onClose}
            />
          </Form>
        </>
      )}
    </>
  );
}

export function ServerWizardModal({
  open,
  targetServer,
  onClose,
  onEditEnrolled,
}: {
  open: boolean;
  targetServer?: ServerHost;
  onClose: () => void;
  onEditEnrolled?: (server: ServerHost) => void;
}) {
  const { t } = usePreferences();

  return (
    <Modal
      open={open}
      title={targetServer ? t('接入监控探针 · {name}', { name: targetServer.name }) : t('新建服务器')}
      onCancel={onClose}
      width={636}
      centered
      destroyOnHidden
      footer={null}
      className="subscription-sheet-modal server-onboarding-modal"
    >
      {open && (
        <ServerWizardBody
          targetServer={targetServer}
          onClose={onClose}
          onEditEnrolled={onEditEnrolled}
        />
      )}
    </Modal>
  );
}
