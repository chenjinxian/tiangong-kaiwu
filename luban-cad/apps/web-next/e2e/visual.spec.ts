/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * 视觉钉版基线（M5-T6，切换门禁第 3 条「截图对照零未登记差异」的回归载体）：
 * - 五关键状态 toHaveScreenshot @1440×900，亮色起底：登录页 / 文档中心网格 /
 *   文档详情 / 编辑器五区（只读态如实）/ 设置页；
 * - 首跑 `corepack pnpm@10 test:e2e --update-snapshots` 建基线（快照落
 *   e2e/__screenshots__/，luban-cad/.gitignore 豁免行放行入库）；此后每次
 *   套件运行即对照——差异红即真红，属预期改版时随同款提交 --update-snapshots；
 * - 对照基准 = onshape-audit 采集（pub-01 登录 / os-01 文档 / os-11 Part
 *   Studio / os-48 帐户），逐张并排人工比对，差异登记 SDD sprint 目录
 *   quadrant/walkthrough.md（对齐/偏差-可接受/偏差-待修三态，M3 visual-diff
 *   口径）；
 * - 钉面 = UI 铬（布局/文案/令牌）。编辑器画布 WebGL 区 mask 掉——瓦片流送
 *   时序像素不可钉（canvas 真实在场由 waitEditorReady 断言兜住，几何内容归
 *   渲染域不归视觉域）；
 * - 数据面钉当前真实栈态（种子项目与调试库同框如实）——种子每轮重置同形；
 *   跨日「已修改」日期文本漂移属已知张力（重钉基线即可，不视为回归）；
 * - 会话注入零登录（helpers.loginWithSession）；主题/语言经 addInitScript
 *   显式钉 light/zh-CN（读存储是应用合法代码路径，防开发态 localStorage
 *   残留读入污染基线）。
 */

import { expect, test, type Page } from '@playwright/test';
import { E2E_IMODEL_NAME, SEED_PROJECT_NAME } from './fixtures';
import {
  apiFindDocumentByName,
  gotoDocuments,
  gotoRoute,
  loginWithSession,
  openSeedImodelEditor,
  readAccessToken,
  waitEditorReady,
} from './helpers';

test.use({ viewport: { width: 1440, height: 900 } });

let seedProjectId = '';

test.beforeAll(async ({ request }) => {
  // 种子项目按名定位（auth.setup 已保证在场；详情/编辑器两用例导航键）
  const hit = await apiFindDocumentByName(request, SEED_PROJECT_NAME, readAccessToken());
  if (!hit) throw new Error(`种子项目 ${SEED_PROJECT_NAME} 不在场（auth.setup 自愈失败？）`);
  seedProjectId = hit.id;
});

/** 钉版定妆：亮色 + 中文显式落默认存储（addInitScript 先于应用代码执行）。 */
async function pinLightZh(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('luban-next-theme', 'light');
    localStorage.setItem('luban-next-lang', 'zh-CN');
  });
}

/** 字体就绪门（webfont 未就绪截图会钉出回退字形）。 */
async function settleFonts(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => null));
}

test('视觉钉版：登录页（亮色）', async ({ page }) => {
  await pinLightZh(page);
  await page.goto('/login');
  await expect(page.getByTestId('signin-route')).toBeVisible();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  await settleFonts(page);
  await expect(page).toHaveScreenshot('login-light.png');
});

test('视觉钉版：文档中心网格（亮色）', async ({ page }) => {
  await pinLightZh(page);
  await gotoDocuments(page);
  // 真实数据锚点：种子项目在列（网格卡片渲染完成）
  await expect(page.getByRole('button', { name: SEED_PROJECT_NAME }).first()).toBeVisible({
    timeout: 20_000,
  });
  await settleFonts(page);
  await expect(page).toHaveScreenshot('documents-grid-light.png');
});

test('视觉钉版：文档详情（亮色）', async ({ page }) => {
  await pinLightZh(page);
  await loginWithSession(page);
  await gotoRoute(page, `/documents/${seedProjectId}`, 'document-details-route');
  // 真实数据锚点：种子库卡片在列（iModel 网格渲染完成）
  const seedCard = page.locator('.imodel-card', { hasText: E2E_IMODEL_NAME });
  await expect(seedCard).toBeVisible({ timeout: 20_000 });
  await settleFonts(page);
  await expect(page).toHaveScreenshot('document-details-light.png');
});

test('视觉钉版：编辑器五区只读态（亮色，画布 mask）', async ({ page }) => {
  await pinLightZh(page);
  await openSeedImodelEditor(page);
  await waitEditorReady(page);
  // 权限门只读态如实钉（M5-T5 D-T5-1 在案，brief 纪律：写工具激活态截图
  // 以只读态为准）；canvas 区 mask（瓦片流送像素不可钉，见文件头注）
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  await expect(canvas).toBeVisible();
  await settleFonts(page);
  await expect(page).toHaveScreenshot('editor-read-only-light.png', {
    mask: [canvas],
    maskColor: 'rgb(255, 255, 255)',
  });
});

test('视觉钉版：设置页个人资料（亮色）', async ({ page }) => {
  await pinLightZh(page);
  await loginWithSession(page);
  await gotoRoute(page, '/settings', 'settings-route');
  await expect(page.getByTestId('settings-panel').getByRole('heading', { name: '个人资料' })).toBeVisible();
  await settleFonts(page);
  await expect(page).toHaveScreenshot('settings-profile-light.png');
});
