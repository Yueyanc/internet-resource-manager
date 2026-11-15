import { expect, test } from '@playwright/test';

import { authenticate, cardAction } from './helpers';

test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

test.afterEach(async ({ page }) => {
  const srvRes = await page.request.get('/api/v1/servers');
  if (srvRes.ok()) {
    for (const item of ((await srvRes.json()) as { items: { id: string }[] }).items) {
      await page.request.delete(`/api/v1/servers/${item.id}`);
    }
  }
});

test('enroll live server agent, inspect telemetry, archive, and delete', async ({ page }) => {
  await page.goto('/servers');
  await page.getByRole('button', { name: '新建服务器', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '新建服务器' });

  const commandPre = modal.locator('.server-command-pre code');
  await expect(commandPre).toContainText('--token \'irm_enroll_');
  const cmdText = await commandPre.innerText();
  const enrollToken = /--token '(irm_enroll_[A-Za-z0-9_-]+)'/.exec(cmdText)![1]!;

  const snapshot = {
    protocolVersion: 1,
    collectedAt: new Date().toISOString(),
    hostname: 'hk-edge-01',
    os: 'linux',
    osPretty: 'Debian GNU/Linux 12',
    kernelVersion: '6.1.0-28-amd64',
    arch: 'amd64',
    cpuModel: 'AMD EPYC 7763',
    cpuCores: 4,
    cpuPercent: 38.6,
    load1: 0.72,
    load5: 0.54,
    load15: 0.41,
    uptimeSeconds: 864200,
    memoryUsedBytes: 3 * 1024 ** 3,
    memoryTotalBytes: 8 * 1024 ** 3,
    swapUsedBytes: 0,
    swapTotalBytes: 1024 ** 3,
    rootDiskUsedBytes: 24 * 1024 ** 3,
    rootDiskTotalBytes: 80 * 1024 ** 3,
    diskType: 'nvme',
    netRxBytes: 10_000_000_000,
    netTxBytes: 20_000_000_000,
    netRxBps: 2_400_000,
    netTxBps: 5_600_000,
    tcpConnections: 48,
    publicIpv4: '',
    publicIpv6: '',
    privateIp: '100.88.12.9',
    sshPort: 22,
    dockerEnabled: false,
    dockerAvailable: false,
    containers: [],
  };

  const enrollRes = await page.request.post('/agent/v1/enroll', {
    headers: { Authorization: `Bearer ${enrollToken}` },
    data: { agentVersion: '0.1.0-e2e', intervalSec: 20, snapshot },
  });
  expect(enrollRes.ok()).toBe(true);
  const { agentToken } = await enrollRes.json() as { agentToken: string };

  const reportRes = await page.request.post('/agent/v1/report', {
    headers: { Authorization: `Bearer ${agentToken}` },
    data: { agentVersion: '0.1.0-e2e', intervalSec: 20, snapshot },
  });
  expect(reportRes.ok()).toBe(true);

  await expect(modal.getByText('服务器已自动接入并完成建档！')).toBeVisible({ timeout: 10_000 });
  await modal.getByRole('button', { name: '完成并查看', exact: true }).click();
  await expect(modal).not.toBeVisible();

  const agentCard = page.locator('.server-card').filter({ hasText: 'hk-edge-01' });
  await expect(agentCard).toContainText('实时在线');
  await expect(agentCard).toContainText('39%');

  await cardAction(page, 'hk-edge-01', '编辑服务器');
  const drawer = page.getByRole('dialog', { name: '编辑服务器' });
  await drawer.getByLabel('已停用归档').click();
  await drawer.getByRole('button', { name: '保存服务器', exact: true }).click();
  await expect(drawer).not.toBeVisible();

  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.getByLabel('运行状态').click();
  await page.getByText('已归档', { exact: true }).last().click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();

  await cardAction(page, 'hk-edge-01', '永久删除');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await expect(page.locator('.server-card')).toHaveCount(0);
});
