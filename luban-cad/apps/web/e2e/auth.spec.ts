/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 注册/登录/登出 e2e（M5-T5；G1 B1.1 更新）：注册只创建**待确认**账号
 * （hub 置 inactive 并发确认邮件）——页面切「查收邮件」态、不自动登录；
 * 未确认账号登录被 422 拒绝并显示本地化文案；随后用栈内活动账号走
 * 登录 → 登出 → 会话清场。真实后端一轮；hub 注册限流 3 次/时，本 spec
 * 是全套件唯一注册消耗点。选择器第一来源 SignUpRoute/SignInRoute
 * （testid + i18n 中文可访问名）。
 */

import { expect, test } from '@playwright/test';
import { TEST_USER } from './fixtures';

/** 唯一注册账号（每轮时间戳新名——重复邮箱注册会被 hub 拒）。 */
const REGISTER_EMAIL = `e2e-m5-${Date.now()}@example.com`;
const REGISTER_PASSWORD = 'E2eM5!2026x';

test('注册 → 待确认（不自动登录）→ 未确认登录被拒 → 登录/登出/会话清场', async ({ page }) => {
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

  // B1.1：注册成功只创建待确认账号；不得自动登录/跳文档中心。
  await expect(page.getByTestId('signup-confirmation')).toBeVisible();
  await expect(page.getByTestId('signup-confirmation')).toContainText(REGISTER_EMAIL);
  await expect(page).toHaveURL(/\/register$/);
  await page.getByRole('link', { name: '返回登录' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('signin-route')).toBeVisible();

  // 未确认账号登录 → hub 422 inactive → 本地化提示（不建会话）。
  await page.getByLabel('邮箱').fill(REGISTER_EMAIL);
  await page.getByLabel('密码', { exact: true }).fill(REGISTER_PASSWORD);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('账号尚未激活');
  await expect(page).toHaveURL(/\/login$/);

  // 活动账号登录 → 文档中心。
  await page.getByLabel('邮箱').fill(TEST_USER.email);
  await page.getByLabel('密码', { exact: true }).fill(TEST_USER.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
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
