/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { test as setup, expect } from '@playwright/test';
import { TEST_USER } from './fixtures';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  // First try to register the test user (in case it doesn't exist)
  try {
    await page.goto('/register');

    // Fill in registration form
    await page.fill('input#name', TEST_USER.name);
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input#password', TEST_USER.password);
    await page.fill('input#confirmPassword', TEST_USER.password);

    // Check agree to terms checkbox
    await page.check('input[type="checkbox"]');

    // Click register button
    await page.getByRole('button', { name: /创建账户|Register/i }).click();

    // If registration succeeds, we should be redirected to /itwins
    await page.waitForURL('**/itwins', { timeout: 5000 });
  } catch {
    // Registration failed (user likely already exists), try logging in
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.getByRole('button', { name: /登录|Sign In/i }).click();

    // Wait for login to complete
    await page.waitForURL('**/itwins', { timeout: 10000 });
  }

  // Verify we're logged in
  await expect(page.url()).toContain('/itwins');

  // Save authentication state
  await page.context().storageState({ path: authFile });
});
