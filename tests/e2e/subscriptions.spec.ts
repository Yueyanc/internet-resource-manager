import { expect, test } from '@playwright/test';
import dayjs from 'dayjs';

import { authenticate, cardAction } from './helpers';

test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

test.afterEach(async ({ page }) => {
  const subs = await page.request.get('/api/v1/subscriptions');
  if (subs.ok()) {
    for (const item of ((await subs.json()) as { items: { id: string }[] }).items) {
      await page.request.delete(`/api/v1/subscriptions/${item.id}`);
    }
  }
  const accs = await page.request.get('/api/v1/accounts');
  if (accs.ok()) {
    for (const item of ((await accs.json()) as { items: { id: string }[] }).items) {
      await page.request.delete(`/api/v1/accounts/${item.id}`);
    }
  }
});

test('create subscription with separated searchable service & billing account dropdowns, renew, archive, and delete', async ({ page }) => {
  await page.goto('/subscriptions');
  await page.getByRole('button', { name: '新建订阅', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '新建订阅' });

  await modal.getByRole('button', { name: '选择预设服务' }).click();
  const presetPopover = page.locator('.preset-picker-popover');
  await expect(presetPopover).toBeVisible();
  const presetStyles = await presetPopover.evaluate((el) => {
    const rootStyle = window.getComputedStyle(el);
    const container = el.querySelector('.ant-popover-container');
    const containerStyle = container ? window.getComputedStyle(container) : null;
    return {
      filter: rootStyle.filter,
      backdropFilter: containerStyle?.backdropFilter || containerStyle?.getPropertyValue('-webkit-backdrop-filter') || '',
    };
  });
  expect(presetStyles.filter).toBe('none');
  expect(presetStyles.backdropFilter).toContain('blur(');

  await page.getByLabel('搜索预设服务').fill('chatgpt');
  await page.locator('.preset-popover-item').filter({ hasText: 'ChatGPT' }).click();

  const nameInput = modal.getByLabel('订阅名称');
  const amountInput = modal.getByLabel('金额');
  await expect(nameInput).toHaveValue('ChatGPT Plus');
  await expect(modal.getByRole('button', { name: '币种' })).toHaveText('US$');
  await expect(amountInput).toHaveValue('20');

  await modal.getByRole('button', { name: '切换套餐' }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Pro 100' }).click();
  await expect(nameInput).toHaveValue('ChatGPT Pro 100');
  await expect(amountInput).toHaveValue('100');

  await modal.getByRole('button', { name: '切换套餐' }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Plus · $20/月' }).click();
  await expect(nameInput).toHaveValue('ChatGPT Plus');
  await expect(amountInput).toHaveValue('20');
  const amountMetrics = await amountInput.evaluate((el: HTMLInputElement) => ({
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
  }));
  expect(amountMetrics.clientWidth).toBeGreaterThanOrEqual(30);
  expect(amountMetrics.scrollWidth).toBeLessThanOrEqual(amountMetrics.clientWidth + 1);

  await modal.getByLabel('下次到期 / 扣款日期').click();
  await page.getByText('今天', { exact: true }).click();

  await modal.getByRole('button', { name: '归属账号' }).click();
  const accountPopover = page.locator('.account-dropdown-popover').first();
  await expect(accountPopover).toBeVisible();
  const accountStyles = await accountPopover.evaluate((el) => {
    const rootStyle = window.getComputedStyle(el);
    const container = el.querySelector('.ant-popover-container');
    const containerStyle = container ? window.getComputedStyle(container) : null;
    return {
      filter: rootStyle.filter,
      backdropFilter: containerStyle?.backdropFilter || containerStyle?.getPropertyValue('-webkit-backdrop-filter') || '',
    };
  });
  expect(accountStyles.filter).toBe('none');
  expect(accountStyles.backdropFilter).toContain('blur(');

  await page.getByRole('button', { name: '快速新建归属账号' }).click();
  const primaryBox = page.getByRole('group', { name: '快速新建归属账号' });
  await primaryBox.getByLabel('主登录标识').fill('ai.work@example.invalid');
  await primaryBox.getByRole('button', { name: '添加并选中' }).click();
  await expect(modal.getByRole('button', { name: '归属账号' })).toContainText('OpenAI');

  await modal.getByRole('button', { name: '扣款账号' }).click();
  await page.getByRole('button', { name: '快速新建代扣账号' }).click();
  const billingBox = page.getByRole('group', { name: '快速新建代扣账号' });
  await billingBox.getByRole('button', { name: 'Apple 账户', exact: true }).click();
  await billingBox.getByLabel('主登录标识').fill('apple.pay@example.invalid');
  await billingBox.getByRole('button', { name: '添加并选中' }).click();
  await expect(modal.getByRole('button', { name: '扣款账号' })).toContainText('Apple 账户');

  await modal.getByRole('button', { name: '保存订阅' }).click();
  await expect(modal).not.toBeVisible();

  const card = page.locator('.subscription-card').filter({ hasText: 'ChatGPT Plus' });
  await expect(card).toContainText('US$20');
  await expect(card).toContainText('OpenAI · Apple 账户 代扣');

  await page.getByRole('button', { name: '查看 ChatGPT Plus', exact: true }).click();
  const subDrawer = page.getByRole('dialog', { name: '订阅详情' });
  await subDrawer.locator('.detail-related-item').filter({ hasText: 'Apple 账户' }).click();
  await expect(page).toHaveURL(/\/accounts\?detail=/);
  const accDrawer = page.getByRole('dialog', { name: '账号详情' });
  await expect(accDrawer.locator('.reverse-row-link').filter({ hasText: 'ChatGPT Plus' })).toContainText('代扣渠道');
  await accDrawer.locator('.reverse-row-link').filter({ hasText: 'ChatGPT Plus' }).click();
  await expect(page).toHaveURL(/\/subscriptions\?detail=/);
  await page.getByRole('dialog', { name: '订阅详情' }).getByRole('button', { name: /Close|关闭/ }).first().click();

  await cardAction(page, 'ChatGPT Plus', '顺延一周期');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await expect(card.locator('time')).toHaveAttribute('datetime', dayjs().add(1, 'month').format('YYYY-MM-DD'));

  await cardAction(page, 'ChatGPT Plus', '编辑订阅');
  const drawer = page.getByRole('dialog', { name: '编辑订阅' });
  await expect(drawer.getByRole('button', { name: '归属账号' })).toContainText('OpenAI');
  await expect(drawer.getByRole('button', { name: '扣款账号' })).toContainText('Apple 账户');
  await drawer.getByLabel('已停用归档').click();
  await drawer.getByRole('button', { name: '保存订阅' }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.locator('.subscription-card')).toHaveCount(0);

  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.getByLabel('订阅状态').click();
  await page.getByText('已归档', { exact: true }).last().click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();

  await cardAction(page, 'ChatGPT Plus', '永久删除');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await expect(page.locator('.subscription-card')).toHaveCount(0);
});
