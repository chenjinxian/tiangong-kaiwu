/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 文档详情页 e2e（M5-T5，会话注入零登录）：面包屑（文档 → 当前文档名）/
 * hero + iModel 卡片网格真实数据（种子库 E2E Seed 已初始化徽标 + hub 真实
 * 状态 Active）/ 新建 iModel 对话框开合（空名校验 → Escape 收合；**不提交**
 * ——不建库不留产）。选择器第一来源 DocumentDetailsPage 族组件 + i18n 中文
 * 可访问名。
 */

import { expect, test } from '@playwright/test';
import { E2E_IMODEL_NAME, SEED_PROJECT_NAME } from './fixtures';
import { apiFindDocumentByName, getApiToken, gotoRoute, loginWithSession } from './helpers';

let seedProjectId = '';

test.beforeAll(async ({ request }) => {
  // 种子项目按名定位（auth.setup 已保证在场）
  const hit = await apiFindDocumentByName(request, SEED_PROJECT_NAME, await getApiToken());
  if (!hit) throw new Error(`种子项目 ${SEED_PROJECT_NAME} 不在场（auth.setup 自愈失败？）`);
  seedProjectId = hit.id;
});

test.beforeEach(async ({ page }) => {
  await loginWithSession(page);
  await gotoRoute(page, `/documents/${seedProjectId}`, 'document-details-route');
});

test('面包屑 / hero / iModel 卡片网格真实数据', async ({ page }) => {
  // 面包屑：返回「文档」+ 当前文档名
  await expect(page.getByRole('button', { name: '文档', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: SEED_PROJECT_NAME })).toBeVisible();

  // hero：名称 headline + 状态 Tag（hub 真实 status=Active）
  await expect(page.getByRole('heading', { name: SEED_PROJECT_NAME })).toBeVisible();
  await expect(page.getByText('Active', { exact: true })).toBeVisible();

  // 卡片网格：种子库按名在列 + 已初始化徽标 + 打开工作空间钮（真实数据 ≥1 iModel）
  const seedCard = page.locator('.imodel-card', { hasText: E2E_IMODEL_NAME });
  await expect(seedCard).toBeVisible({ timeout: 20_000 });
  await expect(seedCard.getByText('已初始化')).toBeVisible();
  await expect(seedCard.getByRole('button', { name: '打开工作空间' })).toBeVisible();
  // iModel 计数 ≥1（hero 与工具条计数行双呈现——取其一断言真值）
  await expect(page.getByText(/个 iModel/).first()).toContainText(/[1-9]/);
});

test('新建 iModel 对话框开合：空名校验 → Escape 收合（不建库）', async ({ page }) => {
  await page.getByRole('button', { name: '新建 iModel' }).first().click();
  const dialog = page.getByRole('dialog', { name: '新建 iModel' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByPlaceholder('输入 iModel 名称')).toBeVisible();

  // 空名提交：客户端必填报错（零服务端请求，不建库）
  await dialog.getByRole('button', { name: '创建', exact: true }).click();
  await expect(dialog.getByText('请输入 iModel 名称')).toBeVisible();

  // Escape 收合（setFocus 焦点在对话框内，Esc 可达）
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('面包屑返回文档中心', async ({ page }) => {
  await page.getByRole('button', { name: '文档', exact: true }).click();
  await page.waitForURL(/\/documents\/?(\?.*)?$/, { timeout: 20_000 });
  await expect(page.getByTestId('documents-route')).toBeVisible();
});
