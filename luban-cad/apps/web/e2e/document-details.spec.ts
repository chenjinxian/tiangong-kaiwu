/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 文档详情页 e2e（M5-T5，会话注入零登录）：面包屑（文档 → 当前文档名）/
 * hero + iModel 卡片网格真实数据（种子库 E2E Seed 已初始化徽标 + hub 真实
 * 状态 Active）。P2.6a：A 旧文档（`测试项目`）只读——原「新建 iModel 对话框
 * 开合」改为只读断言（无写入口 + 只读横幅 + 「打开工作空间」仍可达）；另加
 * B 种子项目（`E2E B 项目`，data.luban.modelMode='B'）详情页真数据（新建 iModel
 * 入口 + B 种子库已初始化）。选择器第一来源 DocumentDetailsPage 族组件 +
 * i18n 中文可访问名。
 */

import { expect, test } from '@playwright/test';
import {
  B_SEED_IMODEL_NAME,
  B_SEED_PROJECT_NAME,
  E2E_IMODEL_NAME,
  SEED_PROJECT_NAME,
} from './fixtures';
import { apiFindDocumentByName, getApiToken, gotoRoute, loginWithSession } from './helpers';

let seedProjectId = '';
let bSeedProjectId = '';

test.beforeAll(async ({ request }) => {
  // 种子项目按名定位（auth.setup 已保证在场）
  const token = await getApiToken();
  const hit = await apiFindDocumentByName(request, SEED_PROJECT_NAME, token);
  if (!hit) throw new Error(`种子项目 ${SEED_PROJECT_NAME} 不在场（auth.setup 自愈失败？）`);
  seedProjectId = hit.id;
  const bHit = await apiFindDocumentByName(request, B_SEED_PROJECT_NAME, token);
  if (!bHit) throw new Error(`B 种子项目 ${B_SEED_PROJECT_NAME} 不在场（auth.setup 自愈失败？）`);
  bSeedProjectId = bHit.id;
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
  // P2.3/P2.6a：A 旧文档（未标记）只读横幅在场。
  await expect(page.getByTestId('legacy-readonly-banner')).toBeVisible();

  // 卡片网格：种子库按名在列 + 已初始化徽标 + 打开工作空间钮（真实数据 ≥1 iModel）
  const seedCard = page.locator('.imodel-card', { hasText: E2E_IMODEL_NAME });
  await expect(seedCard).toBeVisible({ timeout: 20_000 });
  await expect(seedCard.getByText('已初始化')).toBeVisible();
  await expect(seedCard.getByRole('button', { name: '打开工作空间' })).toBeVisible();
  // iModel 计数 ≥1（hero 与工具条计数行双呈现——取其一断言真值）
  await expect(page.getByText(/个 iModel/).first()).toContainText(/[1-9]/);
});

test('A 旧文档只读：无「新建 iModel」写入口 + 只读横幅 + 打开工作空间仍可用', async ({ page }) => {
  // P2.3 A 只读语义：旧文档页不提供新建/删除/分享/重命名入口（原「新建 iModel
  // 对话框开合」用例在 P2.6a 改为只读断言——A 不再是可写创建面）。
  await expect(page.getByTestId('legacy-readonly-banner')).toBeVisible();
  await expect(page.getByRole('button', { name: '新建 iModel' })).toHaveCount(0);

  // 只读读路径保留：种子库卡片 + 「打开工作空间」可达。
  const seedCard = page.locator('.imodel-card', { hasText: E2E_IMODEL_NAME });
  await expect(seedCard).toBeVisible({ timeout: 20_000 });
  await expect(seedCard.getByText('已初始化')).toBeVisible();
  await expect(seedCard.getByRole('button', { name: '打开工作空间' })).toBeVisible();
});

test('B 项目详情（P2.6a 种子）：无只读横幅 + 新建 iModel 入口 + B 种子库已初始化', async ({ page }) => {
  // B 详情页分支只认 iTwin 标记（与 flag 无关）：直接 URL 打开 B 种子项目
  //（会话已由 beforeEach 注入，此处只换路由）。
  await gotoRoute(page, `/documents/${bSeedProjectId}`, 'document-details-route');

  await expect(page.getByRole('heading', { name: B_SEED_PROJECT_NAME })).toBeVisible();
  await expect(page.getByTestId('legacy-readonly-banner')).toHaveCount(0);
  // 创建者持 iTwin imodels_manage → hero 新建入口在场（B-only 写面）。
  await expect(page.getByRole('button', { name: '新建 iModel' }).first()).toBeVisible({
    timeout: 20_000,
  });

  const bCard = page.locator('.imodel-card', { hasText: B_SEED_IMODEL_NAME });
  await expect(bCard).toBeVisible({ timeout: 20_000 });
  await expect(bCard.getByText('已初始化')).toBeVisible();
  await expect(bCard.getByRole('button', { name: '打开工作空间' })).toBeVisible();
});

test('面包屑返回文档中心', async ({ page }) => {
  await page.getByRole('button', { name: '文档', exact: true }).click();
  await page.waitForURL(/\/documents\/?(\?.*)?$/, { timeout: 20_000 });
  await expect(page.getByTestId('documents-route')).toBeVisible();
});
