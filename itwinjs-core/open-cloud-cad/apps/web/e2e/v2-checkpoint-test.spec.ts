import { test, expect } from '@playwright/test';

/**
 * V2 Checkpoint Verification Test
 */

test('V2 Checkpoint should load successfully', async ({ page }) => {
  // Collect console messages
  const consoleMessages: string[] = [];
  page.on('console', msg => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });

  // Login
  await page.goto('/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'Test123!@#');
  await page.getByRole('button', { name: /登录|Sign In/i }).click();
  await page.waitForURL('**/itwins', { timeout: 10000 });

  // Get auth token and iModel info
  const authData = await page.evaluate(() => {
    const authJson = sessionStorage.getItem('open_cloud_cad_auth');
    return authJson ? JSON.parse(authJson) : null;
  });

  expect(authData?.accessToken).toBeTruthy();

  // Get project and iModel IDs
  const projectsResponse = await page.evaluate(async () => {
    const authJson = sessionStorage.getItem('open_cloud_cad_auth');
    const auth = authJson ? JSON.parse(authJson) : null;
    const token = auth?.accessToken;
    const res = await fetch('http://localhost:4000/itwins?class=Project', {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    return await res.json();
  });

  expect(projectsResponse.iTwins?.length).toBeGreaterThan(0);
  const projectId = projectsResponse.iTwins[0].id;

  const imodelsResponse = await page.evaluate(async (pid) => {
    const authJson = sessionStorage.getItem('open_cloud_cad_auth');
    const auth = authJson ? JSON.parse(authJson) : null;
    const token = auth?.accessToken;
    const res = await fetch(`http://localhost:4000/imodels?iTwinId=${pid}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    return await res.json();
  }, projectId);

  expect(imodelsResponse.iModels?.length).toBeGreaterThan(0);
  const imodelId = imodelsResponse.iModels[0].id;

  console.log(`Testing iModel: ${imodelId}`);

  // Navigate to workspace
  await page.goto(`/workspace/${projectId}/${imodelId}`);

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

  // Check status bar
  const statusBar = page.locator('.statusbar');
  if (await statusBar.isVisible().catch(() => false)) {
    const statusText = await statusBar.textContent();
    console.log('Status bar:', statusText);

    // Should show "编辑模式" (edit mode) instead of error
    expect(statusText).toContain('编辑模式');
    expect(statusText).not.toContain('错误');
  }

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
