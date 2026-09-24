import { test, expect } from '@playwright/test';

/**
 * Real iModel toolbar verification test
 * Uses actual iModel ID from the API
 */

test.describe('CAD Toolbar - Real iModel Verification', () => {
  test('toolbar should be visible with all tool categories', async ({ page }) => {
    // Collect console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'Test123!@#');
    await page.getByRole('button', { name: /登录|Sign In/i }).click();
    await page.waitForURL('**/itwins', { timeout: 10000 });

    // Get real iTwin and iModel IDs from the API
    // Note: Frontend connects directly to imodelhub-services (port 4000)
    // Token is stored in sessionStorage with key 'luban_cad_auth'
    const projectsResponse = await page.evaluate(async () => {
      try {
        const authJson = sessionStorage.getItem('luban_cad_auth');
        const auth = authJson ? JSON.parse(authJson) : null;
        const token = auth?.accessToken;
        const res = await fetch('http://localhost:4000/itwins?class=Project', {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        return await res.json();
      } catch (e) {
        return { error: String(e) };
      }
    });

    console.log('Projects response:', projectsResponse);

    if (!projectsResponse.iTwins || projectsResponse.iTwins.length === 0) {
      test.skip(true, 'No projects available');
      return;
    }

    const projectId = projectsResponse.iTwins[0].id;
    console.log('Using project ID:', projectId);

    // Get iModels for this project
    const imodelsResponse = await page.evaluate(async (pid) => {
      try {
        const authJson = sessionStorage.getItem('luban_cad_auth');
        const auth = authJson ? JSON.parse(authJson) : null;
        const token = auth?.accessToken;
        const res = await fetch(`http://localhost:4000/imodels?iTwinId=${pid}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        return await res.json();
      } catch (e) {
        return { error: String(e) };
      }
    }, projectId);

    console.log('iModels response:', imodelsResponse);

    if (!imodelsResponse.iModels || imodelsResponse.iModels.length === 0) {
      test.skip(true, 'No iModels available');
      return;
    }

    const imodelId = imodelsResponse.iModels[0].id;
    console.log('Using iModel ID:', imodelId);

    // Navigate to workspace with real IDs
    await page.goto(`/workspace/${projectId}/${imodelId}`);
    console.log('Navigated to workspace, waiting for load...');

    // Wait for the page to load (give it time to connect)
    await page.waitForTimeout(15000);

    // Take screenshot
    await page.screenshot({ path: 'test-results/workspace-loaded.png', fullPage: true });

    // Check URL
    const url = page.url();
    console.log('Current URL:', url);
    expect(url).toContain('/workspace/');

    // Check for the CAD toolbar
    const toolbar = page.locator('.cad-toolbar-horizontal');
    const toolbarVisible = await toolbar.isVisible().catch(() => false);

    if (toolbarVisible) {
      console.log('✅ CAD Toolbar is visible!');

      // Verify all categories
      const categories = ['草图', '实体', '变换', '布尔', '边', '面', '高级'];
      for (const category of categories) {
        const catElement = toolbar.locator('text=' + category).first();
        const isVisible = await catElement.isVisible().catch(() => false);
        console.log(`  Category ${category}: ${isVisible ? '✅' : '❌'}`);
        expect(isVisible, `Category ${category} should be visible`).toBe(true);
      }

      // Test Boolean tools
      const booleanTools = ['并集', '差集', '交集'];
      for (const toolName of booleanTools) {
        const button = toolbar.locator(`button[title*="${toolName}"], button:has-text("${toolName}")`).first();
        if (await button.isVisible().catch(() => false)) {
          await button.click();
          await page.waitForTimeout(500);

          const message = page.locator('text=选择目标实体');
          const messageVisible = await message.isVisible().catch(() => false);
          console.log(`  Tool ${toolName}: ${messageVisible ? '✅' : '❌'}`);

          // Press Escape to exit tool
          await page.keyboard.press('Escape');
          await page.waitForTimeout(200);
        }
      }

      // Test Face tools
      const faceTools = [
        { name: '面偏移', message: '点击选择要偏移的面' },
        { name: '拉伸面', message: '选择要拉伸的面' },
      ];
      for (const tool of faceTools) {
        const button = toolbar.locator(`button[title*="${tool.name}"], button:has-text("${tool.name}")`).first();
        if (await button.isVisible().catch(() => false)) {
          await button.click();
          await page.waitForTimeout(500);

          const message = page.locator(`text=${tool.message}`);
          const messageVisible = await message.isVisible().catch(() => false);
          console.log(`  Tool ${tool.name}: ${messageVisible ? '✅' : '❌'}`);

          await page.keyboard.press('Escape');
          await page.waitForTimeout(200);
        }
      }

      // Check for console errors
      const toolErrors = consoleErrors.filter(e =>
        e.includes('Tool not registered') ||
        e.includes('Cannot find tool') ||
        e.includes('is not a function')
      );
      console.log('Tool registration errors:', toolErrors.length);
      expect(toolErrors).toHaveLength(0);

      await page.screenshot({ path: 'test-results/toolbar-verified.png', fullPage: true });
    } else {
      console.log('❌ CAD Toolbar not found');

      // Check status bar for error info
      const statusBar = page.locator('.statusbar');
      if (await statusBar.isVisible().catch(() => false)) {
        const statusText = await statusBar.textContent();
        console.log('Status bar:', statusText);
      }

      // Take error screenshot
      await page.screenshot({ path: 'test-results/toolbar-missing.png', fullPage: true });
      test.fail('Toolbar should be visible when connection succeeds');
    }
  });
});
