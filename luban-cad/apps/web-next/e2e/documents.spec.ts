/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 文档中心 e2e（M5-T5，会话注入零登录）：筛选切换（URL ?filter= 唯一事实源）
 * / 真实数据断言（≥1 文档：种子项目）/ 创建菜单开合（含 🟠 gated 项能力引导
 * ——honest 边界：引导对话框出现即 PASS）/ 表格网格切换 + localStorage 记忆 /
 * 搜索三态。选择器第一来源 DocumentsPage 族组件 testid + i18n 中文可访问名。
 */

import { expect, test } from '@playwright/test';
import { SEED_PROJECT_NAME } from './fixtures';
import { gotoDocuments } from './helpers';

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

  // 切表格：Table 表头中文名 + 种子行在列
  await page.getByRole('button', { name: '列表视图' }).click();
  const table = page.locator('.documents-table');
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
  await expect(page.locator('.documents-table')).toBeVisible();
  await page.getByRole('button', { name: '网格视图' }).click();
  await expect(page.locator('.document-tile').first()).toBeVisible();
});

test('搜索三态：命中 → 未命中空态 → 清除还原', async ({ page }) => {
  await sidebar(page).getByRole('button', { name: '我的文档' }).click();
  await expect(page.getByRole('button', { name: SEED_PROJECT_NAME }).first()).toBeVisible({
    timeout: 20_000,
  });

  const searchBox = page.getByPlaceholder('搜索文档…');

  // 命中：种子名含「测试」→ 分区标题切搜索态
  await searchBox.fill('测试');
  await expect(page.getByRole('heading', { name: '搜索："测试"' })).toBeVisible();
  await expect(page.getByRole('button', { name: SEED_PROJECT_NAME }).first()).toBeVisible();

  // 未命中：诚实空态
  await searchBox.fill('绝对不存在的文档名-x');
  await expect(page.getByText('未找到匹配的文档')).toBeVisible();

  // 清除：还原分区
  await page.getByRole('button', { name: '清除搜索' }).click();
  await expect(page.getByRole('heading', { name: '我的文档' })).toBeVisible();
  await expect(page.getByRole('button', { name: SEED_PROJECT_NAME }).first()).toBeVisible();
});
