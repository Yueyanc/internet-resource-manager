import type { IpNode, Subscription } from '@irm/api-client';
import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import { computeIpMetrics, maskIpAddress, nextReviewDate, reviewRemaining } from './ip-metrics';

function makeNode(overrides: Partial<IpNode> = {}): IpNode {
  return {
    id: 'ip-1',
    presetKey: 'att_fiber',
    address: '154.12.88.19',
    version: 4,
    prefixLen: 32,
    networkScope: 'overseas_exit',
    category: 'residential_isp',
    provider: 'AT&T 住宅宽带',
    label: '美西主力',
    region: 'US',
    city: 'Los Angeles',
    asn: 7018,
    asnOrg: 'AT&T Enterprises, LLC',
    ptrRecord: '',
    asnType: 'residential',
    originType: 'native',
    riskLevel: 'clean',
    purityNote: 'Scamalytics 0',
    unlocks: {
      openai: { status: 'full', region: 'US' },
      netflix: { status: 'full', region: 'US' },
    },
    tags: ['双ISP'],
    manualLocks: [],
    lookupSource: 'manual',
    lookupCheckedAt: '',
    lookupError: '',
    role: 'dedicated',
    status: 'active',
    reviewCycle: 'quarterly',
    reviewDays: 0,
    nextReviewDate: '2026-12-01',
    lastReviewedAt: '',
    probeMode: 'tcp',
    probePort: 443,
    probeStatus: 'reachable',
    probeLatencyMs: 142,
    probeCheckedAt: '2026-11-13T12:00:00Z',
    probeError: '',
    subscriptionId: '',
    serverId: '',
    hostLabel: 'lax-isp-01',
    domainIds: [],
    accountIds: [],
    consoleUrl: '',
    notes: '',
    archived: false,
    createdAt: '2026-11-13T12:00:00Z',
    updatedAt: '2026-11-13T12:00:00Z',
    ...overrides,
  };
}

describe('ip-metrics', () => {
  it('masks IPv4, IPv6, and CIDR prefixes cleanly for privacy mode', () => {
    expect(maskIpAddress('154.12.88.19')).toBe('154.12.*.*');
    expect(maskIpAddress('100.64.0.0/10')).toBe('100.64.*.*/10');
    expect(maskIpAddress('2606:4700:4700::1111')).toBe('2606:4700:*:*');
    expect(maskIpAddress('fd7a:115c:a1e0::/48')).toBe('fd7a:115c:*:*/48');
  });

  it('computes review remaining days and cycle advances', () => {
    const today = dayjs('2026-11-13');
    const node = makeNode({ nextReviewDate: '2026-11-20' });
    expect(reviewRemaining(node, today)).toBe(7);
    expect(nextReviewDate('2026-11-13', 'quarterly', 0)).toBe('2027-02-13');
  });

  it('aggregates unlock coverage, residential ratio, and linked subscription renewal alerts', () => {
    const today = dayjs('2026-11-13');
    const cancellingSub: Subscription = {
      id: 'sub-1',
      presetKey: 'dmit',
      name: 'DMIT LAX Pro',
      category: 'cloud',
      amountMinor: 3990,
      currency: 'USD',
      cycle: 'quarterly',
      intervalDays: 0,
      dueDate: '2026-11-25',
      renewalMode: 'manual',
      intention: 'cancel',
      renewalAmountMinor: 0,
      account: '',
      accountId: '',
      billingAccountId: '',
      paymentMethod: 'Visa',
      managementUrl: '',
      notes: '',
      archived: false,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    };

    const nodes: IpNode[] = [
      makeNode({ id: 'ip-1' }),
      makeNode({
        id: 'ip-2',
        presetKey: 'dmit',
        address: '45.88.19.10',
        category: 'cloud_vps',
        provider: 'DMIT',
        label: 'LAX Pro',
        asnType: 'hosting',
        originType: 'broadcast',
        role: 'primary',
        subscriptionId: 'sub-1',
        nextReviewDate: '2027-05-01',
        unlocks: { openai: { status: 'full', region: 'US' }, netflix: { status: 'partial' } },
      }),
      makeNode({
        id: 'ip-3',
        presetKey: 'tailscale',
        address: '100.64.0.42',
        networkScope: 'overlay_private',
        category: 'overlay_subnet',
        provider: 'Tailscale',
        label: 'Mac mini',
        region: 'LAN',
        asnType: 'private',
        originType: 'unknown',
        role: 'service',
        reviewCycle: 'none',
        nextReviewDate: '',
        probeMode: 'none',
        probeStatus: 'skipped_non_public',
        unlocks: {},
      }),
    ];

    const metrics = computeIpMetrics(nodes, [cancellingSub], today);
    expect(metrics.activeCount).toBe(3);
    expect(metrics.overseasExitCount).toBe(2);
    expect(metrics.overlayCount).toBe(1);
    expect(metrics.residentialOrNativeCount).toBe(1);
    expect(metrics.dedicatedCount).toBe(1);
    expect(metrics.chatgptReadyCount).toBe(2);
    expect(metrics.netflixReadyCount).toBe(1);
    expect(metrics.subscriptionAlertCount).toBe(1);
    expect(metrics.hygieneQueue.map(item => item.id)).toContain('ip-2');
    expect(metrics.hygieneQueue.map(item => item.id)).toContain('ip-1');
  });
});
