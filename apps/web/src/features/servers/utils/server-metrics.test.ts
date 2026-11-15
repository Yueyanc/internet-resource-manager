import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';

import type { Preferences, ServerHost, ServerTelemetry, Subscription } from '@irm/api-client';
import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import { buildZeroCallbackProbeCommand } from './probe-command';
import {
  buildSshCommand,
  computeServerMetrics,
  computeTrafficUsage,
  formatSpecSummary,
  maskEndpoint,
  parseSmartEndpoint,
  resolveServerExpiry,
} from './server-metrics';

const basePrefs: Preferences = {
  baseCurrency: 'CNY',
  rates: { CNY: 1, USD: 7.2, HKD: 0.92, EUR: 7.8, GBP: 9.2, JPY: 0.048 },
};

function makeTelemetry(overrides: Partial<ServerTelemetry> = {}): ServerTelemetry {
  return {
    agentStatus: 'none',
    mode: '',
    agentVersion: '',
    intervalSec: 0,
    enrolledAt: '',
    lastReportedAt: '',
    cpuModel: '',
    kernelVersion: '',
    uptimeSeconds: 0,
    cpuPercent: 0,
    load1: 0,
    load5: 0,
    load15: 0,
    memoryUsedBytes: 0,
    memoryTotalBytes: 0,
    swapUsedBytes: 0,
    swapTotalBytes: 0,
    rootDiskUsedBytes: 0,
    rootDiskTotalBytes: 0,
    netRxBps: 0,
    netTxBps: 0,
    trafficCycleKey: '',
    trafficRxBytes: 0,
    trafficTxBytes: 0,
    tcpConnections: 0,
    dockerEnabled: false,
    dockerAvailable: false,
    dockerError: '',
    containers: [],
    ...overrides,
  };
}

function makeServer(overrides: Partial<ServerHost> = {}): ServerHost {
  return {
    id: 'srv-1',
    presetKey: 'dmit',
    name: 'LAX-Pro-01',
    hostname: 'lax-01.internal',
    provider: 'DMIT',
    kind: 'vps',
    status: 'active',
    region: 'US',
    datacenter: 'LAX Pro',
    os: 'Debian 12',
    arch: 'amd64',
    cpuCores: 2,
    memoryMb: 2048,
    diskGb: 40,
    diskType: 'nvme',
    bandwidthMbps: 1000,
    trafficGb: 800,
    trafficRule: 'both',
    trafficResetDay: 1,
    ipv4: '203.0.113.10',
    ipv6: '2001:db8:abcd::1',
    privateIp: '100.64.0.5',
    portNote: 'CN2 GIA',
    sshPort: 2222,
    sshUser: 'debian',
    consoleUrl: 'https://www.dmit.io',
    subscriptionId: '',
    accountId: '',
    expireDate: '',
    domainIds: [],
    ipIds: [],
    tags: ['反代'],
    notes: '',
    archived: false,
    providerConnectionId: '',
    providerMeta: null,
    telemetry: makeTelemetry(),
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    presetKey: 'dmit',
    name: 'DMIT LAX.Pro',
    amountMinor: 3600,
    currency: 'USD',
    cycle: 'yearly',
    intervalDays: 0,
    dueDate: '2026-11-25',
    category: 'cloud',
    renewalMode: 'manual',
    intention: 'keep',
    renewalAmountMinor: 0,
    account: '',
    accountId: '',
    billingAccountId: '',
    paymentMethod: '',
    managementUrl: '',
    notes: '',
    archived: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('server metrics, smart endpoint, and zero-callback probe helpers', () => {
  it('formats hardware summary and masks IPv4/IPv6/hostname endpoints', () => {
    const srv = makeServer();
    expect(formatSpecSummary(srv)).toBe('2C · 2 GiB · 40 GiB NVME · 1 Gbps');
    expect(maskEndpoint('203.0.113.10')).toBe('203.0.*.*');
    expect(maskEndpoint('2001:db8:abcd::1')).toBe('2001:db8:*:*');
    expect(maskEndpoint('node01.example.com')).toBe('no***.example.com');
  });

  it('classifies single smart endpoint input into public IPv4, Tailscale/LAN private IP, IPv6, or hostname', () => {
    expect(parseSmartEndpoint('154.12.34.56')).toEqual({
      kind: 'ipv4',
      ipv4: '154.12.34.56',
      ipv6: '',
      privateIp: '',
      hostname: '',
    });
    expect(parseSmartEndpoint('root@100.88.1.9:2222')).toEqual({
      kind: 'private',
      ipv4: '',
      ipv6: '',
      privateIp: '100.88.1.9',
      hostname: '',
    });
    expect(parseSmartEndpoint('2a01:4f8:c010::1')).toEqual({
      kind: 'ipv6',
      ipv4: '',
      ipv6: '2a01:4f8:c010::1',
      privateIp: '',
      hostname: '',
    });
    expect(parseSmartEndpoint('PVE-Home.Local')).toEqual({
      kind: 'hostname',
      ipv4: '',
      ipv6: '',
      privateIp: '',
      hostname: 'pve-home.local',
    });
  });

  it('computes monthly traffic usage respecting both vs out_only rules', () => {
    const gib = 1024 * 1024 * 1024;
    const srvBoth = makeServer({
      trafficGb: 100,
      trafficRule: 'both',
      telemetry: makeTelemetry({ trafficRxBytes: 15 * gib, trafficTxBytes: 25 * gib }),
    });
    expect(computeTrafficUsage(srvBoth).percent).toBe(40);

    const srvOut = makeServer({
      trafficGb: 100,
      trafficRule: 'out_only',
      telemetry: makeTelemetry({ trafficRxBytes: 15 * gib, trafficTxBytes: 25 * gib }),
    });
    expect(computeTrafficUsage(srvOut).percent).toBe(25);
  });

  it('executes zero-callback POSIX probe one-liner in /bin/sh and produces a valid IRM1: snapshot', () => {
    const cmd = buildZeroCallbackProbeCommand(false);
    const out = execFileSync('/bin/sh', ['-c', cmd], { encoding: 'utf8' }).trim();
    const irmLine = out.split('\n').find(line => line.startsWith('IRM1:'));
    expect(irmLine).toBeDefined();

    const rawBytes = Buffer.from(irmLine!.slice('IRM1:'.length), 'base64');
    const decodedJson = rawBytes[0] === 0x1f && rawBytes[1] === 0x8b
      ? gunzipSync(rawBytes).toString('utf8')
      : rawBytes.toString('utf8');
    const parsed = JSON.parse(decodedJson) as { hostname: string; cpuCores: number; memoryTotalBytes: number };
    expect(parsed.hostname.length).toBeGreaterThan(0);
    expect(parsed.cpuCores).toBeGreaterThan(0);
    expect(parsed.memoryTotalBytes).toBeGreaterThan(0);
  });

  it('builds SSH commands cleanly and returns null when SSH port is 0', () => {
    expect(buildSshCommand(makeServer())).toBe('ssh -p 2222 debian@203.0.113.10');
    expect(buildSshCommand(makeServer({ sshPort: 22, sshUser: '' }))).toBe('ssh root@203.0.113.10');
    expect(buildSshCommand(makeServer({ sshPort: 0 }))).toBeNull();
  });

  it('deduplicates shared subscriptions in monthly spend and tracks telemetry & expiry alerts', () => {
    const today = dayjs('2026-11-13');
    const sub = makeSub(); // $36/yr => $3/mo => 21.6 CNY/mo
    const subs = new Map([[sub.id, sub]]);

    const s1 = makeServer({
      id: 's1',
      subscriptionId: 'sub-1',
      region: 'US',
      telemetry: makeTelemetry({
        agentStatus: 'online',
        dockerAvailable: true,
        containers: [{ id: '1', name: 'caddy', image: 'caddy:2', state: 'running', status: 'Up' }],
      }),
    });
    const s2 = makeServer({
      id: 's2',
      subscriptionId: 'sub-1',
      region: 'US',
      kind: 'nat',
      cpuCores: 1,
      memoryMb: 512,
      diskGb: 10,
      telemetry: makeTelemetry({ agentStatus: 'stale' }),
    });
    const homelab = makeServer({ id: 's3', kind: 'homelab', region: 'LOCAL', expireDate: '2026-11-10', cpuCores: 4, memoryMb: 16384, diskGb: 512 });

    const exp = resolveServerExpiry(s1, subs, today);
    expect(exp.source).toBe('subscription');
    expect(exp.days).toBe(12);

    const metrics = computeServerMetrics([s1, s2, homelab], subs, basePrefs, today);
    expect(metrics.activeCount).toBe(3);
    expect(metrics.onlineAgentCount).toBe(1);
    expect(metrics.staleAgentCount).toBe(1);
    expect(metrics.runningContainersCount).toBe(1);
    expect(metrics.cloudCount).toBe(2);
    expect(metrics.localCount).toBe(1);
    expect(metrics.expiringCount).toBe(2);
    expect(metrics.overdueCount).toBe(1);
    expect(metrics.keepCount).toBe(2);
    expect(metrics.linkedSubCount).toBe(1);
    expect(metrics.monthlySpend).toBeCloseTo(21.6, 5);
    expect(metrics.totalCores).toBe(7);
  });

  it('incorporates providerMeta official monthly billing traffic when agent counter is absent', () => {
    const bwh = makeServer({
      trafficGb: 1000,
      trafficRule: 'both',
      providerConnectionId: 'conn-bwh',
      providerMeta: {
        provider: 'bandwagon',
        externalId: 'veid-10001',
        plan: 'CN2 GIA-E 20G',
        trafficUsedBytes: 250 * 1024 ** 3,
        trafficTotalBytes: 1000 * 1024 ** 3,
        trafficResetAt: '2026-12-01T00:00:00Z',
        lastSeenAt: '',
        clientVersion: '',
        suspended: false,
      },
    });
    const usage = computeTrafficUsage(bwh);
    expect(usage.usedBytes).toBe(250 * 1024 ** 3);
    expect(usage.percent).toBe(25);
  });
});
