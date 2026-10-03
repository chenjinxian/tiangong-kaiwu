/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { TEST_USER } from './fixtures';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login form with all elements', async ({ page }) => {
    // Check for page title/heading - actual UI uses "欢迎回来" (Welcome back)
    await expect(page.getByRole('heading', { name: /欢迎回来|Welcome/i })).toBeVisible();

    // Check for email input - actual UI uses "电子邮箱"
    await expect(page.getByLabel(/电子邮箱|Email/i)).toBeVisible();

    // Check for password input - use textbox role to avoid matching the toggle button
    await expect(page.getByRole('textbox', { name: /密码|Password/i })).toBeVisible();

    // Check for login button
    await expect(page.getByRole('button', { name: /登录|Sign In/i })).toBeVisible();

    // Check for register link - actual UI uses "立即注册"
    await expect(page.getByRole('link', { name: /立即注册|Register/i })).toBeVisible();
  });

  test('should show validation error for empty fields', async ({ page }) => {
    // The login button is disabled when fields are empty, so we can't click it
    // Instead, verify the button is disabled
    const loginButton = page.getByRole('button', { name: /登录|Sign In/i });
    await expect(loginButton).toBeDisabled();

    // Fill in just the email to enable the button
    await page.fill('input[type="email"]', 'test@example.com');

    // Button should still be disabled (password is empty)
    await expect(loginButton).toBeDisabled();

    // Fill in password
    await page.fill('input[type="password"]', 'password');

    // Now button should be enabled
    await expect(loginButton).toBeEnabled();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    // Fill in invalid credentials（密码需满足格式校验，否则 422 走不到「邮箱未注册」分支）
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'NoSuchUser123!');

    // Click login
    await page.getByRole('button', { name: /登录|Sign In/i }).click();

    // Wait for error message —— iTwinUI Alert 不带 role="alert"，直接断言错误文案
    // （404 →「该邮箱未注册，请先注册账户」；401 →「邮箱或密码错误」；422/其他 →「登录失败，请稍后重试」）
    await expect(page.locator('.login-error-alert')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/邮箱或密码错误|未注册|服务器暂时不可用|登录失败|invalid|failed|error|错误|notFound|not found/i)).toBeVisible({ timeout: 5000 });
  });

  test('should successfully login with valid credentials', async ({ page }) => {
    // Fill in valid credentials
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);

    // Click login
    await page.getByRole('button', { name: /登录|Sign In/i }).click();

    // Wait for navigation to itwins page (actual app navigates to /itwins)
    await page.waitForURL('**/itwins', { timeout: 10000 });

    // Verify we're on the itwins page
    await expect(page.url()).toContain('/itwins');

    // Verify user is logged in (check for user menu or avatar)
    await expect(page.getByText(TEST_USER.name).or(page.getByTitle(TEST_USER.name))).toBeVisible();
  });

  test('should navigate to register page', async ({ page }) => {
    // Click register link - actual UI uses "立即注册"
    await page.getByRole('link', { name: /立即注册|Register/i }).click();

    // Verify navigation to register page
    await page.waitForURL('**/register');
    await expect(page.url()).toContain('/register');

    // Check for register form elements - actual register page heading
    await expect(page.getByRole('heading', { name: /创建账户|Create|注册|Register/i })).toBeVisible();
  });

  test('should persist login session after page reload', async ({ page, context }) => {
    // Login first
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.getByRole('button', { name: /登录|Sign In/i }).click();
    await page.waitForURL('**/itwins', { timeout: 10000 });

    // Reload the page
    await page.reload();

    // Verify still on itwins page (not redirected to login)
    await expect(page.url()).toContain('/itwins');
  });
});
