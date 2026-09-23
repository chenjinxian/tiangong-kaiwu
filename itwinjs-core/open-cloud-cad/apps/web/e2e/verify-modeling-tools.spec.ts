import { test, expect } from '@playwright/test';
import { TEST_USER } from './fixtures';

test.describe('Modeling Tools Verification', () => {
  test('verify all modeling tools are registered and working', async ({ page }) => {
    // Collect console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.log('Console error:', msg.text());
      }
    });

    // 1. Login
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.getByRole('button', { name: /登录|Sign In/i }).click();
    await page.waitForURL('**/itwins', { timeout: 10000 });

    // 2. Navigate to first project
    await page.waitForTimeout(2000);

    // Check if empty state is shown
    const emptyState = page.getByText(/暂无项目|No projects/i);
    const hasEmptyState = await emptyState.isVisible().catch(() => false);

    if (hasEmptyState) {
      test.skip(true, 'No projects available - empty state shown');
      return;
    }

    // Click on the project card using the specific button with project name
    const projectButton = page.locator('button:has-text("测试项目")').first();
    const count = await projectButton.count();

    if (count === 0) {
      test.skip(true, 'No projects available');
      return;
    }

    await projectButton.click();
    await page.waitForURL(/.*\/itwins\/.+/, { timeout: 10000 });

    // 3. Find iModel and navigate to editor
    await page.waitForTimeout(2000);

    // Look for "打开工作空间" (Open Workspace) button on the iModel card
    const openWorkspaceButton = page.getByRole('button', { name: /打开工作空间|Open Workspace/i }).first();

    if (await openWorkspaceButton.isVisible().catch(() => false)) {
      await openWorkspaceButton.click();
      await page.waitForURL(/.*\/workspace\/.+/, { timeout: 10000 });
    } else {
      test.skip(true, 'No iModels available');
      return;
    }

    // 4. Wait for editor to load
    await page.waitForTimeout(5000);

    // Take screenshot of initial load
    await page.screenshot({ path: 'test-results/editor-initial.png', fullPage: true });

    // 5. Verify toolbar exists
    const toolbar = page.locator('.cad-toolbar-horizontal');
    const hasToolbar = await toolbar.isVisible().catch(() => false);

    if (!hasToolbar) {
      // Try alternative selectors
      const altToolbar = page.locator('[class*="toolbar"], [class*="Toolbar"]').first();
      const hasAltToolbar = await altToolbar.isVisible().catch(() => false);

      if (!hasAltToolbar) {
        console.log('No toolbar found - checking page content');
        console.log('Current URL:', page.url());
        await page.screenshot({ path: 'test-results/no-toolbar.png', fullPage: true });
        test.fail('Toolbar should be visible');
        return;
      }
    }

    // 6. Test all tool categories are visible
    const categories = ['草图', '实体', '变换', '布尔', '边', '面', '高级'];
    for (const cat of categories) {
      const catVisible = await page.locator('.cad-toolbar-horizontal').locator('text=' + cat).first().isVisible().catch(() => false);
      console.log(`Category ${cat}: ${catVisible ? '✅' : '❌'}`);
      expect(catVisible, `Category ${cat} should be visible`).toBe(true);
    }

    // 7. Test Boolean tools activation
    const booleanTools = [
      { name: '并集', prompt: '选择目标实体' },
      { name: '差集', prompt: '选择目标实体' },
      { name: '交集', prompt: '选择目标实体' },
    ];

    for (const tool of booleanTools) {
      const button = page.locator('.cad-toolbar-horizontal').locator(`button[title*="${tool.name}"], button[label*="${tool.name}"]`).first();
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        await page.waitForTimeout(500);

        const promptVisible = await page.locator(`text=${tool.prompt}`).first().isVisible().catch(() => false);
        console.log(`${tool.name} tool: ${promptVisible ? '✅' : '❌'}`);
        expect(promptVisible, `${tool.name} tool should show prompt`).toBe(true);

        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      } else {
        console.log(`${tool.name} button not found`);
        test.fail(`${tool.name} button should be visible`);
      }
    }

    // 8. Test Face tools activation (newly implemented)
    const faceTools = [
      { name: '面偏移', prompt: '点击选择要偏移的面' },
      { name: '拉伸面', prompt: '选择要拉伸的面' },
    ];

    for (const tool of faceTools) {
      const button = page.locator('.cad-toolbar-horizontal').locator(`button[title*="${tool.name}"], button[label*="${tool.name}"]`).first();
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        await page.waitForTimeout(500);

        const promptVisible = await page.locator(`text=${tool.prompt}`).first().isVisible().catch(() => false);
        console.log(`${tool.name} tool: ${promptVisible ? '✅' : '❌'}`);
        expect(promptVisible, `${tool.name} tool should show prompt`).toBe(true);

        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      } else {
        console.log(`${tool.name} button not found`);
        test.fail(`${tool.name} button should be visible`);
      }
    }

    // 9. Test Edge tools
    const edgeTools = [
      { name: '圆角', prompt: '点击选择要圆角的边' },
      { name: '倒角', prompt: '点击选择要倒角的边' },
    ];

    for (const tool of edgeTools) {
      const button = page.locator('.cad-toolbar-horizontal').locator(`button[title*="${tool.name}"], button[label*="${tool.name}"]`).first();
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        await page.waitForTimeout(500);

        const promptVisible = await page.locator(`text=${tool.prompt}`).first().isVisible().catch(() => false);
        console.log(`${tool.name} tool: ${promptVisible ? '✅' : '❌'}`);
        expect(promptVisible, `${tool.name} tool should show prompt`).toBe(true);

        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
    }

    // 10. Check for console errors
    const criticalErrors = consoleErrors.filter(e =>
      e.includes('Tool not registered') ||
      e.includes('Cannot find tool') ||
      e.includes('is not a function') ||
      e.includes('undefined is not')
    );

    console.log('Total console errors:', consoleErrors.length);
    console.log('Critical errors:', criticalErrors);
    expect(criticalErrors).toHaveLength(0);

    // 11. Final screenshot
    await page.screenshot({ path: 'test-results/verification-complete.png', fullPage: true });
  });
});
