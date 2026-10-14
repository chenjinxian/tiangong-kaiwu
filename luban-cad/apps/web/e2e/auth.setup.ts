/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { mkdirSync, writeFileSync } from 'node:fs';
import { test as setup, expect } from '@playwright/test';
import { TEST_USER } from './fixtures';
import { SEED_PROJECT_NAME, E2E_IMODEL_NAME } from './helpers';

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
  await page.waitForURL('**/documents', { timeout: 15000 });
}

async function registerViaUI(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/register');
  await page.fill('input#name', TEST_USER.name);
  await page.fill('input[type="email"]', TEST_USER.email);
  await page.fill('input#password', TEST_USER.password);
  await page.fill('input#confirmPassword', TEST_USER.password);
  await page.check('input[type="checkbox"]');
  await page.getByRole('button', { name: /创建账户|Register/i }).click();
  await page.waitForURL('**/documents', { timeout: 15000 });
}

setup('authenticate', async ({ page }) => {
  // 登录+清场+种子库重置（baseline 轮询最坏 ~5min，config 默认 120s 不够）
  setup.setTimeout(300_000);

  // 常态快路径：测试账号已注册，直接登录；账号缺失时注册（注册成功即登录态）
  try {
    await loginViaUI(page);
  } catch {
    await registerViaUI(page);
  }

  // Verify we're logged in
  await expect(page.url()).toContain('/documents');

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

  // ── 种子库数据态自治（2026-10-11）：e2e 自管 iModel 每轮重置 ──
  // 依赖种子空态的 spec（features「暂无特征」/ sketch 新建草图后「暂无实体」）会被跨轮
  // 残留打破（extrude 特征、空 sketch 元素、陈旧写租约——51/53 的 2 例败因）。HUB 无
  // 「清空 iModel」API，而「测试项目」内还有人工调试库（调试专用-*），不能按位置重置：
  // e2e 名下自管具名库 E2E Seed，按名「删旧建新」，其余数据零接触。API 形状对照
  // scripts/verify-stack.ps1 Step B（POST /imodels {iTwinId,name}，creationMode 缺省
  // empty → webhook-agent 生成 baseline；终态 failed/missingFiles 即失败）。
  const HUB = 'http://localhost:4000';
  const authJson = await page.evaluate(() => sessionStorage.getItem('luban_cad_auth'));
  const token = (authJson ? JSON.parse(authJson) : {})?.accessToken;
  expect(token, '种子重置需要登录 token').toBeTruthy();
  const hubHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // 种子项目按名定位；缺失即自愈重建（栈 seed 未跑时 e2e 也能自立）
  const projectList = (await fetch(`${HUB}/itwins?class=Project&$top=100`, { headers: hubHeaders }).then((r) => r.json())) as {
    iTwins?: Array<{ id: string; displayName?: string }>;
  };
  let seedProject = projectList.iTwins?.find((t) => t.displayName === SEED_PROJECT_NAME);
  if (!seedProject) {
    const res = await fetch(`${HUB}/itwins`, {
      method: 'POST',
      headers: hubHeaders,
      body: JSON.stringify({ displayName: SEED_PROJECT_NAME, class: 'Project' }),
    });
    if (res.status !== 201) throw new Error(`种子项目缺失且自愈重建失败：HTTP ${res.status}`);
    seedProject = ((await res.json()) as { iTwin: { id: string } }).iTwin;
  }

  // 删旧（仅 e2e 名下库，人工调试库零接触）
  const imodelList = (await fetch(`${HUB}/imodels?iTwinId=${seedProject.id}`, { headers: hubHeaders }).then((r) => r.json())) as {
    iModels?: Array<{ id: string; name?: string; displayName?: string }>;
  };
  for (const m of imodelList.iModels ?? []) {
    if ((m.displayName ?? m.name) !== E2E_IMODEL_NAME) continue;
    const res = await fetch(`${HUB}/imodels/${m.id}`, { method: 'DELETE', headers: hubHeaders });
    if (res.status !== 204) throw new Error(`重置失败：旧「${E2E_IMODEL_NAME}」(${m.id}) 删除 HTTP ${res.status}`);
  }

  // 建新 + 轮询 baseline initialized（5s × 55 ≈ 4.6min；webhook 正常 ~10s，最坏走 WA
  // recovery checker 兜底——setup 超时预算已放大到 300s）
  const created = await fetch(`${HUB}/imodels`, {
    method: 'POST',
    headers: hubHeaders,
    body: JSON.stringify({ iTwinId: seedProject.id, name: E2E_IMODEL_NAME }),
  });
  if (created.status !== 201) throw new Error(`重置失败：「${E2E_IMODEL_NAME}」创建 HTTP ${created.status}`);
  const seedImodelId = ((await created.json()) as { iModel: { id: string } }).iModel.id;
  let state = 'unknown';
  for (let i = 0; i < 55; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const m = (await fetch(`${HUB}/imodels/${seedImodelId}`, { headers: hubHeaders }).then((r) => r.json())) as {
      iModel?: { state?: string };
    };
    state = m.iModel?.state ?? 'unknown';
    if (state === 'initialized') break;
    if (state === 'failed' || state === 'missingFiles') {
      throw new Error(`重置失败：baseline 终态 ${state}（查 docker compose logs webhook-agent）`);
    }
  }
  if (state !== 'initialized') {
    throw new Error(`重置失败：5min 内未 initialized（最后 state=${state}；查 WA 日志 / recovery checker）`);
  }

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
