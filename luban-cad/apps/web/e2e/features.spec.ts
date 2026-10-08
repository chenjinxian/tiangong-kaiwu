/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { expectToolActivated, getActiveToolId, loginWithSession, navigateToEditor } from './helpers';

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

  /**
   * T6.3 视口选边 → 邻面对引用：先按 T6.2 同款步骤建一个 extrude（种子模型持有几何体），
   * 再新建 fillet → 「从视图选边」→ SelectSubEntity 工具激活（拾取期间对话框暂隐——模态
   * backdrop 吞视口点击的化解，浮条接管）→ Escape 退场（hook 自挂的 window capture 级
   * keydown 监听 → startDefaultTool
   * → onComplete → 对话框复开）。几何级命中点击不断言（flaky 面；交互正确性由单测 +
   * MS 集成测试双保险）。末尾删除所建 extrude 自清。
   */
  test('T6.3 选边拾取器：fillet 表单「从视图选边」→ 工具激活 → Escape 退场', async ({ page }) => {
    await navigateToEditor(page);

    const treePanel = page.locator('.feature-tree-panel');
    await expect(treePanel).toBeVisible({ timeout: 60000 });
    await expect(treePanel.getByText('加载中...')).toHaveCount(0, { timeout: 60000 });
    const rowsBefore = await treePanel.locator('.feature-row').count();

    // ── 先建 extrude（T6.2 同款步骤）让种子模型持有几何体 ──
    await treePanel.getByRole('button', { name: '新建特征' }).click();
    const setupDialog = page.getByRole('dialog');
    await expect(setupDialog).toBeVisible();
    await setupDialog.locator('select').selectOption('extrude');
    await setupDialog.getByLabel('距离').fill('2');
    await setupDialog.getByLabel('轮廓').fill('[{"x":0,"y":0},{"x":2,"y":0},{"x":2,"y":2},{"x":0,"y":2}]');
    await setupDialog.getByLabel('轮廓').blur();
    await setupDialog.getByRole('button', { name: '创建' }).click();
    await expect(setupDialog).toHaveCount(0);
    await expect(treePanel.locator('.feature-row')).toHaveCount(rowsBefore + 1);

    // ── 新建 fillet → 「从视图选边」按钮 → SelectSubEntity 激活 ──
    await treePanel.getByRole('button', { name: '新建特征' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('select').selectOption('fillet');
    // fillet 表单字段齐备（chips 空态 + 拾取按钮）
    await expect(dialog.getByText('未选择边')).toBeVisible();
    const pickBtn = dialog.getByRole('button', { name: '从视图选边' });
    await expect(pickBtn).toBeVisible();
    await pickBtn.click();

    // 拾取期间对话框暂隐（浮条接管），工具激活
    await expect(page.getByTestId('edge-picker-banner')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expectToolActivated(page, 'SelectSubEntity');

    // Escape 退场：hook 自挂 capture 监听 → startDefaultTool → 工具 onCleanup → onComplete → 对话框复开
    await page.keyboard.press('Escape');
    await expect
      .poll(() => getActiveToolId(page), { timeout: 10000, message: 'SelectSubEntity 应退出' })
      .not.toBe('SelectSubEntity');
    await expect(page.getByTestId('edge-picker-banner')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });

    // ── 自清：关对话框 + 链尾删除所建 extrude，种子 iModel 回到基线行数 ──
    await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const newRow = treePanel.locator('.feature-row').last();
    await newRow.hover();
    await newRow.getByRole('button', { name: '删除特征' }).click();
    await expect(treePanel.locator('.feature-row')).toHaveCount(rowsBefore);
  });

  /**
   * T6.4 试算预览管道（反馈级）：编辑 extrude distance → 400ms debounce → previewOp(updateParams)
   * → 对话框顶部 .preview-badge 成功文案 → 应用成功；distance=-1 → 徽标失败文案 + 「应用」禁用 +
   * 「仍要应用」强制出口可见（MS previewOp 与 applyOp 同 zod 校验，文案一致由单测钉 parity）。
   * 末尾删除所建特征自清。
   */
  test('T6.4 试算预览：改 distance → 徽标成功 → 应用成功；非法值 → 徽标失败 + 应用禁用', async ({ page }) => {
    await navigateToEditor(page);

    const treePanel = page.locator('.feature-tree-panel');
    await expect(treePanel).toBeVisible({ timeout: 60000 });
    await expect(treePanel.getByText('加载中...')).toHaveCount(0, { timeout: 60000 });
    const rowsBefore = await treePanel.locator('.feature-row').count();

    // ── 先建 extrude（T6.2 同款步骤）提供可编辑特征 ──
    await treePanel.getByRole('button', { name: '新建特征' }).click();
    const setupDialog = page.getByRole('dialog');
    await expect(setupDialog).toBeVisible();
    await setupDialog.locator('select').selectOption('extrude');
    await setupDialog.getByLabel('距离').fill('2');
    await setupDialog.getByLabel('轮廓').fill('[{"x":0,"y":0},{"x":2,"y":0},{"x":2,"y":2},{"x":0,"y":2}]');
    await setupDialog.getByLabel('轮廓').blur();
    await setupDialog.getByRole('button', { name: '创建' }).click();
    await expect(setupDialog).toHaveCount(0);
    const newRow = treePanel.locator('.feature-row').last();
    await expect(newRow).toContainText('拉伸 (extrude)');

    // ── 编辑：distance 3 → debounce 后徽标成功 → 应用成功 ──
    await newRow.hover();
    await newRow.getByRole('button', { name: '编辑特征' }).click();
    const editDialog = page.getByRole('dialog');
    await expect(editDialog).toBeVisible();
    await editDialog.getByLabel('距离').fill('3');
    const badge = editDialog.locator('.preview-badge');
    // debounce 400ms + RPC 往返（previewOp 影子求值），给足余量
    await expect(badge).toBeVisible({ timeout: 15000 });
    await expect(badge).toContainText('试算通过');
    await editDialog.getByRole('button', { name: '应用' }).click();
    await expect(page.getByText('特征参数已更新')).toBeVisible();
    await expect(editDialog).toHaveCount(0);

    // ── 非法值路径：distance=-1 → 徽标失败文案 + 应用禁用 + 「仍要应用」出口 ──
    await newRow.hover();
    await newRow.getByRole('button', { name: '编辑特征' }).click();
    const guardDialog = page.getByRole('dialog');
    await expect(guardDialog).toBeVisible();
    await guardDialog.getByLabel('距离').fill('-1');
    const guardBadge = guardDialog.locator('.preview-badge');
    await expect(guardBadge).toBeVisible({ timeout: 15000 });
    await expect(guardBadge).toContainText('试算失败');
    // name 子串匹配会同时命中「仍要应用」——exact 钉死主按钮
    await expect(guardDialog.getByRole('button', { name: '应用', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await expect(guardDialog.getByRole('button', { name: '仍要应用' })).toBeVisible();
    await guardDialog.getByRole('button', { name: '取消' }).click();
    await expect(guardDialog).toHaveCount(0);

    // ── 自清：链尾删除所建特征，种子 iModel 回到基线行数 ──
    await newRow.hover();
    await newRow.getByRole('button', { name: '删除特征' }).click();
    await expect(treePanel.locator('.feature-row')).toHaveCount(rowsBefore);
  });
});
