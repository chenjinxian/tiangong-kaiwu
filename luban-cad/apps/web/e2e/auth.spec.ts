/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 注册/登出 e2e（M5-T5）：注册 → 自动登录（注册即登录，AuthSession.register
 * 成功后转 login 落会话）→ 登出 → 会话清场回归登录页。真实后端一轮——
 * hub 注册限流 3 次/时，本 spec 是全套件唯一注册消耗点。
 * 选择器第一来源 SignUpRoute（signup-route testid + i18n 中文可访问名）。
 */

import { expect, test } from '@playwright/test';

/** 唯一注册账号（每轮时间戳新名——重复邮箱注册会被 hub 拒）。 */
const REGISTER_EMAIL = `e2e-m5-${Date.now()}@example.com`;
const REGISTER_PASSWORD = 'E2eM5!2026x';

test('注册 → 自动登录 → 登出 → 会话清场', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByTestId('signup-route')).toBeVisible();
  await expect(page.getByRole('heading', { name: '创建账户' })).toBeVisible();

  // 表单填写（真实后端注册一轮）
  await page.getByLabel('名').fill('五号');
  await page.getByLabel('姓').fill('端到端');
  await page.getByLabel('邮箱').fill(REGISTER_EMAIL);
  await page.getByLabel('密码', { exact: true }).fill(REGISTER_PASSWORD);
  // 强度条真实联动（长度/大小写/数字/特殊字符全中 → 非常强）
  await expect(page.getByTestId('password-strength')).toBeVisible();
  await expect(page.getByTestId('password-strength')).toContainText('非常强');
  await page.getByLabel('确认密码').fill(REGISTER_PASSWORD);
  await page.getByRole('checkbox', { name: '我同意服务条款' }).check();

  await page.getByRole('button', { name: '注册', exact: true }).click();

  // 注册即登录：直落文档中心
  await page.waitForURL('**/documents', { timeout: 30_000 });
  await expect(page.getByTestId('documents-route')).toBeVisible();

  // 用户菜单登出（会话清场 → /login）
  await page.getByRole('button', { name: '用户菜单' }).click();
  await page.getByRole('menuitem', { name: '退出登录' }).click();
  await page.waitForURL('**/login', { timeout: 30_000 });
  await expect(page.getByTestId('signin-route')).toBeVisible();

  // 登出已清 sessionStorage：直开受保护路由被 RequireAuth 打回登录页
  await page.goto('/documents');
  await page.waitForURL('**/login', { timeout: 30_000 });
  await expect(page.getByTestId('signin-route')).toBeVisible();
});
