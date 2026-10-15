import { test, expect } from '@playwright/test';
import { loginWithSession, waitForEditorReady, getSeedProjectAndIModel } from './helpers';

/**
 * Verify modeling tools are registered
 * This test checks tool registration without requiring full iModel connection
 */

test.describe('Modeling Tools Registration', () => {
  test('tools should be registered without errors', async ({ page }) => {
    test.setTimeout(180000); // 编辑器 briefcase 连接在负载下建立较慢
    const consoleErrors: string[] = [];
    const consoleLogs: string[] = [];

    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error') {
        consoleErrors.push(text);
      } else {
        consoleLogs.push(text);
      }
    });

    // 会话注入登录（免登录表单，见 helpers）
    await loginWithSession(page);


    // Get real iModel IDs（种子项目 + e2e 自管库，按名定位——见 helpers；
    // 项目/库缺失由 helper 内的明确报错兜底）
    const { projectId, imodelId } = await getSeedProjectAndIModel(page);
    console.log(`Using iModel: ${imodelId}`);

    // Navigate to editor
    await page.goto(`/documents/${projectId}/${imodelId}`);

    // Wait for IModelApp initialization（IPC WS 握手偶发挂起，waitForEditorReady 内含卡滞 reload 重试）
    await waitForEditorReady(page);

    // Check for tool registration errors
    const toolRegistrationErrors = consoleErrors.filter(e =>
      e.includes('Tool not registered') ||
      e.includes('Cannot find tool') ||
      e.includes('is not a function') ||
      e.includes('Failed to register') ||
      e.includes('registerAllTools')
    );

    console.log('Tool registration errors:', toolRegistrationErrors.length);
    toolRegistrationErrors.forEach(e => console.log('  -', e.substring(0, 200)));

    // Check for successful tool registration logs
    const toolRegistrationLogs = consoleLogs.filter(l =>
      l.includes('Tool registered') ||
      l.includes('registerAllTools') ||
      l.includes('EditTools')
    );

    console.log('Tool registration logs:', toolRegistrationLogs.length);
    toolRegistrationLogs.forEach(l => console.log('  -', l.substring(0, 200)));

    // Take screenshot
    await page.screenshot({ path: 'test-results/tools-registered.png', fullPage: true });

    // Verify no tool registration errors
    expect(toolRegistrationErrors).toHaveLength(0);
  });

  test('page structure should be correct', async ({ page }) => {
    // Verify basic page structure is present
    await page.goto('/login');
    const pageContent = await page.content();

    // Check that the page has expected elements
    expect(pageContent).toContain('LubanCAD');
    expect(pageContent).toContain('login');

    console.log('Page structure verified');
  });
});
