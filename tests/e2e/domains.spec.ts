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

test('create domain with RDAP auto-fill, inspect Cloudflare sync modal, edit/archive, delete, and surface API errors', async ({ page }) => {
  await page.goto('/domains');
  await expect(page.getByRole('heading', { name: /域名/ })).toBeVisible();

  // 1. Open Cloudflare Read-Only Sync Modal and verify prefilled template link & scopes
  await page.getByRole('button', { name: 'Cloudflare 同步' }).click();
  const cfDialog = page.getByRole('dialog', { name: /Cloudflare 只读资产同步/ });
  await expect(cfDialog).toBeVisible();
  const templateLink = cfDialog.getByRole('link', { name: '一键打开 Cloudflare 只读令牌模板' });
  await expect(templateLink).toHaveAttribute('href', /dash\.cloudflare\.com\/profile\/api-tokens/);
  await expect(cfDialog).toContainText('Zone · Read');
  await expect(cfDialog).toContainText('DNS · Read');
  await cfDialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(cfDialog).not.toBeVisible();

  // 2. Mock RDAP/WHOIS preview for deterministic offline E2E auto-fill
  await page.route('**/api/v1/domains/lookup-preview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        domain: 'e2e.craftstudio.io',
        apexDomain: 'craftstudio.io',
        registrar: 'Cloudflare',
        dnsProvider: 'Cloudflare DNS',
        presetKey: 'cloudflare',
        expireDate: '2028-06-15',
        nameServers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'],
        source: 'rdap',
        checkedAt: '2026-11-15T12:00:00Z',
      }),
    });
  });

  const domain = `e2e-${Date.now()}.craftstudio.io`;
  await page.getByRole('button', { name: '新建域名', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '新建域名' });

  // Before selecting Cloudflare, inline Cloudflare Sync callout is hidden
  await expect(modal.getByRole('button', { name: 'Cloudflare 同步' })).toHaveCount(0);

  // Selecting Cloudflare preset surfaces inline Cloudflare Sync callout
  await modal.getByRole('button', { name: '更换图标' }).click();
  await page.locator('.preset-popover-item').filter({ hasText: 'Cloudflare' }).first().click();
  await expect(modal.getByText('支持 Cloudflare 只读自动同步')).toBeVisible();
  await modal.getByRole('button', { name: 'Cloudflare 同步' }).click();

  // Modal switches inline to Cloudflare Read-Only Asset Sync and returns cleanly
  const inlineCfDialog = page.getByRole('dialog', { name: /Cloudflare 只读资产同步/ });
  await expect(inlineCfDialog).toBeVisible();
  await expect(inlineCfDialog.getByRole('link', { name: '一键打开 Cloudflare 只读令牌模板' })).toBeVisible();
  await inlineCfDialog.getByRole('button', { name: '返回手动录入' }).click();
  await expect(modal).toBeVisible();

  await modal.getByLabel('域名', { exact: true }).fill(`https://${domain}/docs`);
  await modal.getByRole('button', { name: '自动查询 RDAP' }).click();
  await expect(page.getByText(/已自动回填注册商与到期日/)).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Cloudflare 同步' })).toBeVisible();

  await modal.getByRole('button', { name: '保存域名', exact: true }).click();
  await expect(modal).not.toBeVisible();

  const card = page.locator('.domain-card').filter({ hasText: domain });
  await expect(card).toContainText('Cloudflare');
  await expect(card).toContainText('.IO');
  await expect(card).toContainText('2028-06-15');

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
