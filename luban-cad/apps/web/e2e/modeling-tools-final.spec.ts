/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Modeling Tools - Final Version
 * Tests that all modeling tools are properly registered and visible in the toolbar
 */

test.describe('Modeling Tools - Toolbar Visibility', () => {
  test('should display complete CAD toolbar in editor', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'Test123!@#');
    await page.click('button[type="submit"]');

    // Wait for login to complete
    await page.waitForURL(/\/documents|\/itwins/, { timeout: 10000 });

    // Try to navigate to an editor page directly
    // First check what projects are available
    await page.goto('/itwins');
    await page.waitForTimeout(2000);

    // Get all project links/cards
    const projectCards = page.locator('a[href*="/itwins/"], .section-card, [class*="card"]').filter({ hasText: /./ });
    const count = await projectCards.count();
    console.log(`Found ${count} project cards`);

    if (count > 0) {
      // Click first project
      await projectCards.first().click();
      await page.waitForTimeout(3000);

      // Look for iModel links
      const imodelLinks = page.locator('a[href*="/editor/"], a[href*="/imodel/"], .imodel-card');
      const imodelCount = await imodelLinks.count();
      console.log(`Found ${imodelCount} iModel links`);

      if (imodelCount > 0) {
        // Navigate to first iModel's editor
        const href = await imodelLinks.first().getAttribute('href');
        console.log('iModel href:', href);

        if (href) {
          await page.goto(href);
          await page.waitForTimeout(10000);

          // Take screenshot of editor
          await page.screenshot({ path: 'test-results/editor-loaded.png', fullPage: true });

          // Check for CAD toolbar
          const toolbar = page.locator('.cad-toolbar-horizontal');
          const toolbarVisible = await toolbar.isVisible().catch(() => false);

          if (toolbarVisible) {
            console.log('✅ CAD Toolbar found!');

            // Verify all tool categories
            const categories = ['草图', '实体', '变换', '布尔', '边', '面', '高级'];
            for (const category of categories) {
              const categoryVisible = await toolbar.locator('text=' + category).first().isVisible().catch(() => false);
              console.log(`${category}: ${categoryVisible ? '✅' : '❌'}`);
              expect(categoryVisible, `Category ${category} should be visible`).toBe(true);
            }

            // Test tool activation - UniteSolids
            const uniteButton = toolbar.locator('button[title*="并集"], button[label*="并集"]').first();
            if (await uniteButton.isVisible().catch(() => false)) {
              await uniteButton.click();
              await page.waitForTimeout(500);

              // Check for activation message
              const messageVisible = await page.locator('text=选择目标实体').first().isVisible().catch(() => false);
              console.log('UniteSolids activation:', messageVisible ? '✅' : '❌');

              // Screenshot after activation
              await page.screenshot({ path: 'test-results/unite-activated.png', fullPage: true });
            }

            // Test OffsetFaces
            const offsetButton = toolbar.locator('button[title*="面偏移"], button[label*="面偏移"]').first();
            if (await offsetButton.isVisible().catch(() => false)) {
              await offsetButton.click();
              await page.waitForTimeout(500);

              const offsetMessageVisible = await page.locator('text=点击选择要偏移的面').first().isVisible().catch(() => false);
              console.log('OffsetFaces activation:', offsetMessageVisible ? '✅' : '❌');

              await page.screenshot({ path: 'test-results/offset-activated.png', fullPage: true });
            }

            // Test SweepFaces
            const sweepButton = toolbar.locator('button[title*="拉伸面"], button[label*="拉伸面"]').first();
            if (await sweepButton.isVisible().catch(() => false)) {
              await sweepButton.click();
              await page.waitForTimeout(500);

              const sweepMessageVisible = await page.locator('text=选择要拉伸的面').first().isVisible().catch(() => false);
              console.log('SweepFaces activation:', sweepMessageVisible ? '✅' : '❌');

              await page.screenshot({ path: 'test-results/sweep-activated.png', fullPage: true });
            }

          } else {
            console.log('❌ CAD Toolbar not found');
            const pageContent = await page.content();
            console.log('Page URL:', page.url());
            console.log('Page content snippet:', pageContent.substring(0, 1000));
            test.fail('Toolbar should be visible');
          }
        }
      } else {
        test.skip('No iModels found in project');
      }
    } else {
      test.skip('No projects found');
    }
  });
});

test.describe('Modeling Tools - Console Error Check', () => {
  test('should not have tool registration errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Login and navigate
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'Test123!@#');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/documents|\/itwins/, { timeout: 10000 });

    // Try to access editor
    await page.goto('/itwins');
    await page.waitForTimeout(2000);

    const projectCards = page.locator('a[href*="/itwins/"], .section-card, [class*="card"]').filter({ hasText: /./ });
    const count = await projectCards.count();

    if (count > 0) {
      await projectCards.first().click();
      await page.waitForTimeout(3000);

      const imodelLinks = page.locator('a[href*="/editor/"], a[href*="/imodel/"], .imodel-card');
      const imodelCount = await imodelLinks.count();

      if (imodelCount > 0) {
        const href = await imodelLinks.first().getAttribute('href');
        if (href) {
          await page.goto(href);
          await page.waitForTimeout(10000);

          // Check for toolbar
          const toolbar = page.locator('.cad-toolbar-horizontal');
          const toolbarVisible = await toolbar.isVisible().catch(() => false);

          if (toolbarVisible) {
            // Click through various tools and check for errors
            const tools = ['并集', '差集', '交集', '面偏移', '拉伸面', '圆角', '倒角'];

            for (const tool of tools) {
              const button = toolbar.locator(`button[title*="${tool}"], button[label*="${tool}"]`).first();
              if (await button.isVisible().catch(() => false)) {
                await button.click();
                await page.waitForTimeout(300);
                await page.keyboard.press('Escape');
                await page.waitForTimeout(200);
              }
            }

            // Check for critical errors
            const criticalErrors = errors.filter(e =>
              e.includes('Tool not registered') ||
              e.includes('Cannot find tool') ||
              e.includes('undefined is not a function') ||
              e.includes('is not a function')
            );

            console.log('Console errors:', errors);
            console.log('Critical errors:', criticalErrors);

            expect(criticalErrors).toHaveLength(0);
          }
        }
      }
    }
  });
});
