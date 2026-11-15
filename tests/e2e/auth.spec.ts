import { expect, test } from '@playwright/test';

import { credentials } from './helpers';

test('setup or login, theme toggle, session persistence, and logout revocation', async ({ page }) => {
  const state = await (await page.request.get('/api/v1/auth/status')).json() as { initialized: boolean };
  await page.goto('/subscriptions');
  await expect(page).toHaveURL(state.initialized ? /\/login$/ : /\/setup$/);

  await page.getByLabel(state.initialized ? '用户名' : '管理员用户名', { exact: true }).fill(credentials.username);
  await page.getByLabel('登录密码', { exact: true }).fill(credentials.password);
  if (!state.initialized) await page.getByLabel('确认登录密码', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: state.initialized ? '登录' : '完成初始化并进入', exact: true }).click();

  await expect(page.getByRole('heading', { name: '订阅管理' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: '新建订阅', exact: true })).toHaveCSS('background-color', 'rgb(24, 24, 27)');

  await page.getByRole('button', { name: '切换为暗黑模式' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: '新建订阅', exact: true })).toHaveCSS('background-color', 'rgb(27, 38, 36)');
  await page.getByRole('button', { name: '切换为浅色模式' }).click();

  await page.getByRole('button', { name: '当前用户' }).click();
  await page.getByRole('menuitem', { name: '退出登录' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get('/api/v1/subscriptions')).status()).toBe(401);
});
