/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 登录页 e2e（M5-T5）：表单路径真实登录一轮（全套件唯一 UI 登录——MS 限流
 * 100/15min，其余用例一律走会话注入）+ 找回密码入口往返。选择器第一来源
 * SignInRoute（signin-route testid + i18n 中文可访问名）。
 */

import { expect, test } from '@playwright/test';
import { TEST_USER } from './fixtures';

test.describe('登录页（表单路径一轮 + 找回密码入口）', () => {
  test('空表单校验 → 表单登录 → 文档中心', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('signin-route')).toBeVisible();
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();

    // 空表单提交：逐字段客户端校验（零服务端请求，不耗限流）
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByText('请输入邮箱')).toBeVisible();
    await expect(page.getByText('请输入密码')).toBeVisible();

    // 表单真实登录（本轮唯一 UI 登录）
    await page.getByLabel('邮箱').fill(TEST_USER.email);
    await page.getByLabel('密码', { exact: true }).fill(TEST_USER.password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.waitForURL('**/documents', { timeout: 30_000 });

    // 登录成功落会话：文档中心真实呈现（顶栏 + 左栏；默认档=我的文档）
    await expect(page.getByTestId('documents-route')).toBeVisible();
    await expect(page.getByTestId('document-sidebar')).toBeVisible();
    await expect(page.getByRole('heading', { name: '我的文档' })).toBeVisible();
  });

  test('找回密码入口往返', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('signin-route')).toBeVisible();

    // 入口在（忘记密码？）→ 找回页（仅导航断言：不提交，不触发重置邮件流）
    await page.getByRole('link', { name: '忘记密码？' }).click();
    await expect(page.getByTestId('forgot-password-route')).toBeVisible();
    await expect(page.getByRole('heading', { name: '忘记密码' })).toBeVisible();

    // 返回登录
    await page.getByRole('link', { name: '返回登录' }).click();
    await expect(page.getByTestId('signin-route')).toBeVisible();
  });
});
