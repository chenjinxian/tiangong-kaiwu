/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { test, expect, type Page } from '@playwright/test';
import {
  loginWithSession,
  navigateToEditor,
  getFirstProjectAndIModel,
  waitForEditorReady,
} from './helpers';

/** 登录后直达真实编辑器（经 hub API 取 seed 项目/模型 ID；编辑器路由 /workspace/:iTwinId/:iModelId） */
async function openRealEditor(page: Page): Promise<void> {
  const { projectId, imodelId } = await getFirstProjectAndIModel(page);
  await page.goto(`/workspace/${projectId}/${imodelId}`);
  await waitForEditorReady(page);
}

test.describe('Editor Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithSession(page);
  });

  test('should navigate to editor page from project detail', async ({ page }) => {
    // UI 全链路：项目卡片（Tile 内嵌按钮）→ 详情页「打开工作空间」→ 编辑器（见 helpers）
    await navigateToEditor(page);

    // Actual editor route is /workspace/:iTwinId/:iModelId
    await expect(page.url()).toMatch(/.*\/workspace\/.+/);
    await expect(page.locator('.statusbar')).toBeVisible();
  });

  test('should display editor page with toolbar', async ({ page }) => {
    await openRealEditor(page);

    // 主工具条 + CAD 工具条（后者等价于 briefcase 连接已建立）
    await expect(page.locator('.toolbar').first()).toBeVisible({ timeout: 60000 });
    await expect(page.locator('.cad-toolbar-horizontal')).toBeVisible({ timeout: 60000 });
  });

  test('should show edit mode indicator', async ({ page }) => {
    // 编辑/只读模式由权限自动判定（useIModelPermission），无手动开关——
    // 以状态栏「编辑模式」指示器为准（只读时显示「只读模式」Badge）
    await openRealEditor(page);

    const statusBar = page.locator('.statusbar');
    await expect(statusBar).toContainText(/编辑模式|只读模式/, { timeout: 60000 });
  });

  test('should display status bar', async ({ page }) => {
    await openRealEditor(page);

    const statusBar = page.locator('.statusbar');
    await expect(statusBar).toBeVisible();
    await expect(statusBar).toContainText('已连接', { timeout: 60000 });
    await expect(statusBar).toContainText('公制单位');
  });

  test('should navigate back to documents', async ({ page }) => {
    await openRealEditor(page);

    // 面包屑「项目列表」按钮 → /itwins
    const backButton = page.getByRole('button', { name: '项目列表' }).first();
    await expect(backButton).toBeVisible({ timeout: 30000 });
    await backButton.click();
    await page.waitForURL('**/itwins', { timeout: 30000 });
    await expect(page.url()).toContain('/itwins');
  });
});
