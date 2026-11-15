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

test('enroll live server agent, inspect cockpit, archive, and delete', async ({ page }) => {
  await page.goto('/servers');

  // Verify unified Cloud Server & Mesh Sync modal and provider tabs
  await page.getByRole('button', { name: '云平台同步' }).click();
  const syncDialog = page.getByRole('dialog', { name: /云平台服务器与组网同步/ });
  await expect(syncDialog).toBeVisible();
  await expect(syncDialog.getByRole('tab', { name: 'Tailscale' })).toHaveAttribute('aria-selected', 'true');
  await syncDialog.getByRole('tab', { name: '搬瓦工 KiwiVM' }).click();
  await expect(syncDialog.getByLabel('KiwiVM VEID')).toBeVisible();
  await syncDialog.getByRole('tab', { name: 'Hetzner Cloud' }).click();
  await expect(syncDialog.getByLabel('Hetzner Read-Only API Token')).toBeVisible();
  await syncDialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(syncDialog).not.toBeVisible();

  await page.getByRole('button', { name: '新建服务器', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '新建服务器' });

  // Verify 3rd segmented radio tab switches to CloudSync inline and back
  await modal.getByRole('radio', { name: '云平台同步' }).click();
  await expect(modal.getByRole('tab', { name: 'Tailscale' })).toBeVisible();
  await modal.getByRole('radio', { name: '探针一键接入' }).click();

  await modal.getByRole('switch', { name: '读取 Docker 容器列表（特权接口 · 默认关闭）' }).click();
  const commandPre = modal.locator('.server-command-pre code');
  await expect(commandPre).toContainText('--docker');
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
    dockerEnabled: true,
    dockerAvailable: true,
    containers: [
      {
        id: 'ctr-openresty',
        name: 'openresty',
        image: 'openresty/openresty:alpine',
        state: 'running',
        status: 'Up 14 days',
        composeProject: '1panel-gateway',
        composeService: 'openresty',
      },
      {
        id: 'ctr-irm',
        name: 'resource-manager',
        image: 'ghcr.io/irm:latest',
        state: 'running',
        status: 'Up 2 hours',
      },
    ],
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
  await expect(agentCard).toContainText('2/2');

  // Click card to navigate into dedicated /servers/$serverId cockpit
  await agentCard.getByRole('button', { name: '查看 hk-edge-01' }).click();
  await expect(page).toHaveURL(/\/servers\/[A-Z0-9]+$/);
  await expect(page.getByRole('link', { name: '服务器' }).first()).toHaveAttribute('aria-current', 'page');

  const passport = page.locator('.server-passport-card');
  await expect(passport).toContainText('hk-edge-01');
  await expect(passport).toContainText('ssh root@100.88.12.9');
  await expect(passport).toContainText('4 vCPU EPYC');
  await expect(passport).toContainText('80 GiB NVME');

  const bento = page.locator('.server-bento-grid');
  await expect(bento).toContainText('38.6%');
  await expect(bento).toContainText('剩余 56 GiB');

  const stacks = page.locator('.server-cockpit-panel.is-stacks');
  await expect(stacks).toContainText('2/2 运行中');
  await expect(stacks).toContainText('1panel-gateway');
  await expect(stacks).toContainText('openresty');
  await expect(stacks).toContainText('独立运行容器');
  await expect(stacks).toContainText('resource-manager');

  // Edit in-place from cockpit to archive, then return to /servers and delete
  await page.getByRole('button', { name: '编辑服务器', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: '编辑服务器' });
  await drawer.getByLabel('已停用归档').click();
  await drawer.getByRole('button', { name: '保存服务器', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByText('该服务器当前处于已归档状态，不计入在役算力与到期提醒。')).toBeVisible();

  await page.locator('.server-cockpit-back-pill').click();
  await expect(page).toHaveURL(/\/servers$/);

  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.getByLabel('运行状态').click();
  await page.getByText('已归档', { exact: true }).last().click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();

  await cardAction(page, 'hk-edge-01', '永久删除');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await expect(page.locator('.server-card')).toHaveCount(0);
});
