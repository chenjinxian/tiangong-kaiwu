import { test, expect } from '@playwright/test';
import { loginWithSession, waitForEditorReady, getSeedProjectAndIModel } from './helpers';

/**
 * V2 Checkpoint Verification Test
 */

test('V2 Checkpoint should load successfully', async ({ page }) => {
  test.setTimeout(180000); // 编辑器 briefcase 连接在全套件并行负载下建立较慢
  // Collect console messages
  const consoleMessages: string[] = [];
  page.on('console', msg => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });

  // 会话注入登录（免登录表单，见 helpers）
  await loginWithSession(page);

  // Get auth token and iModel info
  const authData = await page.evaluate(() => {
    const authJson = sessionStorage.getItem('luban_cad_auth');
    return authJson ? JSON.parse(authJson) : null;
  });

  expect(authData?.accessToken).toBeTruthy();

  // Get project and iModel IDs（种子项目 + e2e 自管库，按名定位——见 helpers）
  const { projectId, imodelId } = await getSeedProjectAndIModel(page);

  console.log(`Testing iModel: ${imodelId}`);

  // Navigate to editor
  await page.goto(`/documents/${projectId}/${imodelId}`);

  // Wait for connection attempt
  await page.waitForTimeout(15000);

  // Take screenshot
  await page.screenshot({ path: 'test-results/v2-checkpoint-test.png', fullPage: true });

  // Check for connection errors
  const connectionErrors = consoleMessages.filter(msg =>
    msg.includes('download manifest failed') ||
    msg.includes('Failed to open connection') ||
    msg.includes('403')
  );

  console.log('Console messages:', consoleMessages.slice(-20));
  console.log('Connection errors:', connectionErrors);

  // 等编辑器就绪（IPC WS 握手偶发挂起，waitForEditorReady 内含卡滞 reload 重试）
  await waitForEditorReady(page);
  const statusBar = page.locator('.statusbar');

  // Should show "编辑模式" (edit mode) instead of error
  await expect(statusBar).toContainText('编辑模式', { timeout: 60000 });
  console.log('Status bar:', await statusBar.textContent());
  await expect(statusBar).not.toContainText('编辑错误');

  // Check for toolbar
  const toolbar = page.locator('.cad-toolbar-horizontal');
  const toolbarVisible = await toolbar.isVisible().catch(() => false);

  if (toolbarVisible) {
    console.log('✅ Toolbar is visible!');

    // Check categories
    const categories = ['草图', '实体', '变换', '布尔', '边', '面', '高级'];
    for (const category of categories) {
      const visible = await toolbar.locator('text=' + category).isVisible().catch(() => false);
      console.log(`  ${category}: ${visible ? '✅' : '❌'}`);
    }
  } else {
    console.log('❌ Toolbar not visible');
  }

  // V2 checkpoint should not have 403 errors
  expect(connectionErrors).toHaveLength(0);
});
