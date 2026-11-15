import { expect, test } from '@playwright/test';

import { authenticate, cardAction } from './helpers';

test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

test.afterEach(async ({ page }) => {
  const ipRes = await page.request.get('/api/v1/ips');
  if (ipRes.ok()) {
    for (const item of ((await ipRes.json()) as { items: { id: string }[] }).items) {
      await page.request.delete(`/api/v1/ips/${item.id}`);
    }
  }
});

test('create IP node with unlock matrix, privacy mask, archive, and delete', async ({ page }) => {
  await page.goto('/ips');

  // Verify unified Cloud IP & Mesh Node Sync modal
  await page.getByRole('button', { name: '云平台同步' }).click();
  const syncDialog = page.getByRole('dialog', { name: /云平台 IP 与组网节点同步/ });
  await expect(syncDialog).toBeVisible();
  await expect(syncDialog.getByRole('tab', { name: 'Tailscale' })).toHaveAttribute('aria-selected', 'true');
  await syncDialog.getByRole('tab', { name: '腾讯云 / DNSPod' }).click();
  await expect(syncDialog.getByLabel('CAM SecretId')).toBeVisible();
  await syncDialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(syncDialog).not.toBeVisible();

  await page.getByRole('button', { name: '新建 IP', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '新建 IP' });

  // Selecting Tailscale preset surfaces inline Tailscale Sync callout and switches cleanly
  await modal.getByRole('button', { name: '更换图标' }).click();
  await page.getByLabel('搜索商家或线路预设').fill('tailscale');
  await page.locator('.preset-popover-item').filter({ hasText: 'Tailscale' }).first().click();
  await expect(modal.getByText('支持 Tailscale 只读自动同步')).toBeVisible();
  await modal.getByRole('button', { name: 'Tailscale 同步' }).click();
  const inlineTsDialog = page.getByRole('dialog', { name: /Tailscale 只读资产同步/ });
  await expect(inlineTsDialog).toBeVisible();
  await inlineTsDialog.getByRole('button', { name: '返回手动录入' }).first().click();
  await expect(modal).toBeVisible();

  await modal.getByRole('button', { name: '更换图标' }).click();
  await page.getByLabel('搜索商家或线路预设').fill('att');
  await page.locator('.preset-popover-item').filter({ hasText: 'AT&T 住宅宽带' }).click();
  await modal.getByLabel('IP 地址或 CIDR', { exact: true }).fill('154.12.88.19');
  await modal.getByRole('button', { name: '配置解锁矩阵', exact: true }).click();
  await page.getByRole('button', { name: 'ChatGPT 全解锁', exact: true }).click();
  await modal.getByRole('button', { name: '节点别名', exact: true }).click();
  await modal.getByLabel('节点备注名', { exact: true }).fill('美西家宽主力');
  await modal.getByRole('button', { name: '保存节点', exact: true }).click();
  await expect(modal).not.toBeVisible();

  const attCard = page.locator('.ip-card').filter({ hasText: 'AT&T 住宅宽带' });
  await expect(attCard).toContainText('154.12.88.19');

  await page.getByRole('button', { name: '隐藏完整地址', exact: true }).click();
  await expect(attCard).toContainText('154.12.*.*');
  await page.getByRole('button', { name: '显示完整地址', exact: true }).click();

  await cardAction(page, 'AT&T 住宅宽带 · 美西家宽主力', '编辑节点');
  const drawer = page.getByRole('dialog', { name: '编辑节点' });
  await drawer.getByLabel('已停用归档').click();
  await drawer.getByRole('button', { name: '保存节点', exact: true }).click();
  await expect(drawer).not.toBeVisible();

  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.getByLabel('节点状态').click();
  await page.getByText('已归档', { exact: true }).last().click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();

  await cardAction(page, 'AT&T 住宅宽带 · 美西家宽主力', '永久删除');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await expect(page.locator('.ip-card')).toHaveCount(0);
});
