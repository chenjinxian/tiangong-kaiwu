/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 文档中心 e2e（M5-T5，会话注入零登录）：筛选切换（URL ?filter= 唯一事实源）
 * / 真实数据断言（≥1 文档：种子项目）/ 创建菜单开合（含 🟠 gated 项能力引导
 * ——honest 边界：引导对话框出现即 PASS）/ 表格网格切换 + localStorage 记忆 /
 * 搜索三态。选择器第一来源 DocumentsPage 族组件 testid + i18n 中文可访问名。
 *
 * P2.6c1：e2e 环境以 `VITE_B_MODEL_ENABLED=true` 启动——B 项目区（projects-
 * section）与 A 旧文档区双区同屏；B 种子项目从列表 UI 进入详情/编辑器
 * （L6 路径恢复，见末用例）。flag 关 rollback 面归单测，不在本 spec 覆盖。
 */

import { expect, test } from '@playwright/test';
import { B_SEED_IMODEL_NAME, B_SEED_PROJECT_NAME, SEED_PROJECT_NAME } from './fixtures';
import {
  getApiToken,
  gotoDocuments,
  readModelScopeId,
  readOpenBriefcaseInfo,
  waitEditorReady,
} from './helpers';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed';

/** 侧栏作用域：星标钮（收藏）等卡片按钮与导航项同名，禁全局 byRole。 */
function sidebar(page: import('@playwright/test').Page) {
  return page.getByTestId('document-sidebar');
}

test.beforeEach(async ({ page }) => {
  await gotoDocuments(page);
});

test('筛选切换：默认我的文档真实数据（≥1 文档）→ 最近 → 收藏', async ({ page }) => {
  // 默认档=我的文档（DEFAULT_DOCUMENT_FILTER，?filter 缺席收敛）：种子项目真实在列
  await expect(page.getByRole('heading', { name: '我的文档' })).toBeVisible();
  await expect(page.getByRole('button', { name: SEED_PROJECT_NAME }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/个文档/)).toBeVisible();
  // P2.6c1 flag-on 双区（e2e 环境以 VITE_B_MODEL_ENABLED=true 启动）：B 项目区
  // 在场且 B 种子落位；A 旧文档种子仍在 A 区；B 种子不混入 A 区（分区读取
  // 唯一事实源）。flag 关的 rollback 面由 DocumentsPage.flag-off.test 单测覆盖。
  const projects = page.getByTestId('projects-section');
  await expect(projects).toBeVisible({ timeout: 20_000 });
  await expect(
    projects.getByRole('button', { name: B_SEED_PROJECT_NAME }).first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.locator('.documents-body').getByRole('button', { name: B_SEED_PROJECT_NAME }),
  ).toHaveCount(0);

  // 切「最近打开过的」：分区标题/URL 联动（recents 集真实查询，不假设空/非空）
  await sidebar(page).getByRole('button', { name: '最近打开过的' }).click();
  await expect(page.getByRole('heading', { name: '最近打开过的' })).toBeVisible();
  await expect(page).toHaveURL(/filter=recent/);
  await expect(page.getByText(/个文档/)).toBeVisible();

  // 切「收藏」：标题/URL 联动（收藏集真实查询，不假设空/非空）
  await sidebar(page).getByRole('button', { name: '收藏', exact: true }).click();
  await expect(page.getByRole('heading', { name: '收藏', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/filter=favorites/);
});

test('创建菜单开合：✅ 新建文档 + 🟠 gated 项能力引导（honest 边界）', async ({ page }) => {
  // 开：菜单五项（新建文档 ✅ + 文件夹/导入文件/导入来源/标签 🟠）
  await sidebar(page).getByRole('button', { name: '创建', exact: true }).click();
  const newItem = page.getByRole('menuitem', { name: '新建文档' });
  await expect(newItem).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '新建文件夹' })).toBeVisible();

  // gated 项照常可点 → 能力引导对话框（完整 UI 面，点开引导即达标）
  await page.getByRole('menuitem', { name: '新建文件夹' }).click();
  const capability = page.getByRole('dialog', { name: '功能即将推出' });
  await expect(capability).toBeVisible();
  await capability.getByRole('button', { name: '知道了' }).click();
  await expect(capability).toBeHidden();

  // Escape 收合创建菜单
  await page.keyboard.press('Escape');
  await expect(newItem).toBeHidden();
});

test('表格/网格切换 + localStorage 记忆', async ({ page }) => {
  await sidebar(page).getByRole('button', { name: '我的文档' }).click();
  await expect(page.getByRole('button', { name: SEED_PROJECT_NAME }).first()).toBeVisible({
    timeout: 20_000,
  });

  // 切表格：Table 表头中文名 + 种子行在列。P2.6c1：flag-on 时 B 项目区也有
  // 自己的表格，选择器必须锚 A 旧文档区（`.documents-body`）——否则双表命中
  // 触发 Playwright strict mode 红。
  await page.getByRole('button', { name: '列表视图' }).click();
  const table = page.locator('.documents-body .documents-table');
  await expect(table).toBeVisible();
  await expect(table.getByText('名称', { exact: true })).toBeVisible();
  await expect(table.getByText(SEED_PROJECT_NAME).first()).toBeVisible();

  // 切回网格：卡片网格
  await page.getByRole('button', { name: '网格视图' }).click();
  await expect(page.locator('.document-tile').first()).toBeVisible();

  // 视图偏好落 localStorage（记忆：刷新后仍表格）；用毕还原网格态
  await page.getByRole('button', { name: '列表视图' }).click();
  await expect(table).toBeVisible();
  await expect(page.evaluate(() => localStorage.getItem('luban-next-documents-view'))).resolves.toBe('table');
  await page.reload();
  await expect(page.locator('.documents-body .documents-table')).toBeVisible();
  await page.getByRole('button', { name: '网格视图' }).click();
  await expect(page.locator('.document-tile').first()).toBeVisible();
});

test('搜索三态：命中 → 未命中空态 → 清除还原', async ({ page }) => {
  await sidebar(page).getByRole('button', { name: '我的文档' }).click();
  await expect(page.getByRole('button', { name: SEED_PROJECT_NAME }).first()).toBeVisible({
    timeout: 20_000,
  });

  const searchBox = page.getByPlaceholder('搜索文档…');
  // flag-on 双区共用搜索词：B 区标题在 projects-section 内，A 区标题在 main 的
  // 直属工具条里（同名标题两处 → 断言必须各自限定，不能全局 byRole）。
  const aToolbar = page.locator('.documents-main > .documents-toolbar');
  const projects = page.getByTestId('projects-section');

  // 命中：种子名含「测试」→ 分区标题切搜索态（B 区同显搜索态；B 种子名不含
  // 「测试」→ B 区诚实空态文案）
  await searchBox.fill('测试');
  await expect(aToolbar.getByRole('heading', { name: '搜索："测试"' })).toBeVisible();
  await expect(projects.getByRole('heading', { name: '搜索："测试"' })).toBeVisible();
  await expect(projects.getByText('未找到匹配项目')).toBeVisible();
  await expect(page.getByRole('button', { name: SEED_PROJECT_NAME }).first()).toBeVisible();

  // 未命中：诚实空态
  await searchBox.fill('绝对不存在的文档名-x');
  await expect(page.getByText('未找到匹配的文档')).toBeVisible();

  // 清除：还原分区
  await page.getByRole('button', { name: '清除搜索' }).click();
  await expect(page.getByRole('heading', { name: '我的文档' })).toBeVisible();
  await expect(page.getByRole('button', { name: SEED_PROJECT_NAME }).first()).toBeVisible();
});

test('B 项目 UI 入口：文档中心 B 区 → 详情 → 打开工作空间进默认 Part Studio', async ({
  page,
  request,
}) => {
  // P2.6c1 恢复 L6 的 UI 路径：flag-on 时 B 种子项目出现在文档中心 B 区，
  // 从列表卡片进入详情、再经「打开工作空间」进编辑器（不再只有直连 URL）。
  // B 种子先重置：干净库 + 新 dbKey（旧页面写租约 TTL 30s 不跨轮），并让
  // 解析器在本轮首开时创建默认 `Part Studio 1`（页签名确定性）。
  // P2.6c2 F4：预算 = 单种子重置最坏链 + UI 打开/断言余量（原 900s 仅比
  // 重置最坏 565s + 打开最坏 ~300s 的合计多 35s，慢栈下无余量）。
  test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS);
  const bSeed = await resetBModelSeed(request, await getApiToken());
  await gotoDocuments(page);

  // ① 文档中心 B 区卡片（项目名兜底过滤；前序 spec 的临时项目不影响本断言）
  const projects = page.getByTestId('projects-section');
  const bCard = projects.getByRole('button', { name: B_SEED_PROJECT_NAME }).first();
  await expect(bCard).toBeVisible({ timeout: 20_000 });
  await bCard.click();

  // ② B 项目详情（无只读横幅；B 种子库卡片 + 打开工作空间入口）
  await expect(page).toHaveURL(new RegExp(`/documents/${bSeed.itwinId}(\\?.*)?$`));
  await expect(page.getByTestId('document-details-route')).toBeVisible();
  await expect(page.getByTestId('legacy-readonly-banner')).toHaveCount(0);
  const imodelCard = page.locator('.imodel-card', { hasText: B_SEED_IMODEL_NAME });
  await expect(imodelCard).toBeVisible({ timeout: 20_000 });
  await imodelCard.getByRole('button', { name: '打开工作空间' }).click();

  // ③ 编辑器：URL 落到同一 iModel + 解析器默认 scope；可写连接 + 默认页签
  await expect(page).toHaveURL(
    new RegExp(`/documents/${bSeed.itwinId}/${bSeed.imodelId}`),
  );
  await waitEditorReady(page);
  const scopeId = readModelScopeId(page);
  expect(scopeId, 'B 文档默认 Part Studio 应写入 ?model=').toBeTruthy();
  const tabStrip = page.getByTestId('part-studio-tab-strip');
  await expect(tabStrip.getByRole('tab')).toHaveCount(1);
  await expect(tabStrip.getByRole('tab').first()).toHaveText('Part Studio 1');
  await expect(tabStrip.locator(`[data-studio-id="${scopeId}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const openInfo = await readOpenBriefcaseInfo(page);
  expect(openInfo.key, 'B 文档应打开 briefcase').toBeTruthy();
  expect(openInfo.isReadonly, 'B 文档连接应为可写').toBe(false);
});
