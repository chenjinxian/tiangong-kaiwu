import { test } from '@playwright/test';
const BASE_URL = 'http://localhost:3000';
const TEST_USER = { email: 'test@example.com', password: 'Test123!@#' };

test('Open iModel with baseline', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', TEST_USER.email);
  await page.fill('input[type="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/itwins', { timeout: 30000 });

  // Open the iModel that now has baseline
  await page.goto(`${BASE_URL}/workspace/7aa882bc-2ed0-4398-9476-e4aae304c761/c15b16df-4684-4376-aebc-7ae0592ff26a`);
  await page.waitForTimeout(15000);

  await page.screenshot({ path: 'test-results/baseline-success.png', fullPage: true });
  console.log('Screenshot saved to test-results/baseline-success.png');
});
