import { test, expect } from '@playwright/test';

/**
 * Verify modeling tools are registered
 * This test checks tool registration without requiring full iModel connection
 */

test.describe('Modeling Tools Registration', () => {
  test('tools should be registered without errors', async ({ page }) => {
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

    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'Test123!@#');
    await page.getByRole('button', { name: /登录|Sign In/i }).click();
    await page.waitForURL('**/itwins', { timeout: 10000 });

    // Get real iModel IDs
    const authData = await page.evaluate(() => {
      const authJson = sessionStorage.getItem('open_cloud_cad_auth');
      return authJson ? JSON.parse(authJson) : null;
    });

    console.log('Auth available:', !!authData?.accessToken);

    // Get project and iModel IDs
    const projectsResponse = await page.evaluate(async () => {
      try {
        const authJson = sessionStorage.getItem('open_cloud_cad_auth');
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

    if (!projectsResponse.iTwins?.length) {
      test.skip(true, 'No projects available');
      return;
    }

    const projectId = projectsResponse.iTwins[0].id;

    const imodelsResponse = await page.evaluate(async (pid) => {
      try {
        const authJson = sessionStorage.getItem('open_cloud_cad_auth');
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

    if (!imodelsResponse.iModels?.length) {
      test.skip(true, 'No iModels available');
      return;
    }

    const imodelId = imodelsResponse.iModels[0].id;
    console.log(`Using iModel: ${imodelId}`);

    // Navigate to workspace
    await page.goto(`/workspace/${projectId}/${imodelId}`);

    // Wait for IModelApp initialization
    await page.waitForTimeout(10000);

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
    expect(pageContent).toContain('Open Cloud CAD');
    expect(pageContent).toContain('login');

    console.log('Page structure verified');
  });
});
