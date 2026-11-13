import { expect, test } from '@playwright/test';

test('add, persist, search, and delete a real domain record', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '域名资源' })).toBeVisible();
  await expect(page.getByText('服务已连接')).toBeVisible();
  await expect(page.getByRole('button', { name: '添加域名' })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('domains.png'), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const domain = `e2e-${Date.now()}.example.com`;
  await page.getByRole('button', { name: '添加域名' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('域名', { exact: true }).fill(domain);
  await dialog.getByLabel('备注', { exact: true }).fill('E2E test only');
  await dialog.getByRole('button', { name: '添加', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(domain, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(domain, { exact: true })).toBeVisible();
  await page.getByLabel('搜索域名').fill('no-match.invalid');
  await expect(page.getByText('没有匹配的域名')).toBeVisible();
  await page.getByLabel('搜索域名').fill(domain);
  await page.getByRole('button', { name: `删除 ${domain}`, exact: true }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByText('没有匹配的域名')).toBeVisible();
  expect(errors).toEqual([]);
});

test('unavailable API is not rendered as a healthy empty list', async ({ page }) => {
  await page.route('**/api/v1/domains', route => route.abort());
  await page.goto('/domains');
  await expect(page.getByText('无法加载域名')).toBeVisible();
  await expect(page.getByText('数据不可用')).toBeVisible();
  await expect(page.getByText('暂无域名', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('button', { name: '添加域名' })).toBeDisabled();
});
