/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { test as baseTest, expect } from '@playwright/test';

/**
 * Test user credentials for E2E testing
 * These should match the test user created in the development environment
 */
export const TEST_USER = {
  email: 'test@example.com',
  password: 'Test123!@#',
  name: 'Test User',
};

/**
 * Extended test fixture with authentication
 */
export const test = baseTest.extend<{
  authenticatedPage: { page: typeof baseTest.prototype.page; user: typeof TEST_USER };
}>({
  // Provide authentication fixture
  authenticatedPage: async ({ page }, use) => {
    // Navigate to login page
    await page.goto('/login');

    // Fill in credentials
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);

    // Click login button
    await page.click('button[type="submit"]');

    // Wait for navigation to itwins page
    await page.waitForURL('**/itwins');

    // Use the authenticated page
    await use({ page, user: TEST_USER });
  },
});

export { expect } from '@playwright/test';
