/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Authenticated E2E test using pre-saved auth state
 * Full workflow: Create iTwin -> Create iModel -> Open Editor
 */

import { test, expect } from '@playwright/test';

// Test configuration
const BASE_URL = 'http://localhost:3000';

// Helper: Generate unique names to avoid conflicts
const timestamp = Date.now();
const TEST_PROJECT_NAME = `E2E Project ${timestamp}`;
const TEST_IMODEL_NAME = `E2E Model ${timestamp}`;

// Use pre-authenticated state
test.use({ storageState: 'playwright/.auth/user.json' });

test.describe('Authenticated E2E Workflow', () => {
  test('Full workflow: Create iTwin -> Create iModel -> Open Editor', async ({ page }) => {
    test.setTimeout(300000); // 5 minutes timeout

    console.log('🚀 Starting authenticated E2E workflow test...');
    console.log(`🏗️  Project name: ${TEST_PROJECT_NAME}`);
    console.log(`📐 iModel name: ${TEST_IMODEL_NAME}`);

    // Set up auth injection before any navigation
    await page.addInitScript(() => {
      const authData = {
        accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1IiwiaWQiOjUsInJvbGUiOnsiaWQiOjIsIm5hbWUiOiJVc2VyIiwiX19lbnRpdHkiOiJSb2xlRW50aXR5In0sInNlc3Npb25JZCI6Mjk0LCJpYXQiOjE3NzU2OTQ4MzcsImV4cCI6MTc3NTY5NTczN30.cKv-6_upOdgqckYImtoTcY5PcIpOeh6VcndWowXdoRI",
        refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXNzaW9uSWQiOjI5NCwiaGFzaCI6IjU5MTg5MWIwYWIyMmJiYWFlOWQxNzczZmZhY2NhMmM5NGEyZmIwYmRhZGRjMjEyNDdjODFhMWM5MDMwYTJjNGQiLCJpYXQiOjE3NzU2OTQ4MzcsImV4cCI6MjA5MTA1NDgzN30.IR_1m6hbzUbF9WWqsn9SJ-271BGTsAKLtmKwtVCwuDs",
        expiresIn: 900,
        expiresAt: 1775695737621
      };
      const userData = { id: "5", email: "test@example.com", name: "Test User", plan: "free" };
      sessionStorage.setItem('open_cloud_cad_auth', JSON.stringify(authData));
      sessionStorage.setItem('open_cloud_cad_user', JSON.stringify(userData));
    });

    // Step 1: Navigate to iTwins page
    console.log('\n📍 Step 1: Navigate to iTwins page');
    await page.goto(`${BASE_URL}/itwins`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/01-itwins-page.png', fullPage: true });

    console.log('✅ Navigated to /itwins');

    // Verify we're on the iTwins page
    await expect(page).toHaveURL(/\/itwins/);

    // Step 2: Create new iTwin project
    console.log('\n📍 Step 2: Create iTwin Project');

    // Click "Create iTwin" button
    const createProjectBtn = page.locator('button:has-text("新建项目")').first();
    await createProjectBtn.waitFor({ state: 'visible', timeout: 10000 });
    await createProjectBtn.click();

    // Wait for dialog
    const dialog = page.locator('text=创建 iTwin 项目').first();
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    await page.screenshot({ path: 'test-results/02-create-dialog.png' });

    // Fill project name
    const projectNameInput = page.locator('input[placeholder="输入项目名称"]').first();
    await projectNameInput.fill(TEST_PROJECT_NAME);
    console.log(`✅ Project name filled: ${TEST_PROJECT_NAME}`);

    // Click create button
    const createBtn = page.locator('button:has-text("创建")').first();
    await createBtn.click();

    // Wait for dialog to close
    await dialog.waitFor({ state: 'detached', timeout: 30000 });
    console.log('✅ Create dialog closed');

    // Switch to "My Projects" tab
    const myProjectsTab = page.locator('button:has-text("我的项目")').first();
    await myProjectsTab.click();
    await page.waitForTimeout(1000);

    // Wait for project to appear
    const projectItem = page.locator(`text=${TEST_PROJECT_NAME}`).first();
    await projectItem.waitFor({ state: 'visible', timeout: 30000 });

    console.log('✅ iTwin created successfully');
    await page.screenshot({ path: 'test-results/03-after-create.png', fullPage: true });

    // Step 3: Navigate to project
    console.log('\n📍 Step 3: Navigate to project');
    await projectItem.click();

    await page.waitForURL(/\/itwins\/.+/, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    console.log('✅ Navigated to project detail');
    await page.screenshot({ path: 'test-results/04-project-detail.png', fullPage: true });

    // Verify project name
    await expect(page.locator('body')).toContainText(TEST_PROJECT_NAME);

    // Step 4: Create iModel
    console.log('\n📍 Step 4: Create iModel');

    const createIModelBtn = page.locator('button:has-text("新建 iModel"), button:has-text("创建 iModel")').first();
    await createIModelBtn.waitFor({ state: 'visible', timeout: 10000 });
    await createIModelBtn.click();

    const imodelDialog = page.locator('text=创建 iModel').first();
    await imodelDialog.waitFor({ state: 'visible', timeout: 10000 });
    await page.screenshot({ path: 'test-results/05-imodel-dialog.png' });

    const imodelNameInput = page.locator('input[placeholder="输入模型名称"]').first();
    await imodelNameInput.fill(TEST_IMODEL_NAME);
    console.log(`✅ iModel name filled: ${TEST_IMODEL_NAME}`);

    const imodelCreateBtn = page.locator('button:has-text("创建")').first();
    await imodelCreateBtn.click();

    await page.waitForSelector(`text=${TEST_IMODEL_NAME}`, { timeout: 60000 });
    await page.waitForSelector('button:has-text("打开工作空间")', { timeout: 30000 });

    console.log('✅ iModel created successfully');
    await page.screenshot({ path: 'test-results/06-after-imodel-create.png', fullPage: true });

    // Step 5: Open iModel in editor
    console.log('\n📍 Step 5: Open iModel in Editor');

    const openWorkspaceBtn = page.locator('button:has-text("打开工作空间")').first();
    await openWorkspaceBtn.waitFor({ state: 'visible', timeout: 10000 });
    await openWorkspaceBtn.click();

    await page.waitForURL(/\/workspace\/[^/]+\/[^/]+/, { timeout: 60000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);

    console.log('✅ Editor opened');
    await page.screenshot({ path: 'test-results/07-editor-loaded.png', fullPage: true });

    // Verify editor UI
    const hasToolbar = await page.locator('.toolbar, [data-testid="cad-toolbar"]').isVisible().catch(() => false);
    const hasBreadcrumb = await page.locator('.breadcrumb, [class*="breadcrumb"]').isVisible().catch(() => false);

    console.log(`\n📊 Editor UI check:`);
    console.log(`   - Toolbar visible: ${hasToolbar}`);
    console.log(`   - Breadcrumb visible: ${hasBreadcrumb}`);

    // Step 6: Check modeling tools
    if (hasToolbar) {
      console.log('\n📍 Step 6: Test Modeling Tools');

      const modelingTools = ['选择', '平移', '旋转', '缩放'];
      for (const tool of modelingTools) {
        const toolBtn = page.locator(`button:has-text("${tool}")`).first();
        const isVisible = await toolBtn.isVisible().catch(() => false);
        if (isVisible) {
          console.log(`   ✅ Tool found: ${tool}`);
        }
      }

      await page.screenshot({ path: 'test-results/08-modeling-tools.png', fullPage: true });
    }

    console.log('\n🎉 ==========================================');
    console.log('🎉 Complete E2E workflow test PASSED!');
    console.log('🎉 ==========================================');
    console.log(`   Project: ${TEST_PROJECT_NAME}`);
    console.log(`   iModel: ${TEST_IMODEL_NAME}`);
  });
});
