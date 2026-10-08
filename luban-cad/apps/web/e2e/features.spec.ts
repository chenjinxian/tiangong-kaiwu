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
});
