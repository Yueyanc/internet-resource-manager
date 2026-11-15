import { expect, test } from '@playwright/test';

import { authenticate, cardAction } from './helpers';

test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

test.afterEach(async ({ page }) => {
  const res = await page.request.get('/api/v1/domains');
  if (res.ok()) {
    for (const item of ((await res.json()) as { items: { id: string }[] }).items) {
      await page.request.delete(`/api/v1/domains/${item.id}`);
    }
  }
});

test('create domain with preset, mask, edit/archive, delete, and surface API errors', async ({ page }) => {
  await page.goto('/domains');
  await expect(page.getByRole('heading', { name: /域名/ })).toBeVisible();

  const domain = `e2e-${Date.now()}.craftstudio.io`;
  await page.getByRole('button', { name: '新建域名', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '新建域名' });

  await modal.getByRole('button', { name: '更换图标' }).click();
  await page.getByLabel('搜索注册商或解析商预设').fill('cloudflare');
  await page.locator('.preset-popover-item').filter({ hasText: 'Cloudflare' }).first().click();

  await modal.getByLabel('域名', { exact: true }).fill(`https://${domain}/docs`);
  await modal.getByRole('button', { name: '保存域名', exact: true }).click();
  await expect(modal).not.toBeVisible();

  const card = page.locator('.domain-card').filter({ hasText: domain });
  await expect(card).toContainText('Cloudflare');
  await expect(card).toContainText('.IO');

  await page.getByRole('button', { name: '隐藏域名前缀', exact: true }).click();
  await expect(page.locator('.domain-card').first()).toContainText('e2***.io');
  await page.getByRole('button', { name: '显示完整域名', exact: true }).click();

  await cardAction(page, domain, '编辑域名');
  const drawer = page.getByRole('dialog', { name: '编辑域名' });
  await drawer.getByLabel('已停用归档').click();
  await drawer.getByRole('button', { name: '保存域名', exact: true }).click();
  await expect(drawer).not.toBeVisible();

  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.getByLabel('域名状态').click();
  await page.getByText('已归档', { exact: true }).last().click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();

  await cardAction(page, domain, '永久删除');
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.locator('.domain-card')).toHaveCount(0);

  await page.route('**/api/v1/domains', route => route.abort());
  await page.reload();
  await expect(page.getByText('无法加载域名')).toBeVisible();
});
