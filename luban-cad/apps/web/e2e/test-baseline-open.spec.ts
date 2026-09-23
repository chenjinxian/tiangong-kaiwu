import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const TEST_USER = {
  email: 'test@example.com',
  password: 'Test123!@#'
};

test('Open iModel with baseline', async ({ page }) => {
  test.setTimeout(120000);

  // Login first
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', TEST_USER.email);
  await page.fill('input[type="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/itwins', { timeout: 30000 });

  // Navigate to editor with baseline iModel
  await page.goto(`${BASE_URL}/workspace/95ca8c83-e91e-4828-9d76-a16436240729/3c636e0c-b14e-45e8-b3a0-7c164cbf72b2`);

  // Wait for viewer to load
  await page.waitForTimeout(10000);

  // Take screenshot
  await page.screenshot({ path: 'test-results/baseline-editor-test.png', fullPage: true });

  console.log('Test completed - check test-results/baseline-editor-test.png');
});
