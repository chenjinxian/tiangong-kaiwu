/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Complete E2E test using API login（API 登录路径）
 * Full workflow: API Login -> Create iTwin -> Create iModel -> Open Editor
 */

import { test, expect } from '@playwright/test';
import { waitForEditorReady } from './helpers';

// Test configuration
const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:4000';
const TEST_USER = {
  email: 'test@example.com',
  password: 'Test123!@#'
};

// Helper: Generate unique names to avoid conflicts
const timestamp = Date.now();
const TEST_PROJECT_NAME = `E2E Project ${timestamp}`;
const TEST_IMODEL_NAME = `E2E Model ${timestamp}`;

test.describe('Complete E2E Workflow (API Login)', () => {
  test('Full workflow: API Login -> Create iTwin -> Create iModel -> Open Editor', async ({ page }) => {
    test.setTimeout(300000); // 5 minutes timeout for full workflow

    console.log(`🏗️  Project name: ${TEST_PROJECT_NAME}`);
    console.log(`📐 iModel name: ${TEST_IMODEL_NAME}`);

    // Step 1: API Login and set auth state
    console.log('📍 Step 1: API Login');

    // 用 Playwright request 上下文（Node 侧）调登录 API —— page.evaluate 在 about:blank 上 fetch 会被 CORS 拦
    const loginResponse = await page.request.post(`${API_URL}/auth/email/login`, {
      data: { email: TEST_USER.email, password: TEST_USER.password },
    });
    expect(loginResponse.ok(), 'API 登录应成功').toBeTruthy();
    const loginData = (await loginResponse.json()) as {
      token: string; refreshToken: string; tokenExpires?: number;
      user: { id: number | string; email?: string; firstName?: string; lastName?: string };
    };

    // Set auth state —— 本应用 auth 存 sessionStorage（getStoredAuth 只读 sessionStorage，localStorage 无效）
    await page.goto(BASE_URL);
    await page.evaluate(({ token, refreshToken, user, expiresAt }) => {
      const authData = {
        accessToken: token,
        refreshToken: refreshToken,
        expiresIn: 900,
        expiresAt: expiresAt
      };
      const userData = {
        id: String(user.id),
        email: user.email || '',
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        plan: 'free' as const
      };

      sessionStorage.setItem('luban_cad_auth', JSON.stringify(authData));
      sessionStorage.setItem('luban_cad_user', JSON.stringify(userData));
      localStorage.setItem('luban_cad_remember_me', 'true');
    }, {
      token: loginData.token,
      refreshToken: loginData.refreshToken,
      user: loginData.user,
      expiresAt: loginData.tokenExpires
    });

    console.log('✅ Auth state set in sessionStorage');

    // Navigate to iTwins page (should be authenticated now)
    await page.goto(`${BASE_URL}/itwins`);
    await expect(page).toHaveURL(/\/itwins/);

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
    console.log('✅ iTwin created successfully');

    // Step 3: Navigate to project
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
    console.log('✅ iModel created successfully');

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
    await page
      .evaluate(async (id) => {
        const authJson = sessionStorage.getItem('luban_cad_auth');
        const auth = authJson ? JSON.parse(authJson) : null;
        const headers: Record<string, string> = auth?.accessToken
          ? { Authorization: `Bearer ${auth.accessToken}` }
          : {};
        await fetch(`http://localhost:4000/itwins/${id}`, { method: 'DELETE', headers });
      }, projectId)
      .catch(() => undefined);
  });
});
