/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * 草图面板（M3-b T4.7）——SketchPanel 接真数据后的 UI 第一批验收（真栈：compose + MS 源码模式）。
 * 批：进入草图模式 → SketchPanel 可见 → 新建草图（insertSketch 空实体起步，面板显示活动草图）→
 * 绘制按钮激活 Sketch.CreateLine 工具 → 退出模式（面板关闭）。
 *
 * 清理口径：v1 op 面无 deleteSketch——草图元素（LubanCAD.Sketch）不是 LubanCAD.Feature 行，
 * 不进特征树（queryAllFeatures 不命中）、不受 deleteFeature 链尾守卫管辖，故无 UI 删除路径；
 * 空草图对既有 spec 的特征树行数断言零扰动（features.spec 差值口径不受影响），每次运行残留
 * 一个空 sketch 元素属已知债（deleteSketch op 留给后续 milestone）。
 */

import { test, expect } from '@playwright/test';
import { expectToolActivated, loginWithSession, navigateToEditor } from './helpers';

test.describe('Sketch Panel (草图 RPC)', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithSession(page);
  });

  test('草图模式：面板可见 → 新建草图 → 绘制按钮激活 Sketch.CreateLine → 退出', async ({ page }) => {
    await navigateToEditor(page);

    // 进入草图模式（工具条「编辑草图」）
    await page
      .locator('.cad-toolbar-horizontal')
      .getByRole('button', { name: '编辑草图' })
      .click();
    const sketchPanel = page.locator('.sketch-panel');
    await expect(sketchPanel).toBeVisible({ timeout: 15000 });

    // 新建草图：insertSketch([], []) → 打开新草图 → 元素 tab 空态（活动草图=空实体）
    await sketchPanel.getByRole('button', { name: '新建草图' }).click();
    await expect(sketchPanel.getByText('暂无实体')).toBeVisible({ timeout: 60000 });
    // DOF 徽标：空草图求解 ok dof=0 → 「自由度: 0」恰定徽标（真链路面板读面实证）
    await expect(sketchPanel.getByText('自由度: 0')).toBeVisible();

    // 绘制按钮激活 Sketch.CreateLine 工具（依赖注入路径=runSketchCreateTool）
    await sketchPanel.getByRole('button', { name: '直线' }).click();
    await expectToolActivated(page, 'Sketch.CreateLine', 15000);

    // 退出草图模式：面板关闭
    await sketchPanel.getByRole('button', { name: '退出草图' }).click();
    await expect(sketchPanel).toHaveCount(0);
  });
});
