import { expect, test } from '@playwright/test';

import { authenticate, cardAction } from './helpers';

test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

test.afterEach(async ({ page }) => {
  const accRes = await page.request.get('/api/v1/accounts');
  if (accRes.ok()) {
    for (const item of ((await accRes.json()) as { items: { id: string }[] }).items) {
      await page.request.delete(`/api/v1/accounts/${item.id}`);
    }
  }
});

test('create account with zero-knowledge vault password & live TOTP, unlock, archive, and delete', async ({ page }) => {
  await page.goto('/accounts');
  await expect(page.getByRole('heading', { name: /账号与身份/ })).toBeVisible();

  const vaultStatus = await (await page.request.get('/api/v1/vault')).json() as { initialized: boolean };
  if (!vaultStatus.initialized) {
    await page.getByRole('button', { name: '初始化保险箱', exact: true }).click();
    const setupModal = page.getByRole('dialog', { name: '初始化端到端加密保险箱' });
    await setupModal.getByLabel('保险箱主密码', { exact: true }).fill('VaultMaster!2026');
    await setupModal.getByLabel('确认保险箱主密码', { exact: true }).fill('VaultMaster!2026');
    await setupModal.getByRole('button', { name: '创建保险箱并生成恢复密钥' }).click();

    const recoveryModal = page.getByRole('dialog', { name: '请妥善保存应急恢复密钥' });
    await recoveryModal.getByRole('checkbox').check();
    await recoveryModal.getByRole('button', { name: '完成并进入保险箱' }).click();
  }
  else {
    await page.getByRole('button', { name: '解锁保险箱', exact: true }).click();
    const unlockModal = page.getByRole('dialog', { name: '解锁保险箱' });
    await unlockModal.getByLabel('保险箱主密码', { exact: true }).fill('VaultMaster!2026');
    await unlockModal.getByRole('button', { name: '立即解锁' }).click();
  }

  await expect(page.getByRole('button', { name: '保险箱已解锁' })).toBeVisible();

  await page.getByRole('button', { name: '新建账号', exact: true }).click();
  const wizard = page.getByRole('dialog', { name: '新建账号' });
  await wizard.getByRole('button', { name: '更换平台' }).click();
  await page.getByLabel('搜索平台预设').fill('github');
  await page.locator('.preset-popover-item').filter({ hasText: 'GitHub' }).click();
  await wizard.getByLabel('主登录标识', { exact: true }).fill('octocat@example.invalid');

  await wizard.getByRole('button', { name: '生成强密码', exact: true }).click();
  const generatedPwd = await wizard.getByLabel('账号密码（加密存储）').inputValue();
  await wizard.getByLabel('2FA 动态密钥 (TOTP / otpauth://)').fill('JBSWY3DPEHPK3PXP');
  await wizard.getByRole('button', { name: '保存账号', exact: true }).click();
  await expect(wizard).not.toBeVisible();

  const rawSecretsBody = await (await page.request.get('/api/v1/vault/secrets')).text();
  expect(rawSecretsBody).not.toContain(generatedPwd);
  expect(rawSecretsBody).not.toContain('JBSWY3DPEHPK3PXP');

  const ghCard = page.locator('.account-card').filter({ hasText: 'GitHub' });
  await expect(ghCard.getByRole('button', { name: '复制 GitHub 登录标识' })).toBeVisible();
  await expect(ghCard.getByRole('button', { name: '复制 GitHub 密码' })).toBeVisible();
  await expect(ghCard.locator('.totp-live-pill code')).toHaveText(/^\d{3} \d{3}$/);

  await cardAction(page, 'GitHub', '编辑账号');
  const drawer = page.getByRole('dialog', { name: '编辑账号' });
  await drawer.getByLabel('已停用归档').click();
  await drawer.getByRole('button', { name: '保存账号', exact: true }).click();
  await expect(drawer).not.toBeVisible();

  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.getByLabel('账号状态').click();
  await page.getByText('已归档', { exact: true }).last().click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();

  await cardAction(page, 'GitHub', '永久删除');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await expect(page.locator('.account-card')).toHaveCount(0);
});
