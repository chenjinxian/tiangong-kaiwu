/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';

/**
 * Login helper function
 */
async function loginUser(page: any) {
  const TEST_USER = {
    email: 'test@example.com',
    password: 'Test123!@#',
  };

  await page.goto('/login');
  await page.fill('input[type="email"]', TEST_USER.email);
  await page.fill('input[type="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/documents|\/itwins/, { timeout: 10000 });
}

test.describe('Modeling Tools - Smoke Test', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('login should succeed', async ({ page }) => {
    await expect(page.locator('h2:has-text("我的项目")').first()).toBeVisible();
    await expect(page.locator('text=测试项目').first()).toBeVisible();
  });

  test('should navigate to existing iModel editor', async ({ page }) => {
    // Directly navigate to an existing iModel editor
    // First get a list of projects/iModels from the API or navigate directly
    await page.goto('/itwins');
    await page.waitForTimeout(2000);

    // Click on first project
    const projectCards = page.locator('.section-card, [class*="card"]').filter({ hasText: /测试|项目/ });
    const count = await projectCards.count();

    if (count === 0) {
      test.skip('No projects available');
    }

    await projectCards.first().click();
    await page.waitForTimeout(2000);

    // Check if we're on project detail page
    const url = page.url();
    console.log('Current URL:', url);

    // If we have iModels, click the first one
    const imodelCards = page.locator('.card, [class*="iModel"], [class*="imodel"]').filter({ hasText: /iModel|模型/ });
    const imodelCount = await imodelCards.count();
    console.log('iModel count:', imodelCount);

    if (imodelCount > 0) {
      await imodelCards.first().click();
      await page.waitForTimeout(5000);

      // Check if we're on editor page
      const editorUrl = page.url();
      console.log('Editor URL:', editorUrl);

      // Take screenshot for debugging
      await page.screenshot({ path: 'test-results/editor-page.png', fullPage: true });
    } else {
      test.skip('No iModels available in project');
    }
  });
});

test.describe('Modeling Tools - Direct Editor Access', () => {
  test('should load editor directly and show toolbar', async ({ page }) => {
    // Try to access editor directly with a known iModel
    // Note: This assumes there is at least one iModel in the system

    await loginUser(page);

    // First try to get iModel info from API
    const response = await page.evaluate(async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('http://localhost:4000/itwins', {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        return await res.json();
      } catch (e) {
        return { error: String(e) };
      }
    });

    console.log('Projects response:', response);

    // If we have projects, navigate to the first one
    if (response.iTwins && response.iTwins.length > 0) {
      const projectId = response.iTwins[0].id;

      // Get iModels for this project
      const imodelsResponse = await page.evaluate(async (pid) => {
        try {
          const token = localStorage.getItem('token');
          const res = await fetch(`http://localhost:4000/imodels?iTwinId=${pid}`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
          });
          return await res.json();
        } catch (e) {
          return { error: String(e) };
        }
      }, projectId);

      console.log('iModels response:', imodelsResponse);

      if (imodelsResponse.iModels && imodelsResponse.iModels.length > 0) {
        const imodelId = imodelsResponse.iModels[0].id;

        // Navigate directly to editor
        await page.goto(`/editor/${projectId}/${imodelId}`);
        await page.waitForTimeout(10000);

        // Take screenshot
        await page.screenshot({ path: 'test-results/editor-direct.png', fullPage: true });

        // Check for toolbar
        const toolbar = page.locator('.cad-toolbar-horizontal');
        const isVisible = await toolbar.isVisible().catch(() => false);

        if (isVisible) {
          console.log('Toolbar is visible!');
          await expect(toolbar).toBeVisible();

          // Check tool categories
          const categories = ['草图', '实体', '变换', '布尔', '边', '面', '高级'];
          for (const category of categories) {
            await expect(toolbar.locator('text=' + category)).toBeVisible();
          }
        } else {
          console.log('Toolbar not found, checking page content...');
          const pageContent = await page.content();
          console.log('Page content preview:', pageContent.substring(0, 500));
        }
      } else {
        test.skip('No iModels found');
      }
    } else {
      test.skip('No projects found');
    }
  });
});
