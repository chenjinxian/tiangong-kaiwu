/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Complete E2E test for LubanCAD（UI 登录版）
 * Full workflow: Login -> Create iTwin -> Create iModel -> Open Editor
 */

import { test, expect } from '@playwright/test';
import { loginViaUI, deleteProjectViaApi, waitForEditorReady } from './helpers';

// Helper: Generate unique names to avoid conflicts
const timestamp = Date.now();
const TEST_PROJECT_NAME = `E2E Project ${timestamp}`;
const TEST_IMODEL_NAME = `E2E Model ${timestamp}`;

test.describe('Complete E2E Workflow', () => {
  test('Full workflow: Login -> Create iTwin -> Create iModel -> Open Editor', async ({ page }) => {
    test.setTimeout(180000); // 3 minutes timeout for full workflow

    console.log(`🏗️  Project name: ${TEST_PROJECT_NAME}`);
    console.log(`📐 iModel name: ${TEST_IMODEL_NAME}`);

    // Step 1: Login
    console.log('📍 Step 1: Login');
    await loginViaUI(page);
    await expect(page.url()).toContain('/itwins');

    // Step 2: Create new iTwin project
    console.log('📍 Step 2: Create iTwin Project');

    // 新建项目对话框：标题只在 aria-label（内层 heading 为空），用 role 定位
    await page.getByRole('button', { name: '新建项目' }).first().click();
    const dialog = page.getByRole('dialog', { name: '创建 iTwin 项目' });
    await expect(dialog).toBeVisible({ timeout: 10000 });

    await page.locator('input[placeholder="输入项目名称"]').fill(TEST_PROJECT_NAME);
    await dialog.getByRole('button', { name: '创建', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 30000 });

    // 项目卡片出现在「我的项目」列表（默认过滤即 my）
    const projectItem = page.locator('main').getByRole('button', { name: TEST_PROJECT_NAME }).first();
    await expect(projectItem).toBeVisible({ timeout: 30000 });
    console.log('✅ iTwin created');

    // Step 3: Navigate to the new project
    console.log('📍 Step 3: Navigate to project');
    await projectItem.click();
    await page.waitForURL(/\/itwins\/[^/]+$/, { timeout: 30000 });
    const projectId = page.url().split('/')[4] ?? '';
    await expect(page.locator('body')).toContainText(TEST_PROJECT_NAME);

    // Step 4: Create iModel
    console.log('📍 Step 4: Create iModel');
    await page.getByRole('button', { name: '新建 iModel' }).first().click();
    const imodelDialog = page.locator('.dialog-container').filter({ hasText: '创建 iModel' });
    await expect(imodelDialog).toBeVisible({ timeout: 10000 });

    await page.locator('input[placeholder="输入模型名称"]').fill(TEST_IMODEL_NAME);
    await imodelDialog.getByRole('button', { name: '创建', exact: true }).click();

    // onCreated 会让父组件即时关闭对话框（completed 步骤不可见）——以对话框关闭 + 新卡片出现为就绪信号
    await expect(imodelDialog).toBeHidden({ timeout: 120000 });
    console.log('✅ iModel created');

    // Step 5: Open iModel in editor
    console.log('📍 Step 5: Open iModel in Editor');
    const openBtn = page.getByRole('button', { name: '打开工作空间' }).first();
    // 新建 iModel 经 webhook-agent 异步初始化（同步中指示器），卡片/解锁可能滞后
    await expect(openBtn).toBeVisible({ timeout: 60000 });
    await expect(openBtn).toBeEnabled({ timeout: 60000 });
    await openBtn.click();
    await page.waitForURL(/\/workspace\/[^/]+\/[^/]+/, { timeout: 60000 });

    // 编辑器就绪：主工具条/面包屑 + CAD 工具条（后者等价于 briefcase 连接已建立）
    await waitForEditorReady(page);
    await expect(page.locator('.toolbar').first()).toBeVisible({ timeout: 60000 });
    await expect(page.locator('.breadcrumb').first()).toBeVisible();
    await expect(page.locator('.cad-toolbar-horizontal')).toBeVisible({ timeout: 60000 });

    console.log('🎉 Complete E2E workflow test PASSED!');

    // Cleanup: best-effort 删除测试项目（级联删 iModel）
    await deleteProjectViaApi(page, projectId);
  });
});
