/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { loginWithSession, navigateToEditor, activateToolbarTool } from './helpers';

/**
 * E2E Tests for Modeling Tools - Final Version
 * Tests that all modeling tools are properly registered and visible in the toolbar
 *
 * 断言依据：工具激活提示走 outputPrompt 无 UI 消费（不落 DOM），
 * 故激活断言用 window.IModelApp.toolAdmin.activeTool.toolId（main.tsx 调试暴露）。
 */

test.describe('Modeling Tools - Toolbar Visibility', () => {
  test('should display complete CAD toolbar in editor', async ({ page }) => {
    test.setTimeout(180000); // 编辑器导航 + 三工具激活
    await loginWithSession(page);
    await navigateToEditor(page);

    const toolbar = page.locator('.cad-toolbar-horizontal');
    await expect(toolbar).toBeVisible({ timeout: 10000 });

    // Verify all tool categories
    const categories = ['草图', '实体', '变换', '布尔', '边', '面', '高级'];
    for (const category of categories) {
      await expect(toolbar.getByText(category, { exact: true })).toBeVisible();
    }

    // Test tool activation - UniteSolids / OffsetFaces / SweepFaces
    // （工具按钮的 label 是 React prop → aria-label，title=/label= 属性选择器不适用）
    await activateToolbarTool(page, '并集 (Unite)', 'UniteSolids');
    await page.screenshot({ path: 'test-results/unite-activated.png', fullPage: true });
    await page.keyboard.press('Escape');

    await activateToolbarTool(page, '面偏移 (Offset Face)', 'OffsetFaces');
    await page.screenshot({ path: 'test-results/offset-activated.png', fullPage: true });
    await page.keyboard.press('Escape');

    await activateToolbarTool(page, '拉伸面 (Sweep Face)', 'SweepFaces');
    await page.screenshot({ path: 'test-results/sweep-activated.png', fullPage: true });
  });
});

test.describe('Modeling Tools - Console Error Check', () => {
  test('should not have tool registration errors', async ({ page }) => {
    test.setTimeout(180000); // 编辑器导航 + 七工具逐个激活
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await loginWithSession(page);
    await navigateToEditor(page);

    const toolbar = page.locator('.cad-toolbar-horizontal');
    await expect(toolbar).toBeVisible({ timeout: 10000 });

    // Click through various tools and check for errors
    const tools: Array<[string, string]> = [
      ['并集 (Unite)', 'UniteSolids'],
      ['差集 (Subtract)', 'SubtractSolids'],
      ['交集 (Intersect)', 'IntersectSolids'],
      ['面偏移 (Offset Face)', 'OffsetFaces'],
      ['拉伸面 (Sweep Face)', 'SweepFaces'],
      ['圆角 (Fillet)', 'RoundEdges'],
      ['倒角 (Chamfer)', 'ChamferEdges'],
    ];

    for (const [buttonName, toolId] of tools) {
      await activateToolbarTool(page, buttonName, toolId);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    // Check for critical errors
    const criticalErrors = errors.filter(e =>
      e.includes('Tool not registered') ||
      e.includes('Cannot find tool') ||
      e.includes('undefined is not a function') ||
      e.includes('is not a function')
    );

    console.log('Console errors:', errors);
    console.log('Critical errors:', criticalErrors);

    expect(criticalErrors).toHaveLength(0);
  });
});
