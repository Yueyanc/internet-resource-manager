import type { Preferences, ServerContainer, ServerHost, Subscription } from '@irm/api-client';
import dayjs from 'dayjs';

import { monthlyCost } from '../../subscriptions/utils/subscription-metrics';

export const serverKindMeta = {
  vps: { label: '云主机 / VPS', short: 'VPS', color: '#2563eb' },
  dedicated: { label: '独立服务器', short: '独服', color: '#4f46e5' },
  nat: { label: 'NAT 共享 IP', short: 'NAT', color: '#ea580c' },
  homelab: { label: '家庭内网 / HomeLab', short: 'HomeLab', color: '#0d9488' },
  nas: { label: '私有存储 / NAS', short: 'NAS', color: '#0284c7' },
} as const;

export function formatMemory(memoryMb: number): string {
  if (memoryMb <= 0) return '';
  if (memoryMb >= 1024) {
    const gb = memoryMb / 1024;
    return Number.isInteger(gb) ? `${gb} GiB` : `${Number(gb.toFixed(1))} GiB`;
  }
  return `${memoryMb} MiB`;
}

export function formatDisk(diskGb: number, diskType: ServerHost['diskType'] = ''): string {
  if (diskGb <= 0) return '';
  const size = diskGb >= 1024 && diskGb % 1024 === 0
    ? `${diskGb / 1024} TiB`
    : `${diskGb} GiB`;
  return diskType ? `${size} ${diskType.toUpperCase()}` : size;
}

export function formatBandwidth(bandwidthMbps: number): string {
  if (bandwidthMbps <= 0) return '';
  if (bandwidthMbps >= 1000) {
    const gbps = bandwidthMbps / 1000;
    return Number.isInteger(gbps) ? `${gbps} Gbps` : `${Number(gbps.toFixed(1))} Gbps`;
  }
  return `${bandwidthMbps} Mbps`;
}

export function formatTrafficQuota(trafficGb: number): string {
  if (trafficGb <= 0) return '';
  if (trafficGb >= 1024 && trafficGb % 1024 === 0) {
    return `${trafficGb / 1024} TB`;
  }
  return `${trafficGb} GB`;
}

export function formatBinaryBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  const digits = val >= 100 || idx === 0 ? 0 : val >= 10 ? 1 : 2;
  return `${Number(val.toFixed(digits))} ${units[idx]}`;
}

export function formatBytePair(usedBytes: number, totalBytes: number): { used: string; total: string } {
  if (totalBytes <= 0) {
    return { used: '0', total: '0 B' };
  }
  const tib = 1024 ** 4;
  const gib = 1024 ** 3;
  const mib = 1024 ** 2;
  if (totalBytes >= tib) {
    return {
      used: (usedBytes / tib).toFixed(2),
      total: `${(totalBytes / tib).toFixed(2)} TiB`,
    };
  }
  if (totalBytes >= gib) {
    const totalVal = totalBytes / gib;
    const digits = totalVal >= 100 ? 0 : 1;
    return {
      used: (usedBytes / gib).toFixed(1),
      total: `${totalVal.toFixed(digits)} GiB`,
    };
  }
  if (totalBytes >= mib) {
    return {
      used: String(Math.round(usedBytes / mib)),
      total: `${Math.round(totalBytes / mib)} MiB`,
    };
  }
  return {
    used: formatBinaryBytes(usedBytes),
    total: formatBinaryBytes(totalBytes),
  };
}

export function shortCpuBadge(cpuCores: number, cpuModel: string, arch: ServerHost['arch']): string {
  const chipMatch = /\b(EPYC|Ryzen|Threadripper|Xeon|Core|Neoverse|Graviton|Ampere|Altra|Apple|Cortex)\b/i.exec(cpuModel);
  const chip = chipMatch ? chipMatch[1] : (arch === 'arm64' ? 'ARM64' : '');
  if (cpuCores > 0) {
    return chip ? `${cpuCores} vCPU ${chip}` : `${cpuCores} vCPU`;
  }
  return chip || (arch === 'arm64' ? 'ARM64' : arch === 'amd64' ? 'x86_64' : arch);
}

export function osFamilyBadge(os: string, fallbackShort: string): string {
  const lower = os.toLowerCase();
  if (!lower) return fallbackShort;
  if (/ubuntu|debian|centos|rocky|alma|alpine|arch|fedora|suse|linux|proxmox|pve|openwrt|fnos|unraid|truenas|synology|dsm|gentoo|kali|nixos/.test(lower)) {
    return 'Linux';
  }
  if (/freebsd|openbsd|netbsd/.test(lower)) return 'BSD';
  if (/windows/.test(lower)) return 'Windows';
  if (/macos|darwin/.test(lower)) return 'macOS';
  return fallbackShort;
}

export type ContainerStackGroup = {
  key: string;
  title: string;
  isCompose: boolean;
  running: number;
  items: ServerContainer[];
};

export function groupContainersByStack(
  containers: ServerContainer[],
  standaloneTitle: string,
): ContainerStackGroup[] {
  const composeMap = new Map<string, ServerContainer[]>();
  const standalone: ServerContainer[] = [];

  for (const c of containers) {
    const proj = c.composeProject?.trim() ?? '';
    if (proj) {
      const list = composeMap.get(proj);
      if (list) list.push(c);
      else composeMap.set(proj, [c]);
    }
    else {
      standalone.push(c);
    }
  }

  const groups: ContainerStackGroup[] = Array.from(composeMap.entries())
    .map(([proj, list]) => ({
      key: `compose:${proj}`,
      title: proj,
      isCompose: true,
      running: list.filter(c => c.state === 'running').length,
      items: list,
    }))
    .sort((a, b) => b.items.length - a.items.length || a.title.localeCompare(b.title));

  if (standalone.length > 0) {
    groups.push({
      key: 'standalone',
      title: standaloneTitle,
      isCompose: false,
      running: standalone.filter(c => c.state === 'running').length,
      items: standalone,
    });
  }

  return groups;
}

export function formatTrafficBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1024) {
    return `${Number((gb / 1024).toFixed(2))} TB`;
  }
  if (gb >= 1) {
    return `${Number(gb.toFixed(gb >= 100 ? 0 : 1))} GB`;
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${Number(mb.toFixed(mb >= 10 ? 0 : 1))} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatNetRate(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '0 KB/s';
  if (bytesPerSec >= 1024 * 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
  }
  if (bytesPerSec >= 1024 * 1024) {
    const mb = bytesPerSec / (1024 * 1024);
    return `${mb >= 10 ? mb.toFixed(1) : mb.toFixed(2)} MB/s`;
  }
  if (bytesPerSec >= 1024) {
    return `${Math.round(bytesPerSec / 1024)} KB/s`;
  }
  return `${bytesPerSec} B/s`;
}

export function formatUptime(seconds: number, locale: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  if (seconds <= 0) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.max(1, Math.floor((seconds % 3600) / 60));
  if (locale === 'en-US') {
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${mins} 分`;
  return `${mins} 分钟`;
}

export function computeTrafficUsage(value: ServerHost): {
  usedBytes: number;
  quotaBytes: number;
  percent: number | null;
} {
  const rx = value.telemetry.trafficRxBytes;
  const tx = value.telemetry.trafficTxBytes;
  const agentUsed = value.trafficRule === 'out_only' ? tx : rx + tx;
  const providerUsed = value.providerMeta?.trafficUsedBytes ?? 0;
  const usedBytes = Math.max(agentUsed, providerUsed);
  if (value.trafficRule === 'unlimited') {
    return { usedBytes, quotaBytes: 0, percent: null };
  }
  const quotaBytes = value.trafficGb > 0
    ? value.trafficGb * 1024 * 1024 * 1024
    : (value.providerMeta?.trafficTotalBytes ?? 0);
  if (quotaBytes <= 0) {
    return { usedBytes, quotaBytes: 0, percent: null };
  }
  const percent = Math.min(100, Math.round((usedBytes / quotaBytes) * 1000) / 10);
  return { usedBytes, quotaBytes, percent };
}

export type SmartEndpointKind = 'none' | 'ipv4' | 'ipv6' | 'private' | 'hostname';

function isPrivateOrOverlayIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const a = parts[0] ?? -1;
  const b = parts[1] ?? -1;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // Tailscale / CGNAT
  if (a === 169 && b === 254) return true;
  return false;
}

export function parseSmartEndpoint(raw: string): {
  kind: SmartEndpointKind;
  ipv4: string;
  ipv6: string;
  privateIp: string;
  hostname: string;
} {
  let clean = raw.trim();
  if (!clean) {
    return { kind: 'none', ipv4: '', ipv6: '', privateIp: '', hostname: '' };
  }
  // Strip accidental ssh prefix or user@ prefix if pasted.
  clean = clean.replace(/^ssh\s+/i, '');
  const atIdx = clean.lastIndexOf('@');
  if (atIdx >= 0) {
    clean = clean.slice(atIdx + 1).trim();
  }
  // Strip brackets around IPv6 (and optional :port after bracket).
  if (clean.startsWith('[')) {
    const closeIdx = clean.indexOf(']');
    if (closeIdx > 1) {
      clean = clean.slice(1, closeIdx);
    }
  }
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(clean)) {
    clean = clean.split(':')[0] ?? clean;
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(clean)) {
    if (isPrivateOrOverlayIPv4(clean)) {
      return { kind: 'private', ipv4: '', ipv6: '', privateIp: clean, hostname: '' };
    }
    return { kind: 'ipv4', ipv4: clean, ipv6: '', privateIp: '', hostname: '' };
  }

  if (clean.includes(':')) {
    const lower = clean.toLowerCase();
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) {
      return { kind: 'private', ipv4: '', ipv6: '', privateIp: clean, hostname: '' };
    }
    return { kind: 'ipv6', ipv4: '', ipv6: clean, privateIp: '', hostname: '' };
  }

  return { kind: 'hostname', ipv4: '', ipv6: '', privateIp: '', hostname: clean.toLowerCase() };
}

export function extractUserAndPortFromEndpoint(raw: string): {
  sshUser?: string;
  sshPort?: number;
} {
  let clean = raw.trim().replace(/^ssh\s+/i, '');
  let sshUser: string | undefined;
  let sshPort: number | undefined;

  const atIdx = clean.lastIndexOf('@');
  if (atIdx > 0) {
    sshUser = clean.slice(0, atIdx).trim();
    clean = clean.slice(atIdx + 1).trim();
  }
  const portMatch = /:(\d{1,5})$/.exec(clean);
  if (portMatch && !clean.startsWith('[')) {
    const colonCount = (clean.match(/:/g) ?? []).length;
    if (colonCount === 1) {
      const parsedPort = Number(portMatch[1]);
      if (parsedPort >= 1 && parsedPort <= 65535) {
        sshPort = parsedPort;
      }
    }
  }
  else if (clean.startsWith('[')) {
    const bracketPort = /\]:(\d{1,5})$/.exec(clean);
    if (bracketPort) {
      const parsedPort = Number(bracketPort[1]);
      if (parsedPort >= 1 && parsedPort <= 65535) {
        sshPort = parsedPort;
      }
    }
  }
  return { sshUser, sshPort };
}

export function formatSpecSummary(
  value: Pick<ServerHost, 'cpuCores' | 'memoryMb' | 'diskGb' | 'diskType' | 'bandwidthMbps'>,
): string {
  const parts: string[] = [];
  if (value.cpuCores > 0) parts.push(`${value.cpuCores}C`);
  const mem = formatMemory(value.memoryMb);
  if (mem) parts.push(mem);
  const disk = formatDisk(value.diskGb, value.diskType);
  if (disk) parts.push(disk);
  const bw = formatBandwidth(value.bandwidthMbps);
  if (bw) parts.push(bw);
  return parts.join(' · ');
}

export function primaryEndpoint(
  value: Pick<ServerHost, 'ipv4' | 'ipv6' | 'privateIp' | 'hostname'>,
): { address: string; kind: 'ipv4' | 'ipv6' | 'private' | 'hostname' | 'none' } {
  if (value.ipv4) return { address: value.ipv4, kind: 'ipv4' };
  if (value.ipv6) return { address: value.ipv6, kind: 'ipv6' };
  if (value.privateIp) return { address: value.privateIp, kind: 'private' };
  if (value.hostname) return { address: value.hostname, kind: 'hostname' };
  return { address: '', kind: 'none' };
}

export function maskEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) return '';
  if (trimmed.includes('.') && /^\d+\.\d+\.\d+\.\d+$/.test(trimmed)) {
    const parts = trimmed.split('.');
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  if (trimmed.includes(':')) {
    const groups = trimmed.split(':').filter(Boolean);
    if (groups.length === 0) return '*:*';
    if (groups.length === 1) return `${groups[0]}:*:*`;
    return `${groups[0]}:${groups[1]}:*:*`;
  }
  const dotIdx = trimmed.indexOf('.');
  if (dotIdx > 2) {
    return `${trimmed.slice(0, 2)}***${trimmed.slice(dotIdx)}`;
  }
  return trimmed.length <= 3 ? `${trimmed.charAt(0)}***` : `${trimmed.slice(0, 2)}***`;
}

export function buildSshCommand(
  value: Pick<ServerHost, 'ipv4' | 'ipv6' | 'privateIp' | 'hostname' | 'sshPort' | 'sshUser'>,
): string | null {
  if (value.sshPort <= 0) return null;
  const host = value.ipv4 || value.ipv6 || value.privateIp || value.hostname;
  if (!host) return null;
  const user = value.sshUser.trim() || 'root';
  const portFlag = value.sshPort !== 22 ? ` -p ${value.sshPort}` : '';
  return `ssh${portFlag} ${user}@${host}`;
}

export type ServerExpiryInfo = {
  source: 'subscription' | 'manual' | 'none';
  date: string;
  days: number | null;
  subscription?: Subscription;
};

export function resolveServerExpiry(
  value: Pick<ServerHost, 'subscriptionId' | 'expireDate'>,
  subscriptionsById: Map<string, Subscription>,
  today = dayjs(),
): ServerExpiryInfo {
  if (value.subscriptionId) {
    const sub = subscriptionsById.get(value.subscriptionId);
    if (sub && !sub.archived) {
      if (sub.cycle === 'once') {
        return { source: 'subscription', date: sub.dueDate, days: null, subscription: sub };
      }
      const days = dayjs(sub.dueDate).diff(today.startOf('day'), 'day');
      return { source: 'subscription', date: sub.dueDate, days, subscription: sub };
    }
  }
  if (value.expireDate) {
    const days = dayjs(value.expireDate).diff(today.startOf('day'), 'day');
    return { source: 'manual', date: value.expireDate, days };
  }
  return { source: 'none', date: '', days: null };
}

export function serverNeedsAttention(
  value: ServerHost,
  subscriptionsById: Map<string, Subscription>,
  today = dayjs(),
): boolean {
  if (value.archived) return false;
  if (value.status !== 'active') return true;
  if (value.telemetry.agentStatus === 'stale') return true;
  const expiry = resolveServerExpiry(value, subscriptionsById, today);
  if (expiry.subscription?.intention === 'cancel') return true;
  return expiry.days !== null && expiry.days <= 30;
}

export type RegionSummary = {
  region: string;
  count: number;
};

export type ServerMetrics = {
  activeCount: number;
  cloudCount: number;
  localCount: number;
  onlineAgentCount: number;
  staleAgentCount: number;
  snapshotCount: number;
  runningContainersCount: number;
  expiringCount: number;
  overdueCount: number;
  cancelCount: number;
  keepCount: number;
  totalCores: number;
  totalMemoryMb: number;
  totalDiskGb: number;
  monthlySpend?: number;
  yearlySpend?: number;
  linkedSubCount: number;
  regions: RegionSummary[];
  attentionQueue: { server: ServerHost; expiry: ServerExpiryInfo }[];
  breakdown: {
    key: ServerHost['kind'];
    label: (typeof serverKindMeta)[ServerHost['kind']]['label'];
    short: (typeof serverKindMeta)[ServerHost['kind']]['short'];
    color: string;
    count: number;
  }[];
};

export function computeServerMetrics(
  items: ServerHost[],
  subscriptionsById: Map<string, Subscription>,
  prefs?: Preferences,
  today = dayjs(),
): ServerMetrics {
  const active = items.filter(item => !item.archived);
  const cloudCount = active.filter(item => item.kind === 'vps' || item.kind === 'dedicated' || item.kind === 'nat').length;
  const localCount = active.filter(item => item.kind === 'homelab' || item.kind === 'nas').length;

  let onlineAgentCount = 0;
  let staleAgentCount = 0;
  let snapshotCount = 0;
  let runningContainersCount = 0;
  let expiringCount = 0;
  let overdueCount = 0;
  let cancelCount = 0;
  let keepCount = 0;
  let totalCores = 0;
  let totalMemoryMb = 0;
  let totalDiskGb = 0;

  const uniqueSubIds = new Set<string>();
  const regionMap = new Map<string, number>();
  const attentionQueue: { server: ServerHost; expiry: ServerExpiryInfo }[] = [];

  for (const item of active) {
    totalCores += item.cpuCores;
    totalMemoryMb += item.memoryMb;
    totalDiskGb += item.diskGb;

    if (item.telemetry.agentStatus === 'online') onlineAgentCount += 1;
    else if (item.telemetry.agentStatus === 'stale') staleAgentCount += 1;
    else if (item.telemetry.agentStatus === 'snapshot') snapshotCount += 1;

    if (item.telemetry.dockerAvailable) {
      runningContainersCount += item.telemetry.containers.filter(c => c.state === 'running').length;
    }

    regionMap.set(item.region, (regionMap.get(item.region) ?? 0) + 1);

    const expiry = resolveServerExpiry(item, subscriptionsById, today);
    if (expiry.subscription) {
      uniqueSubIds.add(expiry.subscription.id);
      if (expiry.subscription.intention === 'keep') keepCount += 1;
    }
    if (expiry.subscription?.intention === 'cancel' || item.status === 'retiring') {
      cancelCount += 1;
    }
    if (expiry.days !== null) {
      if (expiry.days < 0) overdueCount += 1;
      else if (expiry.days <= 30) expiringCount += 1;
    }
    if (serverNeedsAttention(item, subscriptionsById, today)) {
      attentionQueue.push({ server: item, expiry });
    }
  }

  attentionQueue.sort((a, b) => {
    const staleRankA = a.server.telemetry.agentStatus === 'stale' ? 0 : 1;
    const staleRankB = b.server.telemetry.agentStatus === 'stale' ? 0 : 1;
    if (staleRankA !== staleRankB) return staleRankA - staleRankB;
    const daysA = a.expiry.days ?? 99999;
    const daysB = b.expiry.days ?? 99999;
    if (daysA !== daysB) return daysA - daysB;
    return a.server.name.localeCompare(b.server.name);
  });

  const regions = Array.from(regionMap.entries())
    .map(([region, count]) => ({ region, count }))
    .sort((a, b) => b.count - a.count || a.region.localeCompare(b.region));

  let monthlySpend: number | undefined;
  let yearlySpend: number | undefined;
  if (prefs) {
    let sum = 0;
    for (const subId of uniqueSubIds) {
      const sub = subscriptionsById.get(subId);
      if (sub && !sub.archived) {
        sum += monthlyCost(sub, prefs);
      }
    }
    monthlySpend = sum;
    yearlySpend = sum * 12;
  }

  const breakdown = (Object.keys(serverKindMeta) as ServerHost['kind'][])
    .map(key => ({
      key,
      label: serverKindMeta[key].label,
      short: serverKindMeta[key].short,
      color: serverKindMeta[key].color,
      count: active.filter(item => item.kind === key).length,
    }))
    .filter(entry => entry.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    activeCount: active.length,
    cloudCount,
    localCount,
    onlineAgentCount,
    staleAgentCount,
    snapshotCount,
    runningContainersCount,
    expiringCount,
    overdueCount,
    cancelCount,
    keepCount,
    totalCores,
    totalMemoryMb,
    totalDiskGb,
    monthlySpend,
    yearlySpend,
    linkedSubCount: uniqueSubIds.size,
    regions,
    attentionQueue,
    breakdown,
  };
}
