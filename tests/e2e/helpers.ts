import { expect, type Page } from '@playwright/test';

export const credentials = { username: 'e2e-admin', password: 'test-only-password' };

export async function authenticate(page: Page) {
  const state = await page.request.get('/api/v1/auth/status');
  const { initialized } = await state.json() as { initialized: boolean };
  const response = await page.request.post(`/api/v1/auth/${initialized ? 'login' : 'setup'}`, { data: credentials });
  expect(response.ok()).toBe(true);
}

export async function cardAction(page: Page, name: string, action: string) {
  await page.getByRole('button', { name: `操作 ${name}`, exact: true }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}
