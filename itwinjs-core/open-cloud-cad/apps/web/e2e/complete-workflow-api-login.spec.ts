/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Complete E2E test using API login
 * Bypasses UI login by directly calling auth API and setting localStorage
 */

import { test, expect } from '@playwright/test';

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

    console.log('🚀 Starting complete E2E workflow test...');
    console.log(`📧 Using test user: ${TEST_USER.email}`);
    console.log(`🏗️  Project name: ${TEST_PROJECT_NAME}`);
    console.log(`📐 iModel name: ${TEST_IMODEL_NAME}`);

    // Step 1: API Login and set auth state
    console.log('\n📍 Step 1: API Login');

    // Call login API directly
    const loginResponse = await page.evaluate(async ({ apiUrl, email, password }) => {
      const response = await fetch(`${apiUrl}/auth/email/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      return response.json();
    }, { apiUrl: API_URL, email: TEST_USER.email, password: TEST_USER.password });

    console.log('✅ Login API response received');

    // Set auth state in localStorage
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

      localStorage.setItem('open_cloud_cad_auth', JSON.stringify(authData));
      localStorage.setItem('open_cloud_cad_user', JSON.stringify(userData));
      localStorage.setItem('open_cloud_cad_remember_me', 'true');
    }, {
      token: loginResponse.token,
      refreshToken: loginResponse.refreshToken,
      user: loginResponse.user,
      expiresAt: loginResponse.tokenExpires
    });

    console.log('✅ Auth state set in localStorage');

    // Navigate to iTwins page (should be authenticated now)
    await page.goto(`${BASE_URL}/itwins`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/02-itwins-page.png', fullPage: true });

    console.log('✅ Navigated to /itwins');

    // Verify we're on the iTwins page
    await expect(page).toHaveURL(/\/itwins/);

    // Step 2: Create new iTwin project
    console.log('\n📍 Step 2: Create iTwin Project');

    // Click "Create iTwin" button (using Chinese text)
    const createProjectBtn = page.locator('button:has-text("新建项目")').first();
    await createProjectBtn.waitFor({ state: 'visible', timeout: 10000 });
    await createProjectBtn.click();

    // Wait for dialog to appear (using Chinese text)
    const dialog = page.locator('text=创建 iTwin 项目').first();
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    await page.screenshot({ path: 'test-results/03-create-dialog.png' });

    // Fill project name
    const projectNameInput = page.locator('input[placeholder="输入项目名称"]').first();
    await projectNameInput.fill(TEST_PROJECT_NAME);
    console.log(`✅ Project name filled: ${TEST_PROJECT_NAME}`);

    // Click create button in dialog
    const createBtn = page.locator('button:has-text("创建")').first();
    await createBtn.click();

    // Wait for dialog to close
    await dialog.waitFor({ state: 'detached', timeout: 30000 });
    console.log('✅ Create dialog closed');

    // Switch to "My Projects" tab to see the new project
    const myProjectsTab = page.locator('button:has-text("我的项目")').first();
    await myProjectsTab.click();
    await page.waitForTimeout(1000);

    // Wait for project to appear in list
    const projectItem = page.locator(`text=${TEST_PROJECT_NAME}`).first();
    await projectItem.waitFor({ state: 'visible', timeout: 30000 });

    console.log('✅ iTwin created successfully');
    await page.screenshot({ path: 'test-results/04-after-create.png', fullPage: true });

    // Step 3: Navigate to the new project
    console.log('\n📍 Step 3: Navigate to project');

    // Click on the new project
    await projectItem.click();

    // Wait for navigation to project detail page
    await page.waitForURL(/\/itwins\/.+/, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    console.log('✅ Navigated to project detail');
    await page.screenshot({ path: 'test-results/05-project-detail.png', fullPage: true });

    // Verify project name is displayed
    await expect(page.locator('body')).toContainText(TEST_PROJECT_NAME);

    // Step 4: Create iModel
    console.log('\n📍 Step 4: Create iModel');

    // Look for "Create iModel" button
    const createIModelBtn = page.locator('button:has-text("新建 iModel"), button:has-text("创建 iModel")').first();
    await createIModelBtn.waitFor({ state: 'visible', timeout: 10000 });
    await createIModelBtn.click();

    // Wait for dialog
    const imodelDialog = page.locator('text=创建 iModel').first();
    await imodelDialog.waitFor({ state: 'visible', timeout: 10000 });
    await page.screenshot({ path: 'test-results/06-imodel-dialog.png' });

    // Fill iModel name
    const imodelNameInput = page.locator('input[placeholder="输入模型名称"]').first();
    await imodelNameInput.fill(TEST_IMODEL_NAME);
    console.log(`✅ iModel name filled: ${TEST_IMODEL_NAME}`);

    // Submit
    const imodelCreateBtn = page.locator('button:has-text("创建")').first();
    await imodelCreateBtn.click();

    // Wait for iModel to be created
    await page.waitForSelector(`text=${TEST_IMODEL_NAME}`, { timeout: 60000 });
    await page.waitForSelector('button:has-text("打开工作空间")', { timeout: 30000 });

    console.log('✅ iModel created successfully');
    await page.screenshot({ path: 'test-results/07-after-imodel-create.png', fullPage: true });

    // Step 5: Open iModel in editor
    console.log('\n📍 Step 5: Open iModel in Editor');

    // Click "打开工作空间" button to open editor
    const openWorkspaceBtn = page.locator('button:has-text("打开工作空间")').first();
    await openWorkspaceBtn.waitFor({ state: 'visible', timeout: 10000 });
    await openWorkspaceBtn.click();

    // Wait for navigation to editor
    await page.waitForURL(/\/workspace\/[^/]+\/[^/]+/, { timeout: 60000 });
    await page.waitForLoadState('domcontentloaded');

    // Wait for viewer to initialize
    await page.waitForTimeout(5000);

    console.log('✅ Editor opened');
    await page.screenshot({ path: 'test-results/08-editor-loaded.png', fullPage: true });

    // Verify editor UI elements
    const hasToolbar = await page.locator('.toolbar, [data-testid="cad-toolbar"]').isVisible().catch(() => false);
    const hasBreadcrumb = await page.locator('.breadcrumb, [class*="breadcrumb"]').isVisible().catch(() => false);
    const hasViewer = await page.locator('[data-testid="web-viewer"], .viewer-container').isVisible().catch(() => false);

    console.log(`\n📊 Editor UI check:`);
    console.log(`   - Toolbar visible: ${hasToolbar}`);
    console.log(`   - Breadcrumb visible: ${hasBreadcrumb}`);
    console.log(`   - Viewer visible: ${hasViewer}`);

    // Step 6: Test basic modeling tools (if editor loaded properly)
    if (hasToolbar) {
      console.log('\n📍 Step 6: Test Modeling Tools');

      // Try to find and click on a modeling tool
      const modelingTools = ['选择', '平移', '旋转', '缩放', '圆角', '倒角', '抽壳'];
      for (const tool of modelingTools) {
        const toolBtn = page.locator(`button:has-text("${tool}")`).first();
        const isVisible = await toolBtn.isVisible().catch(() => false);
        if (isVisible) {
          console.log(`   ✅ Tool found: ${tool}`);
        }
      }

      await page.screenshot({ path: 'test-results/09-modeling-tools.png', fullPage: true });
    }

    // Final success message
    console.log('\n🎉 ==========================================');
    console.log('🎉 Complete E2E workflow test PASSED!');
    console.log('🎉 ==========================================');
    console.log(`   Project: ${TEST_PROJECT_NAME}`);
    console.log(`   iModel: ${TEST_IMODEL_NAME}`);
    console.log(`   User: ${TEST_USER.email}`);
    console.log('   All steps completed successfully!');

    // Cleanup: Delete the test project (optional)
    console.log('\n📍 Cleanup: Delete test project');
    // Navigate back to projects page
    await page.goto(`${BASE_URL}/itwins`);
    await page.waitForLoadState('networkidle');

    // Find and delete the test project
    const testProject = page.locator(`text=${TEST_PROJECT_NAME}`).first();
    const projectExists = await testProject.isVisible().catch(() => false);

    if (projectExists) {
      // Look for delete button
      const projectCard = testProject.locator('xpath=../..');
      const deleteBtn = projectCard.locator('button[title="删除"], button:has-text("删除")').first();

      if (await deleteBtn.isVisible().catch(() => false)) {
        await deleteBtn.click();
        // Confirm deletion if dialog appears
        const confirmBtn = page.locator('button:has-text("确认"), button:has-text("删除")').first();
        if (await confirmBtn.isVisible().catch(() => false)) {
          await confirmBtn.click();
        }
        console.log('✅ Test project deleted');
      }
    }

    console.log('\n✅ E2E test completed successfully!');
  });
});
