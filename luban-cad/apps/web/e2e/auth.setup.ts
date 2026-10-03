/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { mkdirSync, writeFileSync } from 'node:fs';
import { test as setup, expect } from '@playwright/test';
import { TEST_USER } from './fixtures';

const authFile = 'playwright/.auth/user.json';
// 本应用 auth 存 sessionStorage（getStoredAuth 只读 sessionStorage），而 Playwright
// storageState 只携带 cookies + localStorage —— 故额外导出 sessionStorage 载荷，
// 供消费方（如 authenticated-workflow.spec.ts）经 addInitScript 注入。
const sessionFile = 'playwright/.auth/session.json';

async function loginViaUI(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[type="email"]', TEST_USER.email);
  await page.fill('input[type="password"]', TEST_USER.password);
  await page.getByRole('button', { name: /^登录$|登录中|Sign In/i }).first().click();
  await page.waitForURL('**/itwins', { timeout: 15000 });
}

async function registerViaUI(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/register');
  await page.fill('input#name', TEST_USER.name);
  await page.fill('input[type="email"]', TEST_USER.email);
  await page.fill('input#password', TEST_USER.password);
  await page.fill('input#confirmPassword', TEST_USER.password);
  await page.check('input[type="checkbox"]');
  await page.getByRole('button', { name: /创建账户|Register/i }).click();
  await page.waitForURL('**/itwins', { timeout: 15000 });
}

setup('authenticate', async ({ page }) => {
  // 常态快路径：测试账号已注册，直接登录；账号缺失时注册（注册成功即登录态）
  try {
    await loginViaUI(page);
  } catch {
    await registerViaUI(page);
  }

  // Verify we're logged in
  await expect(page.url()).toContain('/itwins');

  // 自愈清场：删除历史运行遗留的测试项目（E2E Project */Demo Project *）。
  // hub 项目列表分页 $top=10，遗留项目会把 seed「测试项目」挤出首页导致依赖它的 spec 失败。
  // 仅按 ASCII 前缀匹配（勿用中文字面量——Git Bash/编码链路会 GBK 污染）。
  await page.evaluate(async () => {
    const authJson = sessionStorage.getItem('luban_cad_auth');
    const auth = authJson ? JSON.parse(authJson) : null;
    const headers: Record<string, string> = auth?.accessToken
      ? { Authorization: `Bearer ${auth.accessToken}` }
      : {};
    const res = await fetch('http://localhost:4000/itwins?class=Project&$top=100', { headers });
    const { iTwins } = await res.json();
    for (const t of iTwins ?? []) {
      if (typeof t.displayName === 'string' && /^(E2E|Demo) Project /.test(t.displayName)) {
        await fetch(`http://localhost:4000/itwins/${t.id}`, { method: 'DELETE', headers }).catch(() => undefined);
      }
    }
  });

  // Save authentication state (cookies + localStorage)
  await page.context().storageState({ path: authFile });

  // Save sessionStorage payload (app's actual auth store)
  const sessionStorageData = await page.evaluate(() => ({
    luban_cad_auth: sessionStorage.getItem('luban_cad_auth'),
    luban_cad_user: sessionStorage.getItem('luban_cad_user'),
  }));
  expect(sessionStorageData.luban_cad_auth, '登录后 sessionStorage 应写入 luban_cad_auth').toBeTruthy();
  mkdirSync('playwright/.auth', { recursive: true });
  writeFileSync(sessionFile, JSON.stringify(sessionStorageData), 'utf-8');
});
