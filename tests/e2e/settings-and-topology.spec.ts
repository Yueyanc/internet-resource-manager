import { expect, test } from '@playwright/test';

import { authenticate } from './helpers';

test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

test.afterEach(async ({ page }) => {
  for (const endpoint of ['/api/v1/domains', '/api/v1/subscriptions', '/api/v1/accounts']) {
    const res = await page.request.get(endpoint);
    if (res.ok()) {
      for (const item of ((await res.json()) as { items: { id: string }[] }).items) {
        await page.request.delete(`${endpoint}/${item.id}`);
      }
    }
  }
});

test('two-pane settings modal, Cmd+K command palette, and reverse-association topology views', async ({ page }) => {
  const acctRes = await page.request.post('/api/v1/accounts', {
    data: {
      presetKey: 'cloudflare',
      platform: 'Cloudflare',
      label: '主力云邮箱',
      category: 'dev_cloud',
      ecosystem: 'overseas',
      identifier: 'ops@craftstudio.invalid',
      uid: '',
      role: 'hub',
      status: 'active',
      region: 'Global',
      authMethod: 'password',
      ssoAccountId: '',
      recoveryEmail: '',
      recoveryAccountId: '',
      phoneHint: '',
      twoFactor: 'totp',
      recoveryCodes: 'saved',
      kycStatus: 'none',
      kycNote: '',
      keepaliveCycle: 'none',
      keepaliveDays: 0,
      nextCheckinDate: '',
      lastCheckedAt: '',
      vaultReference: '',
      securityUrl: 'https://dash.cloudflare.com',
      notes: '',
      archived: false,
    },
  });
  expect(acctRes.ok()).toBe(true);
  const account = (await acctRes.json()) as { id: string };

  const subRes = await page.request.post('/api/v1/subscriptions', {
    data: {
      presetKey: 'cloudflare',
      name: 'Cloudflare Pro',
      amountMinor: 2000,
      renewalAmountMinor: 2000,
      currency: 'USD',
      cycle: 'monthly',
      intervalDays: 30,
      dueDate: '2027-01-15',
      category: 'cloud',
      renewalMode: 'auto',
      intention: 'keep',
      accountId: account.id,
      billingAccountId: '',
      account: '',
      paymentMethod: 'Visa *8812',
      managementUrl: 'https://dash.cloudflare.com',
      notes: '',
      archived: false,
    },
  });
  expect(subRes.ok()).toBe(true);
  const subscription = (await subRes.json()) as { id: string };

  const domRes = await page.request.post('/api/v1/domains', {
    data: {
      presetKey: 'cloudflare',
      name: 'craftstudio.io',
      registrar: 'Cloudflare',
      dnsProvider: 'Cloudflare',
      purpose: 'prod',
      status: 'active',
      expireDate: '2027-01-15',
      autoRenew: true,
      whoisPrivacy: true,
      icpStatus: 'none',
      icpNumber: '',
      registrarAccountId: account.id,
      subscriptionId: subscription.id,
      serverIds: [],
      ipIds: [],
      tags: ['edge'],
      managementUrl: '',
      notes: '',
      archived: false,
    },
  });
  expect(domRes.ok()).toBe(true);

  await page.goto('/accounts');
  const cfCard = page.locator('.account-card').filter({ hasText: 'Cloudflare' });
  await expect(cfCard).toContainText('关联资产 1 项');
  await expect(cfCard).toContainText('关联订阅: Cloudflare Pro');

  await cfCard.getByText('关联资产 1 项').click();
  const acctDrawer = page.getByRole('dialog', { name: '账号详情' });
  await expect(acctDrawer.getByText('关联资产与影响面 (反向拓扑)')).toBeVisible();
  await expect(acctDrawer.getByText('核心枢纽账号 · 共串联 2 项下游资产')).toBeVisible();
  await expect(acctDrawer.locator('.reverse-row-link').filter({ hasText: 'craftstudio.io' })).toBeVisible();
  await acctDrawer.locator('.reverse-row-link').filter({ hasText: 'Cloudflare Pro' }).click();

  await expect(page).toHaveURL(/\/subscriptions\?detail=/);
  const subDrawer = page.getByRole('dialog', { name: '订阅详情' });
  await expect(subDrawer.getByText('反向关联域名 (1)')).toBeVisible();
  await expect(subDrawer.locator('.sub-reverse-domain-pill').filter({ hasText: 'craftstudio.io' })).toBeVisible();
  await subDrawer.getByRole('button', { name: /Close|关闭/ }).first().click();

  // Open two-pane System Settings modal from topbar
  await page.getByRole('button', { name: '系统设置', exact: true }).click();
  const settingsDialog = page.getByRole('dialog', { name: '系统设置' });
  await expect(settingsDialog).toBeVisible();
  await expect(settingsDialog.getByRole('heading', { name: '偏好与汇率' })).toBeVisible();
  await expect(settingsDialog.getByRole('button', { name: '一键拉取实时汇率' })).toBeVisible();

  await settingsDialog.getByRole('tab', { name: '账号与安全' }).click();
  await expect(settingsDialog.getByRole('heading', { name: '账号与安全' })).toBeVisible();
  await expect(settingsDialog.getByText('当前会话')).toBeVisible();

  await settingsDialog.getByRole('tab', { name: '通知与自动化' }).click();
  await expect(settingsDialog.getByRole('heading', { name: '通知与自动化' })).toBeVisible();
  await settingsDialog.getByRole('button', { name: '立即执行巡检' }).click();
  await expect(page.getByText(/巡检完成：顺延/)).toBeVisible();

  await settingsDialog.getByRole('tab', { name: /数据备份与关于/ }).click();
  await expect(settingsDialog.getByRole('heading', { name: '数据备份与关于' })).toBeVisible();
  await expect(settingsDialog.getByText('SQLite 数据库体积')).toBeVisible();
  await expect(settingsDialog.getByRole('button', { name: '下载 SQLite 在线快照 (.db)' })).toBeVisible();
  await settingsDialog.getByRole('button', { name: '关闭' }).click();
  await expect(settingsDialog).toBeHidden();

  // Open Cmd/Ctrl + K Command Palette and jump directly to craftstudio.io
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: '全局快速检索' });
  await expect(palette).toBeVisible();
  await palette.getByRole('textbox', { name: '全局快速检索' }).fill('craftstudio.io');
  await palette.locator('.command-palette-item').filter({ hasText: 'craftstudio.io' }).click();
  await expect(page).toHaveURL(/\/domains\?detail=/);
});
