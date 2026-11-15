import type { ServerHost } from '@irm/api-client';
import { Button } from 'antd';
import dayjs from 'dayjs';
import {
  ArrowUpDown,
  Check,
  Copy,
  Cpu,
  HardDrive,
  MapPin,
  MemoryStick,
  Wifi,
  Zap,
} from 'lucide-react';

import { usePreferences } from '../../../app/preferences-context';
import {
  buildSshCommand,
  computeTrafficUsage,
  formatBandwidth,
  formatBinaryBytes,
  formatBytePair,
  formatDisk,
  formatMemory,
  formatNetRate,
  formatTrafficBytes,
  formatTrafficQuota,
  formatUptime,
  maskEndpoint,
  osFamilyBadge,
  serverKindMeta,
  shortCpuBadge,
} from '../utils/server-metrics';
import { ServerMark } from './server-mark';

function LoadMiniSpark({ load15, load5, load1, cores }: { load15: number; load5: number; load1: number; cores: number }) {
  const cap = Math.max(1, cores || 1, load15, load5, load1);
  const y = (v: number) => {
    const ratio = Math.min(1, Math.max(0.06, v / cap));
    return Math.round((26 - ratio * 20) * 10) / 10;
  };
  const y15 = y(load15);
  const y5 = y(load5);
  const y1 = y(load1);
  const line = `M 2 ${y15} C 18 ${y15}, 24 ${y5}, 38 ${y5} C 52 ${y5}, 58 ${y1}, 74 ${y1}`;
  const area = `${line} L 74 28 L 2 28 Z`;

  return (
    <svg className="server-load-spark" viewBox="0 0 76 28" aria-hidden="true">
      <defs>
        <linearGradient id="irm-cpu-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#irm-cpu-spark-fill)" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="74" cy={y1} r="2.2" fill="currentColor" />
    </svg>
  );
}

function gaugeTone(pct: number): 'is-ok' | 'is-warn' | 'is-danger' {
  if (pct >= 92) return 'is-danger';
  if (pct >= 80) return 'is-warn';
  return 'is-ok';
}

export function ServerCockpitPassport({
  value,
  masked,
  copiedKey,
  onCopy,
  onConnectAgent,
}: {
  value: ServerHost;
  masked: boolean;
  copiedKey: string | null;
  onCopy: (key: string, text: string, isSsh: boolean) => void;
  onConnectAgent: () => void;
}) {
  const { t, locale } = usePreferences();
  const tel = value.telemetry;
  const sshCommand = buildSshCommand(value);

  const maskedSsh = (() => {
    if (!sshCommand || !masked) return sshCommand;
    const host = value.ipv4 || value.ipv6 || value.privateIp || value.hostname;
    if (!host) return sshCommand;
    return sshCommand.replace(host, maskEndpoint(host));
  })();

  const osBadge = osFamilyBadge(value.os, t(serverKindMeta[value.kind].short));
  const statusLabel = {
    active: '',
    standby: t('冷备待命'),
    maintenance: t('维护调试'),
    retiring: t('计划退役'),
  }[value.status];

  const locationParts = [
    value.region,
    value.datacenter || value.provider || t(serverKindMeta[value.kind].label),
  ].filter(Boolean);

  const archDisplay = value.arch === 'amd64' ? 'x86_64' : value.arch === 'arm64' ? 'ARM64' : value.arch;
  const osParts = [
    value.os,
    tel.kernelVersion ? `Kernel ${tel.kernelVersion.replace(/^Linux\s+/i, '')}` : '',
    archDisplay,
  ].filter(Boolean);

  const lastShort = tel.lastReportedAt ? dayjs(tel.lastReportedAt).format('MM-DD HH:mm') : '—';
  const liveLabel = tel.agentStatus === 'online'
    ? (tel.uptimeSeconds > 0
        ? t('实时在线 · 已运行 {uptime}', { uptime: formatUptime(tel.uptimeSeconds, locale) })
        : t('实时在线'))
    : tel.agentStatus === 'stale'
      ? t('心跳丢失 · 最后上报 {time}', { time: lastShort })
      : tel.agentStatus === 'snapshot'
        ? t('快照建档 · 采集于 {time}', { time: lastShort })
        : t('仅台账登记 · 未接入实时探针');

  // Build secondary copy slots cleanly from available host endpoints
  const endpointSlots: { key: string; label: string; raw: string; display: string; copyLabel: string }[] = [];
  if (value.ipv4) {
    endpointSlots.push({
      key: 'ipv4',
      label: t('公网 IPv4'),
      raw: value.ipv4,
      display: masked ? maskEndpoint(value.ipv4) : value.ipv4,
      copyLabel: t('复制主地址'),
    });
  }
  else if (value.hostname) {
    endpointSlots.push({
      key: 'hostname',
      label: t('主机域名'),
      raw: value.hostname,
      display: masked ? maskEndpoint(value.hostname) : value.hostname,
      copyLabel: t('复制主地址'),
    });
  }

  if (value.privateIp) {
    endpointSlots.push({
      key: 'privateIp',
      label: t('组网 IP'),
      raw: value.privateIp,
      display: masked ? maskEndpoint(value.privateIp) : value.privateIp,
      copyLabel: `${t('复制')} ${t('组网 IP')}`,
    });
  }
  if (value.ipv6) {
    endpointSlots.push({
      key: 'ipv6',
      label: t('公网 IPv6'),
      raw: value.ipv6,
      display: masked ? maskEndpoint(value.ipv6) : value.ipv6,
      copyLabel: `${t('复制')} IPv6`,
    });
  }
  else if (!value.privateIp && value.portNote) {
    endpointSlots.push({
      key: 'portNote',
      label: t('端口映射'),
      raw: value.portNote,
      display: value.portNote,
      copyLabel: t('复制'),
    });
  }
  else if (!value.privateIp && value.ipv4 && value.hostname) {
    endpointSlots.push({
      key: 'hostname',
      label: t('主机域名'),
      raw: value.hostname,
      display: masked ? maskEndpoint(value.hostname) : value.hostname,
      copyLabel: t('复制'),
    });
  }

  // Nameplate values: prefer live hardware measurements when available, fallback to ledger specs
  const cpuTitle = shortCpuBadge(value.cpuCores, tel.cpuModel, value.arch);
  const ramTitle = tel.memoryTotalBytes > 0
    ? formatBinaryBytes(tel.memoryTotalBytes)
    : (formatMemory(value.memoryMb) || '—');
  const diskTitle = tel.rootDiskTotalBytes > 0
    ? `${formatBinaryBytes(tel.rootDiskTotalBytes)}${value.diskType ? ` ${value.diskType.toUpperCase()}` : ''}`
    : (formatDisk(value.diskGb, value.diskType) || '—');
  const bwTitle = [
    formatBandwidth(value.bandwidthMbps),
    value.trafficRule === 'unlimited' ? t('不限流量') : formatTrafficQuota(value.trafficGb),
  ].filter(Boolean).join(' · ') || '—';

  // Telemetry bento computations
  const cpuPct = Math.min(100, Math.max(0, tel.cpuPercent));
  const memPct = tel.memoryTotalBytes > 0
    ? Math.min(100, Math.round((tel.memoryUsedBytes / tel.memoryTotalBytes) * 100))
    : 0;
  const diskPct = tel.rootDiskTotalBytes > 0
    ? Math.min(100, Math.round((tel.rootDiskUsedBytes / tel.rootDiskTotalBytes) * 100))
    : 0;
  const memPair = formatBytePair(tel.memoryUsedBytes, tel.memoryTotalBytes);
  const diskPair = formatBytePair(tel.rootDiskUsedBytes, tel.rootDiskTotalBytes);
  const freeDiskBytes = Math.max(0, tel.rootDiskTotalBytes - tel.rootDiskUsedBytes);
  const traffic = computeTrafficUsage(value);

  const cpuTone = gaugeTone(cpuPct);
  const memTone = gaugeTone(memPct);
  const diskTone = gaugeTone(diskPct);
  const trafficTone = traffic.percent !== null ? gaugeTone(traffic.percent) : 'is-ok';

  return (
    <>
      <section className="server-passport-card" aria-label={t('服务器详情')}>
        <div className="server-passport-identity">
          <div className="server-passport-mark-row">
            <ServerMark value={value} size="lg" />
            <div className="server-passport-badges">
              <span className="server-os-pill">{osBadge}</span>
              {statusLabel && <span className="server-status-pill">{statusLabel}</span>}
              {value.archived && <span className="server-status-pill is-archived">{t('已归档')}</span>}
            </div>
          </div>

          <h2 className="server-passport-title" title={value.name}>{value.name}</h2>

          <div className="server-passport-loc">
            <MapPin size={13} />
            <span>{locationParts.join(' · ')}</span>
          </div>

          <div className={`server-passport-live is-${tel.agentStatus}`}>
            <span className="server-passport-dot" />
            <span>{liveLabel}</span>
          </div>

          {osParts.length > 0 && (
            <div className="server-passport-os" title={osParts.join(' · ')}>
              {osParts.join(' · ')}
            </div>
          )}
        </div>

        <div className="server-passport-slots">
          <div className={`server-passport-slot ${copiedKey === 'ssh' ? 'is-copied' : ''}`}>
            <span className="server-slot-tag">SSH</span>
            {sshCommand
              ? (
                  <>
                    <code className="account-slot-code" title={masked ? undefined : sshCommand}>
                      {maskedSsh}
                    </code>
                    <button
                      type="button"
                      className={`account-copy-pill ${copiedKey === 'ssh' ? 'is-copied' : ''}`}
                      aria-label={t('复制 SSH 命令')}
                      onClick={() => onCopy('ssh', sshCommand, true)}
                    >
                      {copiedKey === 'ssh' ? <Check size={12} /> : <Copy size={12} />}
                      <span>{t(copiedKey === 'ssh' ? '已复制' : '复制')}</span>
                    </button>
                  </>
                )
              : <span className="server-slot-empty">{t('未配置连接地址')}</span>}
          </div>

          {endpointSlots.length > 0
            ? endpointSlots.slice(0, 3).map(slot => (
                <div
                  key={slot.key}
                  className={`server-passport-slot ${copiedKey === slot.key ? 'is-copied' : ''}`}
                >
                  <span className="server-slot-tag">{slot.label}</span>
                  <code className="account-slot-code" title={masked ? undefined : slot.raw}>
                    {slot.display}
                  </code>
                  <button
                    type="button"
                    className={`account-slot-icon-btn ${copiedKey === slot.key ? 'is-copied' : ''}`}
                    aria-label={slot.copyLabel}
                    onClick={() => onCopy(slot.key, slot.raw, false)}
                  >
                    {copiedKey === slot.key ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
              ))
            : (
                <>
                  <div className="server-passport-slot">
                    <span className="server-slot-tag">{t('公网 IPv4')}</span>
                    <span className="server-slot-empty">{t('未分配公网 IPv4')}</span>
                  </div>
                  <div className="server-passport-slot">
                    <span className="server-slot-tag">{t('组网 IP')}</span>
                    <span className="server-slot-empty">{t('未配置组网或 IPv6')}</span>
                  </div>
                </>
              )}

          {endpointSlots.length === 1 && (
            <div className="server-passport-slot">
              <span className="server-slot-tag">{t('组网 IP')}</span>
              <span className="server-slot-empty">{t('未配置组网或 IPv6')}</span>
            </div>
          )}
        </div>

        <div className="server-nameplate">
          <div className="server-nameplate-cell">
            <Cpu size={15} />
            <div>
              <span>{t('处理器')}</span>
              <strong title={tel.cpuModel || undefined}>{cpuTitle}</strong>
            </div>
          </div>
          <div className="server-nameplate-cell">
            <MemoryStick size={15} />
            <div>
              <span>{t('内存')}</span>
              <strong>{ramTitle}</strong>
            </div>
          </div>
          <div className="server-nameplate-cell">
            <HardDrive size={15} />
            <div>
              <span>{t('存储')}</span>
              <strong>{diskTitle}</strong>
            </div>
          </div>
          <div className="server-nameplate-cell">
            <Wifi size={15} />
            <div>
              <span>{t('带宽配额')}</span>
              <strong>{bwTitle}</strong>
            </div>
          </div>
        </div>
      </section>

      {tel.agentStatus === 'none'
        ? (
            <section className="server-cockpit-connect-cta">
              <div className="server-cockpit-connect-copy">
                <span className="server-bento-icon is-accent"><Zap size={16} /></span>
                <div>
                  <strong>{t('接入监控探针')}</strong>
                  <p>{t('一键在服务器执行单行命令，自动采集 CPU/内存/磁盘/IP 并开启实时负载与容器监控。')}</p>
                </div>
              </div>
              <Button type="primary" icon={<Zap size={14} />} onClick={onConnectAgent}>
                {t('接入监控探针')}
              </Button>
            </section>
          )
        : (
            <section className="server-bento-grid" aria-label={t('实时负载与遥测')}>
              <article className="server-bento-card">
                <div className="server-bento-head">
                  <div className="server-bento-title">
                    <span className="server-bento-icon"><Cpu size={14} /></span>
                    <span>{t('处理器负载')}</span>
                  </div>
                  {tel.tcpConnections > 0 && (
                    <span className="server-bento-meta-chip">{t('连接数 {count}', { count: tel.tcpConnections })}</span>
                  )}
                </div>

                <div className="server-bento-metric-row">
                  <strong className="server-bento-big">{`${tel.cpuPercent.toFixed(1)}%`}</strong>
                  <LoadMiniSpark
                    load15={tel.load15}
                    load5={tel.load5}
                    load1={tel.load1}
                    cores={value.cpuCores}
                  />
                </div>

                <div className="server-bento-bar" aria-hidden="true">
                  <span
                    className={`server-bento-bar-fill ${cpuTone}`}
                    style={{ width: `${Math.min(100, Math.max(cpuPct > 0 ? 3 : 0, Math.round(cpuPct)))}%` }}
                  />
                </div>

                <div className="server-bento-foot" title={tel.cpuModel || undefined}>
                  <span>{`Load ${tel.load1.toFixed(2)} / ${tel.load5.toFixed(2)} / ${tel.load15.toFixed(2)}`}</span>
                  {tel.cpuModel && <span className="server-bento-foot-sub">{tel.cpuModel}</span>}
                </div>
              </article>

              <article className="server-bento-card">
                <div className="server-bento-head">
                  <div className="server-bento-title">
                    <span className="server-bento-icon"><MemoryStick size={14} /></span>
                    <span>{t('内存占用')}</span>
                  </div>
                </div>

                <div className="server-bento-metric-row">
                  <div className="server-bento-pair">
                    <strong className="server-bento-big">{memPair.used}</strong>
                    <span>{`/ ${memPair.total}`}</span>
                  </div>
                  <span className={`server-bento-pct ${memTone}`}>{`${memPct}%`}</span>
                </div>

                <div className="server-bento-bar" aria-hidden="true">
                  <span
                    className={`server-bento-bar-fill ${memTone}`}
                    style={{ width: `${Math.min(100, Math.max(memPct > 0 ? 3 : 0, memPct))}%` }}
                  />
                </div>

                <div className="server-bento-foot">
                  <span>
                    {tel.swapTotalBytes > 0
                      ? `Swap ${formatBinaryBytes(tel.swapUsedBytes)} / ${formatBinaryBytes(tel.swapTotalBytes)}`
                      : t('未启用 Swap 交换分区')}
                  </span>
                </div>
              </article>

              <article className="server-bento-card">
                <div className="server-bento-head">
                  <div className="server-bento-title">
                    <span className="server-bento-icon"><HardDrive size={14} /></span>
                    <span>{t('根分区存储')}</span>
                  </div>
                </div>

                <div className="server-bento-metric-row">
                  <div className="server-bento-pair">
                    <strong className="server-bento-big">{diskPair.used}</strong>
                    <span>{`/ ${diskPair.total}`}</span>
                  </div>
                  <span className={`server-bento-pct ${diskTone}`}>{`${diskPct}%`}</span>
                </div>

                <div className="server-bento-bar" aria-hidden="true">
                  <span
                    className={`server-bento-bar-fill ${diskTone}`}
                    style={{ width: `${Math.min(100, Math.max(diskPct > 0 ? 3 : 0, diskPct))}%` }}
                  />
                </div>

                <div className="server-bento-foot">
                  <span>
                    {[
                      value.diskType ? value.diskType.toUpperCase() : '',
                      tel.rootDiskTotalBytes > 0 ? t('剩余 {free}', { free: formatBinaryBytes(freeDiskBytes) }) : '',
                    ].filter(Boolean).join(' · ') || '—'}
                  </span>
                </div>
              </article>

              <article className="server-bento-card">
                <div className="server-bento-head">
                  <div className="server-bento-title">
                    <span className="server-bento-icon"><ArrowUpDown size={14} /></span>
                    <span>{t('实时速率与周期流量')}</span>
                  </div>
                </div>

                <div className="server-bento-metric-row">
                  {tel.agentStatus === 'snapshot'
                    ? (
                        <div className="server-bento-rates">
                          <em className="is-rx">↓</em>
                          <strong>{formatTrafficBytes(tel.trafficRxBytes)}</strong>
                          <span className="server-rate-sep">·</span>
                          <em className="is-tx">↑</em>
                          <strong>{formatTrafficBytes(tel.trafficTxBytes)}</strong>
                        </div>
                      )
                    : (
                        <div className="server-bento-rates">
                          <em className="is-rx">↓</em>
                          <strong>{formatNetRate(tel.netRxBps)}</strong>
                          <span className="server-rate-sep">·</span>
                          <em className="is-tx">↑</em>
                          <strong>{formatNetRate(tel.netTxBps)}</strong>
                        </div>
                      )}
                </div>

                <div className="server-bento-bar" aria-hidden="true">
                  <span
                    className={`server-bento-bar-fill ${trafficTone}`}
                    style={{
                      width: traffic.percent !== null
                        ? `${Math.min(100, Math.max(traffic.usedBytes > 0 ? 3 : 0, Math.round(traffic.percent)))}%`
                        : `${traffic.usedBytes > 0 ? 18 : 0}%`,
                    }}
                  />
                </div>

                <div className="server-bento-foot">
                  <span>
                    {traffic.percent !== null
                      ? `${t('本月已用 {used}', { used: formatTrafficBytes(traffic.usedBytes) })} / ${formatTrafficQuota(value.trafficGb)} (${Math.round(traffic.percent)}%)`
                      : t('累计流量 {used}', { used: formatTrafficBytes(traffic.usedBytes) })}
                  </span>
                  {value.trafficResetDay > 0 && (
                    <span className="server-bento-foot-right">
                      {t('每月 {day} 日重置', { day: value.trafficResetDay })}
                    </span>
                  )}
                </div>
              </article>
            </section>
          )}
    </>
  );
}
