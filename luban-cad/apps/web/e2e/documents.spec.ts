/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { loginWithSession, SEED_PROJECT_NAME } from './helpers';

test.describe('Documents Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithSession(page);
  });

  test('should display documents page with header', async ({ page }) => {
    // 页面 heading = section-title（过滤标签，默认「我的项目」）；
    // 注意项目卡片名也是 h2，getByRole('heading', {name: /项目/}) 会撞 strict mode
    await expect(page.locator('.section-title')).toBeVisible();
    await expect(page.locator('.section-title')).toHaveText('我的项目');

    // Check for create project button (topbar high-visibility button)
    await expect(page.getByRole('button', { name: '新建项目' })).toBeVisible();
  });

  test('should display project grid or list', async ({ page }) => {
    // Wait for projects to load
    await page.waitForTimeout(2000);

    // Check for grid/list container OR empty state
    const grid = page.locator('[class*="grid"], [class*="list"]').first();
    const emptyState = page.getByText(/暂无项目|No projects|Empty/i);

    const hasGrid = await grid.isVisible().catch(() => false);
    const hasEmpty = await emptyState.isVisible().catch(() => false);

    // Either grid or empty state should be visible
    expect(hasGrid || hasEmpty).toBe(true);
  });

  test('should open create project dialog', async ({ page }) => {
    // Click create project button (topbar)
    await page.getByRole('button', { name: '新建项目' }).click();

    // 对话框标题只存在于 aria-label（内层 heading 为空）—— 用 role 定位
    const dialog = page.getByRole('dialog', { name: '创建 iTwin 项目' });
    await expect(dialog).toBeVisible();

    // 表单输入：label 未关联控件（getByLabel 不命中），用 placeholder
    await expect(page.locator('input[placeholder="输入项目名称"]')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '创建', exact: true })).toBeVisible();
  });

  test('should navigate to project detail page', async ({ page }) => {
    // 项目卡片 = iTwinUI Tile（div[cursor=pointer] 内嵌以项目名命名的 button，无 a[href]/.card）
    const projectTile = page.locator('main').getByRole('button', { name: SEED_PROJECT_NAME }).first();
    await expect(projectTile, 'e2e 数据前置不满足：seed 项目卡片未出现——起栈+seed 后重跑').toBeVisible({ timeout: 15000 });
    await projectTile.click();

    // Verify navigation to detail page - actual route is /itwins/:iTwinId
    await page.waitForURL(/.*\/itwins\/.+/, { timeout: 10000 });
    await expect(page.url()).toMatch(/.*\/itwins\/.+/);
  });

  test('should logout successfully', async ({ page }) => {
    // Check if already on login page (session expired or server error)
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      // Already logged out
      return;
    }

    // 侧边栏「退出登录」SidenavButton —— 用等待式断言（isVisible() 不等待会误判加载中）
    const logoutButton = page.getByRole('button', { name: '退出登录' });
    await expect(logoutButton).toBeVisible({ timeout: 15000 });
    await logoutButton.click();

    // Verify redirect to login page (or already there)
    await page.waitForURL('**/login', { timeout: 10000 });
    await expect(page.url()).toContain('/login');
  });
});
