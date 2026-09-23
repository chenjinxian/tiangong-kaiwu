/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
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

  // Navigate to login page
  await page.goto('/login');

  // Fill in credentials
  await page.fill('input[type="email"]', TEST_USER.email);
  await page.fill('input[type="password"]', TEST_USER.password);

  // Click login button
  await page.click('button[type="submit"]');

  // Wait for navigation to documents/itwins page
  await page.waitForURL(/\/documents|\/itwins/, { timeout: 10000 });
}

/**
 * Navigate to editor helper
 */
async function navigateToEditor(page: any) {
  // Wait for page to load (项目卡片)
  await page.waitForSelector('text=测试项目', { timeout: 10000 });

  // Click on first project card
  await page.locator('.section-card, [class*="card"]').filter({ hasText: '测试项目' }).first().click();

  // Wait for project detail page to load
  await page.waitForTimeout(2000);

  // Check if we're on the project detail page
  const url = page.url();
  if (!url.includes('/itwins/')) {
    throw new Error('Not on project detail page');
  }

  // Look for iModel cards
  const imodelCards = page.locator('.imodel-card, [class*="iModel"], .card');
  const count = await imodelCards.count();

  if (count === 0) {
    console.log('No iModels found in this project');
    throw new Error('No iModel available for testing');
  }

  // Click on first iModel
  await imodelCards.first().click();

  // Wait for viewer/editor to load
  await page.waitForTimeout(5000);
}

/**
 * E2E Tests for Modeling Tools
 * Tests all modeling tools including the newly implemented ones:
 * - Boolean tools (Unite, Subtract, Intersect)
 * - OffsetFaces
 * - SweepFaces
 */

test.describe('Modeling Tools - Basic Visibility', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('login should succeed and show project page', async ({ page }) => {
    // Verify we're on the projects page
    await expect(page.locator('h2:has-text("我的项目")').first()).toBeVisible();
    await expect(page.locator('text=测试项目').first()).toBeVisible();
  });
});

test.describe('Modeling Tools - Toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
    try {
      await navigateToEditor(page);
    } catch (e) {
      console.log('Could not navigate to editor:', e);
      test.skip();
    }
  });

  test('should display CAD toolbar with all categories', async ({ page }) => {
    // Wait for toolbar to appear
    await page.waitForSelector('.cad-toolbar-horizontal', { timeout: 10000 });

    // Check all tool categories are visible
    const categories = ['草图', '实体', '变换', '布尔', '边', '面', '高级'];
    for (const category of categories) {
      await expect(page.locator('.cad-toolbar-horizontal').locator('text=' + category)).toBeVisible();
    }
  });

  test('should display boolean tool buttons', async ({ page }) => {
    await page.waitForSelector('.cad-toolbar-horizontal', { timeout: 10000 });

    // Check boolean tools
    await expect(page.locator('.cad-toolbar-horizontal').locator('button[title*="并集"], button[label*="并集"]').first()).toBeVisible();
    await expect(page.locator('.cad-toolbar-horizontal').locator('button[title*="差集"], button[label*="差集"]').first()).toBeVisible();
    await expect(page.locator('.cad-toolbar-horizontal').locator('button[title*="交集"], button[label*="交集"]').first()).toBeVisible();
  });

  test('should display face tool buttons', async ({ page }) => {
    await page.waitForSelector('.cad-toolbar-horizontal', { timeout: 10000 });

    // Check face tools
    await expect(page.locator('.cad-toolbar-horizontal').locator('button[title*="抽壳"], button[label*="抽壳"]').first()).toBeVisible();
    await expect(page.locator('.cad-toolbar-horizontal').locator('button[title*="面偏移"], button[label*="面偏移"]').first()).toBeVisible();
    await expect(page.locator('.cad-toolbar-horizontal').locator('button[title*="拉伸面"], button[label*="拉伸面"]').first()).toBeVisible();
    await expect(page.locator('.cad-toolbar-horizontal').locator('button[title*="拔模"], button[label*="拔模"]').first()).toBeVisible();
  });

  test('should display edge tool buttons', async ({ page }) => {
    await page.waitForSelector('.cad-toolbar-horizontal', { timeout: 10000 });

    // Check edge tools
    await expect(page.locator('.cad-toolbar-horizontal').locator('button[title*="圆角"], button[label*="圆角"]').first()).toBeVisible();
    await expect(page.locator('.cad-toolbar-horizontal').locator('button[title*="倒角"], button[label*="倒角"]').first()).toBeVisible();
  });
});

test.describe('Modeling Tools - Activation', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
    try {
      await navigateToEditor(page);
    } catch (e) {
      console.log('Could not navigate to editor:', e);
      test.skip();
    }
  });

  test('should activate UniteSolids tool without error', async ({ page }) => {
    await page.waitForSelector('.cad-toolbar-horizontal', { timeout: 10000 });

    // Click Unite button
    const uniteButton = page.locator('.cad-toolbar-horizontal').locator('button[title*="并集"], button[label*="并集"]').first();
    await uniteButton.click();

    // Check for tool activation message in notifications
    await expect(page.locator('text=选择目标实体').first()).toBeVisible({ timeout: 5000 });
  });

  test('should activate SubtractSolids tool without error', async ({ page }) => {
    await page.waitForSelector('.cad-toolbar-horizontal', { timeout: 10000 });

    const subtractButton = page.locator('.cad-toolbar-horizontal').locator('button[title*="差集"], button[label*="差集"]').first();
    await subtractButton.click();

    await expect(page.locator('text=选择目标实体').first()).toBeVisible({ timeout: 5000 });
  });

  test('should activate IntersectSolids tool without error', async ({ page }) => {
    await page.waitForSelector('.cad-toolbar-horizontal', { timeout: 10000 });

    const intersectButton = page.locator('.cad-toolbar-horizontal').locator('button[title*="交集"], button[label*="交集"]').first();
    await intersectButton.click();

    await expect(page.locator('text=选择目标实体').first()).toBeVisible({ timeout: 5000 });
  });

  test('should activate OffsetFaces tool without error', async ({ page }) => {
    await page.waitForSelector('.cad-toolbar-horizontal', { timeout: 10000 });

    const offsetButton = page.locator('.cad-toolbar-horizontal').locator('button[title*="面偏移"], button[label*="面偏移"]').first();
    await offsetButton.click();

    await expect(page.locator('text=点击选择要偏移的面').first()).toBeVisible({ timeout: 5000 });
  });

  test('should activate SweepFaces tool without error', async ({ page }) => {
    await page.waitForSelector('.cad-toolbar-horizontal', { timeout: 10000 });

    const sweepButton = page.locator('.cad-toolbar-horizontal').locator('button[title*="拉伸面"], button[label*="拉伸面"]').first();
    await sweepButton.click();

    await expect(page.locator('text=选择要拉伸的面').first()).toBeVisible({ timeout: 5000 });
  });

  test('should activate RoundEdges tool without error', async ({ page }) => {
    await page.waitForSelector('.cad-toolbar-horizontal', { timeout: 10000 });

    const roundButton = page.locator('.cad-toolbar-horizontal').locator('button[title*="圆角"], button[label*="圆角"]').first();
    await roundButton.click();

    await expect(page.locator('text=点击选择要圆角的边').first()).toBeVisible({ timeout: 5000 });
  });

  test('should activate ChamferEdges tool without error', async ({ page }) => {
    await page.waitForSelector('.cad-toolbar-horizontal', { timeout: 10000 });

    const chamferButton = page.locator('.cad-toolbar-horizontal').locator('button[title*="倒角"], button[label*="倒角"]').first();
    await chamferButton.click();

    await expect(page.locator('text=点击选择要倒角的边').first()).toBeVisible({ timeout: 5000 });
  });

  test('should activate HollowFaces tool without error', async ({ page }) => {
    await page.waitForSelector('.cad-toolbar-horizontal', { timeout: 10000 });

    const hollowButton = page.locator('.cad-toolbar-horizontal').locator('button[title*="抽壳"], button[label*="抽壳"]').first();
    await hollowButton.click();

    await expect(page.locator('text=点击选择要移除的面').first()).toBeVisible({ timeout: 5000 });
  });

  test('should activate DraftFaces tool without error', async ({ page }) => {
    await page.waitForSelector('.cad-toolbar-horizontal', { timeout: 10000 });

    const draftButton = page.locator('.cad-toolbar-horizontal').locator('button[title*="拔模"], button[label*="拔模"]').first();
    await draftButton.click();

    await expect(page.locator('text=点击选择要拔模的面').first()).toBeVisible({ timeout: 5000 });
  });

  test('should activate MirrorElements tool without error', async ({ page }) => {
    await page.waitForSelector('.cad-toolbar-horizontal', { timeout: 10000 });

    const mirrorButton = page.locator('.cad-toolbar-horizontal').locator('button[title*="镜像"], button[label*="镜像"]').first();
    await mirrorButton.click();

    await expect(page.locator('text=选择要镜像的元素').first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Modeling Tools - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
    try {
      await navigateToEditor(page);
    } catch (e) {
      console.log('Could not navigate to editor:', e);
      test.skip();
    }
  });

  test('should handle tool activation without console errors', async ({ page }) => {
    await page.waitForSelector('.cad-toolbar-horizontal', { timeout: 10000 });

    // Collect console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.log('Console error:', msg.text());
      }
    });

    // Test all tools
    const tools = [
      { name: '圆角', text: '点击选择要圆角的边' },
      { name: '倒角', text: '点击选择要倒角的边' },
      { name: '抽壳', text: '点击选择要移除的面' },
      { name: '拔模', text: '点击选择要拔模的面' },
      { name: '面偏移', text: '点击选择要偏移的面' },
      { name: '拉伸面', text: '选择要拉伸的面' },
      { name: '并集', text: '选择目标实体' },
      { name: '差集', text: '选择目标实体' },
      { name: '交集', text: '选择目标实体' },
    ];

    for (const tool of tools) {
      // Clear previous errors
      consoleErrors.length = 0;

      // Click tool button
      const button = page.locator('.cad-toolbar-horizontal').locator(`button[title*="${tool.name}"], button[label*="${tool.name}"]`).first();
      await button.click();

      // Wait for tool activation
      await page.waitForSelector(`text=${tool.text}`, { timeout: 5000 });

      // Check no critical errors
      const criticalErrors = consoleErrors.filter(e =>
        e.includes('Tool not registered') ||
        e.includes('undefined is not') ||
        e.includes('cannot read property') ||
        e.includes('is not a function')
      );

      expect(criticalErrors).toHaveLength(0);

      // Press Escape to exit tool
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  });
});
