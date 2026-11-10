/**
 * 登出边界（真栈）：页面级 IPC host 的 WebSocket 身份在建连时固定，登出必须
 * 走整页导航销毁旧 host/socket——SPA 切 /login 会复用旧 WS 身份。
 *
 * 证据口径：`performance.timeOrigin` 在整页 reload 后必然变化；SPA 路由切换
 * 保持不变。断言登出后 timeOrigin 前进 + URL=/login，而非只看“页面显示登录表单”
 * （SPA 也能做到）。
 */
import { expect, test } from '@playwright/test';
import { loginWithSession } from '../helpers.js';

test.describe('IPC 边界：登出', () => {
  test('退出登录 → 整页导航 /login（新 timeOrigin，不复用旧 WS 身份）', async ({ page }) => {
    test.setTimeout(120_000);
    await loginWithSession(page);
    await page.goto('/documents');
    await expect(page.getByTestId('documents-route')).toBeVisible({ timeout: 30_000 });

    const timeOriginBefore = await page.evaluate(() => performance.timeOrigin);
    await page.getByRole('button', { name: '用户菜单' }).click();
    await page.getByRole('menuitem', { name: '退出登录' }).click();

    await page.waitForURL('**/login', { timeout: 30_000 });
    const timeOriginAfter = await page.evaluate(() => performance.timeOrigin);
    expect(timeOriginAfter).toBeGreaterThan(timeOriginBefore);
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible({ timeout: 30_000 });
  });
});
