/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import {
  loginWithSession,
  navigateToEditor,
  getFirstProjectAndIModel,
  waitForEditorReady,
  SEED_PROJECT_NAME,
} from './helpers';

test.describe('Modeling Tools - Smoke Test', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithSession(page);
  });

  test('login should succeed', async ({ page }) => {
    await expect(page.locator('.section-title')).toHaveText('我的项目');
    await expect(page.getByText(SEED_PROJECT_NAME).first()).toBeVisible();
  });

  test('should navigate to existing iModel editor', async ({ page }) => {
    // UI 全链路：项目卡片 → 详情页「打开工作空间」→ 编辑器（见 helpers.navigateToEditor）
    await navigateToEditor(page);

    await expect(page.url()).toMatch(/\/workspace\/[^/]+\/[^/]+/);
    await expect(page.locator('.statusbar')).toBeVisible();
    await page.screenshot({ path: 'test-results/editor-page.png', fullPage: true });
  });
});

test.describe('Modeling Tools - Direct Editor Access', () => {
  test('should load editor directly and show toolbar', async ({ page }) => {
    test.setTimeout(180000); // 编辑器 briefcase 连接在全套件并行负载下建立较慢
    await loginWithSession(page);

    // 经 hub API 取真实 ID（auth token 在 sessionStorage 的 luban_cad_auth）
    const { projectId, imodelId } = await getFirstProjectAndIModel(page);

    // 编辑器路由是 /workspace/:iTwinId/:iModelId（不存在 /editor/...）
    await page.goto(`/workspace/${projectId}/${imodelId}`);
    await page.screenshot({ path: 'test-results/editor-direct.png', fullPage: true });

    // 先等编辑器就绪（IPC WS 握手偶发挂起，waitForEditorReady 内含卡滞 reload 重试）
    await waitForEditorReady(page);

    // CAD 工具条（编辑权限 + briefcase 连接建立后渲染）
    const toolbar = page.locator('.cad-toolbar-horizontal');
    await expect(toolbar).toBeVisible({ timeout: 60000 });

    // Check tool categories
    const categories = ['草图', '实体', '变换', '布尔', '边', '面', '高级'];
    for (const category of categories) {
      await expect(toolbar.getByText(category, { exact: true })).toBeVisible();
    }
  });
});
