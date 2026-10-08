/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { loginWithSession, navigateToEditor } from './helpers';

/**
 * 特征树（M3-a T6.1）——接 M1 特征 RPC（useFeatureSystem）后的 UI 第一批验收。
 * 断言真实 DOM：特征树容器 / 空态文案 / 新建对话框（type 选项 = formModel 键集 4 类型）/ 取消关闭。
 */

test.describe('Feature Tree (特征 RPC)', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithSession(page);
  });

  test('特征树容器可见且空树显示「暂无特征」', async ({ page }) => {
    await navigateToEditor(page);

    const treePanel = page.locator('.feature-tree-panel');
    await expect(treePanel).toBeVisible({ timeout: 60000 });

    // 首次打开时 MS ensureInitialized 会自建 PartStudio（schema+空 body），随后 getTree 返回 []
    // ——空态文案出现即等价于特征树 RPC 链路已通
    await expect(treePanel.getByText('暂无特征')).toBeVisible({ timeout: 60000 });
  });

  test('新建特征对话框：type 选项含 4 类型（formModel 键集），取消关闭', async ({ page }) => {
    await navigateToEditor(page);

    const treePanel = page.locator('.feature-tree-panel');
    await expect(treePanel).toBeVisible({ timeout: 60000 });

    await treePanel.getByRole('button', { name: '新建特征' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('新建特征')).toBeVisible();

    // 类型选项 = MS getFeatureFormModel 键集（native select，选项常挂 DOM）
    const select = dialog.locator('select');
    await expect(select).toBeVisible();
    for (const featureType of ['extrude', 'booleanAdd', 'booleanSubtract', 'fillet']) {
      await expect(select.locator(`option[value="${featureType}"]`)).toHaveCount(1);
    }

    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toHaveCount(0);
  });

  /**
   * T6.2 参数面板（表单模型驱动）——单批验收：新建 extrude（type→distance→profile json→创建）→
   * 树行出现；编辑 distance 3 → 应用 → toast 成功；再改 distance=-1 → 应用 → 对话框顶部 Alert 呈现
   * 后端守卫文案（M2-UX 债 #4）。末尾经面板删除所建特征自清（链尾删除），不污染种子 iModel。
   */
  test('T6.2 参数面板：新建/编辑/守卫错误全链路（表单模型驱动）', async ({ page }) => {
    await navigateToEditor(page);

    const treePanel = page.locator('.feature-tree-panel');
    await expect(treePanel).toBeVisible({ timeout: 60000 });
    // 等首屏树加载完成（不假设空树——前批失败可能残留特征，行数基线做差值断言）
    await expect(treePanel.getByText('加载中...')).toHaveCount(0, { timeout: 60000 });
    const rowsBefore = await treePanel.locator('.feature-row').count();

    // ── 新建：type=extrude → 参数表单（formModel 字段）→ insertFeature ──
    await treePanel.getByRole('button', { name: '新建特征' }).click();
    const newDialog = page.getByRole('dialog');
    await expect(newDialog).toBeVisible();
    await newDialog.locator('select').selectOption('extrude');

    // 选定类型后表单模型字段渲染（number + json + readonlyText 三 kind）
    const distanceInput = newDialog.getByLabel('距离');
    const profileArea = newDialog.getByLabel('轮廓');
    await expect(distanceInput).toBeVisible();
    await expect(profileArea).toBeVisible();
    await expect(newDialog.getByLabel('草图')).toBeVisible();

    await distanceInput.fill('2');
    await profileArea.fill('[{"x":0,"y":0},{"x":2,"y":0},{"x":2,"y":2},{"x":0,"y":2}]');
    await profileArea.blur(); // json 字段失焦 parse 后才入参（输入中不外发）
    await newDialog.getByRole('button', { name: '创建' }).click();

    await expect(newDialog).toHaveCount(0);
    await expect(treePanel.locator('.feature-row')).toHaveCount(rowsBefore + 1);
    const newRow = treePanel.locator('.feature-row').last();
    await expect(newRow).toContainText('拉伸 (extrude)');

    // ── 编辑：distance 3 → 应用 → toast 成功 ──
    await newRow.hover();
    await newRow.getByRole('button', { name: '编辑特征' }).click();
    const editDialog = page.getByRole('dialog');
    await expect(editDialog).toBeVisible();
    await expect(editDialog).toContainText('编辑特征：拉伸 (extrude)');
    // 编辑预填：存储 params 回填（profile json 回显 + distance=2）
    await expect(editDialog.getByLabel('距离')).toHaveValue('2');
    await expect(editDialog.getByLabel('轮廓')).toHaveValue('[{"x":0,"y":0},{"x":2,"y":0},{"x":2,"y":2},{"x":0,"y":2}]');

    await editDialog.getByLabel('距离').fill('3');
    await editDialog.getByRole('button', { name: '应用' }).click();
    await expect(page.getByText('特征参数已更新')).toBeVisible();
    await expect(editDialog).toHaveCount(0);

    // ── 守卫错误：distance=-1 → 应用 → 对话框顶部 Alert 呈现后端文案（M2-UX #4）──
    await newRow.hover();
    await newRow.getByRole('button', { name: '编辑特征' }).click();
    const guardDialog = page.getByRole('dialog');
    await expect(guardDialog).toBeVisible();
    await guardDialog.getByLabel('距离').fill('-1');
    await guardDialog.getByRole('button', { name: '应用' }).click();
    // zod 校验错误经 Alert 呈现（distance.positive 拒收；断言 alert 容器可见且含 distance 路径文案）
    const guardAlert = guardDialog.locator('div[class*="alert"]').filter({ hasText: 'distance' });
    await expect(guardAlert).toBeVisible();
    await guardDialog.getByRole('button', { name: '取消' }).click();
    await expect(guardDialog).toHaveCount(0);

    // ── 自清：链尾删除所建特征（尾特征删除守卫放行），种子 iModel 回到基线行数 ──
    await newRow.hover();
    await newRow.getByRole('button', { name: '删除特征' }).click();
    await expect(treePanel.locator('.feature-row')).toHaveCount(rowsBefore);
  });
});
