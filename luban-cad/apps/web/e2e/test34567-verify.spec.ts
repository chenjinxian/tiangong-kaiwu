import { test, expect } from '@playwright/test';

test('test34567 should load successfully', async ({ page }) => {
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

  // Navigate directly to test34567
  // Project: aef4dad2-5b6c-4ef4-b261-4509d704281a
  // iModel: e57a8e27-49c4-4eaa-ad9b-103234202075
  await page.goto('/workspace/aef4dad2-5b6c-4ef4-b261-4509d704281a/e57a8e27-49c4-4eaa-ad9b-103234202075');

  // Wait for connection
  await page.waitForTimeout(15000);

  // Take screenshot
  await page.screenshot({ path: 'test-results/test34567-loaded.png', fullPage: true });

  // Check for connection success
  const hasConnectionError = consoleErrors.some(e =>
    e.includes('download manifest failed') ||
    e.includes('Failed to open connection')
  );

  console.log('Console errors:', consoleErrors.slice(-5));

  // Check status bar
  const statusBar = page.locator('.statusbar');
  if (await statusBar.isVisible().catch(() => false)) {
    const statusText = await statusBar.textContent();
    console.log('Status bar:', statusText);

    // Should show edit mode or readonly mode, not error
    const hasValidMode = statusText.includes('编辑模式') || statusText.includes('只读模式');
    expect(hasValidMode).toBe(true);
    expect(statusText).not.toContain('错误');
  }

  // Check toolbar
  const toolbar = page.locator('.cad-toolbar-horizontal');
  const toolbarVisible = await toolbar.isVisible().catch(() => false);

  if (toolbarVisible) {
    console.log('✅ Toolbar visible!');
  }

  expect(hasConnectionError).toBe(false);
});
